"""
app/ai/chains.py
================
LangChain Runnable chains for Version 2.

Chains:
  - Memory extraction chain (Temperature = 0 for deterministic facts & micro-summary)
  - Single-pass RAG reply generation chain (Produces 3 styled replies)
"""

import logging
from functools import lru_cache
from typing import Any

from langchain_core.runnables import Runnable

from app.ai.llm import get_llm
from app.ai.output_models import GeneratedReplies, MemoryExtractionOutput
from app.ai.prompts import MEMORY_EXTRACTION_PROMPT, REPLY_GENERATION_PROMPT

logger = logging.getLogger(__name__)


# ── 1. Memory Extraction Chain (Unified micro-summary + facts + supersession) ──


@lru_cache(maxsize=1)
def get_memory_extraction_chain() -> Runnable:
    """Single-pass memory extraction chain using temperature=0 for deterministic extraction."""
    llm = get_llm()
    extraction_llm = llm.with_structured_output(MemoryExtractionOutput)
    return MEMORY_EXTRACTION_PROMPT | extraction_llm


async def run_memory_extraction(inputs: dict[str, Any]) -> MemoryExtractionOutput:
    """Execute the memory extraction chain asynchronously."""
    chain = get_memory_extraction_chain()
    result = await chain.ainvoke(inputs)
    if not isinstance(result, MemoryExtractionOutput):
        raise RuntimeError(f"Unexpected memory extraction output type: {type(result)}")
    return result


# ── 2. Single-Pass RAG Reply Generation Chain ─────────────────────────────────


@lru_cache(maxsize=1)
def get_reply_generation_chain() -> Runnable:
    """Single-pass RAG reply chain generating professional, conversational, and concise replies."""
    llm = get_llm()
    structured_llm = llm.with_structured_output(GeneratedReplies)
    return REPLY_GENERATION_PROMPT | structured_llm


async def run_reply_generation(inputs: dict[str, Any]) -> GeneratedReplies:
    """Execute the single-pass RAG reply generation chain asynchronously."""
    chain = get_reply_generation_chain()
    result = await chain.ainvoke(inputs)
    if not isinstance(result, GeneratedReplies):
        raise RuntimeError(f"Unexpected reply generation output type: {type(result)}")
    return result
