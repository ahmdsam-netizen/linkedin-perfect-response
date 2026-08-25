"""
app/ai/output_models.py
=======================
Pydantic schemas for LangChain structured output in Version 2.
"""

from typing import Literal

from pydantic import BaseModel, Field

# ── 1. Reply Generation Output Models ─────────────────────────────────────────

ReplyStyle = Literal["professional", "conversational", "concise"]


class ReplySuggestion(BaseModel):
    """A single reply alternative in a specific tone/style."""
    style: ReplyStyle = Field(description="The tone/style of this suggestion.")
    text: str = Field(description="The reply text written in the user's authentic first-person voice.")


class GeneratedReplies(BaseModel):
    """Structured output for the 3 distinct reply alternatives."""
    replies: list[ReplySuggestion] = Field(
        description="Exactly three reply suggestions: professional, conversational, concise.",
        min_length=3,
        max_length=3,
    )


# ── 2. Memory & Summary Extraction Output Models ──────────────────────────────


class FactItem(BaseModel):
    """A single long-term fact extracted from a message slice."""
    content: str = Field(
        description=(
            "Concise single fact. Who said/did/plans WHAT. "
            "Max 25 words. Example: 'User told contact they are building Project Nebula using React.'"
        )
    )
    memory_type: Literal[
        "PROJECT", "WORK", "TECHNOLOGY", "PREFERENCE", "COMMITMENT", "PERSON", "OTHER"
    ] = Field(description="Category of the fact.")


class MemoryExtractionOutput(BaseModel):
    """Structured output from the unified memory extraction and summarization chain."""
    summary_chunk: str = Field(
        description=(
            "1–3 sentence micro-summary of THIS message slice only (40–70 words). "
            "Cover key topics and outcomes. Do NOT repeat previous summary content."
        )
    )
    new_facts: list[FactItem] = Field(
        description="Meaningful long-term facts worth remembering.",
        default_factory=list,
    )
    superseded_fact_ids: list[str] = Field(
        description="IDs of existing facts contradicted or updated by the new messages.",
        default_factory=list,
    )
