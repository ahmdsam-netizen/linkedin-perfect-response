"""
app/services/reply_service.py
==============================
V2 single-pass RAG reply orchestrator with Hybrid Working-Buffer & Dynamic Budgeting.

Pipeline (8 steps):
  1. Load conversation + user + contact from DB
  2. Count unprocessed messages
  3. Run memory processor if needed (lazy, only on reply request)
  4. Fetch recent unsummarized messages (immediate working buffer)
  5. Dynamic Prompt Budgeting: load 1 summary chunk if buffer is large (>=6 msgs), else 2 chunks
  6. Contact-scoped semantic search (top-3 facts)
  7. Assemble partitioned context (Past History + Immediate Buffer + Facts)
  8. Single LangChain call → 3 styled replies
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chains import run_reply_generation
from app.core.config import get_settings
from app.services import (
    context_builder,
    conversation_service,
    memory_processor,
    message_service,
    retrieval_service,
    summary_chunk_service,
)

logger = logging.getLogger(__name__)
settings = get_settings()


async def generate_reply(
    db: AsyncSession,
    *,
    conversation_id: str,
    user_name: str,
    user_role: str,
    contact_name: str,
    contact_headline: str | None,
    relationship: str | None,
    instruction: str | None,
    tone: str | None,
) -> dict:
    """Execute the full V2 RAG reply pipeline with dynamic prompt budgeting.

    Args:
        db: Active async database session.
        conversation_id: Internal Conversation.id.
        user_name: Name of the replying user.
        user_role: Role/title of the replying user.
        contact_name: Name of the LinkedIn contact.
        contact_headline: Contact's LinkedIn headline.
        relationship: Relationship description.
        instruction: User's reply objective.
        tone: Preferred tone override.

    Returns:
        dict with keys: reply, replies, memory_context

    Raises:
        ValueError: If the conversation is not found.
        RuntimeError: If the LLM call fails.
    """
    # 1. Load conversation
    conversation = await conversation_service.get_conversation_by_id(db, conversation_id)
    if conversation is None:
        raise ValueError(f"Conversation not found: {conversation_id}")

    user_id = conversation.user_id
    contact_id = conversation.contact_id

    # 2. Lazy memory processing on reply request (if threshold is met)
    processed = await memory_processor.process_if_needed(
        db,
        conversation=conversation,
        user_name=user_name,
        contact_name=contact_name,
        contact_id=contact_id,
        user_id=user_id,
        force=False,
    )

    if processed:
        conversation = await conversation_service.get_conversation_by_id(db, conversation_id)

    # 3. Fetch recent unsummarized messages (immediate working memory buffer)
    recent_messages = await message_service.get_recent_messages(
        db,
        conversation_id=conversation_id,
        limit=settings.recent_messages_count,
    )

    # 4. Dynamic Prompt Budgeting:
    # If recent message buffer is full (>= 6 messages), load only 1 summary chunk (~35 tokens).
    # If recent buffer has fewer messages (< 6 messages), load 2 chunks (~70 tokens) for deeper history.
    chunk_limit = 1 if len(recent_messages) >= 6 else 2
    summary_chunks = await summary_chunk_service.get_latest_chunks(
        db, conversation_id=conversation_id, limit=chunk_limit
    )

    # 5. Semantic search (gracefully returns [] on failure)
    search_query = context_builder.get_search_query(recent_messages, instruction)
    relevant_facts = await retrieval_service.semantic_search(
        db,
        query=search_query,
        user_id=user_id,
        contact_id=contact_id,
    )

    # 6. Build partitioned token-budgeted context
    context = context_builder.build_reply_context(
        user_name=user_name,
        user_role=user_role,
        contact_name=contact_name,
        contact_headline=contact_headline,
        relationship=relationship or "LinkedIn connection",
        summary_chunks=summary_chunks,
        relevant_facts=relevant_facts,
        recent_messages=recent_messages,
        instruction=instruction,
        tone=tone,
    )

    # 7. Single-pass LLM call
    logger.info(
        "Generating reply: conversation=%s facts=%d chunks=%d (limit=%d) recent_buffer=%d",
        conversation_id,
        len(relevant_facts),
        len(summary_chunks),
        chunk_limit,
        len(recent_messages),
    )
    generated = await run_reply_generation(context)

    # 8. Assemble response
    replies = [
        {"style": r.style, "text": r.text}
        for r in generated.replies
    ]
    primary_reply = replies[0]["text"] if replies else ""

    return {
        "reply": primary_reply,
        "replies": replies,
        "memory_context": {
            "summary_used": len(summary_chunks) > 0,
            "facts_retrieved": len(relevant_facts),
            "recent_messages_used": len(recent_messages),
        },
    }
