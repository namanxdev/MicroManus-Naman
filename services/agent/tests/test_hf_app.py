"""Deployment smoke test for the isolated Hugging Face entrypoint process."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def test_hugging_face_entrypoint_initializes_existing_lifespan(tmp_path: Path) -> None:
    service_dir = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment.update(
        {
            "MICROMANUS_AGENT_ENVIRONMENT": "production",
            "MICROMANUS_AGENT_SERVICE_TOKEN": "test-service-token-that-is-at-least-32-chars",
            "MICROMANUS_AGENT_CHECKPOINT_DB_PATH": str(tmp_path / "checkpoints.sqlite"),
            "MICROMANUS_AGENT_ARTIFACT_DIR": str(tmp_path / "artifacts"),
        }
    )
    script = """
from fastapi.testclient import TestClient
from hf_app import app

with TestClient(app) as client:
    root = client.get("/")
    assert root.status_code == 200
    assert root.json()["status"] == "ready"

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["checkpoint_backend"] == "sqlite"

    models = client.get("/v1/models")
    assert models.status_code == 200
    assert len(models.json()["models"]) >= 1
"""

    completed = subprocess.run(  # noqa: S603 - fixed interpreter and inline test script
        [sys.executable, "-c", script],
        cwd=service_dir,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
