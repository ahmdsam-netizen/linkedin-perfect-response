"""
tests/conftest.py
=================
Shared pytest fixtures for Version 2 test suite.
"""

from typing import Generator
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.ai.output_models import GeneratedReplies, ReplySuggestion


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    """Inject a fake GEMINI_API_KEY so Settings validation passes in every test."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-fake-api-key-for-unit-tests")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.5-flash")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/linkedin_reply")
    from app.core.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient with mocked LLM."""
    with patch("app.ai.llm.ChatGoogleGenerativeAI") as mock_llm_cls:
        mock_llm_cls.return_value = MagicMock()

        from app.ai import chains
        chains.get_memory_extraction_chain.cache_clear()
        chains.get_reply_generation_chain.cache_clear()

        from app.ai.llm import get_llm
        get_llm.cache_clear()

        from app.main import app
        with TestClient(app, raise_server_exceptions=True) as test_client:
            yield test_client

        chains.get_memory_extraction_chain.cache_clear()
        chains.get_reply_generation_chain.cache_clear()
        get_llm.cache_clear()


@pytest.fixture
def mock_generated_replies() -> GeneratedReplies:
    """A realistic GeneratedReplies output for use in tests."""
    return GeneratedReplies(
        replies=[
            ReplySuggestion(
                style="professional",
                text="Kafka is worth evaluating if you're dealing with high-throughput or durable message replay.",
            ),
            ReplySuggestion(
                style="conversational",
                text="Kafka is great for that workload — what is your message volume like?",
            ),
            ReplySuggestion(
                style="concise",
                text="Kafka works well here. What is your volume?",
            ),
        ]
    )
