from pathlib import Path
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

import app.graph as graph_module
from app.auth import AuthenticatedCaller
from app.config import Settings
from app.graph import PreparedRun, ResearchAgent
from app.pricing import PricingRegistry
from app.reports import ReportService
from app.schemas import ChatRequest, ProviderCredentials


class ScriptedModel(BaseChatModel):
    responses: list[Any]

    @property
    def _llm_type(self) -> str:
        return "scripted-test"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedModel":
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return ChatResult(generations=[ChatGeneration(message=response)])


class ContextAwareModel(BaseChatModel):
    @property
    def _llm_type(self) -> str:
        return "context-aware-test"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ContextAwareModel":
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        human_count = sum(isinstance(message, HumanMessage) for message in messages)
        message = AIMessage(
            content=f"human_messages={human_count}",
            usage_metadata={"input_tokens": 10, "output_tokens": 2, "total_tokens": 12},
        )
        return ChatResult(generations=[ChatGeneration(message=message)])


async def test_graph_loops_through_tool_and_emits_metered_final(
    monkeypatch: Any, tmp_path: Path
) -> None:
    scripted = ScriptedModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[{"name": "test_lookup", "args": {"query": "wildfire"}, "id": "call-1"}],
                usage_metadata={"input_tokens": 100, "output_tokens": 10, "total_tokens": 110},
            ),
            AIMessage(
                content="Final researched answer.",
                usage_metadata={
                    "input_tokens": 200,
                    "output_tokens": 20,
                    "total_tokens": 220,
                    "input_token_details": {"cache_read": 50},
                },
            ),
        ]
    )

    @tool("test_lookup")
    async def test_lookup(query: str) -> str:
        """Return deterministic evidence for a test query."""

        return '{"kind":"search_results","results":[]}'

    monkeypatch.setattr(graph_module, "build_chat_model", lambda *args, **kwargs: scripted)
    monkeypatch.setattr(graph_module, "build_research_tools", lambda *args, **kwargs: [test_lookup])

    settings = Settings(
        environment="test",
        service_token="test-service-token",
        checkpoint_backend="memory",
        artifact_dir=tmp_path,
        run_timeout_seconds=30,
    )
    registry = PricingRegistry.load()
    reports = ReportService(tmp_path)
    agent = ResearchAgent(
        settings=settings,
        registry=registry,
        checkpointer=InMemorySaver(),
        reports=reports,
    )
    request = ChatRequest(
        thread_id="thread-1",
        message="Research wildfire prevention",
        model="openai/gpt-5.6-luna",
        credentials=ProviderCredentials(api_key="sk-test-provider"),
    )
    prepared = PreparedRun(
        request=request,
        caller=AuthenticatedCaller("user-1"),
        definition=registry.get(request.model),
        base_url="https://api.openai.com/v1",
        max_iterations=1,
    )

    events = [event async for event in agent.stream(prepared)]
    names = [event.event for event in events]
    usage = next(event.data for event in events if event.event == "usage")
    final = next(event.data for event in events if event.event == "final")

    assert "tool.started" in names
    assert "tool.completed" in names
    assert final["content"] == "Final researched answer."
    assert usage["input_tokens"] == 250
    assert usage["cache_read_tokens"] == 50
    assert usage["output_tokens"] == 30
    assert names[-1] == "done"


async def test_report_enabled_guarantees_pdf_when_model_skips_tool(
    monkeypatch: Any, tmp_path: Path
) -> None:
    # The model answers directly and never calls create_pdf_report; the run must still emit a PDF.
    scripted = ScriptedModel(
        responses=[
            AIMessage(
                content="# Wildfire report\n\nA complete, self-contained researched answer.",
                usage_metadata={"input_tokens": 120, "output_tokens": 30, "total_tokens": 150},
            ),
        ]
    )

    @tool("test_lookup")
    async def test_lookup(query: str) -> str:
        """Unused tool; the model resolves without calling it."""

        return '{"kind":"search_results","results":[]}'

    monkeypatch.setattr(graph_module, "build_chat_model", lambda *args, **kwargs: scripted)
    monkeypatch.setattr(graph_module, "build_research_tools", lambda *args, **kwargs: [test_lookup])

    settings = Settings(
        environment="test",
        service_token="test-service-token",
        checkpoint_backend="memory",
        artifact_dir=tmp_path,
        run_timeout_seconds=30,
    )
    registry = PricingRegistry.load()
    reports = ReportService(tmp_path)
    agent = ResearchAgent(
        settings=settings,
        registry=registry,
        checkpointer=InMemorySaver(),
        reports=reports,
    )
    request = ChatRequest(
        thread_id="thread-report",
        message="Research wildfire prevention",
        model="openai/gpt-5.6-luna",
        credentials=ProviderCredentials(api_key="sk-test-provider"),
        report_enabled=True,
    )
    caller = AuthenticatedCaller("user-1")
    prepared = PreparedRun(
        request=request,
        caller=caller,
        definition=registry.get(request.model),
        base_url="https://api.openai.com/v1",
        max_iterations=1,
    )

    events = [event async for event in agent.stream(prepared)]
    artifacts = [event.data["artifact"] for event in events if event.event == "artifact"]
    final = next(event.data for event in events if event.event == "final")

    assert len(artifacts) == 1
    assert artifacts[0]["download_url"].startswith("/v1/artifacts/")
    assert len(final["artifacts"]) == 1
    # The PDF is actually written to disk and resolvable for this owner.
    assert reports.find(caller.namespace, artifacts[0]["id"]) is not None


async def test_report_disabled_emits_no_artifact(monkeypatch: Any, tmp_path: Path) -> None:
    scripted = ScriptedModel(
        responses=[
            AIMessage(
                content="A direct answer with no report requested.",
                usage_metadata={"input_tokens": 40, "output_tokens": 8, "total_tokens": 48},
            ),
        ]
    )

    @tool("test_lookup")
    async def test_lookup(query: str) -> str:
        """Unused tool."""

        return '{"kind":"search_results","results":[]}'

    monkeypatch.setattr(graph_module, "build_chat_model", lambda *args, **kwargs: scripted)
    monkeypatch.setattr(graph_module, "build_research_tools", lambda *args, **kwargs: [test_lookup])

    settings = Settings(
        environment="test",
        service_token="test-service-token",
        checkpoint_backend="memory",
        artifact_dir=tmp_path,
        run_timeout_seconds=30,
    )
    registry = PricingRegistry.load()
    agent = ResearchAgent(
        settings=settings,
        registry=registry,
        checkpointer=InMemorySaver(),
        reports=ReportService(tmp_path),
    )
    request = ChatRequest(
        thread_id="thread-no-report",
        message="Just answer this",
        model="openai/gpt-5.6-luna",
        credentials=ProviderCredentials(api_key="sk-test-provider"),
    )
    prepared = PreparedRun(
        request=request,
        caller=AuthenticatedCaller("user-1"),
        definition=registry.get(request.model),
        base_url="https://api.openai.com/v1",
        max_iterations=1,
    )

    events = [event async for event in agent.stream(prepared)]
    final = next(event.data for event in events if event.event == "final")

    assert not any(event.event == "artifact" for event in events)
    assert final["artifacts"] == []


async def test_checkpoint_retains_context_only_for_same_user_thread(
    monkeypatch: Any, tmp_path: Path
) -> None:
    monkeypatch.setattr(
        graph_module, "build_chat_model", lambda *args, **kwargs: ContextAwareModel()
    )
    settings = Settings(
        environment="test",
        service_token="test-service-token",
        checkpoint_backend="memory",
        artifact_dir=tmp_path,
        run_timeout_seconds=30,
    )
    registry = PricingRegistry.load()
    agent = ResearchAgent(
        settings=settings,
        registry=registry,
        checkpointer=InMemorySaver(),
        reports=ReportService(tmp_path),
    )

    async def run(user_id: str, thread_id: str, message: str) -> str:
        request = ChatRequest(
            thread_id=thread_id,
            message=message,
            model="openai/gpt-5.6-luna",
            credentials=ProviderCredentials(api_key="sk-test-provider"),
        )
        prepared = PreparedRun(
            request=request,
            caller=AuthenticatedCaller(user_id),
            definition=registry.get(request.model),
            base_url="https://api.openai.com/v1",
            max_iterations=1,
        )
        events = [event async for event in agent.stream(prepared)]
        return next(event.data["content"] for event in events if event.event == "final")

    assert await run("user-1", "thread-a", "first") == "human_messages=1"
    assert await run("user-1", "thread-a", "second") == "human_messages=2"
    assert await run("user-2", "thread-a", "other user") == "human_messages=1"
    assert await run("user-1", "thread-b", "other thread") == "human_messages=1"


async def test_failed_later_model_call_still_emits_partial_billable_usage(
    monkeypatch: Any, tmp_path: Path
) -> None:
    scripted = ScriptedModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[{"name": "test_lookup", "args": {"query": "x"}, "id": "call-1"}],
                usage_metadata={"input_tokens": 80, "output_tokens": 10, "total_tokens": 90},
            ),
            RuntimeError("provider failed after first billed call"),
        ]
    )

    @tool("test_lookup")
    async def test_lookup(query: str) -> str:
        """Return deterministic test evidence."""

        return '{"kind":"search_results","results":[]}'

    monkeypatch.setattr(graph_module, "build_chat_model", lambda *args, **kwargs: scripted)
    monkeypatch.setattr(graph_module, "build_research_tools", lambda *args, **kwargs: [test_lookup])
    settings = Settings(
        environment="test",
        service_token="test-service-token",
        checkpoint_backend="memory",
        artifact_dir=tmp_path,
        run_timeout_seconds=30,
    )
    registry = PricingRegistry.load()
    agent = ResearchAgent(
        settings=settings,
        registry=registry,
        checkpointer=InMemorySaver(),
        reports=ReportService(tmp_path),
    )
    request = ChatRequest(
        thread_id="thread-failure",
        message="research this",
        model="openai/gpt-5.6-luna",
        credentials=ProviderCredentials(api_key="sk-test-provider"),
    )
    prepared = PreparedRun(
        request=request,
        caller=AuthenticatedCaller("user-1"),
        definition=registry.get(request.model),
        base_url="https://api.openai.com/v1",
        max_iterations=3,
    )

    events = [event async for event in agent.stream(prepared)]
    usage = next(event.data for event in events if event.event == "usage")

    assert usage["partial"] is True
    assert usage["input_tokens"] == 80
    assert usage["output_tokens"] == 10
    assert [event.event for event in events][-2:] == ["error", "done"]
