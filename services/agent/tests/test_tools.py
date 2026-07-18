import json

import httpx
import pytest
import respx

from app.config import Settings
from app.schemas import ProviderCredentials
from app.tools import TavilySearchClient, ToolFailure


def _settings() -> Settings:
    return Settings(environment="test", checkpoint_backend="memory", tool_timeout_seconds=2)


@pytest.mark.asyncio
@respx.mock
async def test_tavily_search_uses_bearer_auth_and_returns_bounded_sources() -> None:
    route = respx.post("https://api.tavily.com/search").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "Primary source",
                        "url": "https://example.com/research",
                        "content": "A relevant search excerpt.",
                        "score": 0.91,
                    },
                    {
                        "title": "Unsafe result",
                        "url": "file:///private/report",
                        "content": "Must be ignored.",
                    },
                ]
            },
        )
    )

    sources = await TavilySearchClient("tvly-test-secret", _settings()).search(
        "recent research",
        5,
    )

    assert route.called
    request = route.calls.last.request
    assert request.headers["Authorization"] == "Bearer tvly-test-secret"
    assert json.loads(request.content) == {
        "query": "recent research",
        "topic": "general",
        "search_depth": "basic",
        "max_results": 5,
        "include_answer": False,
        "include_raw_content": False,
        "include_images": False,
    }
    assert len(sources) == 1
    assert sources[0].title == "Primary source"
    assert sources[0].snippet == "A relevant search excerpt."


@pytest.mark.asyncio
@respx.mock
async def test_tavily_search_reports_authentication_failure_without_leaking_key() -> None:
    respx.post("https://api.tavily.com/search").mock(
        return_value=httpx.Response(401, json={"detail": "invalid API key"})
    )

    with pytest.raises(ToolFailure) as caught:
        await TavilySearchClient("tvly-private-secret", _settings()).search("research", 3)

    assert caught.value.code == "search_auth_failed"
    assert caught.value.safe_message == "Tavily Search credentials were rejected"
    assert "tvly-private-secret" not in str(caught.value)


def test_tavily_key_is_kept_secret_in_request_credentials() -> None:
    credentials = ProviderCredentials(
        api_key="provider-test-secret",
        tavily_api_key="tvly-test-secret",
    )

    assert credentials.tavily_api_key is not None
    assert credentials.tavily_api_key.get_secret_value() == "tvly-test-secret"
    assert "tvly-test-secret" not in repr(credentials)
