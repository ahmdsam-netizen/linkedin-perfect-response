"""
app/db/init_db.py
=================
Idempotent database initializer.

Creates the pgvector extension and all tables on first run.
Safe to call on every startup — uses CREATE IF NOT EXISTS semantics.

Usage:
    Called from app/main.py lifespan context manager on startup.
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import engine, get_db_context
from app.db.models import Base

logger = logging.getLogger(__name__)


async def init_db() -> None:
    """Initialize the database: enable pgvector extension and create all tables."""
    logger.info("Initializing database...")

    async with engine.begin() as conn:
        # Enable pgvector extension (idempotent)
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        logger.info("pgvector extension ready.")

        # Create all tables defined in models.py (idempotent)
        await conn.run_sync(Base.metadata.create_all)
        logger.info("All database tables created (or already exist).")

    logger.info("Database initialization complete.")
