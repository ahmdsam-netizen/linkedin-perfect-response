"""
app/main.py
===========
FastAPI application factory with database lifespan initializer and V2 routers.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import conversations as conversations_router
from app.api.routes import memory as memory_router
from app.api.routes import reply as reply_router
from app.core.config import get_settings
from app.db.init_db import init_db

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for database initialization on startup."""
    try:
        await init_db()
        logger.info("Database initialized successfully.")
    except Exception as exc:
        logger.warning("Database initialization error: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend API for the LinkedIn AI Reply Chrome extension. "
        "Persistent conversation memory, RAG, pgvector semantic search, "
        "and episodic micro-summary chunks."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(reply_router.router, prefix="/api/v1")
app.include_router(conversations_router.router, prefix="/api/v1")
app.include_router(memory_router.router, prefix="/api/v1")


# ── Health check ──────────────────────────────────────────────────────────────


@app.get(
    "/health",
    summary="Health check",
    description="Returns the server status.",
    tags=["Health"],
)
async def health() -> dict:
    return {"status": "ok", "version": settings.app_version}


@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "message": f"{settings.app_name} API is running.",
        "docs": "/docs",
        "health": "/health",
        "version": settings.app_version,
    }


logger.info(
    "%s v%s ready. CORS origins: %s",
    settings.app_name,
    settings.app_version,
    settings.cors_origins,
)
