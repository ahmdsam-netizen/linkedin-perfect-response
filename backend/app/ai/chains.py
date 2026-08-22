"""
app/ai/chains.py
================
LangChain chain definitions.

Each chain is a composable pipeline:
    PromptTemplate | LLM.with_structured_output(OutputModel)

Chains are cached with lru_cache — no re-creation on every request.
No route or service code should know how chains are built internally.
"""

import logging
from functools import lru_cache
from typing import Any

from langchain_core.runnables import Runnable

from app.ai.llm import get_llm
from app.ai.output_models import ConversationAnalysis, GeneratedReplies
from app.ai.prompts import CONVERSATION_ANALYSIS_PROMPT, REPLY_GENERATION_PROMPT

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_conversation_analysis_chain() -> Runnable:
    """Return the cached conversation analysis LangChain chain.

    Pipeline:
        CONVERSATION_ANALYSIS_PROMPT
            | ChatGoogleGenerativeAI (temp=0 for deterministic analysis)
            | structured output → ConversationAnalysis

    Temperature is overridden to 0 here so analysis is stable and factual.
    The base LLM uses 0.7 (for reply generation), so we bind an override.
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(ConversationAnalysis)
    chain = CONVERSATION_ANALYSIS_PROMPT | structured_llm
    logger.debug("Conversation analysis chain created.")
    return chain


@lru_cache(maxsize=1)
def get_reply_generation_chain() -> Runnable:
    """Return the cached reply generation LangChain chain.

    Pipeline:
        REPLY_GENERATION_PROMPT
            | ChatGoogleGenerativeAI (temp=0.7 for creative replies)
            | structured output → GeneratedReplies

    The LLM is instructed to produce exactly 3 suggestions via the output model.
    """
    llm = get_llm()
    structured_llm = llm.with_structured_output(GeneratedReplies)
    chain = REPLY_GENERATION_PROMPT | structured_llm
    logger.debug("Reply generation chain created.")
    return chain


async def run_conversation_analysis(inputs: dict[str, Any]) -> ConversationAnalysis:
    """Execute the conversation analysis chain asynchronously.

    Args:
        inputs: Dict with keys matching CONVERSATION_ANALYSIS_PROMPT variables.

    Returns:
        A validated ConversationAnalysis instance.

    Raises:
        RuntimeError: If the chain produces an unexpected output type.
    """
    chain = get_conversation_analysis_chain()
    result = await chain.ainvoke(inputs)

    if not isinstance(result, ConversationAnalysis):
        raise RuntimeError(
            f"Conversation analysis chain returned unexpected type: {type(result)}"
        )
    return result


async def run_reply_generation(inputs: dict[str, Any]) -> GeneratedReplies:
    """Execute the reply generation chain asynchronously.

    Args:
        inputs: Dict with keys matching REPLY_GENERATION_PROMPT variables.

    Returns:
        A validated GeneratedReplies instance containing 3 suggestions.

    Raises:
        RuntimeError: If the chain produces an unexpected output type.
    """
    chain = get_reply_generation_chain()
    result = await chain.ainvoke(inputs)

    if not isinstance(result, GeneratedReplies):
        raise RuntimeError(
            f"Reply generation chain returned unexpected type: {type(result)}"
        )
    return result
