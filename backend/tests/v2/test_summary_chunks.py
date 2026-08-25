"""
tests/v2/test_summary_chunks.py
===============================
Tests for episodic micro-summary chunk querying and appending.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from app.db.models import SummaryChunk
from app.services import summary_chunk_service


@pytest.mark.asyncio
async def test_get_latest_chunks_ordering():
    """Verify that get_latest_chunks returns chunks in chronological order."""
    mock_db = AsyncMock()

    c1 = SummaryChunk(id="c1", conversation_id="conv-1", chunk_index=0, summary_chunk="Discussed Project Nebula initial requirements.")
    c2 = SummaryChunk(id="c2", conversation_id="conv-1", chunk_index=1, summary_chunk="Agreed on React and FastAPI tech stack.")

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [c2, c1]
    mock_db.execute.return_value = mock_result

    chunks = await summary_chunk_service.get_latest_chunks(mock_db, conversation_id="conv-1", limit=2)

    # Should be reversed to chronological order [c1, c2]
    assert len(chunks) == 2
    assert chunks[0].chunk_index == 0
    assert chunks[1].chunk_index == 1
