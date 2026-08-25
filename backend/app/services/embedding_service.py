"""
app/services/embedding_service.py
===================================
Generate and store embeddings via Google Gemini (gemini-embedding-001).

Key optimisation: batch all fact contents in a single aembed_documents() call
to minimize Gemini API round-trips (~5–10x fewer calls than embedding one-by-one).
Dimension: 768 (Matryoshka-truncated from 3072).
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm import get_embedding_model
from app.db.models import Memory

logger = logging.getLogger(__name__)


async def embed_query(query: str) -> list[float]:
    """Generate a single query embedding for semantic search.

    Args:
        query: Text to embed (the retrieval search query).

    Returns:
        768-dimensional float vector.
    """
    model = get_embedding_model()
    vector = await model.aembed_query(query)
    return vector


async def embed_and_store_memories(
    db: AsyncSession,
    memories: list[Memory],
) -> None:
    """Batch-generate embeddings for a list of Memory objects and persist them.

    All contents are embedded in a single Gemini API call, then stored via
    raw SQL UPDATE (pgvector type requires raw SQL, not ORM assignment).

    Args:
        db: Active async database session.
        memories: List of Memory ORM objects (must already be flushed to DB).
    """
    if not memories:
        return

    texts = [m.content for m in memories]

    logger.info("Generating embeddings for %d facts (single batch call).", len(texts))
    model = get_embedding_model()
    vectors = await model.aembed_documents(texts)

    # Store embeddings via raw SQL — pgvector requires the ::vector cast
    for memory, vector in zip(memories, vectors):
        await db.execute(
            text(
                "UPDATE memories SET embedding = :vec::vector WHERE id = :id"
            ),
            {"vec": str(vector), "id": memory.id},
        )

    logger.info("Stored %d embeddings.", len(memories))
