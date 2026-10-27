"""Live Twin Studio endpoints: sessions, agenda, live chat, voice/avatar media."""

from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from ..avatar.pipeline import PipelineError
from ..avatar.service import AvatarNotReady
from ..identity.store import IdentityStore
from ..live import service, streamer
from ..live.schemas import (
    MODES,
    PLATFORMS,
    AgendaAdd,
    ChatCreate,
    DestinationIn,
    DestinationView,
    LiveCreate,
    LiveMessage,
    LiveSession,
)
from ..live.store import LiveStore
from ..meta_client import MetaClient, MetaClientError, default_client
from ..settings import get_settings
from .twins import get_store

router = APIRouter(tags=["live"])


@lru_cache(maxsize=4)
def _live_store_for(db_path: str) -> LiveStore:
    return LiveStore(db_path)


def get_live_store() -> LiveStore:
    return _live_store_for(get_settings().twinverse_db_path)


def get_model_client() -> MetaClient:
    return default_client()


def _session_or_404(session_id: str, live_store: LiveStore) -> LiveSession:
    session = live_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="live session not found")
    return session


@router.post(
    "/api/twins/{twin_id}/live-sessions",
    response_model=LiveSession,
    status_code=status.HTTP_201_CREATED,
)
def create_live(
    twin_id: str,
    body: LiveCreate,
    store: IdentityStore = Depends(get_store),
    live_store: LiveStore = Depends(get_live_store),
) -> LiveSession:
    twin = store.get_twin(twin_id)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin not found")
    if body.mode not in MODES:
        raise HTTPException(status_code=422, detail=f"mode must be one of {MODES}")
    platforms = [p for p in body.platforms if p in PLATFORMS]
    return live_store.create_session(
        twin.id, twin.version, body.title or f"Live with {twin.name}", body.mode, platforms, body.agenda
    )


@router.get("/api/twins/{twin_id}/live-sessions", response_model=list[LiveSession])
def list_live(
    twin_id: str,
    limit: int = Query(20, ge=1, le=50),
    store: IdentityStore = Depends(get_store),
    live_store: LiveStore = Depends(get_live_store),
) -> list[LiveSession]:
    if store.get_twin(twin_id) is None:
        raise HTTPException(status_code=404, detail="twin not found")
    return live_store.list_sessions(twin_id, limit=limit)


@router.get("/api/live/{session_id}", response_model=LiveSession)
def get_live(session_id: str, live_store: LiveStore = Depends(get_live_store)) -> LiveSession:
    session = _session_or_404(session_id, live_store)
    if session.stream_status == "publishing" and not streamer.is_publishing(session_id):
        session.stream_status = "error"  # ffmpeg exited (bad key, network, ingest closed)
        live_store.save_session(session)
    return session


@router.post("/api/live/{session_id}/end", response_model=LiveSession)
def end_live(session_id: str, live_store: LiveStore = Depends(get_live_store)) -> LiveSession:
    from datetime import UTC, datetime

    session = _session_or_404(session_id, live_store)
    if streamer.is_publishing(session_id):
        streamer.stop_session(session_id)
    session.status = "ended"
    session.stream_status = "stopped"
    session.ended_at = datetime.now(UTC)
    live_store.save_session(session)
    return live_store.get_session(session_id)  # type: ignore[return-value]


@router.get("/api/live/{session_id}/destination", response_model=DestinationView)
def get_destination(
    session_id: str, live_store: LiveStore = Depends(get_live_store)
) -> DestinationView:
    _session_or_404(session_id, live_store)
    dest = live_store.get_destination(session_id)
    if dest is None:
        return DestinationView(configured=False)
    return DestinationView(
        configured=True, rtmp_url=dest["rtmp_url"], key_hint=f"••••{dest['key_last4']}"
    )


@router.post("/api/live/{session_id}/destination", response_model=DestinationView)
def set_destination(
    session_id: str, body: DestinationIn, live_store: LiveStore = Depends(get_live_store)
) -> DestinationView:
    session = _session_or_404(session_id, live_store)
    if not body.rtmp_url.startswith(("rtmp://", "rtmps://")):
        raise HTTPException(status_code=422, detail="rtmp_url must start with rtmp:// or rtmps://")
    live_store.save_destination(session_id, body.rtmp_url.strip(), body.stream_key.strip())
    session.youtube_configured = True
    if "youtube" not in session.platforms:
        session.platforms.append("youtube")
    live_store.save_session(session)
    dest = live_store.get_destination(session_id)
    assert dest is not None
    return DestinationView(
        configured=True, rtmp_url=dest["rtmp_url"], key_hint=f"••••{dest['key_last4']}"
    )


@router.delete("/api/live/{session_id}/destination", response_model=DestinationView)
def delete_destination(
    session_id: str, live_store: LiveStore = Depends(get_live_store)
) -> DestinationView:
    session = _session_or_404(session_id, live_store)
    if streamer.is_publishing(session_id):
        streamer.stop_session(session_id)
        session.stream_status = "stopped"
    live_store.delete_destination(session_id)
    session.youtube_configured = False
    live_store.save_session(session)
    return DestinationView(configured=False)


@router.post("/api/live/{session_id}/publish", response_model=LiveSession)
def publish(
    session_id: str, live_store: LiveStore = Depends(get_live_store)
) -> LiveSession:
    session = _session_or_404(session_id, live_store)
    if session.status != "live":
        raise HTTPException(status_code=409, detail="live session has ended")
    try:
        session.stream_status = streamer.publish_session(session, get_settings(), live_store)
    except PipelineError as exc:
        session.stream_status = "error"
        live_store.save_session(session)
        raise HTTPException(status_code=503, detail=str(exc)) from None
    live_store.save_session(session)
    return live_store.get_session(session_id)  # type: ignore[return-value]


@router.post("/api/live/{session_id}/unpublish", response_model=LiveSession)
def unpublish(
    session_id: str, live_store: LiveStore = Depends(get_live_store)
) -> LiveSession:
    session = _session_or_404(session_id, live_store)
    session.stream_status = streamer.stop_session(session_id)
    live_store.save_session(session)
    return live_store.get_session(session_id)  # type: ignore[return-value]


@router.post("/api/live/{session_id}/agenda", response_model=LiveSession)
def add_agenda(
    session_id: str, body: AgendaAdd, live_store: LiveStore = Depends(get_live_store)
) -> LiveSession:
    from ..live.schemas import AgendaPoint

    session = _session_or_404(session_id, live_store)
    if session.status != "live":
        raise HTTPException(status_code=409, detail="live session has ended")
    session.agenda.append(AgendaPoint(text=body.text.strip()))
    live_store.save_session(session)
    return live_store.get_session(session_id)  # type: ignore[return-value]


@router.post("/api/live/{session_id}/advance", response_model=LiveMessage)
def advance(
    session_id: str,
    store: IdentityStore = Depends(get_store),
    live_store: LiveStore = Depends(get_live_store),
    client: MetaClient = Depends(get_model_client),
) -> LiveMessage:
    session = _session_or_404(session_id, live_store)
    if session.status != "live":
        raise HTTPException(status_code=409, detail="live session has ended")
    twin = store.get_twin(session.twin_id, session.identity_version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin snapshot not found")
    try:
        return service.advance_point(session, twin, client, live_store)
    except MetaClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None


@router.post("/api/live/{session_id}/chat", response_model=LiveMessage)
def post_chat(
    session_id: str,
    body: ChatCreate,
    store: IdentityStore = Depends(get_store),
    live_store: LiveStore = Depends(get_live_store),
    client: MetaClient = Depends(get_model_client),
) -> LiveMessage:
    session = _session_or_404(session_id, live_store)
    if session.status != "live":
        raise HTTPException(status_code=409, detail="live session has ended")
    twin = store.get_twin(session.twin_id, session.identity_version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin snapshot not found")
    chat = LiveMessage(
        kind="chat",
        platform=body.platform if body.platform in PLATFORMS + ["studio"] else "studio",
        username=body.username.strip(),
        message=body.message.strip(),
        priority=body.priority,
    )
    try:
        return service.answer_chat(session, twin, chat, client, live_store)
    except MetaClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None


def _msg_or_404(msg_id: str, live_store: LiveStore) -> LiveMessage:
    msg = live_store.get_message(msg_id)
    if msg is None:
        raise HTTPException(status_code=404, detail="message not found")
    return msg


@router.post(
    "/api/live/messages/{msg_id}/voice",
    response_model=LiveMessage,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_voice(
    msg_id: str, background: BackgroundTasks, live_store: LiveStore = Depends(get_live_store)
) -> LiveMessage:
    msg = _msg_or_404(msg_id, live_store)
    settings = get_settings()
    try:
        queued = service.request_media(msg, "voice", settings, live_store)
    except AvatarNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    background.add_task(service.render_voice, msg_id, settings, live_store)
    return queued


@router.post(
    "/api/live/messages/{msg_id}/video",
    response_model=LiveMessage,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_video(
    msg_id: str, background: BackgroundTasks, live_store: LiveStore = Depends(get_live_store)
) -> LiveMessage:
    msg = _msg_or_404(msg_id, live_store)
    settings = get_settings()
    try:
        queued = service.request_media(msg, "video", settings, live_store)
    except AvatarNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    background.add_task(service.render_video, msg_id, settings, live_store)
    return queued


@router.get("/api/live/messages/{msg_id}/audio")
def serve_audio(msg_id: str, live_store: LiveStore = Depends(get_live_store)):
    msg = _msg_or_404(msg_id, live_store)
    if msg.voice_status != "done":
        raise HTTPException(status_code=404, detail="audio not ready")
    base = (Path(get_settings().twinverse_avatar_dir) / "live").resolve()
    path = (base / f"{msg.id}.wav").resolve()
    if path.parent != base or not path.is_file():
        raise HTTPException(status_code=404, detail="audio file missing")
    return FileResponse(path, media_type="audio/wav", filename=f"twin-live-{msg.id}.wav")


@router.get("/api/live/messages/{msg_id}/video")
def serve_video(msg_id: str, live_store: LiveStore = Depends(get_live_store)):
    msg = _msg_or_404(msg_id, live_store)
    if msg.video_status != "done":
        raise HTTPException(status_code=404, detail="video not ready")
    base = (Path(get_settings().twinverse_avatar_dir) / "videos").resolve()
    path = (base / f"{msg.id}.mp4").resolve()
    if path.parent != base or not path.is_file():
        raise HTTPException(status_code=404, detail="video file missing")
    return FileResponse(path, media_type="video/mp4", filename=f"twin-live-{msg.id}.mp4")


@router.delete("/api/live/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_live(session_id: str, live_store: LiveStore = Depends(get_live_store)) -> Response:
    if not live_store.delete_session(session_id):
        raise HTTPException(status_code=404, detail="live session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
