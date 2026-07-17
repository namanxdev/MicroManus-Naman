"""Versioned model catalog and deterministic token-cost calculations."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from importlib.resources import files
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

Provider = Literal["openai", "anthropic", "kimi"]


class PricePeriod(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    effective_from: date
    effective_to: date | None = None
    input: Decimal = Field(ge=0)
    cache_read: Decimal = Field(ge=0)
    cache_write: Decimal = Field(ge=0)
    output: Decimal = Field(ge=0)

    @model_validator(mode="after")
    def validate_dates(self) -> PricePeriod:
        if self.effective_to is not None and self.effective_to < self.effective_from:
            raise ValueError("pricing effective_to cannot precede effective_from")
        return self

    def applies_on(self, day: date) -> bool:
        return self.effective_from <= day and (
            self.effective_to is None or day <= self.effective_to
        )


class ModelDefinition(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    id: str
    provider: Provider
    api_model: str
    label: str
    description: str
    default_base_url: HttpUrl
    context_window: int = Field(gt=0)
    rates: tuple[PricePeriod, ...]
    pricing_notes: str | None = None
    source_urls: tuple[HttpUrl, ...]

    @model_validator(mode="after")
    def validate_periods(self) -> ModelDefinition:
        if not self.rates:
            raise ValueError("at least one pricing period is required")
        if not self.id.startswith(f"{self.provider}/"):
            raise ValueError("model id must be namespaced by provider")
        periods = sorted(self.rates, key=lambda item: item.effective_from)
        for previous, current in zip(periods, periods[1:], strict=False):
            if previous.effective_to is None or previous.effective_to >= current.effective_from:
                raise ValueError(f"overlapping pricing periods for {self.id}")
        return self

    def price_on(self, day: date) -> PricePeriod:
        for period in self.rates:
            if period.applies_on(day):
                return period
        raise LookupError(f"no pricing for {self.id} on {day.isoformat()}")


class RegistryDocument(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    version: str
    currency: Literal["USD"]
    unit_tokens: int = Field(gt=0)
    models: tuple[ModelDefinition, ...]

    @model_validator(mode="after")
    def unique_ids(self) -> RegistryDocument:
        ids = [item.id for item in self.models]
        if len(ids) != len(set(ids)):
            raise ValueError("model ids must be unique")
        return self


@dataclass(frozen=True, slots=True)
class UsageNumbers:
    """Provider-neutral usage. ``input_tokens`` includes every input token class."""

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    @property
    def uncached_input_tokens(self) -> int:
        return max(self.input_tokens - self.cache_read_tokens - self.cache_write_tokens, 0)


class PricingRegistry:
    def __init__(self, document: RegistryDocument):
        self.document = document
        self._models = {model.id: model for model in document.models}

    @classmethod
    def load(cls, override_path: Path | None = None) -> PricingRegistry:
        if override_path is None:
            registry_file = files("app.registry").joinpath("pricing.v1.json")
            raw = registry_file.read_text(encoding="utf-8")
        else:
            raw = override_path.read_text(encoding="utf-8")
        return cls(RegistryDocument.model_validate(json.loads(raw)))

    def get(self, model_id: str) -> ModelDefinition:
        try:
            return self._models[model_id]
        except KeyError as exc:
            raise KeyError(f"unsupported model: {model_id}") from exc

    def list_models(self, at: date | None = None) -> list[dict[str, Any]]:
        day = at or datetime.now(UTC).date()
        result: list[dict[str, Any]] = []
        for model in self.document.models:
            price = model.price_on(day)
            result.append(
                {
                    "id": model.id,
                    "provider": model.provider,
                    "api_model": model.api_model,
                    "label": model.label,
                    "description": model.description,
                    "context_window": model.context_window,
                    "supports_tools": True,
                    "supports_prompt_cache": True,
                    "pricing_notes": model.pricing_notes,
                    "pricing": self._price_payload(price),
                }
            )
        return result

    def calculate(
        self,
        model_id: str,
        usage: UsageNumbers,
        at: date | None = None,
    ) -> dict[str, Any]:
        day = at or datetime.now(UTC).date()
        period = self.get(model_id).price_on(day)
        unit = Decimal(self.document.unit_tokens)

        def charge(tokens: int, rate: Decimal) -> Decimal:
            return (Decimal(tokens) * rate / unit).quantize(
                Decimal("0.000000001"), rounding=ROUND_HALF_UP
            )

        input_cost = charge(usage.uncached_input_tokens, period.input)
        cache_read_cost = charge(usage.cache_read_tokens, period.cache_read)
        cache_write_cost = charge(usage.cache_write_tokens, period.cache_write)
        output_cost = charge(usage.output_tokens, period.output)
        total = input_cost + cache_read_cost + cache_write_cost + output_cost
        return {
            "input_usd": float(input_cost),
            "output_usd": float(output_cost),
            "cache_read_usd": float(cache_read_cost),
            "cache_write_usd": float(cache_write_cost),
            "total_usd": float(total),
            "currency": self.document.currency,
            "pricing_version": self.document.version,
            "pricing_effective_date": day.isoformat(),
        }

    def _price_payload(self, period: PricePeriod) -> dict[str, Any]:
        return {
            "unit_tokens": self.document.unit_tokens,
            "currency": self.document.currency,
            "input_per_million": float(period.input),
            "cache_read_per_million": float(period.cache_read),
            "cache_write_per_million": float(period.cache_write),
            "output_per_million": float(period.output),
            "effective_from": period.effective_from.isoformat(),
            "effective_to": period.effective_to.isoformat() if period.effective_to else None,
            "version": self.document.version,
        }
