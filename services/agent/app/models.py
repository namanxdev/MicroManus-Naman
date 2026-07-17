"""Create short-lived LangChain clients from request-scoped BYOK credentials."""

from __future__ import annotations

from langchain_core.language_models.chat_models import BaseChatModel

from .config import Settings
from .pricing import ModelDefinition
from .schemas import ProviderCredentials


def build_chat_model(
    definition: ModelDefinition,
    credentials: ProviderCredentials,
    base_url: str,
    settings: Settings,
) -> BaseChatModel:
    """Build a client without reading provider keys from environment variables."""

    api_key = credentials.api_key.get_secret_value()
    common = {
        "model": definition.api_model,
        "max_tokens": settings.max_output_tokens,
        "timeout": settings.provider_timeout_seconds,
        "max_retries": 2,
    }
    if definition.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            **common,
            api_key=api_key,
            base_url=base_url,
        )

    # Kimi's public API and custom endpoints both implement OpenAI Chat Completions.
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        **common,
        api_key=api_key,
        base_url=base_url,
        stream_usage=True,
    )
