"""Bounded research tools. Web content is treated as untrusted data."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from dataclasses import dataclass, field
from html import unescape
from io import BytesIO
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup
from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field, ValidationError

from .config import Settings
from .reports import ReportService
from .schemas import Artifact, ProviderCredentials, Source
from .security import URLSafetyError, validate_public_url

_USER_AGENT = "MicroManus-Research/0.1 (+https://micromanus.app)"
_BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


class SearchInput(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    count: int = Field(default=5, ge=1, le=10)


class FetchInput(BaseModel):
    url: str = Field(min_length=8, max_length=2_048)


class ReportToolInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    markdown: str = Field(min_length=20, max_length=100_000)


class ToolFailure(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.safe_message = message


def _compact_text(value: Any, limit: int) -> str:
    text = BeautifulSoup(unescape(str(value or "")), "html.parser").get_text(" ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def _source_id(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def _safe_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)


@dataclass(slots=True)
class RunEvidence:
    max_sources: int
    sources: list[Source] = field(default_factory=list)
    artifacts: list[Artifact] = field(default_factory=list)
    _source_urls: set[str] = field(default_factory=set)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _report_created: bool = False

    async def add_sources(self, candidates: list[Source]) -> list[Source]:
        added: list[Source] = []
        async with self._lock:
            for source in candidates:
                key = str(source.url)
                if key in self._source_urls or len(self.sources) >= self.max_sources:
                    continue
                self._source_urls.add(key)
                self.sources.append(source)
                added.append(source)
        return added

    async def source_snapshot(self) -> tuple[Source, ...]:
        async with self._lock:
            return tuple(self.sources)

    async def reserve_report(self) -> bool:
        async with self._lock:
            if self._report_created:
                return False
            self._report_created = True
            return True

    async def add_artifact(self, artifact: Artifact) -> None:
        async with self._lock:
            self.artifacts.append(artifact)


class BraveSearchClient:
    def __init__(self, api_key: str, settings: Settings):
        self._api_key = api_key
        self._settings = settings

    async def search(self, query: str, count: int) -> list[Source]:
        timeout = httpx.Timeout(self._settings.tool_timeout_seconds, connect=5.0)
        headers = {
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": _USER_AGENT,
            "X-Subscription-Token": self._api_key,
        }
        params = {"q": query, "count": count, "safesearch": "moderate", "text_decorations": "false"}
        try:
            async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
                response = await client.get(_BRAVE_SEARCH_URL, headers=headers, params=params)
                response.raise_for_status()
                payload = response.json()
        except httpx.TimeoutException as exc:
            raise ToolFailure("search_timeout", "web search timed out") from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                raise ToolFailure(
                    "search_auth_failed", "Brave Search credentials were rejected"
                ) from exc
            if exc.response.status_code == 429:
                raise ToolFailure(
                    "search_rate_limited", "Brave Search rate limit was reached"
                ) from exc
            raise ToolFailure("search_failed", "Brave Search request failed") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise ToolFailure("search_failed", "Brave Search request failed") from exc

        results = payload.get("web", {}).get("results", []) if isinstance(payload, dict) else []
        sources: list[Source] = []
        for item in results[:count]:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "")
            if urlsplit(url).scheme.lower() not in {"http", "https"}:
                continue
            try:
                sources.append(
                    Source(
                        id=_source_id(url),
                        title=_compact_text(item.get("title") or url, 500),
                        url=url,
                        snippet=_compact_text(item.get("description"), 1_000),
                    )
                )
            except ValidationError:
                continue
        return sources


class SafePageFetcher:
    def __init__(self, settings: Settings):
        self._settings = settings

    async def fetch(self, raw_url: str) -> dict[str, Any]:
        current = await validate_public_url(raw_url)
        original_scheme = urlsplit(current).scheme
        timeout = httpx.Timeout(self._settings.tool_timeout_seconds, connect=5.0)
        headers = {
            "Accept": (
                "text/html,application/xhtml+xml,application/pdf,text/plain,"
                "application/json;q=0.8"
            ),
            "Accept-Encoding": "gzip, deflate",
            "User-Agent": _USER_AGENT,
        }

        async with httpx.AsyncClient(
            timeout=timeout, follow_redirects=False, trust_env=False
        ) as client:
            for _redirect in range(4):
                # Re-resolve every hop. An infrastructure egress policy remains recommended.
                current = await validate_public_url(current)
                try:
                    async with client.stream("GET", current, headers=headers) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            location = response.headers.get("location")
                            if not location:
                                raise ToolFailure(
                                    "fetch_redirect", "page returned an invalid redirect"
                                )
                            redirected = urljoin(current, location)
                            if (
                                original_scheme == "https"
                                and urlsplit(redirected).scheme != "https"
                            ):
                                raise ToolFailure(
                                    "fetch_redirect", "HTTPS pages may not redirect to HTTP"
                                )
                            current = redirected
                            continue
                        if response.status_code >= 400:
                            raise ToolFailure(
                                "fetch_http_error", f"page returned HTTP {response.status_code}"
                            )

                        content_type = (
                            response.headers.get("content-type", "").split(";", 1)[0].lower()
                        )
                        allowed = {
                            "text/html",
                            "application/xhtml+xml",
                            "text/plain",
                            "application/json",
                            "application/pdf",
                        }
                        if content_type not in allowed:
                            raise ToolFailure(
                                "fetch_content_type", "page content type is not supported"
                            )
                        content_length = response.headers.get("content-length")
                        if content_length and int(content_length) > self._settings.max_fetch_bytes:
                            raise ToolFailure(
                                "fetch_too_large", "page is too large to fetch safely"
                            )

                        chunks: list[bytes] = []
                        size = 0
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > self._settings.max_fetch_bytes:
                                raise ToolFailure(
                                    "fetch_too_large", "page is too large to fetch safely"
                                )
                            chunks.append(chunk)
                        body = b"".join(chunks)
                        return self._extract(current, content_type, body, response.encoding)
                except httpx.TimeoutException as exc:
                    raise ToolFailure("fetch_timeout", "page fetch timed out") from exc
                except httpx.HTTPError as exc:
                    raise ToolFailure("fetch_failed", "page fetch failed") from exc
            raise ToolFailure("fetch_redirect", "page exceeded the redirect limit")

    def _extract(
        self, url: str, content_type: str, body: bytes, encoding: str | None
    ) -> dict[str, Any]:
        if content_type == "application/pdf":
            return self._extract_pdf(url, body)
        text = body.decode(encoding or "utf-8", errors="replace")
        title = urlsplit(url).hostname or url
        if content_type in {"text/html", "application/xhtml+xml"}:
            soup = BeautifulSoup(text, "html.parser")
            if soup.title and soup.title.string:
                title = _compact_text(soup.title.string, 500)
            for element in soup(["script", "style", "noscript", "svg", "canvas", "iframe"]):
                element.decompose()
            root = soup.find("main") or soup.find("article") or soup.body or soup
            text = root.get_text("\n")
        text = re.sub(r"[ \t\r\f\v]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        text = text[: self._settings.max_fetch_characters]
        return {
            "kind": "web_page",
            "url": url,
            "title": title,
            "content": text,
            "characters": len(text),
            "content_type": content_type,
            "untrusted_content": True,
        }

    def _extract_pdf(self, url: str, body: bytes) -> dict[str, Any]:
        try:
            from pypdf import PdfReader

            reader = PdfReader(BytesIO(body), strict=False)
            pages: list[str] = []
            for page in reader.pages[: self._settings.max_pdf_pages_to_fetch]:
                pages.append(page.extract_text() or "")
        except Exception as exc:
            raise ToolFailure("fetch_pdf_invalid", "PDF could not be parsed") from exc
        text = re.sub(r"\s+", " ", "\n\n".join(pages)).strip()
        text = text[: self._settings.max_fetch_characters]
        return {
            "kind": "web_page",
            "url": url,
            "title": url.rsplit("/", 1)[-1] or "PDF document",
            "content": text,
            "characters": len(text),
            "content_type": "application/pdf",
            "pages_read": min(len(reader.pages), self._settings.max_pdf_pages_to_fetch),
            "untrusted_content": True,
        }


def build_research_tools(
    *,
    credentials: ProviderCredentials,
    settings: Settings,
    evidence: RunEvidence,
    reports: ReportService,
    owner_namespace: str,
) -> list[BaseTool]:
    brave_secret = credentials.brave_api_key
    brave = (
        BraveSearchClient(brave_secret.get_secret_value(), settings)
        if brave_secret is not None
        else None
    )
    fetcher = SafePageFetcher(settings)

    @tool("web_search", args_schema=SearchInput)
    async def web_search(query: str, count: int = 5) -> str:
        """Search the public web for recent sources. Use before claiming time-sensitive facts."""

        if brave is None:
            return _safe_json(
                {
                    "kind": "tool_error",
                    "code": "search_not_configured",
                    "message": "Brave Search is not configured for this chat.",
                }
            )
        try:
            async with asyncio.timeout(settings.tool_timeout_seconds + 1):
                sources = await brave.search(query.strip(), count)
            await evidence.add_sources(sources)
            return _safe_json(
                {
                    "kind": "search_results",
                    "query": query.strip(),
                    "results": [source.model_dump(mode="json") for source in sources],
                    "untrusted_content": True,
                }
            )
        except (ToolFailure, TimeoutError) as exc:
            code = exc.code if isinstance(exc, ToolFailure) else "search_timeout"
            message = exc.safe_message if isinstance(exc, ToolFailure) else "web search timed out"
            return _safe_json({"kind": "tool_error", "code": code, "message": message})

    @tool("fetch_url", args_schema=FetchInput)
    async def fetch_url(url: str) -> str:
        """Fetch readable text from one public HTTP(S) URL, including bounded PDFs."""

        try:
            async with asyncio.timeout(settings.tool_timeout_seconds + 1):
                result = await fetcher.fetch(url)
            source = Source(
                id=_source_id(result["url"]),
                title=_compact_text(result["title"], 500),
                url=result["url"],
                snippet=_compact_text(result["content"], 1_000),
            )
            await evidence.add_sources([source])
            return _safe_json(result)
        except URLSafetyError as exc:
            return _safe_json({"kind": "tool_error", "code": "unsafe_url", "message": str(exc)})
        except (ToolFailure, TimeoutError) as exc:
            code = exc.code if isinstance(exc, ToolFailure) else "fetch_timeout"
            message = exc.safe_message if isinstance(exc, ToolFailure) else "page fetch timed out"
            return _safe_json({"kind": "tool_error", "code": code, "message": message})
        except ValidationError:
            return _safe_json(
                {"kind": "tool_error", "code": "fetch_invalid", "message": "page URL is invalid"}
            )

    @tool("create_pdf_report", args_schema=ReportToolInput)
    async def create_pdf_report(title: str, markdown: str) -> str:
        """Create one downloadable PDF when the user explicitly asks for a report artifact."""

        if not await evidence.reserve_report():
            return _safe_json(
                {
                    "kind": "tool_error",
                    "code": "report_already_created",
                    "message": "Only one PDF report can be created per run.",
                }
            )
        try:
            sources = await evidence.source_snapshot()
            artifact = await asyncio.to_thread(
                reports.create,
                owner_namespace=owner_namespace,
                title=title,
                markdown=markdown,
                sources=sources,
            )
            await evidence.add_artifact(artifact)
            return _safe_json({"kind": "artifact", "artifact": artifact.model_dump(mode="json")})
        except (OSError, ValueError):
            return _safe_json(
                {
                    "kind": "tool_error",
                    "code": "report_failed",
                    "message": "The PDF report could not be created.",
                }
            )

    return [web_search, fetch_url, create_pdf_report]
