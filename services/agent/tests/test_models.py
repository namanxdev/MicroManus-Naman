from app.models import _is_openrouter_endpoint, _model_for_endpoint
from app.pricing import PricingRegistry


def test_openrouter_endpoint_detection_does_not_trust_lookalike_hosts() -> None:
    assert _is_openrouter_endpoint("https://openrouter.ai/api/v1")
    assert _is_openrouter_endpoint("https://api.openrouter.ai/v1")
    assert not _is_openrouter_endpoint("https://openrouter.ai.example.com/v1")


def test_openrouter_uses_provider_qualified_model_slugs() -> None:
    registry = PricingRegistry.load()

    assert _model_for_endpoint(
        registry.get("openai/gpt-5.6-luna"),
        "https://openrouter.ai/api/v1",
    ) == "openai/gpt-5.6-luna"
    assert _model_for_endpoint(
        registry.get("anthropic/claude-sonnet-5"),
        "https://openrouter.ai/api/v1",
    ) == "anthropic/claude-sonnet-5"
    assert _model_for_endpoint(
        registry.get("kimi/kimi-k3"),
        "https://openrouter.ai/api/v1",
    ) == "moonshotai/kimi-k3"


def test_native_endpoints_keep_native_model_ids() -> None:
    definition = PricingRegistry.load().get("openai/gpt-5.6-luna")

    assert _model_for_endpoint(definition, "https://api.openai.com/v1") == "gpt-5.6-luna"
