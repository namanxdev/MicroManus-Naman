"""Public request/response schemas. Secret fields are never serialized into events."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    SecretStr,
    StringConstraints,
    field_validator,
)

Identifier = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=128, pattern=r"^[\w.@:-]+$"),
]


class ProviderCredentials(BaseModel):
    """Ephemeral BYOK credentials forwarded by the authenticated Next.js server."""

    model_config = ConfigDict(extra="forbid")

    api_key: SecretStr = Field(min_length=8, repr=False)
    base_url: HttpUrl | None = None
    tavily_api_key: SecretStr | None = Field(default=None, min_length=8, repr=False)
    brave_api_key: SecretStr | None = Field(default=None, min_length=8, repr=False)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread_id: Identifier
    message: str = Field(min_length=1, max_length=30_000)
    model: str = Field(min_length=3, max_length=128)
    credentials: ProviderCredentials = Field(repr=False)
    max_iterations: int | None = Field(default=None, ge=1, le=20)

    @field_validator("message")
    @classmethod
    def reject_blank_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value.strip()


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str = Field(max_length=500)
    url: HttpUrl
    snippet: str = Field(default="", max_length=2_000)


class Artifact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: Literal["pdf"] = "pdf"
    title: str
    mime_type: Literal["application/pdf"] = "application/pdf"
    size_bytes: int = Field(ge=1)
    download_url: str
    created_at: datetime


class ReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=1, max_length=100_000)
    sources: list[Source] = Field(default_factory=list, max_length=100)
    thread_id: Identifier | None = None

    @field_validator("title", "markdown")
    @classmethod
    def reject_blank_report_fields(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("value must not be blank")
        return value.strip()


class ReportResponse(BaseModel):
    artifact: Artifact


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str
    checkpoint_backend: Literal["sqlite", "memory"]
    pricing_version: str


class ModelListResponse(BaseModel):
    pricing_version: str
    models: list[dict[str, Any]]
