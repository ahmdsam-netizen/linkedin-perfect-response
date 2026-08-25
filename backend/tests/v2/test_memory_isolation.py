"""
tests/v2/test_memory_isolation.py
=================================
Tests for contact-scoped memory isolation (TEST 1 & TEST 2 from spec).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services import retrieval_service


@pytest.mark.asyncio
async def test_contact_memory_isolation():
    """Verify that retrieval strictly isolates memories by contact_id."""
    user_id = "user-111"
    john_id = "contact-john"
    sarah_id = "contact-sarah"

    mock_db = AsyncMock()

    class MockRow:
        def __init__(self, id, content, memory_type, similarity):
            self.id = id
            self.content = content
            self.memory_type = memory_type
            self.similarity = similarity

    # Mock embedding query
    with patch("app.services.retrieval_service.embed_query", new_callable=AsyncMock) as mock_embed:
        mock_embed.return_value = [0.1] * 768

        # 1. Search scoped to John
        mock_result_john = MagicMock()
        mock_result_john.fetchall.return_value = [
            MockRow("mem-1", "John is leading Project Nebula using React and FastAPI.", "PROJECT", 0.88),
        ]
        mock_db.execute.return_value = mock_result_john

        john_facts = await retrieval_service.semantic_search(
            mock_db,
            query="project status",
            user_id=user_id,
            contact_id=john_id,
        )

        assert len(john_facts) == 1
        assert "Project Nebula" in john_facts[0]["content"]

        call_args = mock_db.execute.call_args
        params = call_args[0][1]
        assert params["user_id"] == user_id
        assert params["contact_id"] == john_id

        # 2. Search scoped to Sarah
        mock_result_sarah = MagicMock()
        mock_result_sarah.fetchall.return_value = [
            MockRow("mem-2", "Sarah is managing Project Neon on AWS Cloud.", "PROJECT", 0.91),
        ]
        mock_db.execute.return_value = mock_result_sarah

        sarah_facts = await retrieval_service.semantic_search(
            mock_db,
            query="project status",
            user_id=user_id,
            contact_id=sarah_id,
        )

        assert len(sarah_facts) == 1
        assert "Project Neon" in sarah_facts[0]["content"]
        assert "Project Nebula" not in sarah_facts[0]["content"]

        call_args = mock_db.execute.call_args
        params = call_args[0][1]
        assert params["contact_id"] == sarah_id
