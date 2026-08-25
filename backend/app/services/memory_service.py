"""
app/services/memory_service.py
================================
CRUD operations for contact-scoped Memory (fact) records.
"""

import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Memory

logger = logging.getLogger(__name__)


async def get_active_memories(
    db: AsyncSession,
    *,
    user_id: str,
    contact_id: str,
) -> list[Memory]:
    """Return all ACTIVE memories for a (user, contact) pair.

    Used by the memory processor to pass existing facts to the LLM for
    contradiction/supersession detection.
    """
    result = await db.execute(
        select(Memory).where(
            Memory.user_id == user_id,
            Memory.contact_id == contact_id,
            Memory.status == "ACTIVE",
        )
    )
    return list(result.scalars().all())


async def create_memory(
    db: AsyncSession,
    *,
    user_id: str,
    contact_id: str,
    content: str,
    memory_type: str,
) -> Memory:
    """Insert a new ACTIVE memory fact (without embedding — set later by embedding service)."""
    memory = Memory(
        user_id=user_id,
        contact_id=contact_id,
        content=content,
        memory_type=memory_type,
        status="ACTIVE",
    )
    db.add(memory)
    await db.flush()
    logger.debug("Created memory: id=%s type=%s", memory.id, memory_type)
    return memory


async def bulk_create_memories(
    db: AsyncSession,
    *,
    user_id: str,
    contact_id: str,
    facts: list[dict],  # [{"content": str, "memory_type": str}]
) -> list[Memory]:
    """Bulk-insert multiple memory facts and return them all."""
    memories = []
    for fact in facts:
        memory = Memory(
            user_id=user_id,
            contact_id=contact_id,
            content=fact["content"],
            memory_type=fact["memory_type"],
            status="ACTIVE",
        )
        db.add(memory)
        memories.append(memory)
    await db.flush()
    logger.info(
        "Bulk-created %d memories for user=%s contact=%s",
        len(memories),
        user_id,
        contact_id,
    )
    return memories


async def supersede_memories(
    db: AsyncSession,
    *,
    memory_ids: list[str],
) -> int:
    """Mark a list of memories as SUPERSEDED.

    Args:
        db: Active async database session.
        memory_ids: List of Memory.id values to supersede.

    Returns:
        Number of rows updated.
    """
    if not memory_ids:
        return 0
    result = await db.execute(
        update(Memory)
        .where(Memory.id.in_(memory_ids), Memory.status == "ACTIVE")
        .values(status="SUPERSEDED")
    )
    count = result.rowcount
    logger.info("Superseded %d memories: ids=%s", count, memory_ids)
    return count
