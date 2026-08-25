"""
app/services/context_builder.py
================================
Token-budgeted context assembler for the V2 single-pass RAG reply prompt.

Partitions context into:
  1. Past Conversation History: Summary chunks covering earlier discussion.
  2. Immediate Ongoing Exchange: Recent uncompressed messages before the summary threshold.
  3. Recalled Long-Term Facts: Top-3 semantically retrieved contact facts.
  4. User Profile & Objective: Target tone and reply instructions.

Target budget: ~550–650 tokens total.
"""

import logging

from app.db.models import Message, SummaryChunk

logger = logging.getLogger(__name__)

# ── Token budget constants ────────────────────────────────────────────────────
_MAX_SUMMARY_WORDS = 80        # ~106 tokens — covers 1–2 chunks
_MAX_FACT_CHARS = 120          # ~30 tokens per fact — covers top 3
_MAX_RECENT_MESSAGES = 8       # ~200 tokens for immediate working buffer
_MAX_CONTACT_HEADLINE_CHARS = 100


def _format_recent_conversation(
    messages: list[Message],
    user_name: str,
    contact_name: str,
) -> str:
    """Format recent unsummarized messages as the active ongoing exchange transcript."""
    if not messages:
        return "(no recent messages in active buffer)"
    lines = []
    for msg in messages:
        speaker = user_name if msg.sender_type == "USER" else contact_name
        # Truncate very long individual messages to protect token budget
        content = msg.content[:300] + "…" if len(msg.content) > 300 else msg.content
        lines.append(f"{speaker}: {content}")
    return "\n".join(lines)


def _format_summary_chunks(chunks: list[SummaryChunk]) -> str:
    """Concatenate episodic summary chunks into a single bounded background history string."""
    if not chunks:
        return "(No past summarized history yet — this is a new or ongoing exchange)"
    combined = " ".join(c.summary_chunk for c in chunks)
    # Enforce strict word budget
    words = combined.split()
    if len(words) > _MAX_SUMMARY_WORDS:
        combined = " ".join(words[:_MAX_SUMMARY_WORDS]) + "…"
    return combined


def _format_facts(facts: list[dict]) -> str:
    """Format retrieved semantic facts as a bullet list."""
    if not facts:
        return "(none recalled)"
    lines = []
    for f in facts:
        content = f["content"]
        if len(content) > _MAX_FACT_CHARS:
            content = content[:_MAX_FACT_CHARS] + "…"
        lines.append(f"• {content}")
    return "\n".join(lines)


def _build_search_query(
    recent_messages: list[Message],
    instruction: str | None,
) -> str:
    """Build the semantic search query from recent context + user instruction."""
    parts = []
    if instruction and instruction.strip():
        parts.append(instruction.strip())
    # Take last 2 messages for search query
    for msg in recent_messages[-2:]:
        parts.append(msg.content[:200])
    return " ".join(parts) or "general conversation context"


def build_reply_context(
    *,
    user_name: str,
    user_role: str,
    contact_name: str,
    contact_headline: str | None,
    relationship: str,
    summary_chunks: list[SummaryChunk],
    relevant_facts: list[dict],
    recent_messages: list[Message],
    instruction: str | None,
    tone: str | None,
) -> dict:
    """Assemble all partitioned context variables for REPLY_GENERATION_PROMPT.

    Returns a flat dict mapping to prompt template variables.
    Every value is pre-trimmed to stay strictly within the token budget.
    """
    headline = (contact_headline or "")[:_MAX_CONTACT_HEADLINE_CHARS]
    objective = instruction or "Continue the conversation naturally and helpfully."
    style = tone or "professional"

    context = {
        "contact_name": contact_name,
        "contact_headline": headline,
        "relationship": relationship or "LinkedIn connection",
        "conversation_summary": _format_summary_chunks(summary_chunks),
        "relevant_facts": _format_facts(relevant_facts),
        "recent_conversation": _format_recent_conversation(
            recent_messages, user_name, contact_name
        ),
        "user_name": user_name,
        "user_role": user_role or "Professional",
        "objective": objective,
        "style_preference": style,
    }

    logger.debug(
        "Built reply context: facts=%d chunks=%d recent_msgs=%d",
        len(relevant_facts),
        len(summary_chunks),
        len(recent_messages),
    )
    return context


def get_search_query(
    recent_messages: list[Message],
    instruction: str | None,
) -> str:
    """Public helper used by reply_service to build the semantic search query."""
    return _build_search_query(recent_messages, instruction)
