"""TWINVERSE AI FastAPI application."""

from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .avatar.store import AvatarStore
from .conversation.store import ConversationStore
from .live.store import LiveStore
from .meta_client import default_client
from .routes.auth import router as auth_router
from .routes.avatar import router as avatar_router
from .routes.comparison import router as comparison_router
from .routes.conversations import router as conversations_router
from .routes.demo import router as demo_router
from .routes.live import router as live_router
from .routes.settings import router as settings_router
from .routes.simulations import router as simulations_router
from .routes.twins import twins_router
from .settings import get_settings
from .simulation.store import SimulationStore

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
logger = logging.getLogger("twinverse")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    sims = SimulationStore(settings.twinverse_db_path).recover_interrupted()
    verdicts = AvatarStore(settings.twinverse_db_path).recover_interrupted()
    media_jobs = ConversationStore(settings.twinverse_db_path).recover_interrupted_media()
    live_media = LiveStore(settings.twinverse_db_path).recover_interrupted_media()
    if sims or verdicts or media_jobs or live_media:
        logger.warning(
            "recovered interrupted work: %d run(s), %d verdict job(s),"
            " %d conversation media job(s), %d live media job(s) marked failed",
            sims,
            verdicts,
            media_jobs,
            live_media,
        )
    logger.info("twinverse-api started (model_mode=%s)", default_client().mode)
    yield


app = FastAPI(title="TWINVERSE AI", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)


_PUBLIC_PATHS = ("/api/health", "/api/auth/signup", "/api/auth/login")


@app.middleware("http")
async def require_auth(request: Request, call_next):
    settings = get_settings()
    if (
        settings.twinverse_auth_required
        and request.url.path.startswith("/api/")
        and request.url.path not in _PUBLIC_PATHS
        and request.method != "OPTIONS"
    ):
        from .auth.store import verify_token

        header = request.headers.get("authorization", "")
        token = header.split(" ", 1)[1] if header.lower().startswith("bearer ") else ""
        if not token or verify_token(token, settings) is None:
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=401, content={"detail": "sign in required"})
    return await call_next(request)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = uuid.uuid4().hex[:12]
    started = time.monotonic()
    response = await call_next(request)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    logger.info(
        "%s %s -> %d in %dms [%s]",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        request_id,
    )
    return response


app.include_router(auth_router)
app.include_router(demo_router)
app.include_router(settings_router)
app.include_router(twins_router)
app.include_router(conversations_router)
app.include_router(live_router)
app.include_router(simulations_router)
app.include_router(comparison_router)
app.include_router(avatar_router)


@app.get("/api/health")
def health() -> dict:
    client = default_client()
    settings = get_settings()
    return {
        "status": "ok",
        "service": "twinverse-api",
        "version": "0.1.0",
        "model_mode": client.mode,  # live | fixture
        "model": client.model,
        "model_api_configured": bool(settings.model_api_key),
    }
