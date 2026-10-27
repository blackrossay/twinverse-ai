"""Voice catalogue: cloned voice, local engine, optional hosted voices."""

from __future__ import annotations

import time

import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from ..avatar.likeness import likeness_paths
from ..avatar.provider import inference_ready
from ..settings import get_settings

router = APIRouter(prefix="/api/voice", tags=["voice"])

_EL_CACHE: dict[str, object] = {"at": 0.0, "voices": []}
_EL_TTL_S = 600.0


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    voice_id: str = Field(min_length=1, max_length=100)


def _elevenlabs_voices(api_key: str) -> list[dict]:
    now = time.monotonic()
    if now - float(_EL_CACHE["at"]) < _EL_TTL_S and _EL_CACHE["voices"]:
        return list(_EL_CACHE["voices"])  # type: ignore[arg-type]
    try:
        resp = httpx.get(
            "https://api.elevenlabs.io/v1/voices",
            headers={"xi-api-key": api_key},
            timeout=10.0,
        )
        if resp.status_code != 200:
            return []
        voices = [
            {
                "id": v.get("voice_id", ""),
                "name": v.get("name", "Voice"),
                "category": v.get("category", "hosted"),
            }
            for v in resp.json().get("voices", [])
        ]
    except httpx.HTTPError:
        return []
    _EL_CACHE.update(at=now, voices=voices)
    return voices


@router.get("/catalogue")
def catalogue() -> dict:
    settings = get_settings()
    likeness = likeness_paths(settings.twinverse_avatar_dir).present
    el_configured = bool(settings.elevenlabs_api_key)
    return {
        "cloned": {
            "ready": inference_ready(settings) and likeness,
            "engine_ready": inference_ready(settings),
            "likeness_present": likeness,
            "label": "Your cloned voice (local/cloud, open-source)",
        },
        "elevenlabs": {
            "configured": el_configured,
            "voices": _elevenlabs_voices(settings.elevenlabs_api_key) if el_configured else [],
            "label": "Hosted catalogue voices (ElevenLabs, optional key)",
        },
        "instant": {
            "ready": True,
            "label": "Instant device voices (browser, zero setup)",
        },
    }


@router.post("/speak")
def speak(body: SpeakIn) -> Response:
    """Hosted realistic speech. 503 with a clear path when no key is set."""
    settings = get_settings()
    if not settings.elevenlabs_api_key:
        raise HTTPException(
            status_code=503,
            detail="hosted voice needs ELEVENLABS_API_KEY on the server; "
            "your cloned voice and instant device voices work without it",
        )
    try:
        resp = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{body.voice_id}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": body.text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {"stability": 0.45, "similarity_boost": 0.8},
            },
            timeout=60.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"hosted voice unreachable: {exc}") from None
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"hosted voice failed ({resp.status_code})")
    return Response(content=resp.content, media_type="audio/mpeg")
