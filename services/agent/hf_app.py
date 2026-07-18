"""Hugging Face custom-Python Space entrypoint for the MicroManus FastAPI service."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import uvicorn
from fastapi import FastAPI


async def space_root() -> dict[str, str]:
    """Return a small public landing response for the Space iframe."""

    return {
        "service": "MicroManus Research Agent",
        "status": "ready",
        "health": "/health",
    }


def load_application() -> FastAPI:
    """Apply safe Space defaults before importing the existing ASGI application."""

    runtime_dir = Path(tempfile.gettempdir()) / "micromanus"

    os.environ.setdefault("MICROMANUS_AGENT_ENVIRONMENT", "production")
    os.environ.setdefault(
        "MICROMANUS_AGENT_CHECKPOINT_DB_PATH",
        str(runtime_dir / "checkpoints.sqlite"),
    )
    os.environ.setdefault(
        "MICROMANUS_AGENT_ARTIFACT_DIR",
        str(runtime_dir / "artifacts"),
    )

    checkpoint_path = Path(os.environ["MICROMANUS_AGENT_CHECKPOINT_DB_PATH"])
    artifact_dir = Path(os.environ["MICROMANUS_AGENT_ARTIFACT_DIR"])
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    # Keep the research app top-level so its lifespan initializes the registry, checkpointer,
    # report service, and LangGraph agent. Mounted sub-app lifespans are not guaranteed to run.
    from app.main import app as agent_app

    agent_app.add_api_route("/", space_root, methods=["GET"], include_in_schema=False)
    return agent_app


app = load_application()


def main() -> None:
    """Serve the Space on Hugging Face's required public port."""

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "7860")),
        workers=1,
        log_level="info",
    )


if __name__ == "__main__":
    main()
