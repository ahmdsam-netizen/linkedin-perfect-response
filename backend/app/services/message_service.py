"""
app/services/message_service.py
================================
Batch-insert messages with SHA-256 hash deduplication.

Uses INSERT ... ON CONFLICT DO NOTHING so an entire conversation sync
is handled in a single SQL statement — no N+1 queries.
"""

import hashlib
import logging
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Message

logger = logging.getLogger(__name__)


@dataclass
class MessageIn:
    """Input DTO for a single message to be synced."""
    sender_type: str   # 'USER' | 'CONTACT'
    content: str


def _content_hash(sender_type: str, content: str) -> str:
    """Deterministic SHA-256 hash for message deduplication.

    The hash covers both sender identity and content so two identical texts
    from different senders are NOT considered duplicates.
    """
    raw = f"{sender_type}:{content.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def batch_insert_messages(
    db: AsyncSession,
    *,
    conversation_id: str,
    messages: list[MessageIn],
) -> int:
    """Batch-insert messages, skipping any already present (by content_hash).

    Uses a single SQL statement with ON CONFLICT DO NOTHING for efficiency.

    Args:
        db: Active async database session.
        conversation_id: The Conversation.id to associate messages with.
        messages: Ordered list of MessageIn DTOs.

    Returns:
        Number of newly inserted messages (0 if all were duplicates).
    """
    if not messages:
        return 0

    rows = [
        {
            "conversation_id": conversation_id,
            "sender_type": m.sender_type,
            "content": m.content,
            "content_hash": _content_hash(m.sender_type, m.content),
        }
        for m in messages
    ]

    # Single batch insert — ON CONFLICT silently skips existing messages.
    result = await db.execute(
        text(
            """
            INSERT INTO messages (id, conversation_id, sender_type, content, content_hash)
            SELECT gen_random_uuid(), :conversation_id, :sender_type, :content, :content_hash
            ON CONFLICT (conversation_id, content_hash) DO NOTHING
            """
        ),
        rows,
    )

    inserted = result.rowcount if result.rowcount != -1 else len(rows)
    logger.info(
        "Synced %d messages for conversation %s (%d new)",
        len(rows),
        conversation_id,
        inserted,
    )
    return inserted


async def get_unprocessed_messages(
    db: AsyncSession,
    *,
    conversation_id: str,
    last_processed_message_id: str | None,
) -> list[Message]:
    """Return messages in a conversation that have not yet been processed into memory.

    If last_processed_message_id is None, returns all messages.
    Otherwise, returns only messages created after the last processed one.
    """
    from sqlalchemy import select

    if last_processed_message_id is None:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at)
        )
    else:
        # Get the created_at timestamp of the last processed message
        last_result = await db.execute(
            select(Message.created_at).where(Message.id == last_processed_message_id)
        )
        last_ts = last_result.scalar_one_or_none()

        if last_ts is None:
            # Fallback: return all messages if pointer is broken
            result = await db.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at)
            )
        else:
            result = await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == conversation_id,
                    Message.created_at > last_ts,
                )
                .order_by(Message.created_at)
            )

    return list(result.scalars().all())


async def get_recent_messages(
    db: AsyncSession,
    *,
    conversation_id: str,
    limit: int = 8,
) -> list[Message]:
    """Return the N most recent messages in a conversation (for reply context)."""
    from sqlalchemy import select

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    # Reverse so chronological order is maintained
    messages = list(result.scalars().all())
    messages.reverse()
    return messages
