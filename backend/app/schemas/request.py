"""
app/schemas/request.py
======================
Pydantic models for the incoming HTTP request from the Chrome extension.

These mirror the TypeScript types in extension/src/shared/types.ts exactly.
Field names use camelCase aliases so the extension can send camelCase JSON
while the Python application uses snake_case internally.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ─── camelCase alias helper ───────────────────────────────────────────────────

def _camel(snake: str) -> str:
    """Convert snake_case to camelCase for JSON aliases."""
    parts = snake.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


_alias_config = ConfigDict(
    alias_generator=_camel,
    populate_by_name=True,   # allow both snake_case and camelCase
    str_strip_whitespace=True,
)


# ─── Sub-models ───────────────────────────────────────────────────────────────


class LinkedInPerson(BaseModel):
    """Mirrors LinkedInPerson in shared/types.ts."""

    model_config = _alias_config

    name: str = Field(default="Recipient", description="Full name of the person.")
    headline: str | None = Field(default=None, description="LinkedIn headline.")
    company: str | None = Field(default=None, description="Current company.")
    position: str | None = Field(default=None, description="Current job title.")
    profile_url: str | None = Field(default=None, description="LinkedIn profile URL.")
    about: str | None = Field(default=None, description="LinkedIn About section text.")
    skills: list[str] = Field(default_factory=list, description="Listed skills.")
    recent_posts: list[str] = Field(
        default_factory=list, description="Recent LinkedIn post texts."
    )


class Message(BaseModel):
    """A single message in the LinkedIn conversation.

    Mirrors Message in shared/types.ts.
    `sender` is a discriminated Literal — only 'me' or 'them' are valid.
    """

    model_config = _alias_config

    sender: Literal["me", "them"] = Field(
        description="Who sent this message: 'me' (the user) or 'them' (the recipient)."
    )
    text: str = Field(default="", description="Message body text.")
    timestamp: str | None = Field(
        default=None, description="Optional timestamp string (ISO 8601 or display text)."
    )


class ConversationContext(BaseModel):
    """The full conversation context scraped by the extension.

    Mirrors ConversationContext in shared/types.ts.
    """

    model_config = _alias_config

    recipient: LinkedInPerson = Field(
        default_factory=LinkedInPerson,
        description="Profile information about the person being replied to.",
    )
    messages: list[Message] = Field(
        default_factory=list,
        description="Chronological list of messages in the conversation.",
    )

    @model_validator(mode="after")
    def conversation_must_have_messages(self) -> "ConversationContext":
        # model_validator(mode="after") runs on every construction — including
        # when Pydantic uses default_factory to build this model as a nested
        # default inside GenerateReplyRequest.  @field_validator does NOT run
        # on default values in Pydantic v2, which is why we use this instead.
        if not self.messages:
            raise ValueError(
                "The conversation must contain at least one message to generate a reply."
            )
        return self


class UserProfile(BaseModel):
    """The signed-in user's profile, as configured in the extension settings.

    Mirrors UserProfile in shared/types.ts.
    """

    model_config = _alias_config

    name: str = Field(default="LinkedIn User", description="User's full name.")
    role: str = Field(default="", description="User's current job title / role.")
    skills: list[str] = Field(default_factory=list, description="User's skills.")
    background: str = Field(
        default="", description="Short professional background / bio."
    )
    style: str | None = Field(
        default=None,
        description=(
            "Preferred communication style "
            "(e.g. 'professional', 'casual', 'concise')."
        ),
    )


# ─── Top-level request ────────────────────────────────────────────────────────


class GenerateReplyRequest(BaseModel):
    """Request body for POST /api/v1/reply/generate.

    Mirrors GenerateReplyRequest in shared/types.ts.
    The extension sends this as JSON; FastAPI validates it against this model.
    """

    model_config = _alias_config

    context: ConversationContext = Field(
        default_factory=ConversationContext,
        description="Scraped conversation context from LinkedIn.",
    )
    user_profile: UserProfile = Field(
        default_factory=UserProfile,
        description="The replying user's profile.",
    )
    my_name: str | None = Field(
        default=None,
        description="Override for the user's display name (if different from profile).",
    )
    recipient_name: str | None = Field(
        default=None,
        description="Override for the recipient's display name.",
    )
    relationship: str | None = Field(
        default=None,
        description=(
            "Description of the relationship between the two people "
            "(e.g. 'first-degree connection', 'former colleague', 'cold outreach')."
        ),
    )
    style: str | None = Field(
        default=None,
        description="Override for communication style for this specific request.",
    )
    user_prompt: str | None = Field(
        default=None,
        description=(
            "Optional custom instruction or objective from the user "
            "(e.g. 'ask them about job opportunities at their company')."
        ),
    )

    # ── Derived helpers ───────────────────────────────────────────────────────

    @property
    def resolved_user_name(self) -> str:
        """Return the best available display name for the user."""
        return self.my_name or self.user_profile.name or "LinkedIn User"

    @property
    def resolved_recipient_name(self) -> str:
        """Return the best available display name for the recipient."""
        return (
            self.recipient_name
            or self.context.recipient.name
            or "the recipient"
        )

    @property
    def resolved_communication_style(self) -> str:
        """Return the effective communication style."""
        return self.style or self.user_profile.style or "professional"

    @property
    def resolved_objective(self) -> str:
        """Return the user's objective for this reply.

        If the user provided a custom prompt, that IS the objective.
        Otherwise fall back to a sensible default.
        """
        if self.user_prompt and self.user_prompt.strip():
            return self.user_prompt.strip()
        return (
            "Continue the conversation naturally and helpfully. "
            "Respond to the last message in a way that moves the conversation forward."
        )
