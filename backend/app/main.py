"""
app/main.py
===========
FastAPI application factory.

Responsibilities:
- Create and configure the FastAPI app instance.
- Configure CORS middleware.
- Register API routers.
- Expose a simple health check endpoint.

No AI logic, no database, no business logic belongs here.
"""

import logging
import logging.config

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import reply as reply_router
from app.core.config import get_settings

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Application ───────────────────────────────────────────────────────────────

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Backend API for the LinkedIn AI Reply Chrome extension. "
        "Generates contextual LinkedIn message replies using Gemini via LangChain."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Only the origins listed in settings are allowed.
# For local development this includes localhost ports used by Vite / webpack.
# For production, add the Chrome extension origin to CORS_ORIGINS in .env:
#   CORS_ORIGINS=["chrome-extension://your-extension-id"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(reply_router.router, prefix="/api/v1")
# Backward-compatibility alias for extension calling /api/generate-reply directly
app.include_router(reply_router.router, prefix="/api")


# ── Health check ──────────────────────────────────────────────────────────────


@app.get(
    "/health",
    summary="Health check",
    description="Returns the server status. Used by monitoring and the extension to verify connectivity.",
    tags=["Health"],
)
async def health() -> dict:
    """Simple liveness check.

    Returns:
        {"status": "ok"} when the server is running.
    """
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
async def root() -> dict:
    """Root redirect hint for browsers."""
    return {
        "message": f"{settings.app_name} API is running.",
        "docs": "/docs",
        "health": "/health",
    }


logger.info(
    "%s v%s started. CORS origins: %s",
    settings.app_name,
    settings.app_version,
    settings.cors_origins,
)
