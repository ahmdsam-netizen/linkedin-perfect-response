"""
tests/test_schemas.py
=====================
Tests for Pydantic request schema validation.

These tests ensure the API rejects invalid payloads before they reach
any service or AI code.
"""

import pytest


# ── Valid payloads ────────────────────────────────────────────────────────────


def test_valid_request_passes_validation(client, valid_request_payload):
    """A fully valid request payload should not be rejected at the schema level.

    We patch the reply service so no real Gemini call is made —
    we only care that the validation step passes (status != 422).
    """
    from unittest.mock import AsyncMock, patch
    from app.schemas.response import (
        ConversationAnalysisSummary,
        GenerateReplyResponse,
        ReplySuggestionResponse,
    )

    mock_response = GenerateReplyResponse(
        replies=[
            ReplySuggestionResponse(style="professional", text="Professional reply."),
            ReplySuggestionResponse(style="conversational", text="Conversational reply."),
            ReplySuggestionResponse(style="concise", text="Concise reply."),
        ],
        analysis=ConversationAnalysisSummary(
            main_topic="Test topic",
            tone="professional",
            conversation_stage="discussion",
            last_message_intent="asking a question",
        ),
    )

    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(return_value=mock_response),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    assert response.status_code == 200


# ── Invalid sender ────────────────────────────────────────────────────────────


def test_invalid_sender_rejected(client, valid_request_payload):
    """A message with sender='unknown' must be rejected with 422."""
    payload = valid_request_payload.copy()
    payload["context"] = {
        **payload["context"],
        "messages": [
            {"sender": "unknown", "text": "Hello?"}
        ],
    }
    response = client.post("/api/v1/reply/generate", json=payload)
    assert response.status_code == 422


# ── Empty conversation ────────────────────────────────────────────────────────


def test_empty_messages_rejected(client, valid_request_payload):
    """A conversation with no messages must be rejected with 422."""
    payload = valid_request_payload.copy()
    payload["context"] = {
        **payload["context"],
        "messages": [],
    }
    response = client.post("/api/v1/reply/generate", json=payload)
    assert response.status_code == 422


# ── Missing required top-level field ─────────────────────────────────────────


def test_missing_context_uses_default(client, valid_request_payload):
    """Omitting 'context' entirely should use defaults (no 422), but
    an empty messages list inside will still fail.

    This test sends a payload with no 'context' key at all.
    FastAPI/Pydantic will use the default_factory for ConversationContext,
    which has an empty messages list — triggering the validator.
    """
    payload = {k: v for k, v in valid_request_payload.items() if k != "context"}
    response = client.post("/api/v1/reply/generate", json=payload)
    # Empty messages → 422 from our field_validator.
    assert response.status_code == 422


# ── Minimal valid request ─────────────────────────────────────────────────────


def test_minimal_valid_request(client):
    """The absolute minimum valid request: one message, defaults for everything else."""
    from unittest.mock import AsyncMock, patch
    from app.schemas.response import (
        ConversationAnalysisSummary,
        GenerateReplyResponse,
        ReplySuggestionResponse,
    )

    mock_response = GenerateReplyResponse(
        replies=[
            ReplySuggestionResponse(style="professional", text="A reply."),
            ReplySuggestionResponse(style="conversational", text="A reply."),
            ReplySuggestionResponse(style="concise", text="A reply."),
        ],
        analysis=ConversationAnalysisSummary(
            main_topic="topic",
            tone="neutral",
            conversation_stage="initial",
            last_message_intent="greeting",
        ),
    )

    minimal = {
        "context": {
            "messages": [
                {"sender": "them", "text": "Hi, are you open to new opportunities?"}
            ]
        }
    }

    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(return_value=mock_response),
    ):
        response = client.post("/api/v1/reply/generate", json=minimal)

    assert response.status_code == 200


# ── camelCase compatibility ───────────────────────────────────────────────────


def test_camelcase_fields_accepted(client, valid_request_payload):
    """The extension sends camelCase JSON; the schema must accept it."""
    from unittest.mock import AsyncMock, patch
    from app.schemas.response import (
        ConversationAnalysisSummary,
        GenerateReplyResponse,
        ReplySuggestionResponse,
    )

    mock_response = GenerateReplyResponse(
        replies=[
            ReplySuggestionResponse(style="professional", text="Reply."),
            ReplySuggestionResponse(style="conversational", text="Reply."),
            ReplySuggestionResponse(style="concise", text="Reply."),
        ],
        analysis=ConversationAnalysisSummary(
            main_topic="t", tone="t", conversation_stage="t", last_message_intent="t"
        ),
    )

    # Ensure the fixture uses camelCase keys (as the extension sends).
    assert "userProfile" in valid_request_payload

    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(return_value=mock_response),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    assert response.status_code == 200
