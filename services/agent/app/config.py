"""Runtime configuration. Provider credentials intentionally do not live here."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Non-provider service configuration loaded from ``MICROMANUS_AGENT_*`` vars."""

    model_config = SettingsConfigDict(
        env_prefix="MICROMANUS_AGENT_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    service_token: SecretStr | None = None
    allow_insecure_dev_auth: bool = False

    checkpoint_backend: Literal["sqlite", "memory"] = "sqlite"
    checkpoint_db_path: Path = Path("data/checkpoints.sqlite")
    artifact_dir: Path = Path("data/artifacts")
    pricing_registry_path: Path | None = None

    default_max_iterations: int = Field(default=6, ge=1, le=12)
    max_iterations_cap: int = Field(default=10, ge=1, le=20)
    run_timeout_seconds: float = Field(default=180.0, ge=10, le=900)
    provider_timeout_seconds: float = Field(default=75.0, ge=5, le=300)
    tool_timeout_seconds: float = Field(default=20.0, ge=2, le=90)
    sse_heartbeat_seconds: float = Field(default=10.0, ge=2, le=30)
    max_output_tokens: int = Field(default=8_192, ge=256, le=64_000)

    max_fetch_bytes: int = Field(default=2_000_000, ge=32_768, le=10_000_000)
    max_fetch_characters: int = Field(default=24_000, ge=2_000, le=100_000)
    max_pdf_pages_to_fetch: int = Field(default=30, ge=1, le=100)
    max_report_characters: int = Field(default=100_000, ge=2_000, le=500_000)
    max_sources_per_run: int = Field(default=40, ge=1, le=100)

    @field_validator("checkpoint_db_path", "artifact_dir", "pricing_registry_path")
    @classmethod
    def expand_paths(cls, value: Path | None) -> Path | None:
        return value.expanduser() if value is not None else None

    def validate_security(self) -> None:
        """Fail closed when a production service has no server-to-server secret."""

        if self.environment == "production" and self.service_token is None:
            raise RuntimeError("MICROMANUS_AGENT_SERVICE_TOKEN is required in production")
        if (
            self.environment == "production"
            and self.service_token is not None
            and len(self.service_token.get_secret_value()) < 32
        ):
            raise RuntimeError("MICROMANUS_AGENT_SERVICE_TOKEN must be at least 32 characters")
        if self.environment == "production" and self.allow_insecure_dev_auth:
            raise RuntimeError("insecure development auth cannot be enabled in production")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
