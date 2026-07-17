import os
from pathlib import Path


def main() -> None:
    """Run the private research service after the uv workspace is synced."""
    import uvicorn

    # Pydantic reads the service's local .env and keeps relative runtime data scoped there.
    os.chdir(Path(__file__).resolve().parent / "services" / "agent")
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("MICROMANUS_AGENT_ENVIRONMENT", "development") == "development",
    )


if __name__ == "__main__":
    main()
