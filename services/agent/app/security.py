"""Outbound URL validation used by fetch tools and custom provider endpoints."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Collection
from urllib.parse import urlsplit, urlunsplit


class URLSafetyError(ValueError):
    """Raised when an outbound URL could reach a disallowed network target."""


_BLOCKED_HOST_SUFFIXES = (
    ".localhost",
    ".local",
    ".internal",
    ".home",
    ".lan",
    ".onion",
    ".test",
    ".invalid",
    ".example",
)


def _is_public_ip(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    return ip.is_global


async def _resolve_public(host: str, port: int) -> tuple[str, ...]:
    if _is_public_ip(host):
        return (host,)
    try:
        # A literal non-global IP must not fall through to platform DNS parsing.
        ipaddress.ip_address(host.split("%", 1)[0])
    except ValueError:
        pass
    else:
        raise URLSafetyError("private, local, or reserved network targets are not allowed")

    loop = asyncio.get_running_loop()
    try:
        records = await asyncio.wait_for(
            loop.getaddrinfo(host, port, type=socket.SOCK_STREAM), timeout=3.0
        )
    except TimeoutError as exc:
        raise URLSafetyError("DNS resolution timed out") from exc
    except socket.gaierror as exc:
        raise URLSafetyError("host could not be resolved") from exc

    addresses = tuple(sorted({str(record[4][0]).split("%", 1)[0] for record in records}))
    if not addresses:
        raise URLSafetyError("host did not resolve to an address")
    if any(not _is_public_ip(address) for address in addresses):
        raise URLSafetyError("host resolves to a private, local, or reserved address")
    return addresses


async def validate_public_url(
    raw_url: str,
    *,
    require_https: bool = False,
    allowed_ports: Collection[int] = (80, 443),
) -> str:
    """Validate scheme, authority, port, and every DNS answer for an outbound URL.

    DNS is deliberately checked again before every redirect. Deployments should also
    enforce an egress firewall because application-level checks cannot fully eliminate
    DNS rebinding between resolution and connection.
    """

    if not raw_url or len(raw_url) > 2_048:
        raise URLSafetyError("URL length is invalid")
    if any(ord(character) < 32 for character in raw_url):
        raise URLSafetyError("URL contains control characters")

    parsed = urlsplit(raw_url)
    allowed_schemes = {"https"} if require_https else {"http", "https"}
    if parsed.scheme.lower() not in allowed_schemes:
        raise URLSafetyError("only approved HTTP schemes are allowed")
    if parsed.username is not None or parsed.password is not None:
        raise URLSafetyError("URL user information is not allowed")
    if not parsed.hostname:
        raise URLSafetyError("URL must include a host")

    host = parsed.hostname.rstrip(".").lower()
    if not host or len(host) > 253 or "%" in host:
        raise URLSafetyError("URL host is invalid")
    try:
        ascii_host = host.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise URLSafetyError("URL host is invalid") from exc
    if ascii_host == "localhost" or ascii_host.endswith(_BLOCKED_HOST_SUFFIXES):
        raise URLSafetyError("local and special-use hostnames are not allowed")

    try:
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    except ValueError as exc:
        raise URLSafetyError("URL port is invalid") from exc
    if port not in allowed_ports:
        raise URLSafetyError("URL port is not allowed")

    await _resolve_public(ascii_host, port)
    # Fragments never need to leave the service. Preserve the query for normal pages.
    netloc = f"[{ascii_host}]" if ":" in ascii_host else ascii_host
    default_port = 443 if parsed.scheme.lower() == "https" else 80
    if port != default_port:
        netloc = f"{netloc}:{port}"
    return urlunsplit((parsed.scheme.lower(), netloc, parsed.path or "/", parsed.query, ""))


async def validate_provider_base_url(raw_url: str) -> str:
    parsed = urlsplit(raw_url)
    if parsed.query or parsed.fragment:
        raise URLSafetyError("provider endpoint cannot contain a query or fragment")
    return (await validate_public_url(raw_url, require_https=True, allowed_ports=(443,))).rstrip(
        "/"
    )
