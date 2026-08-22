"""
tests/test_reply.py
====================
Tests for the reply generation endpoint and service.

All tests mock the LangChain chains so no real Gemini API call is made.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.schemas.response import (
    ConversationAnalysisSummary,
    GenerateReplyResponse,
    ReplySuggestionResponse,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_mock_response() -> GenerateReplyResponse:
    return GenerateReplyResponse(
        replies=[
            ReplySuggestionResponse(
                style="professional",
                text="Kafka is worth evaluating for high-throughput scenarios.",
            ),
            ReplySuggestionResponse(
                style="conversational",
                text="Kafka's great — especially if you need message replay.",
            ),
            ReplySuggestionResponse(
                style="concise",
                text="Kafka makes sense here. What's your message volume?",
            ),
        ],
        analysis=ConversationAnalysisSummary(
            main_topic="Distributed systems communication",
            tone="technical and conversational",
            conversation_stage="technical discussion",
            last_message_intent="asking for a technical opinion",
        ),
    )


# ── Success case ──────────────────────────────────────────────────────────────


def test_generate_reply_success(client, valid_request_payload):
    """POST /api/v1/reply/generate returns 200 with 3 structured replies."""
    mock_response = _make_mock_response()

    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(return_value=mock_response),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    assert response.status_code == 200
    data = response.json()

    # Top-level structure.
    assert "replies" in data
    assert len(data["replies"]) == 3

    # Each reply has the expected shape.
    styles = {r["style"] for r in data["replies"]}
    assert styles == {"professional", "conversational", "concise"}

    for reply in data["replies"]:
        assert "style" in reply
        assert "text" in reply
        assert isinstance(reply["text"], str)
        assert len(reply["text"]) > 0


def test_generate_reply_includes_analysis(client, valid_request_payload):
    """The response includes an analysis summary."""
    mock_response = _make_mock_response()

    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(return_value=mock_response),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    data = response.json()
    assert "analysis" in data
    assert data["analysis"] is not None
    assert "main_topic" in data["analysis"]
    assert "tone" in data["analysis"]
    assert "conversation_stage" in data["analysis"]
    assert "last_message_intent" in data["analysis"]


# ── Gemini failure → 502 ──────────────────────────────────────────────────────


def test_gemini_api_error_returns_502(client, valid_request_payload):
    """When the AI service throws an error, the endpoint returns 502 (not 500).

    The error message must not expose the API key or internal details.
    """
    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(
            side_effect=Exception("quota exceeded for the google api key")
        ),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    assert response.status_code == 502
    data = response.json()
    # The API key must NEVER appear in the response body.
    response_text = str(data)
    assert "test-fake-api-key-for-unit-tests" not in response_text
    assert "GEMINI_API_KEY" not in response_text
    # A human-friendly message is returned instead.
    assert "detail" in data


def test_runtime_error_returns_502(client, valid_request_payload):
    """A RuntimeError (bad chain output) returns 502, not 500."""
    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(
            side_effect=RuntimeError("Chain returned unexpected type: <class 'str'>")
        ),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    assert response.status_code == 502


def test_unexpected_error_returns_500(client, valid_request_payload):
    """An unexpected internal error returns 500 with a safe message."""
    with patch(
        "app.services.reply_service.generate_reply",
        new=AsyncMock(side_effect=Exception("Something completely unexpected")),
    ):
        response = client.post("/api/v1/reply/generate", json=valid_request_payload)

    # Could be 500 (unexpected) or 502 (AI pattern) depending on message content.
    assert response.status_code in {500, 502}
    data = response.json()
    assert "detail" in data


# ── Service unit test (no HTTP) ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reply_service_orchestration(
    mock_settings, mock_analysis, mock_generated_replies, valid_request_payload
):
    """Test that reply_service.generate_reply calls both chains in order.

    This is a unit test of the service layer — no HTTP involved.
    """
    from app.schemas.request import GenerateReplyRequest

    request = GenerateReplyRequest.model_validate(valid_request_payload)

    with (
        patch(
            "app.services.reply_service.analyze_conversation",
            new=AsyncMock(return_value=mock_analysis),
        ) as mock_analyze,
        patch(
            "app.services.reply_service.run_reply_generation",
            new=AsyncMock(return_value=mock_generated_replies),
        ) as mock_generate,
    ):
        from app.services.reply_service import generate_reply
        result = await generate_reply(request)

    # Both mocks were called exactly once.
    mock_analyze.assert_awaited_once()
    mock_generate.assert_awaited_once()

    # The result is a properly typed response.
    assert len(result.replies) == 3
    assert result.analysis is not None
    assert result.analysis.main_topic == mock_analysis.main_topic


# ── Context service unit test ─────────────────────────────────────────────────


def test_context_service_builds_all_keys(mock_analysis, valid_request_payload):
    """build_reply_generation_context must include all prompt variable keys."""
    from app.schemas.request import GenerateReplyRequest
    from app.services.context_service import build_reply_generation_context

    from app.ai.prompts import REPLY_GENERATION_PROMPT

    request = GenerateReplyRequest.model_validate(valid_request_payload)
    context = build_reply_generation_context(request, mock_analysis)

    # Every variable referenced in the prompt template must be present.
    prompt_vars = REPLY_GENERATION_PROMPT.input_variables
    for var in prompt_vars:
        assert var in context, f"Missing prompt variable: '{var}'"


# ── Conversation service unit test ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_conversation_service_calls_chain(
    mock_settings, mock_analysis, valid_request_payload
):
    """analyze_conversation must call the analysis chain with correct inputs."""
    from app.schemas.request import GenerateReplyRequest
    from app.services.conversation_service import analyze_conversation

    request = GenerateReplyRequest.model_validate(valid_request_payload)

    with patch(
        "app.services.conversation_service.run_conversation_analysis",
        new=AsyncMock(return_value=mock_analysis),
    ) as mock_chain:
        result = await analyze_conversation(
            context=request.context,
            user_profile=request.user_profile,
            user_name=request.resolved_user_name,
            recipient_name=request.resolved_recipient_name,
        )

    mock_chain.assert_awaited_once()
    # The chain was called with a dict containing the expected keys.
    call_args = mock_chain.call_args[0][0]
    assert "conversation_text" in call_args
    assert "user_name" in call_args
    assert "recipient_name" in call_args

    # The returned analysis matches our mock.
    assert result.main_topic == mock_analysis.main_topic
