"""
app/api/routes/conversations.py
================================
FastAPI routes for conversation synchronization.

POST /api/v1/conversations/sync
  - Upserts user & contact
  - Upserts conversation
  - Batch-inserts new messages (SHA-256 deduplication)
  - Returns conversation_id, user_id, contact_id, and new_messages_count
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.request import SyncRequest
from app.schemas.response import SyncResponse
from app.services import (
    contact_service,
    conversation_service,
    message_service,
    user_service,
)
from app.services.message_service import MessageIn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.post(
    "/sync",
    response_model=SyncResponse,
    summary="Synchronize a LinkedIn conversation",
    description=(
        "Upserts the user, contact, and conversation records, and batch-inserts "
        "any new messages using SHA-256 content-hash deduplication."
    ),
    responses={
        200: {"description": "Conversation synchronized successfully."},
        422: {"description": "Validation error in payload."},
        500: {"description": "Internal database error."},
    },
)
async def sync_conversation(
    payload: SyncRequest,
    db: AsyncSession = Depends(get_db),
) -> SyncResponse:
    """Synchronize conversation metadata and messages from the Chrome extension."""
    try:
        # 1. Upsert User
        user = await user_service.find_or_create_user(
            db,
            linkedin_id=payload.user.linkedin_id,
            name=payload.user.name,
        )

        # 2. Upsert Contact
        contact = await contact_service.find_or_create_contact(
            db,
            user_id=user.id,
            linkedin_profile_id=payload.contact.linkedin_profile_id,
            name=payload.contact.name,
            headline=payload.contact.headline,
        )

        # 3. Upsert Conversation
        conversation = await conversation_service.find_or_create_conversation(
            db,
            user_id=user.id,
            contact_id=contact.id,
            linkedin_conversation_id=payload.conversation.linkedin_conversation_id,
        )

        # 4. Batch-insert messages
        messages_to_insert = [
            MessageIn(sender_type=m.sender_type, content=m.content)
            for m in payload.messages
        ]
        new_count = await message_service.batch_insert_messages(
            db,
            conversation_id=conversation.id,
            messages=messages_to_insert,
        )

        return SyncResponse(
            conversation_id=conversation.id,
            new_messages_count=new_count,
            user_id=user.id,
            contact_id=contact.id,
        )

    except Exception as exc:
        logger.error("Error during conversation sync: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to synchronize conversation.",
        ) from exc
