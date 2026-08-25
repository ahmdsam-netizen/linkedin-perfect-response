"""
app/services/conversation_service.py
=====================================
Find-or-create a Conversation and update its processing pointer.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation

logger = logging.getLogger(__name__)


async def find_or_create_conversation(
    db: AsyncSession,
    *,
    user_id: str,
    contact_id: str,
    linkedin_conversation_id: str,
) -> Conversation:
    """Return an existing Conversation or create one if not found.

    Args:
        db: Active async database session.
        user_id: Internal User.id.
        contact_id: Internal Contact.id.
        linkedin_conversation_id: LinkedIn thread identifier.

    Returns:
        The Conversation ORM object.
    """
    result = await db.execute(
        select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.linkedin_conversation_id == linkedin_conversation_id,
        )
    )
    conversation = result.scalar_one_or_none()

    if conversation is not None:
        return conversation

    conversation = Conversation(
        user_id=user_id,
        contact_id=contact_id,
        linkedin_conversation_id=linkedin_conversation_id,
    )
    db.add(conversation)
    await db.flush()
    logger.info(
        "Created conversation: id=%s linkedin_id=%s",
        conversation.id,
        linkedin_conversation_id,
    )
    return conversation


async def get_conversation_by_id(
    db: AsyncSession,
    conversation_id: str,
) -> Conversation | None:
    """Return a Conversation by its internal UUID."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    return result.scalar_one_or_none()


async def update_processing_pointer(
    db: AsyncSession,
    *,
    conversation_id: str,
    last_processed_message_id: str,
) -> None:
    """Update last_processed_message_id after successful memory processing."""
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conversation = result.scalar_one_or_none()
    if conversation:
        conversation.last_processed_message_id = last_processed_message_id
        logger.debug(
            "Updated processing pointer: conversation=%s message=%s",
            conversation_id,
            last_processed_message_id,
        )
