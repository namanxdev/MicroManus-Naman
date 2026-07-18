"""Create short-lived LangChain clients from request-scoped BYOK credentials."""

from __future__ import annotations

from urllib.parse import urlsplit

from langchain_core.language_models.chat_models import BaseChatModel

from .config import Settings
from .pricing import ModelDefinition
from .schemas import ProviderCredentials

_OPENROUTER_PROVIDER_SLUGS = {
    "openai": "openai",
    "anthropic": "anthropic",
    "kimi": "moonshotai",
}


def _is_openrouter_endpoint(base_url: str) -> bool:
    host = (urlsplit(base_url).hostname or "").lower().rstrip(".")
    return host == "openrouter.ai" or host.endswith(".openrouter.ai")


def _model_for_endpoint(definition: ModelDefinition, base_url: str) -> str:
    """Translate native model IDs to the provider-qualified slugs OpenRouter requires."""

    if not _is_openrouter_endpoint(base_url) or "/" in definition.api_model:
        return definition.api_model
    return f"{_OPENROUTER_PROVIDER_SLUGS[definition.provider]}/{definition.api_model}"


def build_chat_model(
    definition: ModelDefinition,
    credentials: ProviderCredentials,
    base_url: str,
    settings: Settings,
) -> BaseChatModel:
    """Build a client without reading provider keys from environment variables."""

    api_key = credentials.api_key.get_secret_value()
    openrouter = _is_openrouter_endpoint(base_url)
    common = {
        "model": _model_for_endpoint(definition, base_url),
        "max_tokens": settings.max_output_tokens,
        "timeout": settings.provider_timeout_seconds,
        "max_retries": 2,
    }
    if definition.provider == "anthropic" and not openrouter:
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            **common,
            api_key=api_key,
            base_url=base_url,
        )

    # Kimi, custom compatible endpoints and OpenRouter implement OpenAI Chat Completions.
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        **common,
        api_key=api_key,
        base_url=base_url,
        stream_usage=True,
    )
