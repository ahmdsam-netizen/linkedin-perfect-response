"""
app/services/conversation_service.py
=====================================
Service responsible for analysing a LinkedIn conversation.

Responsibilities:
- Format the conversation into a text representation for the prompt.
- Call the conversation analysis LangChain chain.
- Return a structured ConversationAnalysis.

This service has NO knowledge of HTTP requests or FastAPI.
"""

import logging

from app.ai.chains import run_conversation_analysis
from app.ai.output_models import ConversationAnalysis
from app.schemas.request import ConversationContext, LinkedInPerson, Message, UserProfile

logger = logging.getLogger(__name__)


def _format_conversation_text(
    messages: list[Message],
    user_name: str,
    recipient_name: str,
) -> str:
    """Render a list of messages into a readable conversation transcript.

    Args:
        messages: Chronological list of messages.
        user_name: Display name for the user ('me' sender).
        recipient_name: Display name for the recipient ('them' sender).

    Returns:
        A multi-line string suitable for inclusion in a prompt.
    """
    lines: list[str] = []
    for msg in messages:
        name = user_name if msg.sender == "me" else recipient_name
        timestamp_suffix = f" [{msg.timestamp}]" if msg.timestamp else ""
        lines.append(f"{name}{timestamp_suffix}:\n{msg.text.strip()}")
    return "\n\n".join(lines)


def _format_recipient_headline(recipient: LinkedInPerson) -> str:
    """Build a one-line description of the recipient for the prompt."""
    parts: list[str] = []
    if recipient.headline:
        parts.append(recipient.headline)
    if recipient.position and recipient.company:
        parts.append(f"{recipient.position} at {recipient.company}")
    elif recipient.position:
        parts.append(recipient.position)
    elif recipient.company:
        parts.append(f"works at {recipient.company}")
    return f" ({', '.join(parts)})" if parts else ""


async def analyze_conversation(
    context: ConversationContext,
    user_profile: UserProfile,
    user_name: str,
    recipient_name: str,
) -> ConversationAnalysis:
    """Analyse a LinkedIn conversation using Gemini via LangChain.

    Args:
        context: The full conversation context from the request.
        user_profile: The replying user's profile.
        user_name: Resolved display name for the user.
        recipient_name: Resolved display name for the recipient.

    Returns:
        A ConversationAnalysis with structured insights about the conversation.

    Raises:
        RuntimeError: If the LangChain chain fails or returns invalid output.
    """
    conversation_text = _format_conversation_text(
        messages=context.messages,
        user_name=user_name,
        recipient_name=recipient_name,
    )
    recipient_headline = _format_recipient_headline(context.recipient)

    inputs = {
        "user_name": user_name,
        "user_role": user_profile.role or "Professional",
        "recipient_name": recipient_name,
        "recipient_headline": recipient_headline,
        "conversation_text": conversation_text,
    }

    logger.info(
        "Running conversation analysis | user=%s recipient=%s messages=%d",
        user_name,
        recipient_name,
        len(context.messages),
    )

    analysis = await run_conversation_analysis(inputs)

    logger.info(
        "Conversation analysis complete | topic=%s stage=%s",
        analysis.main_topic,
        analysis.conversation_stage,
    )
    return analysis
