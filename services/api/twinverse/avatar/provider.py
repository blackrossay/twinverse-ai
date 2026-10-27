"""Where avatar/voice inference runs: this machine, or your cloud service.

local — MeloTTS/OpenVoice/MuseTalk in-process (developer machine, demo).
http  — POST likeness + script to the Twinverse inference service
        (services/inference) running on your GPU cloud; returns media bytes.
        Customers' devices never install or run any of this.

All render call sites go through here so placement is one env var:
TWINVERSE_AVATAR_PROVIDER=local|http
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

import httpx

from ..settings import Settings
from .likeness import Likeness
from .pipeline import PipelineError, check_pipeline, clone_voice, render_verdict

logger = logging.getLogger("twinverse.avatar.provider")

_health_cache: dict[str, tuple[float, bool]] = {}
_HEALTH_TTL_S = 30.0


def provider_mode(settings: Settings) -> str:
    return (settings.twinverse_avatar_provider or "local").strip().lower()


def inference_ready(settings: Settings) -> bool:
    """Readiness for status endpoints, per provider."""
    if provider_mode(settings) != "http":
        return check_pipeline(settings).voice_ready
    url = settings.twinverse_inference_url.rstrip("/")
    if not url:
        return False
    cached = _health_cache.get(url)
    now = time.monotonic()
    if cached and now - cached[0] < _HEALTH_TTL_S:
        return cached[1]
    try:
        resp = httpx.get(f"{url}/health", timeout=3.0)
        ready = resp.status_code == 200 and resp.json().get("voice_ready", False)
    except Exception:
        ready = False
    _health_cache[url] = (now, ready)
    return ready


def missing(settings: Settings) -> list[str]:
    if provider_mode(settings) != "http":
        return check_pipeline(settings).missing
    if not settings.twinverse_inference_url:
        return ["inference service: set TWINVERSE_INFERENCE_URL (see docs/CLOUD.md)"]
    if not inference_ready(settings):
        return ["inference service: unreachable or not ready (check TWINVERSE_INFERENCE_URL)"]
    return []


def _headers(settings: Settings) -> dict[str, str]:
    token = settings.twinverse_inference_token
    return {"X-Inference-Token": token} if token else {}


def clone_voice_media(
    script_text: str, ref_audio: Path, out_wav: Path, settings: Settings
) -> Path:
    """Speak script_text in the cloned voice -> wav at out_wav."""
    if provider_mode(settings) != "http":
        return clone_voice(script_text, ref_audio, out_wav, settings)
    url = settings.twinverse_inference_url.rstrip("/")
    if not url:
        raise PipelineError("TWINVERSE_INFERENCE_URL is not set")
    try:
        with ref_audio.open("rb") as fh:
            resp = httpx.post(
                f"{url}/v1/voice",
                files={"voice": (ref_audio.name, fh, "application/octet-stream")},
                data={"script": script_text},
                headers=_headers(settings),
                timeout=settings.inference_timeout_s,
            )
    except httpx.HTTPError as exc:
        raise PipelineError(f"inference service unreachable: {exc}") from None
    if resp.status_code != 200:
        raise PipelineError(f"inference voice render failed ({resp.status_code}): {resp.text[:300]}")
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    out_wav.write_bytes(resp.content)
    return out_wav


def render_verdict_media(
    script_text: str,
    *,
    likeness: Likeness,
    videos_dir: str | Path,
    job_id: str,
    settings: Settings,
) -> tuple[Path, str]:
    """Talking-avatar clip -> (mp4 path, mode portrait|lipsync)."""
    if provider_mode(settings) != "http":
        return render_verdict(
            script_text,
            likeness=likeness,
            videos_dir=videos_dir,
            job_id=job_id,
            settings=settings,
        )
    url = settings.twinverse_inference_url.rstrip("/")
    if not url:
        raise PipelineError("TWINVERSE_INFERENCE_URL is not set")
    try:
        with likeness.photo.open("rb") as photo, likeness.voice.open("rb") as voice:
            resp = httpx.post(
                f"{url}/v1/video",
                files={
                    "photo": (likeness.photo.name, photo, "application/octet-stream"),
                    "voice": (likeness.voice.name, voice, "application/octet-stream"),
                },
                data={"script": script_text},
                headers=_headers(settings),
                timeout=settings.inference_timeout_s,
            )
    except httpx.HTTPError as exc:
        raise PipelineError(f"inference service unreachable: {exc}") from None
    if resp.status_code != 200:
        raise PipelineError(f"inference video render failed ({resp.status_code}): {resp.text[:300]}")
    mode = resp.headers.get("X-Render-Mode", "portrait")
    videos = Path(videos_dir)
    videos.mkdir(parents=True, exist_ok=True)
    out = videos / f"{job_id}.mp4"
    out.write_bytes(resp.content)
    return out, mode
