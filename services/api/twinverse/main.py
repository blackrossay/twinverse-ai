"""TWINVERSE AI FastAPI application."""

from fastapi import FastAPI

from .meta_client import default_client
from .routes.twins import twins_router
from .settings import settings

app = FastAPI(title="TWINVERSE AI", version="0.1.0")
app.include_router(twins_router)


@app.get("/api/health")
def health() -> dict:
    client = default_client()
    return {
        "status": "ok",
        "service": "twinverse-api",
        "version": "0.1.0",
        "model_mode": client.mode,  # live | fixture
        "model": client.model,
        "model_api_configured": bool(settings.model_api_key),
    }
