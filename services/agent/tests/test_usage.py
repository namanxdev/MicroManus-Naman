from langchain_core.messages import AIMessage

from app.pricing import UsageNumbers
from app.usage import UsageAccumulator, extract_usage


def test_openai_cached_tokens_are_subtracted_from_public_input_bucket() -> None:
    message = AIMessage(
        content="ok",
        response_metadata={
            "token_usage": {
                "prompt_tokens": 1_000,
                "completion_tokens": 100,
                "prompt_tokens_details": {"cached_tokens": 600},
            }
        },
    )
    accumulator = UsageAccumulator()
    accumulator.add(extract_usage(message, "openai"))

    assert accumulator.payload() == {
        "input_tokens": 400,
        "total_input_tokens": 1_000,
        "output_tokens": 100,
        "cache_read_tokens": 600,
        "cache_write_tokens": 0,
        "total_tokens": 1_100,
    }


def test_anthropic_disjoint_raw_counters_are_normalized_to_total_input() -> None:
    message = AIMessage(
        content="ok",
        response_metadata={
            "usage": {
                "input_tokens": 300,
                "output_tokens": 50,
                "cache_read_input_tokens": 500,
                "cache_creation_input_tokens": 200,
            }
        },
    )

    assert extract_usage(message, "anthropic") == UsageNumbers(
        input_tokens=1_000,
        output_tokens=50,
        cache_read_tokens=500,
        cache_write_tokens=200,
    )


def test_kimi_direct_cache_hit_counter_is_supported() -> None:
    message = AIMessage(
        content="ok",
        response_metadata={
            "token_usage": {
                "prompt_tokens": 1_000,
                "completion_tokens": 50,
                "prompt_cache_hit_tokens": 400,
            }
        },
    )

    usage = extract_usage(message, "kimi")
    assert usage.input_tokens == 1_000
    assert usage.uncached_input_tokens == 600
    assert usage.cache_read_tokens == 400
