"""
app/services/memory_processor.py
==================================
Unified memory processing pipeline.

Orchestrates:
  1. Heuristic noise filter — skip LLM if all messages are trivial (0 tokens)
  2. Single LLM call — unified micro-summary + fact extraction + supersession
  3. DB transaction — append chunk, bulk-insert memories, supersede old facts
  4. Batch embedding generation — one Gemini API call for all new facts
  5. Update processing pointer

This module is the only place in the application that decides whether to
call the LLM for memory extraction. All callers (reply_service) simply
call process_if_needed() and let this module decide.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.chains import run_memory_extraction
from app.core.config import get_settings
from app.core.heuristics import all_messages_trivial, filter_substantive
from app.db.models import Conversation, Message
from app.services import (
    conversation_service,
    embedding_service,
    memory_service,
    message_service,
    summary_chunk_service,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _format_messages_for_llm(messages: list[Message], user_name: str, contact_name: str) -> str:
    """Format messages as a compact conversation transcript for the LLM."""
    lines = []
    for msg in messages:
        speaker = user_name if msg.sender_type == "USER" else contact_name
        lines.append(f"{speaker}: {msg.content}")
    return "\n".join(lines)


def _format_existing_facts(memories: list) -> str:
    """Format existing active memories for the LLM's contradiction check."""
    if not memories:
        return "(none)"
    lines = [f"[{m.id}] {m.content}" for m in memories]
    return "\n".join(lines)


async def process_if_needed(
    db: AsyncSession,
    *,
    conversation: Conversation,
    user_name: str,
    contact_name: str,
    contact_id: str,
    user_id: str,
    force: bool = False,
) -> bool:
    """Process unprocessed messages into memory if threshold is met.

    Args:
        db: Active async database session.
        conversation: The Conversation ORM object.
        user_name: Display name of the replying user (for LLM context).
        contact_name: Display name of the contact (for LLM context).
        contact_id: Internal Contact.id for memory scoping.
        user_id: Internal User.id for memory scoping.
        force: If True, process even if below threshold (e.g. on reply request).

    Returns:
        True if memory processing was executed, False if skipped.
    """
    # 1. Load unprocessed messages
    unprocessed = await message_service.get_unprocessed_messages(
        db,
        conversation_id=conversation.id,
        last_processed_message_id=conversation.last_processed_message_id,
    )

    if not unprocessed:
        logger.debug("No unprocessed messages for conversation %s.", conversation.id)
        return False

    # 2. Check threshold
    count = len(unprocessed)
    threshold = settings.memory_process_threshold
    if not force and count < threshold:
        logger.debug(
            "Skipping memory processing: %d unprocessed < threshold %d.", count, threshold
        )
        return False

    # 3. Heuristic noise filter — 0 LLM tokens for pure trivial batches
    contents = [m.content for m in unprocessed]
    if all_messages_trivial(contents):
        # Advance the processing pointer without calling the LLM
        last_id = unprocessed[-1].id
        await conversation_service.update_processing_pointer(
            db, conversation_id=conversation.id, last_processed_message_id=last_id
        )
        logger.info(
            "All %d unprocessed messages are trivial — skipped LLM (0 tokens).", count
        )
        return False

    # 4. Filter substantive messages for LLM (reduce tokens further)
    substantive = filter_substantive(contents)
    substantive_messages = [m for m in unprocessed if not all_messages_trivial([m.content])]

    # 5. Load context for the LLM
    existing_memories = await memory_service.get_active_memories(
        db, user_id=user_id, contact_id=contact_id
    )
    latest_chunks = await summary_chunk_service.get_latest_chunks(
        db, conversation_id=conversation.id, limit=1
    )
    previous_summary = latest_chunks[0].summary_chunk if latest_chunks else "(none)"
    existing_facts_text = _format_existing_facts(existing_memories)
    messages_text = _format_messages_for_llm(substantive_messages, user_name, contact_name)

    # 6. Single LLM call: micro-summary + facts + superseded IDs
    logger.info(
        "Running memory extraction for conversation %s (%d substantive messages).",
        conversation.id,
        len(substantive_messages),
    )
    try:
        extraction = await run_memory_extraction({
            "contact_name": contact_name,
            "user_name": user_name,
            "previous_summary": previous_summary,
            "existing_facts": existing_facts_text,
            "messages_text": messages_text,
        })
    except Exception as exc:
        logger.error("Memory extraction LLM call failed: %s", exc, exc_info=True)
        return False

    # 7. DB transaction: append chunk, create memories, supersede old, update pointer
    try:
        # Append micro-summary chunk
        await summary_chunk_service.append_chunk(
            db,
            conversation_id=conversation.id,
            summary_chunk=extraction.summary_chunk,
        )

        # Bulk-create new memory facts (without embeddings yet)
        new_memories = []
        if extraction.new_facts:
            new_memories = await memory_service.bulk_create_memories(
                db,
                user_id=user_id,
                contact_id=contact_id,
                facts=[
                    {"content": f.content, "memory_type": f.memory_type}
                    for f in extraction.new_facts
                ],
            )

        # Supersede contradicted facts
        if extraction.superseded_fact_ids:
            await memory_service.supersede_memories(
                db, memory_ids=extraction.superseded_fact_ids
            )

        # Update processing pointer to last message in the batch
        await conversation_service.update_processing_pointer(
            db,
            conversation_id=conversation.id,
            last_processed_message_id=unprocessed[-1].id,
        )

        # Commit before generating embeddings (embeddings don't need to be atomic)
        await db.commit()

        # 8. Batch-generate embeddings (one Gemini API call for all new facts)
        if new_memories:
            await embedding_service.embed_and_store_memories(db, new_memories)
            await db.commit()

        logger.info(
            "Memory processing complete: conversation=%s chunk_added=True "
            "new_facts=%d superseded=%d",
            conversation.id,
            len(new_memories),
            len(extraction.superseded_fact_ids),
        )
        return True

    except Exception as exc:
        logger.error("Memory processing DB transaction failed: %s", exc, exc_info=True)
        await db.rollback()
        return False
