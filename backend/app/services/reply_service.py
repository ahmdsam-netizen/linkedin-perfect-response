"""
app/services/reply_service.py
==============================
Main orchestration service for reply generation.

This is the single entry point the API route calls.  It coordinates:
    1. Conversation analysis (ConversationService)
    2. Context building (ContextService)
    3. Reply generation (LangChain + Gemini)
    4. Response assembly

This service has NO knowledge of FastAPI, HTTP status codes, or request objects
beyond the validated Pydantic model it receives.
"""

import logging

from app.ai.chains import run_reply_generation
from app.schemas.request import GenerateReplyRequest
from app.schemas.response import (
    ConversationAnalysisSummary,
    GenerateReplyResponse,
    ReplySuggestionResponse,
)
from app.services.context_service import build_reply_generation_context
from app.services.conversation_service import analyze_conversation

logger = logging.getLogger(__name__)


async def generate_reply(request: GenerateReplyRequest) -> GenerateReplyResponse:
    """Orchestrate the full reply generation pipeline.

    Steps:
        1. Analyse the conversation (Gemini call #1).
        2. Build the generation context (pure Python).
        3. Generate 3 reply alternatives (Gemini call #2).
        4. Assemble and return the response.

    Args:
        request: Validated GenerateReplyRequest from the Chrome extension.

    Returns:
        A GenerateReplyResponse with 3 reply suggestions and an analysis summary.

    Raises:
        Any exception raised by the LangChain chains is allowed to propagate
        to the API route, which maps them to appropriate HTTP error responses.
    """
    user_name = request.resolved_user_name
    recipient_name = request.resolved_recipient_name

    logger.info(
        "Starting reply generation | user=%s recipient=%s messages=%d",
        user_name,
        recipient_name,
        len(request.context.messages),
    )

    # ── Step 1: Analyse the conversation ─────────────────────────────────────
    analysis = await analyze_conversation(
        context=request.context,
        user_profile=request.user_profile,
        user_name=user_name,
        recipient_name=recipient_name,
    )

    # ── Step 2: Build generation context ─────────────────────────────────────
    generation_context = build_reply_generation_context(
        request=request,
        analysis=analysis,
    )

    # ── Step 3: Generate reply suggestions ───────────────────────────────────
    logger.info("Running reply generation chain.")
    generated = await run_reply_generation(generation_context)

    # ── Step 4: Assemble response ─────────────────────────────────────────────
    replies = [
        ReplySuggestionResponse(style=suggestion.style, text=suggestion.text)
        for suggestion in generated.replies
    ]

    analysis_summary = ConversationAnalysisSummary.from_analysis(analysis)

    response = GenerateReplyResponse(
        reply=replies[0].text if replies else "",
        replies=replies,
        analysis=analysis_summary,
    )

    logger.info(
        "Reply generation complete | %d replies generated.", len(replies)
    )
    return response
