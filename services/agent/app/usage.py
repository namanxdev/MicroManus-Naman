"""Normalize usage fields emitted by OpenAI, Anthropic, and OpenAI-compatible APIs."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage

from .pricing import Provider, UsageNumbers


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _integer(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError):
        return 0


def _first_integer(*values: Any) -> int:
    for value in values:
        parsed = _integer(value)
        if parsed:
            return parsed
    return 0


def extract_usage(message: AIMessage, provider: Provider) -> UsageNumbers:
    """Extract one model call's usage without double-counting cache token classes."""

    metadata = _mapping(getattr(message, "response_metadata", None))
    raw = _mapping(metadata.get("usage") or metadata.get("token_usage"))

    # Anthropic reports non-cached, cache read, and cache creation as disjoint fields.
    if provider == "anthropic" and raw:
        cache_read = _integer(raw.get("cache_read_input_tokens"))
        cache_write = _integer(raw.get("cache_creation_input_tokens"))
        base_input = _integer(raw.get("input_tokens"))
        output = _integer(raw.get("output_tokens"))
        if base_input or output or cache_read or cache_write:
            return UsageNumbers(
                input_tokens=base_input + cache_read + cache_write,
                output_tokens=output,
                cache_read_tokens=cache_read,
                cache_write_tokens=cache_write,
            )

    standardized = _mapping(getattr(message, "usage_metadata", None))
    if standardized:
        details = _mapping(standardized.get("input_token_details"))
        raw_details = _mapping(raw.get("prompt_tokens_details"))
        cache_read = _first_integer(
            details.get("cache_read"),
            details.get("cached_tokens"),
            details.get("cache_read_tokens"),
            details.get("prompt_cache_hit_tokens"),
            standardized.get("cache_read_input_tokens"),
            raw_details.get("cached_tokens"),
            raw.get("cached_tokens"),
            raw.get("prompt_cache_hit_tokens"),
        )
        cache_write = _first_integer(
            details.get("cache_creation"),
            details.get("cache_write"),
            details.get("cache_creation_tokens"),
            details.get("cache_write_tokens"),
            standardized.get("cache_creation_input_tokens"),
            raw_details.get("cache_creation_tokens"),
            raw.get("cache_creation_input_tokens"),
        )
        input_tokens = _integer(standardized.get("input_tokens"))
        if input_tokens < cache_read + cache_write:
            input_tokens += cache_read + cache_write
        return UsageNumbers(
            input_tokens=input_tokens,
            output_tokens=_integer(standardized.get("output_tokens")),
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
        )

    prompt_details = _mapping(raw.get("prompt_tokens_details"))
    cache_read = _first_integer(
        prompt_details.get("cached_tokens"),
        prompt_details.get("cache_read_tokens"),
        prompt_details.get("prompt_cache_hit_tokens"),
        raw.get("cached_tokens"),
        raw.get("cache_hit_tokens"),
        raw.get("prompt_cache_hit_tokens"),
        raw.get("cache_read_input_tokens"),
    )
    cache_write = _first_integer(
        prompt_details.get("cache_creation_tokens"),
        prompt_details.get("cache_write_tokens"),
        raw.get("cache_creation_input_tokens"),
        raw.get("cache_write_input_tokens"),
    )
    input_tokens = _first_integer(raw.get("prompt_tokens"), raw.get("input_tokens"))
    if input_tokens < cache_read + cache_write:
        input_tokens += cache_read + cache_write
    return UsageNumbers(
        input_tokens=input_tokens,
        output_tokens=_first_integer(raw.get("completion_tokens"), raw.get("output_tokens")),
        cache_read_tokens=cache_read,
        cache_write_tokens=cache_write,
    )


@dataclass(slots=True)
class UsageAccumulator:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    def add(self, usage: UsageNumbers) -> None:
        self.input_tokens += usage.input_tokens
        self.output_tokens += usage.output_tokens
        self.cache_read_tokens += usage.cache_read_tokens
        self.cache_write_tokens += usage.cache_write_tokens

    def snapshot(self) -> UsageNumbers:
        return UsageNumbers(
            input_tokens=self.input_tokens,
            output_tokens=self.output_tokens,
            cache_read_tokens=self.cache_read_tokens,
            cache_write_tokens=self.cache_write_tokens,
        )

    def payload(self) -> dict[str, int]:
        usage = self.snapshot()
        return {
            # Public buckets are disjoint so the billing service can price each once.
            "input_tokens": usage.uncached_input_tokens,
            "total_input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cache_read_tokens": usage.cache_read_tokens,
            "cache_write_tokens": usage.cache_write_tokens,
            "total_tokens": usage.total_tokens,
        }
