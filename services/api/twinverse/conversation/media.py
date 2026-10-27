"""Cloned-voice audio and talking-avatar video for conversation turns."""

from __future__ import annotations

import logging
from pathlib import Path

from ..avatar.likeness import likeness_paths
from ..avatar.pipeline import PipelineError
from ..avatar.provider import clone_voice_media, inference_ready, render_verdict_media
from ..avatar.provider import missing as provider_missing
from ..avatar.service import AvatarNotReady
from ..settings import Settings
from .schemas import Turn
from .store import ConversationStore

logger = logging.getLogger("twinverse.conversation.media")

MAX_SPOKEN_CHARS = 700  # ~1 minute of speech per reply


def spoken_script(text: str) -> str:
    body = " ".join((text or "").split())
    if len(body) <= MAX_SPOKEN_CHARS:
        return body
    cut = body[:MAX_SPOKEN_CHARS].rsplit(" ", 1)[0].rstrip(" ,;:")
    return (cut or body[:MAX_SPOKEN_CHARS]) + "…"


def _require_ready(settings: Settings) -> None:
    if not inference_ready(settings):
        raise AvatarNotReady(provider_missing(settings))
    if not likeness_paths(settings.twinverse_avatar_dir).present:
        raise AvatarNotReady(["likeness: upload your photo + voice sample first"])


def request_voice(turn: Turn, settings: Settings, store: ConversationStore) -> Turn:
    if turn.role != "twin":
        raise AvatarNotReady(["only twin replies can be spoken"])
    _require_ready(settings)
    return store.update_turn(turn.model_copy(update={"voice_status": "queued", "media_error": ""}))


def request_video(turn: Turn, settings: Settings, store: ConversationStore) -> Turn:
    if turn.role != "twin":
        raise AvatarNotReady(["only twin replies can be rendered"])
    _require_ready(settings)
    return store.update_turn(turn.model_copy(update={"video_status": "queued", "media_error": ""}))


def render_voice(turn_id: str, settings: Settings, store: ConversationStore) -> Turn | None:
    """Background worker: clone the voice and speak one twin turn. Never raises."""
    turn = store.get_turn(turn_id)
    if turn is None or turn.voice_status == "done":
        return turn
    turn = store.update_turn(turn.model_copy(update={"voice_status": "rendering"}))
    try:
        out_dir = Path(settings.twinverse_avatar_dir) / "conversations"
        out_dir.mkdir(parents=True, exist_ok=True)
        clone_voice_media(
            spoken_script(turn.text),
            likeness_paths(settings.twinverse_avatar_dir).voice,
            out_dir / f"{turn.id}.wav",
            settings,
        )
    except PipelineError as exc:
        return store.update_turn(
            turn.model_copy(update={"voice_status": "failed", "media_error": str(exc)[:500]})
        )
    except Exception as exc:  # stored, never leaked as a stack trace
        logger.exception("voice render crashed for turn %s", turn_id)
        return store.update_turn(
            turn.model_copy(update={"voice_status": "failed", "media_error": f"render crashed: {exc}"[:500]})
        )
    return store.update_turn(
        turn.model_copy(
            update={"voice_status": "done", "voice_url": f"/api/conversations/turns/{turn.id}/audio"}
        )
    )


def render_video(turn_id: str, settings: Settings, store: ConversationStore) -> Turn | None:
    """Background worker: talking-avatar clip of one twin turn. Never raises."""
    turn = store.get_turn(turn_id)
    if turn is None or turn.video_status == "done":
        return turn
    turn = store.update_turn(turn.model_copy(update={"video_status": "rendering"}))
    try:
        _, mode = render_verdict_media(
            spoken_script(turn.text),
            likeness=likeness_paths(settings.twinverse_avatar_dir),
            videos_dir=Path(settings.twinverse_avatar_dir) / "videos",
            job_id=turn.id,
            settings=settings,
        )
    except PipelineError as exc:
        return store.update_turn(
            turn.model_copy(update={"video_status": "failed", "media_error": str(exc)[:500]})
        )
    except Exception as exc:
        logger.exception("video render crashed for turn %s", turn_id)
        return store.update_turn(
            turn.model_copy(update={"video_status": "failed", "media_error": f"render crashed: {exc}"[:500]})
        )
    return store.update_turn(
        turn.model_copy(
            update={
                "video_status": "done",
                "video_url": f"/api/conversations/turns/{turn.id}/video",
                "render_mode": mode,
            }
        )
    )
