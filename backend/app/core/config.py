"""
app/core/config.py
==================
Centralised application settings loaded from environment variables.

V2: Added database URL, embedding model, and memory processing thresholds.
"""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Gemini ────────────────────────────────────────────────────────────────
    gemini_api_key: str = Field(..., description="Gemini API key (required)")
    gemini_model: str = Field(
        default="gemini-2.5-flash",
        description="Gemini model for reply generation and memory extraction.",
    )
    gemini_embedding_model: str = Field(
        default="gemini-embedding-001",
        description="Gemini embedding model.",
    )
    embedding_dimensions: int = Field(
        default=768,
        description="Output dimensions (Matryoshka truncation).",
    )

    # ── Database (V2) ─────────────────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/linkedin_reply",
        description="Async PostgreSQL connection URL.",
    )

    # ── Memory Processing Thresholds ──────────────────────────────────────────
    memory_process_threshold: int = Field(
        default=10,
        description="Trigger memory processing after N unprocessed messages.",
    )
    recent_messages_count: int = Field(
        default=8,
        description="Number of recent messages included in reply context.",
    )
    retrieval_top_k: int = Field(
        default=3,
        description="Max facts returned from semantic search.",
    )
    retrieval_threshold: float = Field(
        default=0.30,
        description="Minimum cosine similarity score for fact retrieval.",
    )

    # ── Application ───────────────────────────────────────────────────────────
    app_name: str = "LinkedIn AI Reply"
    app_version: str = "2.0.0"
    debug: bool = False

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080",
        ]
    )

    @field_validator("gemini_api_key")
    @classmethod
    def api_key_must_not_be_placeholder(cls, v: str) -> str:
        if v.strip() in {"your_gemini_api_key_here", "", "CHANGE_ME"}:
            raise ValueError(
                "GEMINI_API_KEY is set to a placeholder value. "
                "Please provide a real Gemini API key in your .env file."
            )
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached Settings singleton."""
    return Settings()
