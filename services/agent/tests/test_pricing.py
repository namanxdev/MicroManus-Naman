from datetime import date
from decimal import Decimal

import pytest

from app.pricing import PricingRegistry, UsageNumbers


def test_calculates_four_disjoint_token_buckets() -> None:
    registry = PricingRegistry.load()
    usage = UsageNumbers(
        input_tokens=1_750,
        output_tokens=500,
        cache_read_tokens=500,
        cache_write_tokens=250,
    )

    cost = registry.calculate("openai/gpt-5.6-sol", usage, at=date(2026, 7, 17))

    assert usage.uncached_input_tokens == 1_000
    assert cost["input_usd"] == pytest.approx(0.005)
    assert cost["cache_read_usd"] == pytest.approx(0.00025)
    assert cost["cache_write_usd"] == pytest.approx(0.0015625)
    assert cost["output_usd"] == pytest.approx(0.015)
    assert cost["total_usd"] == pytest.approx(0.0218125)


def test_selects_time_bounded_sonnet_introductory_price() -> None:
    registry = PricingRegistry.load()
    model = registry.get("anthropic/claude-sonnet-5")

    assert model.price_on(date(2026, 8, 31)).input == 2
    assert model.price_on(date(2026, 9, 1)).input == 3


def test_unknown_model_is_rejected() -> None:
    with pytest.raises(KeyError, match="unsupported model"):
        PricingRegistry.load().get("openai/not-a-model")


def test_fable_uses_five_minute_cache_write_rate() -> None:
    model = PricingRegistry.load().get("anthropic/claude-fable-5")
    period = model.price_on(date(2026, 7, 17))

    assert period.input == 10
    assert period.cache_read == 1
    assert period.cache_write == Decimal("12.50")
    assert period.output == 50
    assert "1-hour" in (model.pricing_notes or "")
