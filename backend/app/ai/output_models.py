"""
app/ai/output_models.py
=======================
Pydantic models that describe the *structured output* expected from Gemini.

These are NOT HTTP schemas — they are the contracts between the LangChain
chains and the application. LangChain's `with_structured_output()` will
enforce that the LLM returns data matching these models.
"""

from typing import Literal

from pydantic import BaseModel, Field


# ── Conversation Analysis ─────────────────────────────────────────────────────


class ConversationAnalysis(BaseModel):
    """Structured output from the conversation analysis chain.

    Gemini must populate every field. The model is instructed not to generate
    reply text here — analysis only.
    """

    main_topic: str = Field(
        description="The primary subject of the conversation in a short phrase."
    )
    topics: list[str] = Field(
        description="List of specific topics, technologies, or themes discussed."
    )
    tone: str = Field(
        description=(
            "Overall tone of the conversation "
            "(e.g. 'professional', 'casual and friendly', 'technical')."
        )
    )
    conversation_stage: str = Field(
        description=(
            "Current stage of the conversation "
            "(e.g. 'initial outreach', 'ongoing discussion', 'closing', "
            "'technical deep-dive', 'rapport building')."
        )
    )
    important_facts: list[str] = Field(
        description=(
            "Key facts, positions, technologies, or decisions explicitly "
            "mentioned in the conversation. Do not invent facts."
        )
    )
    open_questions: list[str] = Field(
        description=(
            "Questions or topics raised in the conversation that have not "
            "yet been answered or resolved."
        )
    )
    last_message_intent: str = Field(
        description=(
            "The intent or purpose behind the most recent message in the "
            "conversation (e.g. 'asking for technical opinion', "
            "'scheduling a meeting', 'introducing themselves')."
        )
    )


# ── Reply Generation ──────────────────────────────────────────────────────────

ReplyStyle = Literal["professional", "conversational", "concise"]


class ReplySuggestion(BaseModel):
    """A single generated reply suggestion."""

    style: ReplyStyle = Field(
        description=(
            "The communication style of this reply: "
            "'professional', 'conversational', or 'concise'."
        )
    )
    text: str = Field(
        description=(
            "The reply text. Must sound like a real human wrote it. "
            "Do not include the style label or any meta-commentary."
        )
    )


class GeneratedReplies(BaseModel):
    """Structured output from the reply generation chain.

    Always contains exactly three suggestions: professional, conversational,
    and concise — in that order.
    """

    replies: list[ReplySuggestion] = Field(
        description=(
            "Exactly three reply suggestions. "
            "Index 0: professional. Index 1: conversational. Index 2: concise."
        ),
        min_length=3,
        max_length=3,
    )
