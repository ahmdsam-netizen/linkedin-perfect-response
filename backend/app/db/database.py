"""
app/db/database.py
==================
Async SQLAlchemy engine, session factory, and FastAPI DB dependency.

All database interaction in this application goes through the AsyncSession
provided by get_db(). No module should import the engine directly.
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# ── Engine ────────────────────────────────────────────────────────────────────
# pool_pre_ping=True ensures stale connections are detected before use.
# echo=settings.debug logs all SQL when DEBUG=true.

engine = create_async_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=settings.debug,
)

# ── Session factory ───────────────────────────────────────────────────────────
# expire_on_commit=False prevents lazy-load errors after commit in async context.

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── FastAPI dependency ────────────────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession for use in FastAPI route dependencies.

    The session is committed on success and rolled back on any exception,
    then closed regardless of outcome.

    Usage:
        @router.post("/example")
        async def handler(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Context manager (for non-FastAPI use, e.g. init_db) ──────────────────────


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager version of get_db for use outside FastAPI."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
