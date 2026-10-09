"""
app/services/summary_chunk_service.py
======================================
Manage episodic micro-summary chunks with rolling 3-chunk retention.
"""

from __future__ import annotations

import logging

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.models import SummaryChunk

logger = logging.getLogger(__name__)


async def get_latest_chunks(
    db: AsyncSession,
    *,
    conversation_id: str,
    limit: int = 2,
) -> list[SummaryChunk]:
    """Return the N most recent summary chunks for a conversation.

    Used by context_builder.py to add conversation history to the reply prompt
    without sending the full conversation history.

    Args:
        db: Active async database session.
        conversation_id: The Conversation.id to look up chunks for.
        limit: Max number of recent chunks to return (default 2 = ~80–140 words).

    Returns:
        List of SummaryChunk objects in chronological order.
    """
    result = await db.execute(
        select(SummaryChunk)
        .where(SummaryChunk.conversation_id == conversation_id)
        .order_by(SummaryChunk.chunk_index.desc())
        .limit(limit)
    )
    chunks = list(result.scalars().all())
    chunks.reverse()  # Return in chronological order
    return chunks


async def get_next_chunk_index(
    db: AsyncSession,
    *,
    conversation_id: str,
) -> int:
    """Return the next chunk_index for a conversation (0-based, monotonically increasing)."""
    result = await db.execute(
        select(func.max(SummaryChunk.chunk_index)).where(
            SummaryChunk.conversation_id == conversation_id
        )
    )
    max_index = result.scalar_one_or_none()
    return 0 if max_index is None else max_index + 1


async def prune_old_chunks(
    db: AsyncSession,
    *,
    conversation_id: str,
    keep_last: int | None = None,
) -> int:
    """Prune older summary chunks beyond the rolling limit (default: 3 chunks).

    Keeps storage bounded and query performance sub-millisecond forever.

    Args:
        db: Active async database session.
        conversation_id: Target conversation.
        keep_last: Maximum number of recent chunks to retain.

    Returns:
        Number of pruned chunks deleted.
    """
    max_chunks = (
        keep_last
        if keep_last is not None
        else get_settings().max_summary_chunks_per_conversation
    )

    # Find all chunks ordered newest first
    result = await db.execute(
        select(SummaryChunk.id)
        .where(SummaryChunk.conversation_id == conversation_id)
        .order_by(SummaryChunk.chunk_index.desc())
    )
    chunk_ids = list(result.scalars().all())

    if len(chunk_ids) <= max_chunks:
        return 0

    # Delete any chunks older than max_chunks
    ids_to_delete = chunk_ids[max_chunks:]
    del_result = await db.execute(
        delete(SummaryChunk).where(SummaryChunk.id.in_(ids_to_delete))
    )
    deleted_count = del_result.rowcount or len(ids_to_delete)
    logger.info(
        "Pruned %d older summary chunks for conversation %s (kept latest %d)",
        deleted_count,
        conversation_id,
        max_chunks,
    )
    return deleted_count


async def append_chunk(
    db: AsyncSession,
    *,
    conversation_id: str,
    summary_chunk: str,
    keep_last: int | None = None,
) -> SummaryChunk:
    """Append a new micro-summary chunk and auto-prune older chunks beyond the limit.

    Args:
        db: Active async database session.
        conversation_id: Target conversation.
        summary_chunk: The 1–3 sentence micro-summary text.
        keep_last: Optional override for max retained chunks.

    Returns:
        The newly created SummaryChunk.
    """
    chunk_index = await get_next_chunk_index(db, conversation_id=conversation_id)
    chunk = SummaryChunk(
        conversation_id=conversation_id,
        chunk_index=chunk_index,
        summary_chunk=summary_chunk,
    )
    db.add(chunk)
    await db.flush()
    logger.info(
        "Appended summary chunk %d for conversation %s", chunk_index, conversation_id
    )

    # Auto-prune older chunks beyond the rolling 3-chunk window
    await prune_old_chunks(db, conversation_id=conversation_id, keep_last=keep_last)

    return chunk
