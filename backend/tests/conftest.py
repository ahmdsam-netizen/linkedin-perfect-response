"""
tests/conftest.py
=================
Shared pytest fixtures for the test suite.

All tests that touch the FastAPI app or LangChain chains use these fixtures.
No real Gemini API key is required to run the test suite.
"""

from typing import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai.output_models import (
    ConversationAnalysis,
    GeneratedReplies,
    ReplySuggestion,
)

# ── Mock settings ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    """Inject a fake GEMINI_API_KEY so Settings validation passes in every test.

    Uses monkeypatch to set the env var before the module is imported.
    autouse=True means this fixture runs for every test automatically.
    """
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-api-key-for-unit-tests")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-flash")
    # Clear the lru_cache so settings are re-read with the patched env.
    from app.core.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# ── FastAPI test client ───────────────────────────────────────────────────────


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient with LLM chain calls mocked out.

    The LangChain chains are patched so tests never make real Gemini API calls.
    """
    # Patch the LLM factory to prevent real model initialisation.
    with patch("app.ai.llm.ChatGoogleGenerativeAI") as mock_llm_cls:
        mock_llm_instance = MagicMock()
        mock_llm_cls.return_value = mock_llm_instance

        # Clear chain caches so they use the mocked LLM.
        from app.ai import chains
        chains.get_conversation_analysis_chain.cache_clear()
        chains.get_reply_generation_chain.cache_clear()
        chains.get_llm.cache_clear() if hasattr(chains, "get_llm") else None

        from app.ai.llm import get_llm
        get_llm.cache_clear()

        from app.main import app
        with TestClient(app, raise_server_exceptions=True) as test_client:
            yield test_client

        # Clean up caches after test.
        chains.get_conversation_analysis_chain.cache_clear()
        chains.get_reply_generation_chain.cache_clear()
        get_llm.cache_clear()


# ── Canonical mock outputs ────────────────────────────────────────────────────


@pytest.fixture
def mock_analysis() -> ConversationAnalysis:
    """A realistic ConversationAnalysis for use in tests."""
    return ConversationAnalysis(
        main_topic="Backend architecture and technology choices",
        topics=["Redis Pub/Sub", "Kafka", "distributed systems"],
        tone="technical and conversational",
        conversation_stage="technical discussion",
        important_facts=["Sam is currently using Redis Pub/Sub"],
        open_questions=["Whether Sam has considered Kafka"],
        last_message_intent="asking for a technical opinion",
    )


@pytest.fixture
def mock_generated_replies() -> GeneratedReplies:
    """A realistic GeneratedReplies output for use in tests."""
    return GeneratedReplies(
        replies=[
            ReplySuggestion(
                style="professional",
                text=(
                    "Kafka is worth evaluating if you're dealing with high-throughput "
                    "or need durable message replay. Redis Pub/Sub is simpler, but "
                    "Kafka gives you stronger delivery guarantees. Happy to share some "
                    "benchmarks if useful."
                ),
            ),
            ReplySuggestion(
                style="conversational",
                text=(
                    "Kafka's great for exactly that kind of workload — especially if "
                    "you need message replay or want to decouple your consumers. Redis "
                    "Pub/Sub is fine for lighter use cases. What's your current message "
                    "volume like?"
                ),
            ),
            ReplySuggestion(
                style="concise",
                text=(
                    "Kafka makes sense if you need replay or stricter delivery. "
                    "What's your message volume?"
                ),
            ),
        ]
    )


# ── Canonical request payload ─────────────────────────────────────────────────


@pytest.fixture
def valid_request_payload() -> dict:
    """A valid GenerateReplyRequest JSON payload matching the extension's format."""
    return {
        "context": {
            "recipient": {
                "name": "Sam Chen",
                "headline": "Senior Software Engineer",
                "company": "Acme Corp",
                "position": "Senior Software Engineer",
                "profileUrl": "https://linkedin.com/in/samchen",
            },
            "messages": [
                {
                    "sender": "them",
                    "text": "How are you handling communication between your servers?",
                    "timestamp": "10:00 AM",
                },
                {
                    "sender": "me",
                    "text": "I'm using Redis Pub/Sub.",
                    "timestamp": "10:05 AM",
                },
                {
                    "sender": "them",
                    "text": "Have you considered Kafka?",
                    "timestamp": "10:07 AM",
                },
            ],
        },
        "userProfile": {
            "name": "John Doe",
            "role": "Backend Engineer",
            "skills": ["Python", "Kafka", "Redis"],
            "background": "5 years of experience in distributed systems.",
            "style": "professional",
        },
        "myName": "John",
        "recipientName": "Sam",
        "relationship": "first-degree connection and former colleague",
        "objective": "Share my experience with Kafka and offer to help.",
    }
