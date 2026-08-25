"""
app/schemas/response.py
=======================
Pydantic response schemas for Version 2 API endpoints.
"""

from pydantic import BaseModel, ConfigDict, Field


def _camel(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


_alias_config = ConfigDict(
    alias_generator=_camel,
    populate_by_name=True,
)


class SyncResponse(BaseModel):
    """Response from POST /api/v1/conversations/sync."""
    model_config = _alias_config
    conversation_id: str
    new_messages_count: int
    user_id: str
    contact_id: str


class MemoryContextSummary(BaseModel):
    """Memory context metadata returned with reply suggestions."""
    model_config = _alias_config
    summary_used: bool = Field(description="Whether conversation summary chunks were available.")
    facts_retrieved: int = Field(description="Number of semantic facts retrieved.")
    recent_messages_used: int = Field(description="Number of recent messages included in context.")


class ReplySuggestion(BaseModel):
    """A single generated reply alternative."""
    model_config = _alias_config
    style: str
    text: str


class GenerateReplyResponse(BaseModel):
    """Response from POST /api/v1/reply/generate."""
    model_config = _alias_config
    reply: str = Field(description="Primary reply text (first suggestion).")
    replies: list[ReplySuggestion] = Field(
        description="All three reply alternatives (professional, conversational, concise)."
    )
    memory_context: MemoryContextSummary | None = Field(
        default=None,
        description="Details of memory context used — shown in the extension UI badge.",
    )
