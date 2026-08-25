"""
app/api/routes/memory.py
========================
FastAPI routes for memory inspection and debugging.

Endpoints:
  - GET /api/v1/conversations/{conversation_id}/summary-chunks (inspect chunks)
  - GET /api/v1/conversations/{conversation_id}/memories (inspect contact facts)
  - POST /api/v1/memory/process (manually trigger memory processing)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import Conversation, Memory, SummaryChunk
from app.schemas.memory import (
    MemoryListResponse,
    MemoryOut,
    SummaryChunkListResponse,
    SummaryChunkOut,
)
from app.services import conversation_service, memory_processor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["Memory & Summary Inspection"])


class ProcessMemoryRequest(BaseModel):
    conversation_id: str
    user_name: str = "LinkedIn User"
    contact_name: str = "Contact"


@router.get(
    "/conversations/{conversation_id}/summary-chunks",
    response_model=SummaryChunkListResponse,
    summary="Get all micro-summary chunks for a conversation",
)
async def get_summary_chunks(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
) -> SummaryChunkListResponse:
    """Return all episodic summary chunks for a conversation in chronological order."""
    result = await db.execute(
        select(SummaryChunk)
        .where(SummaryChunk.conversation_id == conversation_id)
        .order_by(SummaryChunk.chunk_index)
    )
    chunks = result.scalars().all()
    return SummaryChunkListResponse(
        chunks=[
            SummaryChunkOut(
                id=c.id,
                chunk_index=c.chunk_index,
                summary_chunk=c.summary_chunk,
                created_at=c.created_at,
            )
            for c in chunks
        ],
        total=len(chunks),
    )


@router.get(
    "/conversations/{conversation_id}/memories",
    response_model=MemoryListResponse,
    summary="Get all memories/facts for a contact via conversation ID",
)
async def get_contact_memories(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
) -> MemoryListResponse:
    """Return all active and superseded memories for the contact of this conversation."""
    convo = await conversation_service.get_conversation_by_id(db, conversation_id)
    if convo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation not found: {conversation_id}",
        )

    result = await db.execute(
        select(Memory)
        .where(
            Memory.user_id == convo.user_id,
            Memory.contact_id == convo.contact_id,
        )
        .order_by(Memory.created_at.desc())
    )
    memories = result.scalars().all()
    return MemoryListResponse(
        memories=[
            MemoryOut(
                id=m.id,
                content=m.content,
                memory_type=m.memory_type,
                status=m.status,
                created_at=m.created_at,
            )
            for m in memories
        ],
        total=len(memories),
    )


@router.post(
    "/memory/process",
    summary="Manually trigger memory processing for a conversation",
)
async def trigger_memory_process(
    payload: ProcessMemoryRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force memory processing of any unprocessed messages in the conversation."""
    convo = await conversation_service.get_conversation_by_id(db, payload.conversation_id)
    if convo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation not found: {payload.conversation_id}",
        )

    processed = await memory_processor.process_if_needed(
        db,
        conversation=convo,
        user_name=payload.user_name,
        contact_name=payload.contact_name,
        contact_id=convo.contact_id,
        user_id=convo.user_id,
        force=True,
    )
    return {"processed": processed, "conversation_id": payload.conversation_id}
