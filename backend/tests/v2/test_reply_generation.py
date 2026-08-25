"""
tests/v2/test_reply_generation.py
=================================
Tests for token-budgeted context building and single-pass RAG reply generation.
"""

from app.db.models import Message, SummaryChunk
from app.services import context_builder


def test_build_reply_context_token_budget():
    """Verify that context_builder respects token budgets and truncates safely."""
    # 1. Very long message
    long_text = "A" * 1000
    messages = [
        Message(id="m1", sender_type="USER", content="Hey John, how is the project going?", content_hash="h1"),
        Message(id="m2", sender_type="CONTACT", content=long_text, content_hash="h2"),
    ]

    # 2. Long summary chunk
    long_summary = "word " * 200
    chunks = [
        SummaryChunk(id="c1", conversation_id="conv-1", chunk_index=0, summary_chunk=long_summary),
    ]

    # 3. Facts
    facts = [
        {"id": "f1", "content": "Fact 1: " + "detail " * 50, "memory_type": "PROJECT"},
    ]

    context = context_builder.build_reply_context(
        user_name="Sayem Ahmad",
        user_role="Lead Software Engineer",
        contact_name="John Doe",
        contact_headline="Director of Engineering at Microsoft",
        relationship="Colleague",
        summary_chunks=chunks,
        relevant_facts=facts,
        recent_messages=messages,
        instruction="Ask for an update on Project Nebula",
        tone="professional",
    )

    assert context["contact_name"] == "John Doe"
    assert "Sayem Ahmad" in context["user_name"]
    # Check that summary was capped
    assert len(context["conversation_summary"].split()) <= 85
    # Check that long message was truncated with ellipsis
    assert "…" in context["recent_conversation"]
    # Check facts are formatted with bullet points
    assert context["relevant_facts"].startswith("• ")
