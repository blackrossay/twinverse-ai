"""Voice catalogue: cloned voice + Kokoro studio voices (all open-source).

No third-party voice APIs in this build — the catalogue that feels like a
hosted voice library is Kokoro running locally / on our own inference
service, and the star voice is the user's own clone.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from ..avatar.kokoro_tts import kokoro_available, list_voices, synthesize
from ..avatar.likeness import likeness_paths
from ..avatar.pipeline import PipelineError
from ..avatar.provider import inference_ready
from ..settings import get_settings

router = APIRouter(prefix="/api/voice", tags=["voice"])


class StudioIn(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    voice: str = Field(default="af_heart", max_length=50)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


@router.get("/catalogue")
def catalogue() -> dict:
    settings = get_settings()
    likeness = likeness_paths(settings.twinverse_avatar_dir).present
    return {
        "cloned": {
            "ready": inference_ready(settings) and likeness,
            "engine_ready": inference_ready(settings),
            "likeness_present": likeness,
            "label": "Your cloned voice (local/cloud, open-source)",
        },
        "studio": {
            "ready": kokoro_available(settings),
            "voices": list_voices(settings),
            "label": "Studio voices (Kokoro, open-source, local)",
        },
        "instant": {
            "ready": True,
            "label": "Instant device voices (browser, zero setup)",
        },
    }


@router.post("/studio")
def studio(body: StudioIn) -> Response:
    """Kokoro studio voice: natural catalogue speech, generated locally."""
    settings = get_settings()
    if not kokoro_available(settings):
        raise HTTPException(
            status_code=503,
            detail="Kokoro studio voices not installed on this server (avatar venv + models/kokoro)",
        )
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "studio.wav"
        try:
            synthesize(body.text, body.voice, out, settings, speed=body.speed)
        except PipelineError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        return Response(content=out.read_bytes(), media_type="audio/wav")
