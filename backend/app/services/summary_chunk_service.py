"""
app/services/summary_chunk_service.py
======================================
Manage episodic micro-summary chunks for conversations.
"""

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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


async def append_chunk(
    db: AsyncSession,
    *,
    conversation_id: str,
    summary_chunk: str,
) -> SummaryChunk:
    """Append a new micro-summary chunk to a conversation.

    Args:
        db: Active async database session.
        conversation_id: Target conversation.
        summary_chunk: The 1–3 sentence micro-summary text.

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
    return chunk
