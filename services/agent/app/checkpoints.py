"""LangGraph checkpoint lifecycle."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver

from .config import Settings


class CheckpointManager:
    def __init__(self, settings: Settings):
        self._settings = settings
        self.checkpointer: Any = None
        self._context: Any = None

    async def start(self) -> Any:
        if self._settings.checkpoint_backend == "memory":
            self.checkpointer = InMemorySaver()
            return self.checkpointer

        path: Path = self._settings.checkpoint_db_path
        path.parent.mkdir(parents=True, exist_ok=True)
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        self._context = AsyncSqliteSaver.from_conn_string(str(path))
        self.checkpointer = await self._context.__aenter__()
        return self.checkpointer

    async def close(self) -> None:
        if self._context is not None:
            await self._context.__aexit__(None, None, None)
            self._context = None
        self.checkpointer = None
