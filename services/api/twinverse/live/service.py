"""Live reply engine: chat in -> short spoken twin reply out, voice-first."""

from __future__ import annotations

import logging
from pathlib import Path

from ..avatar.likeness import likeness_paths
from ..avatar.pipeline import PipelineError
from ..avatar.provider import clone_voice_media, inference_ready, render_verdict_media
from ..avatar.provider import missing as provider_missing
from ..avatar.service import AvatarNotReady
from ..conversation.media import spoken_script
from ..identity.schemas import TwinDetail
from ..meta_client import MetaClient, MetaClientError
from ..model_json import load_prompt, parse_json_object
from ..settings import Settings
from .schemas import LiveMessage, LiveSession
from .store import LiveStore

logger = logging.getLogger("twinverse.live")

_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "v1" / "live.md"
CALL_TIMEOUT_S = 45.0


def _identity_block(twin: TwinDetail) -> str:
    p = twin.payload
    style = [f"- {k}: {v}" for k, v in p.communication_style.items()] or ["- (unspecified)"]
    return "\n".join(
        [
            f"You are the twin of: {twin.name} (identity v{twin.version})",
            "VERIFIED FACTS:",
            *[f"- [{f.id}] ({f.category}) {f.statement}" for f in p.verified_facts],
            f"SKILLS: {', '.join(p.skills) or '(none)'}",
            f"GOALS: {', '.join(p.goals) or '(none)'}",
            f"CONSTRAINTS: {', '.join(p.constraints) or '(none)'}",
            "COMMUNICATION STYLE:",
            *style,
        ]
    )


def _agenda_text(session: LiveSession) -> str:
    if not session.agenda:
        return "(open floor — no set points)"
    lines = []
    for i, point in enumerate(session.agenda):
        mark = "done" if point.done else ("NOW" if i == session.current_point else "next")
        lines.append(f"- [{mark}] {point.text}")
    return "\n".join(lines)


def _parse_reply(text: str) -> str:
    try:
        reply = str(parse_json_object(text).get("reply") or "").strip()
        if reply:
            return reply
    except ValueError:
        pass
    return text.strip()


def answer_chat(
    session: LiveSession, twin: TwinDetail, chat: LiveMessage, client: MetaClient, store: LiveStore
) -> LiveMessage:
    """Generate the twin's spoken reply to one chat message. Persists both."""
    store.add_message(session.id, chat)
    prompt = (
        load_prompt(str(_PROMPT_PATH))
        .replace("{{IDENTITY}}", _identity_block(twin))
        .replace("{{MODE}}", session.mode)
        .replace("{{AGENDA}}", _agenda_text(session))
        .replace("{{PLATFORM}}", chat.platform)
        .replace("{{USERNAME}}", chat.username)
        .replace("{{MESSAGE}}", chat.message)
    )
    result = client.generate(prompt, timeout_s=CALL_TIMEOUT_S)
    if result.fixture:
        chat.reply = (
            "[OFFLINE FIXTURE] Hey "
            f"{chat.username}, great question — I'd answer that in character with a live "
            "model key set. Keep them coming!"
        )
        chat.fixture = True
        chat.model = result.model
        return store.update_message(chat)
    reply = _parse_reply(result.text)
    if not reply:
        raise MetaClientError("live reply failed: model returned an empty reply")
    chat.reply = reply
    chat.model = result.model
    chat.latency_ms = result.latency_ms
    logger.info("live %s answered %s in %dms", session.id, chat.username, result.latency_ms)
    return store.update_message(chat)


def advance_point(
    session: LiveSession, twin: TwinDetail, client: MetaClient, store: LiveStore
) -> LiveMessage:
    """Deliver the current discussion point's talk track, then advance."""
    if session.current_point >= len(session.agenda):
        msg = LiveMessage(
            kind="system",
            platform="studio",
            username="STUDIO",
            message="All discussion points covered.",
            reply="That's every point on today's agenda — let's keep the chat going!",
        )
        return store.add_message(session.id, msg)
    point = session.agenda[session.current_point]
    prompt = (
        load_prompt(str(_PROMPT_PATH))
        .replace("{{IDENTITY}}", _identity_block(twin))
        .replace("{{MODE}}", session.mode)
        .replace("{{AGENDA}}", _agenda_text(session))
        .replace("{{PLATFORM}}", "studio")
        .replace("{{USERNAME}}", "HOST")
        .replace(
            "{{MESSAGE}}",
            f"Introduce this next discussion point to the live audience in 60-100 words,"
            f" then invite chat to react: {point.text}",
        )
    )
    result = client.generate(prompt, timeout_s=CALL_TIMEOUT_S)
    session.agenda[session.current_point].done = True
    session.current_point += 1
    store.save_session(session)
    msg = LiveMessage(
        kind="point", platform="studio", username="AGENDA", message=point.text
    )
    if result.fixture:
        msg.reply = f"[OFFLINE FIXTURE] Let's get into it: {point.text} — chat, what do you think?"
        msg.fixture = True
        msg.model = result.model
    else:
        msg.reply = _parse_reply(result.text)
        msg.model = result.model
        msg.latency_ms = result.latency_ms
    return store.add_message(session.id, msg)


# --- cloned voice / avatar for live replies ---------------------------------


def _require_ready(settings: Settings) -> None:
    if not inference_ready(settings):
        raise AvatarNotReady(provider_missing(settings))
    if not likeness_paths(settings.twinverse_avatar_dir).present:
        raise AvatarNotReady(["likeness: upload your photo + voice sample first"])


def request_media(msg: LiveMessage, kind: str, settings: Settings, store: LiveStore) -> LiveMessage:
    if not msg.reply:
        raise AvatarNotReady(["only twin replies can be rendered"])
    _require_ready(settings)
    field = "voice_status" if kind == "voice" else "video_status"
    return store.update_message(msg.model_copy(update={field: "queued", "media_error": ""}))


def render_voice(msg_id: str, settings: Settings, store: LiveStore) -> LiveMessage | None:
    msg = store.get_message(msg_id)
    if msg is None or msg.voice_status == "done":
        return msg
    msg = store.update_message(msg.model_copy(update={"voice_status": "rendering"}))
    try:
        out_dir = Path(settings.twinverse_avatar_dir) / "live"
        out_dir.mkdir(parents=True, exist_ok=True)
        clone_voice_media(
            spoken_script(msg.reply),
            likeness_paths(settings.twinverse_avatar_dir).voice,
            out_dir / f"{msg.id}.wav",
            settings,
        )
    except PipelineError as exc:
        return store.update_message(
            msg.model_copy(update={"voice_status": "failed", "media_error": str(exc)[:500]})
        )
    except Exception as exc:
        logger.exception("live voice render crashed for %s", msg_id)
        return store.update_message(
            msg.model_copy(update={"voice_status": "failed", "media_error": f"render crashed: {exc}"[:500]})
        )
    return store.update_message(
        msg.model_copy(
            update={"voice_status": "done", "voice_url": f"/api/live/messages/{msg.id}/audio"}
        )
    )


def render_video(msg_id: str, settings: Settings, store: LiveStore) -> LiveMessage | None:
    msg = store.get_message(msg_id)
    if msg is None or msg.video_status == "done":
        return msg
    msg = store.update_message(msg.model_copy(update={"video_status": "rendering"}))
    try:
        _, mode = render_verdict_media(
            spoken_script(msg.reply),
            likeness=likeness_paths(settings.twinverse_avatar_dir),
            videos_dir=Path(settings.twinverse_avatar_dir) / "videos",
            job_id=msg.id,
            settings=settings,
        )
    except PipelineError as exc:
        return store.update_message(
            msg.model_copy(update={"video_status": "failed", "media_error": str(exc)[:500]})
        )
    except Exception as exc:
        logger.exception("live video render crashed for %s", msg_id)
        return store.update_message(
            msg.model_copy(update={"video_status": "failed", "media_error": f"render crashed: {exc}"[:500]})
        )
    return store.update_message(
        msg.model_copy(
            update={
                "video_status": "done",
                "video_url": f"/api/live/messages/{msg.id}/video",
                "render_mode": mode,
            }
        )
    )
