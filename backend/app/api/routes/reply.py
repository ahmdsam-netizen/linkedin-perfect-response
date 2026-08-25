"""
app/api/routes/reply.py
========================
FastAPI route for single-pass RAG reply generation using persistent conversation memory.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.request import GenerateReplyRequest
from app.schemas.response import GenerateReplyResponse
from app.services import reply_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reply", tags=["Reply Generation"])


@router.post(
    "/generate",
    response_model=GenerateReplyResponse,
    summary="Generate LinkedIn reply suggestions using persistent memory",
    description=(
        "Accepts a synced conversation ID and generates 3 context-aware reply suggestions "
        "using contact-scoped semantic facts, recent micro-summary chunks, and recent messages."
    ),
    responses={
        200: {"description": "Reply suggestions generated successfully."},
        404: {"description": "Conversation not found."},
        422: {"description": "Request validation error."},
        502: {"description": "Upstream AI service error (Gemini unavailable)."},
        500: {"description": "Unexpected internal server error."},
    },
)
async def generate_reply(
    request: GenerateReplyRequest,
    db: AsyncSession = Depends(get_db),
) -> GenerateReplyResponse:
    """Generate three contextual reply suggestions for a synced LinkedIn conversation."""
    try:
        result = await reply_service.generate_reply(
            db,
            conversation_id=request.conversation_id,
            user_name=request.user_name,
            user_role=request.user_role,
            contact_name=request.contact_name,
            contact_headline=request.contact_headline,
            relationship=request.relationship,
            instruction=request.instruction,
            tone=request.tone,
        )
        return GenerateReplyResponse(**result)

    except ValueError as exc:
        logger.warning("Conversation not found or invalid value: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        logger.error("AI service error during reply generation: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI service returned an unexpected response. Please try again.",
        ) from exc

    except Exception as exc:
        logger.error("Unexpected error during reply generation: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again.",
        ) from exc
