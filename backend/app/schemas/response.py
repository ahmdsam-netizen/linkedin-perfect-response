"""
app/schemas/response.py
=======================
Pydantic models for the HTTP response sent back to the Chrome extension.

The response deliberately exposes only what the extension needs.
Internal LLM output details, prompt contents, and API keys are never included.
"""

from typing import Literal

from pydantic import BaseModel, Field

from app.ai.output_models import ConversationAnalysis


# ── Reply suggestion ──────────────────────────────────────────────────────────


class ReplySuggestionResponse(BaseModel):
    """A single reply suggestion returned to the Chrome extension."""

    style: Literal["professional", "conversational", "concise"] = Field(
        description="The communication style of this reply."
    )
    text: str = Field(description="The generated reply text.")


# ── Optional analysis summary ─────────────────────────────────────────────────


class ConversationAnalysisSummary(BaseModel):
    """A trimmed version of the internal ConversationAnalysis for the response.

    We surface a subset of the analysis so the extension can optionally
    display context (e.g., main topic, detected intent) without exposing
    internal prompt engineering details.
    """

    main_topic: str
    tone: str
    conversation_stage: str
    last_message_intent: str

    @classmethod
    def from_analysis(
        cls, analysis: ConversationAnalysis
    ) -> "ConversationAnalysisSummary":
        return cls(
            main_topic=analysis.main_topic,
            tone=analysis.tone,
            conversation_stage=analysis.conversation_stage,
            last_message_intent=analysis.last_message_intent,
        )


# ── Top-level response ────────────────────────────────────────────────────────


class GenerateReplyResponse(BaseModel):
    """Response body for POST /api/v1/reply/generate.

    Includes `reply` (primary suggestion text for legacy/simple clients)
    and `replies` array (all three suggestions: professional, conversational, concise).
    Optionally includes `analysis` if the extension wants to display context.
    """

    reply: str = Field(
        default="",
        description="Primary generated reply text (convenience alias for replies[0].text).",
    )
    replies: list[ReplySuggestionResponse] = Field(
        description="Exactly three reply suggestions: professional, conversational, concise.",
        min_length=3,
        max_length=3,
    )
    analysis: ConversationAnalysisSummary | None = Field(
        default=None,
        description=(
            "Optional summary of the conversation analysis. "
            "Included for transparency; the extension may display or ignore it."
        ),
    )

