from pathlib import Path

from app.reports import ReportService
from app.schemas import Source


def test_creates_real_user_scoped_pdf(tmp_path: Path) -> None:
    service = ReportService(tmp_path)
    artifact = service.create(
        owner_namespace="owner-a",
        title="Wildfire Research",
        markdown="# Findings\n\n- Dry fuel increases risk.\n- Detection reduces response time.",
        sources=[
            Source(
                id="source-1",
                title="Public source",
                url="https://example.com/source",
                snippet="A short source summary.",
            )
        ],
    )

    path = service.find("owner-a", artifact.id)
    assert path is not None
    assert path.read_bytes().startswith(b"%PDF-")
    assert artifact.mime_type == "application/pdf"
    assert service.find("owner-b", artifact.id) is None
