"""
app/core/config.py
==================
Centralised application settings loaded from environment variables.

All other modules MUST import `get_settings()` from here.
Never call `os.getenv()` directly elsewhere in the application.
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
        default="gemini-3.6-flash",
        description="Gemini model identifier (e.g. gemini-3.6-flash)",
    )

    # ── Application ───────────────────────────────────────────────────────────
    app_name: str = "LinkedIn AI Reply"
    app_version: str = "1.0.0"
    debug: bool = False

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Add the production Chrome extension origin here when deploying.
    # Format for Chrome extensions: "chrome-extension://<extension-id>"
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080",
            # TODO: add production Chrome extension origin before deployment
            # "chrome-extension://your-extension-id-here",
        ]
    )

    @field_validator("gemini_api_key")
    @classmethod
    def api_key_must_not_be_placeholder(cls, v: str) -> str:
        """Prevent accidental use of the example placeholder value."""
        if v.strip() in {"your_gemini_api_key_here", "", "CHANGE_ME"}:
            raise ValueError(
                "GEMINI_API_KEY is set to a placeholder value. "
                "Please provide a real Gemini API key in your .env file."
            )
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the cached Settings singleton.

    Using lru_cache ensures the .env file is read only once per process,
    and the same object is reused across all callers.
    """
    return Settings()
