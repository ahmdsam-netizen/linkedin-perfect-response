"""
app/ai/llm.py
=============
LLM and embedding model initialisation.

Singletons:
  - ChatGoogleGenerativeAI (Gemini)
  - GoogleGenerativeAIEmbeddings (gemini-embedding-001)
"""

import logging
from functools import lru_cache

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_llm() -> ChatGoogleGenerativeAI:
    """Return the cached Gemini LLM for reply generation and memory extraction."""
    settings = get_settings()
    logger.info("Initialising Gemini LLM: model=%s", settings.gemini_model)
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        convert_system_message_to_human=False,
    )


@lru_cache(maxsize=1)
def get_embedding_model() -> GoogleGenerativeAIEmbeddings:
    """Return the cached Gemini embedding model (768-dim Matryoshka truncation).

    Used exclusively by embedding_service.py — no other module should call this
    directly.
    """
    settings = get_settings()
    logger.info(
        "Initialising Gemini Embeddings: model=%s dimensions=%d",
        settings.gemini_embedding_model,
        settings.embedding_dimensions,
    )
    return GoogleGenerativeAIEmbeddings(
        model=settings.gemini_embedding_model,
        google_api_key=settings.gemini_api_key,
        # Matryoshka Representation Learning: truncate 3072-dim to 768-dim
        # for 4x storage reduction with minimal accuracy loss.
        output_dimensionality=settings.embedding_dimensions,
    )
