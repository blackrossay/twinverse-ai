"""Conversational twin agent endpoints: sessions, turns, voice/avatar media."""

from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from ..avatar.service import AvatarNotReady
from ..conversation import media
from ..conversation.schemas import Conversation, ConversationCreate, Turn, TurnCreate
from ..conversation.service import reply_to
from ..conversation.store import ConversationStore
from ..identity.store import IdentityStore
from ..meta_client import MetaClient, MetaClientError, default_client
from ..settings import get_settings
from .twins import get_store

router = APIRouter(tags=["conversations"])


@lru_cache(maxsize=4)
def _conv_store_for(db_path: str) -> ConversationStore:
    return ConversationStore(db_path)


def get_conv_store() -> ConversationStore:
    return _conv_store_for(get_settings().twinverse_db_path)


def get_model_client() -> MetaClient:
    return default_client()


@router.post(
    "/api/twins/{twin_id}/conversations",
    response_model=Conversation,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    twin_id: str,
    body: ConversationCreate,
    store: IdentityStore = Depends(get_store),
    conv_store: ConversationStore = Depends(get_conv_store),
) -> Conversation:
    twin = store.get_twin(twin_id)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin not found")
    return conv_store.create_session(twin.id, twin.version, body.title)


@router.get("/api/twins/{twin_id}/conversations", response_model=list[Conversation])
def list_conversations(
    twin_id: str,
    limit: int = Query(20, ge=1, le=50),
    store: IdentityStore = Depends(get_store),
    conv_store: ConversationStore = Depends(get_conv_store),
) -> list[Conversation]:
    if store.get_twin(twin_id) is None:
        raise HTTPException(status_code=404, detail="twin not found")
    return conv_store.list_sessions(twin_id, limit=limit)


@router.get("/api/conversations/{session_id}", response_model=Conversation)
def get_conversation(
    session_id: str, conv_store: ConversationStore = Depends(get_conv_store)
) -> Conversation:
    session = conv_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    return session


@router.delete("/api/conversations/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    session_id: str, conv_store: ConversationStore = Depends(get_conv_store)
) -> Response:
    if not conv_store.delete_session(session_id):
        raise HTTPException(status_code=404, detail="conversation not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/api/conversations/{session_id}/turns", response_model=Turn)
def post_turn(
    session_id: str,
    body: TurnCreate,
    store: IdentityStore = Depends(get_store),
    conv_store: ConversationStore = Depends(get_conv_store),
    client: MetaClient = Depends(get_model_client),
) -> Turn:
    session = conv_store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="conversation not found")
    twin = store.get_twin(session.twin_id, session.identity_version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin snapshot not found")
    try:
        return reply_to(session, twin, body.message.strip(), client, conv_store)
    except MetaClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None


def _get_turn_or_404(turn_id: str, conv_store: ConversationStore) -> Turn:
    turn = conv_store.get_turn(turn_id)
    if turn is None:
        raise HTTPException(status_code=404, detail="turn not found")
    return turn


@router.post(
    "/api/conversations/turns/{turn_id}/voice",
    response_model=Turn,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_voice(
    turn_id: str,
    background: BackgroundTasks,
    conv_store: ConversationStore = Depends(get_conv_store),
) -> Turn:
    turn = _get_turn_or_404(turn_id, conv_store)
    settings = get_settings()
    try:
        queued = media.request_voice(turn, settings, conv_store)
    except AvatarNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    background.add_task(media.render_voice, turn_id, settings, conv_store)
    return queued


@router.post(
    "/api/conversations/turns/{turn_id}/video",
    response_model=Turn,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_video(
    turn_id: str,
    background: BackgroundTasks,
    conv_store: ConversationStore = Depends(get_conv_store),
) -> Turn:
    turn = _get_turn_or_404(turn_id, conv_store)
    settings = get_settings()
    try:
        queued = media.request_video(turn, settings, conv_store)
    except AvatarNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    background.add_task(media.render_video, turn_id, settings, conv_store)
    return queued


@router.get("/api/conversations/turns/{turn_id}/audio")
def serve_audio(turn_id: str, conv_store: ConversationStore = Depends(get_conv_store)):
    turn = _get_turn_or_404(turn_id, conv_store)
    if turn.voice_status != "done":
        raise HTTPException(status_code=404, detail="audio not ready")
    base = (Path(get_settings().twinverse_avatar_dir) / "conversations").resolve()
    path = (base / f"{turn.id}.wav").resolve()
    if path.parent != base or not path.is_file():
        raise HTTPException(status_code=404, detail="audio file missing")
    return FileResponse(path, media_type="audio/wav", filename=f"twin-reply-{turn.id}.wav")


@router.get("/api/conversations/turns/{turn_id}/video")
def serve_video(turn_id: str, conv_store: ConversationStore = Depends(get_conv_store)):
    turn = _get_turn_or_404(turn_id, conv_store)
    if turn.video_status != "done":
        raise HTTPException(status_code=404, detail="video not ready")
    base = (Path(get_settings().twinverse_avatar_dir) / "videos").resolve()
    path = (base / f"{turn.id}.mp4").resolve()
    if path.parent != base or not path.is_file():
        raise HTTPException(status_code=404, detail="video file missing")
    return FileResponse(path, media_type="video/mp4", filename=f"twin-reply-{turn.id}.mp4")
