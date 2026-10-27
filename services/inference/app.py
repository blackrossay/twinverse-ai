"""Twinverse cloud inference service: voice clone + talking-avatar renders.

Deploy this on YOUR GPU cloud (it is the only piece that needs MeloTTS /
OpenVoice / MuseTalk installed). The main API talks to it over HTTPS with a
shared token; customers never see or install any of it.

Run:  uvicorn app:app --host 0.0.0.0 --port 8100   (from services/inference,
      with the twinverse package importable — see Dockerfile.inference)
Env:  TWINVERSE_INFERENCE_TOKEN (required in production),
      TWINVERSE_OPENVOICE_CKPT, TWINVERSE_MUSETALK_REPO, TWINVERSE_AVATAR_DIR
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from twinverse.avatar.likeness import Likeness
from twinverse.avatar.pipeline import (
    PipelineError,
    check_pipeline,
    clone_voice,
    render_verdict,
)
from twinverse.settings import Settings

app = FastAPI(title="Twinverse Inference", version="0.1.0")


def _auth(token: str | None) -> None:
    expected = os.environ.get("TWINVERSE_INFERENCE_TOKEN", "")
    if expected and token != expected:
        raise HTTPException(status_code=401, detail="invalid inference token")


@app.get("/health")
def health() -> dict:
    settings = Settings()
    info = check_pipeline(settings)
    return {
        "status": "ok",
        "service": "twinverse-inference",
        "voice_ready": info.voice_ready,
        "lipsync_ready": info.lipsync_ready,
        "device": info.device,
        "missing": info.missing,
    }


@app.post("/v1/voice")
async def voice(
    script: str = Form(...),
    voice: UploadFile = File(...),  # noqa: B008
    x_inference_token: str | None = Header(default=None),
):
    _auth(x_inference_token)
    settings = Settings()
    with tempfile.TemporaryDirectory() as tmp:
        ref = Path(tmp) / f"ref{Path(voice.filename or 'voice.wav').suffix or '.wav'}"
        ref.write_bytes(await voice.read())
        out = Path(tmp) / "cloned.wav"
        try:
            clone_voice(script, ref, out, settings)
        except PipelineError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        from fastapi.responses import Response

        return Response(content=out.read_bytes(), media_type="audio/wav")


@app.post("/v1/video")
async def video(
    script: str = Form(...),
    photo: UploadFile = File(...),  # noqa: B008
    voice: UploadFile = File(...),  # noqa: B008
    x_inference_token: str | None = Header(default=None),
):
    _auth(x_inference_token)
    settings = Settings()
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        photo_path = base / f"photo{Path(photo.filename or 'photo.jpg').suffix or '.jpg'}"
        voice_path = base / f"voice{Path(voice.filename or 'voice.wav').suffix or '.wav'}"
        photo_path.write_bytes(await photo.read())
        voice_path.write_bytes(await voice.read())
        videos = base / "videos"
        try:
            out, mode = render_verdict(
                script,
                likeness=Likeness(photo=photo_path, voice=voice_path),
                videos_dir=videos,
                job_id="render",
                settings=settings,
            )
        except PipelineError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from None
        data = out.read_bytes()
        from fastapi.responses import Response

        return Response(content=data, media_type="video/mp4", headers={"X-Render-Mode": mode})
