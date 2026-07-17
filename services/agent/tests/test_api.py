from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="test",
        service_token="internal-test-token",
        checkpoint_backend="memory",
        artifact_dir=tmp_path / "artifacts",
        checkpoint_db_path=tmp_path / "checkpoints.sqlite",
    )


def test_health_and_models_are_self_describing(tmp_path: Path) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        health = client.get("/health")
        models = client.get("/v1/models")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert models.status_code == 200
    assert len(models.json()["models"]) >= 9


def test_protected_routes_require_internal_auth(tmp_path: Path) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        response = client.post(
            "/v1/reports",
            headers={"X-User-Id": "user-1"},
            json={"title": "Test", "markdown": "A sufficiently useful report."},
        )
    assert response.status_code == 401


def test_validation_response_never_echoes_provider_key(tmp_path: Path) -> None:
    secret = "tiny"
    with TestClient(create_app(_settings(tmp_path))) as client:
        response = client.post(
            "/v1/chat/stream",
            headers={
                "Authorization": "Bearer internal-test-token",
                "X-User-Id": "user-1",
            },
            json={
                "thread_id": "thread-1",
                "message": "hello",
                "model": "openai/gpt-5.6-luna",
                "credentials": {"api_key": secret},
            },
        )
    assert response.status_code == 422
    assert secret not in response.text


def test_report_download_is_isolated_by_user(tmp_path: Path) -> None:
    headers = {
        "Authorization": "Bearer internal-test-token",
        "X-User-Id": "user-1",
    }
    with TestClient(create_app(_settings(tmp_path))) as client:
        created = client.post(
            "/v1/reports",
            headers=headers,
            json={"title": "Test report", "markdown": "# Result\n\nA useful finding."},
        )
        artifact = created.json()["artifact"]
        downloaded = client.get(artifact["download_url"], headers=headers)
        denied = client.get(
            artifact["download_url"],
            headers={**headers, "X-User-Id": "user-2"},
        )

    assert created.status_code == 201
    assert downloaded.status_code == 200
    assert downloaded.content.startswith(b"%PDF-")
    assert denied.status_code == 404
