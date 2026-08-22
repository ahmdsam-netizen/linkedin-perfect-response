"""
app/ai/llm.py
=============
LLM initialisation — the single place where Gemini is configured.

All other modules obtain the model via `get_llm()`.  Nothing outside this
module needs to know which provider or SDK is used.
"""

import logging
from functools import lru_cache

from langchain_google_genai import ChatGoogleGenerativeAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_llm() -> ChatGoogleGenerativeAI:
    """Return the cached ChatGoogleGenerativeAI instance.

    The model is initialised once per process using settings loaded from
    environment variables.  lru_cache ensures we never create duplicate
    client objects or re-read the API key.

    Returns:
        A configured ChatGoogleGenerativeAI ready for LangChain chain use.
    """
    settings = get_settings()

    logger.info(
        "Initialising Gemini LLM: model=%s", settings.gemini_model
    )

    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        convert_system_message_to_human=False,
    )
