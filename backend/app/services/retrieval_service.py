"""
app/services/retrieval_service.py
===================================
Contact-scoped semantic search using pgvector cosine similarity.

IMPORTANT: Every query ALWAYS filters by (user_id, contact_id).
This is the core data isolation guarantee — memories from Contact A
can never appear in results for Contact B.

No HNSW/IVFFlat index is used. Instead, a Partial B-Tree Index on
(user_id, contact_id) WHERE status='ACTIVE' lets PostgreSQL instantly
load only the 10–50 facts for this contact into memory, then performs
exact cosine distance ranking in sub-millisecond time.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.embedding_service import embed_query

logger = logging.getLogger(__name__)

settings = get_settings()


async def semantic_search(
    db: AsyncSession,
    *,
    query: str,
    user_id: str,
    contact_id: str,
    top_k: int | None = None,
    threshold: float | None = None,
) -> list[dict]:
    """Retrieve the most semantically relevant memories for a (user, contact) pair.

    Args:
        db: Active async database session.
        query: The natural language search query (e.g. the latest message text).
        user_id: Scope filter — only search this user's memories.
        contact_id: Scope filter — only search this contact's memories.
        top_k: Max results to return (defaults to settings.retrieval_top_k).
        threshold: Minimum cosine similarity (defaults to settings.retrieval_threshold).

    Returns:
        List of dicts: [{"id": str, "content": str, "memory_type": str, "similarity": float}]
        Returns empty list on any error (graceful degradation).
    """
    k = top_k or settings.retrieval_top_k
    t = threshold if threshold is not None else settings.retrieval_threshold

    try:
        query_vector = await embed_query(query)
    except Exception as exc:
        logger.warning("Embedding generation failed during retrieval: %s", exc)
        return []

    try:
        result = await db.execute(
            text(
                """
                SELECT
                    id,
                    content,
                    memory_type,
                    1 - (embedding <=> :vec::vector) AS similarity
                FROM memories
                WHERE user_id = :user_id
                  AND contact_id = :contact_id
                  AND status = 'ACTIVE'
                  AND embedding IS NOT NULL
                  AND 1 - (embedding <=> :vec::vector) >= :threshold
                ORDER BY embedding <=> :vec::vector
                LIMIT :top_k
                """
            ),
            {
                "vec": str(query_vector),
                "user_id": user_id,
                "contact_id": contact_id,
                "threshold": t,
                "top_k": k,
            },
        )
        rows = result.fetchall()
        facts = [
            {
                "id": row.id,
                "content": row.content,
                "memory_type": row.memory_type,
                "similarity": float(row.similarity),
            }
            for row in rows
        ]
        logger.info(
            "Semantic search returned %d facts for contact=%s query=%r",
            len(facts),
            contact_id,
            query[:60],
        )
        return facts

    except Exception as exc:
        # Graceful degradation: if pgvector fails, reply generation continues
        # with summary chunks + recent messages only.
        logger.warning("pgvector search failed (graceful degradation): %s", exc)
        return []
