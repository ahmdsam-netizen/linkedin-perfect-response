"""
app/schemas/request.py
=======================
Pydantic request schemas for Version 2 API endpoints.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def _camel(snake: str) -> str:
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


_alias_config = ConfigDict(
    alias_generator=_camel,
    populate_by_name=True,
    str_strip_whitespace=True,
)


# ─── 1. Conversation Sync Request Models ───────────────────────────────────────


class SyncUserIn(BaseModel):
    model_config = _alias_config
    linkedin_id: str = Field(description="LinkedIn member identifier.")
    name: str = Field(description="Display name of the replying user.")


class SyncContactIn(BaseModel):
    model_config = _alias_config
    linkedin_profile_id: str = Field(description="LinkedIn profile identifier of the contact.")
    name: str = Field(description="Display name of the contact.")
    headline: str | None = Field(default=None, description="Contact's LinkedIn headline.")


class SyncConversationIn(BaseModel):
    model_config = _alias_config
    linkedin_conversation_id: str = Field(description="LinkedIn thread/conversation identifier.")


class SyncMessageIn(BaseModel):
    model_config = _alias_config
    sender_type: Literal["USER", "CONTACT"] = Field(
        description="Who sent this message: USER or CONTACT."
    )
    content: str = Field(description="Message text content.")


class SyncRequest(BaseModel):
    """Payload for POST /api/v1/conversations/sync."""
    model_config = _alias_config
    user: SyncUserIn
    contact: SyncContactIn
    conversation: SyncConversationIn
    messages: list[SyncMessageIn] = Field(
        default_factory=list,
        description="Ordered list of messages extracted from active LinkedIn conversation.",
    )


# ─── 2. Reply Generation Request Model ─────────────────────────────────────────


class GenerateReplyRequest(BaseModel):
    """Payload for POST /api/v1/reply/generate."""
    model_config = _alias_config
    conversation_id: str = Field(description="Internal conversation UUID from sync response.")
    user_name: str = Field(default="LinkedIn User", description="Name of the replying user.")
    user_role: str = Field(default="", description="Role/title of the replying user.")
    contact_name: str = Field(default="", description="Display name of the contact.")
    contact_headline: str | None = Field(default=None, description="Contact's LinkedIn headline.")
    relationship: str | None = Field(default=None, description="Relationship description.")
    instruction: str | None = Field(
        default=None,
        description="User's objective or custom prompt goal.",
    )
    tone: str | None = Field(
        default=None,
        description="Preferred tone: 'professional', 'casual', 'concise', etc.",
    )
