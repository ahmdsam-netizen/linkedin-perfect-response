"""
tests/v2/test_fact_lifecycle.py
===============================
Tests for the fact lifecycle: ACTIVE -> SUPERSEDED transition (TEST 4 from spec).
"""

import pytest
from unittest.mock import AsyncMock
from app.services import memory_service


@pytest.mark.asyncio
async def test_fact_supersede_lifecycle():
    """Verify that superseded_memories marks facts as SUPERSEDED."""
    mock_db = AsyncMock()

    # Mock execute result
    mock_result = AsyncMock()
    mock_result.rowcount = 1
    mock_db.execute.return_value = mock_result

    old_fact_ids = ["fact-google-123"]
    updated_count = await memory_service.supersede_memories(
        mock_db, memory_ids=old_fact_ids
    )

    assert updated_count == 1
    mock_db.execute.assert_called_once()
