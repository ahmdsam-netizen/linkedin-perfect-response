"""
app/services/context_service.py
================================
Context engineering service.

Responsibility: transform the validated request data + conversation analysis
into a clean, flat dictionary that maps directly to the reply generation
prompt variables.

This is where context engineering lives — decisions about what information
to include, how to format it, and how to present it to the LLM are made here,
not inside the prompt template itself.

This service has NO knowledge of HTTP requests or FastAPI.
"""

import logging

from app.ai.output_models import ConversationAnalysis
from app.schemas.request import GenerateReplyRequest, LinkedInPerson, Message

logger = logging.getLogger(__name__)

# Maximum number of recent posts to include in the recipient profile.
# Keeps the prompt from growing uncontrollably for active LinkedIn users.
_MAX_RECIPIENT_POSTS = 2

# Maximum number of messages to include in the conversation text sent to the
# reply generation prompt (the analysis already saw the full conversation).
# For very long conversations, we include the most recent messages.
_MAX_CONVERSATION_MESSAGES = 20


def _format_recipient_details(person: LinkedInPerson) -> str:
    """Build a structured description of the recipient for the prompt."""
    lines: list[str] = []

    if person.headline:
        lines.append(f"Headline: {person.headline}")
    if person.position and person.company:
        lines.append(f"Role: {person.position} at {person.company}")
    elif person.position:
        lines.append(f"Role: {person.position}")
    elif person.company:
        lines.append(f"Company: {person.company}")
    if person.about:
        # Trim long About sections to avoid bloating the prompt.
        about_trimmed = person.about[:400].rstrip()
        if len(person.about) > 400:
            about_trimmed += "…"
        lines.append(f"About: {about_trimmed}")
    if person.skills:
        lines.append(f"Skills: {', '.join(person.skills[:10])}")
    if person.recent_posts:
        posts = person.recent_posts[:_MAX_RECIPIENT_POSTS]
        post_lines = [f"  - {p[:150]}…" if len(p) > 150 else f"  - {p}" for p in posts]
        lines.append("Recent activity:\n" + "\n".join(post_lines))

    return "\n".join(lines) if lines else "No additional profile details available."


def _format_conversation_for_generation(
    messages: list[Message],
    user_name: str,
    recipient_name: str,
) -> str:
    """Render the conversation for the reply generation prompt.

    Uses only the most recent messages to keep the prompt focused.
    The full conversation was already analysed in pass 1.
    """
    recent = messages[-_MAX_CONVERSATION_MESSAGES:]
    lines: list[str] = []
    for msg in recent:
        name = user_name if msg.sender == "me" else recipient_name
        timestamp_suffix = f" [{msg.timestamp}]" if msg.timestamp else ""
        lines.append(f"{name}{timestamp_suffix}:\n{msg.text.strip()}")
    return "\n\n".join(lines)


def _format_analysis_facts(facts: list[str]) -> str:
    if not facts:
        return "None explicitly stated."
    return "\n".join(f"• {f}" for f in facts)


def _format_analysis_questions(questions: list[str]) -> str:
    if not questions:
        return "None."
    return "\n".join(f"• {q}" for q in questions)


def build_reply_generation_context(
    request: GenerateReplyRequest,
    analysis: ConversationAnalysis,
) -> dict:
    """Build the flat context dictionary for the reply generation prompt.

    Args:
        request: Validated incoming request.
        analysis: Structured output from the conversation analysis chain.

    Returns:
        A dict whose keys match the variables in REPLY_GENERATION_PROMPT.
    """
    user_name = request.resolved_user_name
    recipient_name = request.resolved_recipient_name

    relationship = (
        request.relationship
        or "LinkedIn connection (relationship not specified)"
    )

    user_skills = (
        ", ".join(request.user_profile.skills)
        if request.user_profile.skills
        else "Not specified"
    )

    context = {
        # User
        "user_name": user_name,
        "user_role": request.user_profile.role or "Professional",
        "user_background": request.user_profile.background or "Not provided.",
        "user_skills": user_skills,
        "communication_style": request.resolved_communication_style,
        # Recipient
        "recipient_name": recipient_name,
        "recipient_details": _format_recipient_details(request.context.recipient),
        # Relationship & objective
        "relationship": relationship,
        "objective": request.resolved_objective,
        # Conversation
        "conversation_text": _format_conversation_for_generation(
            messages=request.context.messages,
            user_name=user_name,
            recipient_name=recipient_name,
        ),
        # Analysis (from pass 1)
        "analysis_main_topic": analysis.main_topic,
        "analysis_stage": analysis.conversation_stage,
        "analysis_tone": analysis.tone,
        "analysis_intent": analysis.last_message_intent,
        "analysis_facts": _format_analysis_facts(analysis.important_facts),
        "analysis_questions": _format_analysis_questions(analysis.open_questions),
    }

    logger.debug(
        "Reply generation context built | user=%s recipient=%s objective=%.80s",
        user_name,
        recipient_name,
        request.resolved_objective,
    )
    return context
