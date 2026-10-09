"""
tests/v2/test_summary_chunks.py
===============================
Tests for episodic micro-summary chunk querying, appending, and rolling 3-chunk retention.
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


@pytest.mark.asyncio
async def test_prune_old_chunks_rolling_window():
    """Verify that prune_old_chunks deletes chunks beyond the rolling limit of 3."""
    mock_db = AsyncMock()

    # Suppose there are 5 chunks in DB: id-5, id-4, id-3, id-2, id-1
    mock_result_select = MagicMock()
    mock_result_select.scalars.return_value.all.return_value = ["id-5", "id-4", "id-3", "id-2", "id-1"]

    mock_result_delete = MagicMock()
    mock_result_delete.rowcount = 2

    mock_db.execute.side_effect = [mock_result_select, mock_result_delete]

    deleted = await summary_chunk_service.prune_old_chunks(mock_db, conversation_id="conv-1", keep_last=3)

    # Should prune 2 oldest chunks (id-2 and id-1), keeping latest 3 (id-5, id-4, id-3)
    assert deleted == 2
    assert mock_db.execute.call_count == 2
