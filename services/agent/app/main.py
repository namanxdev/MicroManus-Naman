"""FastAPI transport for the MicroManus research agent."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from . import __version__
from .auth import AuthenticatedCaller, authenticate_request
from .checkpoints import CheckpointManager
from .config import Settings, get_settings
from .graph import AgentEvent, PreparedRun, ResearchAgent
from .pricing import PricingRegistry
from .reports import ReportService
from .schemas import (
    ChatRequest,
    HealthResponse,
    ModelListResponse,
    ReportRequest,
    ReportResponse,
)
from .security import URLSafetyError
from .sse import encode_event, heartbeat

_STREAM_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
}


def create_app(config: Settings | None = None) -> FastAPI:
    settings = config or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        settings.validate_security()
        registry = PricingRegistry.load(settings.pricing_registry_path)
        # Pricing is a billing dependency: fail startup instead of serving an unpriced model.
        registry.list_models()
        reports = ReportService(settings.artifact_dir, settings.max_report_characters)
        reports.prepare()
        checkpoints = CheckpointManager(settings)
        checkpointer = await checkpoints.start()

        application.state.settings = settings
        application.state.registry = registry
        application.state.reports = reports
        application.state.checkpoints = checkpoints
        application.state.agent = ResearchAgent(
            settings=settings,
            registry=registry,
            checkpointer=checkpointer,
            reports=reports,
        )
        try:
            yield
        finally:
            await checkpoints.close()

    application = FastAPI(
        title="MicroManus Research Agent",
        version=__version__,
        description=(
            "Internal, server-authenticated LangGraph research service. Provider and Brave keys "
            "are "
            "accepted only on a chat request and are never persisted, logged, or returned."
        ),
        lifespan=lifespan,
        docs_url="/docs" if settings.environment != "production" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.environment != "production" else None,
    )

    @application.exception_handler(RequestValidationError)
    async def safe_validation_error(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        # FastAPI's default includes the invalid input. Redact it because it may be a BYOK key.
        details = [
            {"loc": item.get("loc"), "msg": item.get("msg"), "type": item.get("type")}
            for item in error.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": details})

    @application.get(
        "/health",
        response_model=HealthResponse,
        tags=["service"],
        summary="Liveness and initialized dependency status",
    )
    async def health(request: Request) -> HealthResponse:
        return HealthResponse(
            version=__version__,
            checkpoint_backend=request.app.state.settings.checkpoint_backend,
            pricing_version=request.app.state.registry.document.version,
        )

    @application.get(
        "/v1/models",
        response_model=ModelListResponse,
        tags=["models"],
        summary="List curated BYOK models and active token prices",
        description=(
            "Returns stable MicroManus model ids. Rates are USD per one million tokens and expose "
            "separate uncached-input, cache-read, cache-write, and output prices."
        ),
    )
    async def models(request: Request) -> ModelListResponse:
        registry: PricingRegistry = request.app.state.registry
        return ModelListResponse(
            pricing_version=registry.document.version,
            models=registry.list_models(),
        )

    @application.post(
        "/v1/chat/stream",
        tags=["chat"],
        summary="Run one checkpointed research turn as an SSE stream",
        description=(
            "Requires `Authorization: Bearer <service-token>` and trusted `X-User-Id`. The body "
            "contains ephemeral provider credentials and an external thread id. Context is "
            "isolated by a hash of user id plus thread id. SSE event types are documented in "
            "the service README."
        ),
        responses={
            200: {"content": {"text/event-stream": {}}},
            401: {"description": "Invalid internal service token"},
            422: {"description": "Invalid body, model, or provider endpoint"},
        },
    )
    async def chat_stream(
        body: ChatRequest,
        request: Request,
        caller: Annotated[AuthenticatedCaller, Depends(authenticate_request)],
    ) -> StreamingResponse:
        agent: ResearchAgent = request.app.state.agent
        try:
            prepared = await agent.prepare(body, caller)
        except KeyError as exc:
            raise HTTPException(status_code=422, detail="unsupported model") from exc
        except URLSafetyError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        return StreamingResponse(
            _stream_with_heartbeats(request, agent, prepared),
            media_type="text/event-stream",
            headers=_STREAM_HEADERS,
        )

    @application.post(
        "/v1/reports",
        response_model=ReportResponse,
        status_code=status.HTTP_201_CREATED,
        tags=["artifacts"],
        summary="Render supplied research markdown as a user-owned PDF",
    )
    async def create_report(
        body: ReportRequest,
        request: Request,
        caller: Annotated[AuthenticatedCaller, Depends(authenticate_request)],
    ) -> ReportResponse:
        reports: ReportService = request.app.state.reports
        if len(body.markdown) > request.app.state.settings.max_report_characters:
            raise HTTPException(status_code=413, detail="report is too large")
        try:
            artifact = await asyncio.to_thread(
                reports.create,
                owner_namespace=caller.namespace,
                title=body.title,
                markdown=body.markdown,
                sources=body.sources,
            )
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="report could not be created") from exc
        return ReportResponse(artifact=artifact)

    @application.get(
        "/v1/artifacts/{artifact_id}",
        tags=["artifacts"],
        summary="Download a user-owned PDF artifact",
        responses={404: {"description": "Artifact does not exist for this user"}},
    )
    async def download_artifact(
        artifact_id: str,
        request: Request,
        caller: Annotated[AuthenticatedCaller, Depends(authenticate_request)],
    ) -> FileResponse:
        path = request.app.state.reports.find(caller.namespace, artifact_id)
        if path is None:
            raise HTTPException(status_code=404, detail="artifact not found")
        return FileResponse(
            path,
            media_type="application/pdf",
            filename="micromanus-report.pdf",
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    return application


async def _stream_with_heartbeats(
    request: Request, agent: ResearchAgent, prepared: PreparedRun
) -> AsyncIterator[bytes]:
    # A run is strictly bounded by iterations/sources, so an unbounded queue remains small and
    # lets cancellation cleanup publish its sentinel without a full-queue deadlock.
    queue: asyncio.Queue[AgentEvent | object] = asyncio.Queue()
    finished = object()

    async def produce() -> None:
        try:
            async for event in agent.stream(prepared):
                await queue.put(event)
        finally:
            queue.put_nowait(finished)

    producer = asyncio.create_task(produce(), name=f"research-{prepared.request.thread_id}")
    sequence = 0
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                item = await asyncio.wait_for(
                    queue.get(), timeout=agent.settings.sse_heartbeat_seconds
                )
            except TimeoutError:
                yield heartbeat()
                continue
            if item is finished:
                break
            sequence += 1
            yield encode_event(item, sequence)  # type: ignore[arg-type]
    finally:
        if not producer.done():
            producer.cancel()
        with suppress(asyncio.CancelledError):
            await producer


app = create_app()
