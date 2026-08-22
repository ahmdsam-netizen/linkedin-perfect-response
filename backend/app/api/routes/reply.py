"""
app/api/routes/reply.py
========================
FastAPI route for the reply generation endpoint.

Responsibilities:
- Define the POST /api/v1/reply/generate endpoint.
- Delegate all business logic to reply_service.
- Map service exceptions to appropriate HTTP error responses.
- Never expose internal details (API keys, stack traces, prompt internals) to the client.
"""

import logging

from fastapi import APIRouter, HTTPException, status

from app.schemas.request import GenerateReplyRequest
from app.schemas.response import GenerateReplyResponse
from app.services import reply_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reply", tags=["Reply Generation"])


@router.post(
    "/generate",
    response_model=GenerateReplyResponse,
    summary="Generate LinkedIn reply suggestions",
    description=(
        "Accepts a structured LinkedIn conversation context from the Chrome "
        "extension and returns three AI-generated reply suggestions: "
        "professional, conversational, and concise."
    ),
    responses={
        200: {"description": "Three reply suggestions generated successfully."},
        422: {"description": "Request validation error (invalid payload)."},
        502: {"description": "Upstream AI service error (Gemini unavailable)."},
        500: {"description": "Unexpected internal server error."},
    },
)
async def generate_reply(
    request: GenerateReplyRequest,
) -> GenerateReplyResponse:
    """Generate three contextual reply suggestions for a LinkedIn conversation.

    The request body must contain:
    - The conversation messages (at least one required).
    - The recipient's profile information.
    - The user's profile and optional objective.

    The endpoint runs a two-pass AI pipeline:
    1. Conversation analysis (Gemini call #1).
    2. Reply generation based on the analysis (Gemini call #2).
    """
    try:
        return await reply_service.generate_reply(request)

    except ValueError as exc:
        # Input-related errors (e.g., empty conversation caught at service level).
        logger.warning("Value error in reply generation: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        # LangChain chain produced unexpected output.
        logger.error("Runtime error in reply generation: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "The AI service returned an unexpected response. "
                "Please try again."
            ),
        ) from exc

    except Exception as exc:  # noqa: BLE001
        # Catch-all: includes Gemini API errors, network failures, etc.
        # Log the full error internally but return a safe message to the client.
        error_type = type(exc).__name__

        # Detect common Gemini / Google API error patterns by inspecting the
        # exception class name and message — without importing provider internals.
        error_str = str(exc).lower()
        is_api_error = any(
            keyword in error_str
            for keyword in (
                "api key",
                "quota",
                "rate limit",
                "unavailable",
                "deadline exceeded",
                "invalid argument",
                "permission denied",
                "resource exhausted",
            )
        )

        if is_api_error or "google" in error_type.lower():
            logger.error(
                "Gemini API error during reply generation [%s]: %s",
                error_type,
                exc,
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "The AI service is temporarily unavailable. "
                    "Please try again in a moment."
                ),
            ) from exc

        logger.error(
            "Unexpected error during reply generation [%s]: %s",
            error_type,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred. Please try again.",
        ) from exc
