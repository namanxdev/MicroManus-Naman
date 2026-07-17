import pytest

from app.security import URLSafetyError, validate_provider_base_url, validate_public_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/admin",
        "http://169.254.169.254/latest/meta-data",
        "http://10.2.3.4/",
        "http://[::1]/",
        "ftp://1.1.1.1/file",
        "http://user:pass@1.1.1.1/",
        "http://1.1.1.1:8080/",
    ],
)
async def test_rejects_ssrf_and_non_http_targets(url: str) -> None:
    with pytest.raises(URLSafetyError):
        await validate_public_url(url)


async def test_accepts_public_https_and_strips_fragment() -> None:
    result = await validate_public_url("https://1.1.1.1/research?q=1#section")
    assert result == "https://1.1.1.1/research?q=1"


async def test_provider_endpoint_requires_https_without_query() -> None:
    with pytest.raises(URLSafetyError):
        await validate_provider_base_url("http://1.1.1.1/v1")
    with pytest.raises(URLSafetyError):
        await validate_provider_base_url("https://1.1.1.1/v1?target=x")
