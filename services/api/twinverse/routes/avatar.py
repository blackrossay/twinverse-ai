"""Talking-verdict endpoints: local open-source face + voice renders."""

from functools import lru_cache
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse

from ..avatar.likeness import (
    MAX_PHOTO_BYTES,
    MAX_VOICE_BYTES,
    LikenessError,
    delete_likeness,
    likeness_paths,
    save_likeness,
)
from ..avatar.pipeline import check_pipeline
from ..avatar.schemas import AvatarStatus, TalkingVerdict
from ..avatar.service import AvatarNotReady, render_job, request_verdict
from ..avatar.store import AvatarStore
from ..evaluation.deterministic import check_scenario
from ..evaluation.service import compute_comparison
from ..identity.store import IdentityStore
from ..meta_client import MetaClient, MetaClientError
from ..settings import Settings, get_settings
from ..simulation.store import SimulationStore
from .comparison import get_eval_store, get_model_client
from .simulations import get_sim_store
from .twins import get_store

router = APIRouter(tags=["avatar"])


@lru_cache(maxsize=4)
def _avatar_store_for(db_path: str) -> AvatarStore:
    return AvatarStore(db_path)


def get_avatar_store() -> AvatarStore:
    return _avatar_store_for(get_settings().twinverse_db_path)


def _status(settings: Settings) -> AvatarStatus:
    from ..avatar.provider import inference_ready, provider_mode
    from ..avatar.provider import missing as provider_missing

    present = likeness_paths(settings.twinverse_avatar_dir).present
    if provider_mode(settings) == "http":
        ready = inference_ready(settings)
        return AvatarStatus(
            configured=ready and present,
            voice_ready=ready,
            lipsync_ready=ready,
            likeness_present=present,
            device="cloud",
            missing=provider_missing(settings),
            lipsync_note="Cloud inference service (your infra) renders voice + avatar.",
        )
    info = check_pipeline(settings)
    return AvatarStatus(
        configured=info.voice_ready and present,
        voice_ready=info.voice_ready,
        lipsync_ready=info.lipsync_ready,
        likeness_present=present,
        device=info.device,
        missing=list(info.missing),
        lipsync_note=info.lipsync_note,
    )


@router.get("/api/avatar/status", response_model=AvatarStatus)
def avatar_status() -> AvatarStatus:
    return _status(get_settings())


async def _read_limited(upload: UploadFile, max_bytes: int, label: str) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while chunk := await upload.read(1024 * 256):
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=422, detail=f"{label} exceeds the {max_bytes // (1024 * 1024)} MB limit."
            )
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/api/avatar/likeness", response_model=AvatarStatus)
async def upload_likeness(
    photo: UploadFile = File(...),
    voice: UploadFile = File(...),
    consent: str = Form(""),
) -> AvatarStatus:
    settings = get_settings()
    try:
        save_likeness(
            settings.twinverse_avatar_dir,
            consent=consent,
            photo_name=photo.filename or "",
            photo_type=photo.content_type or "",
            photo_bytes=await _read_limited(photo, MAX_PHOTO_BYTES, "Photo"),
            voice_name=voice.filename or "",
            voice_type=voice.content_type or "",
            voice_bytes=await _read_limited(voice, MAX_VOICE_BYTES, "Voice sample"),
        )
    except LikenessError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return _status(settings)


@router.get("/api/avatar/likeness/photo")
def likeness_photo():
    settings = get_settings()
    paths = likeness_paths(settings.twinverse_avatar_dir)
    if not paths.photo.is_file():
        raise HTTPException(status_code=404, detail="no likeness photo uploaded")
    media = {
        ".png": "image/png",
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }.get(paths.photo.suffix.lower(), "image/jpeg")
    return FileResponse(paths.photo, media_type=media)


@router.delete("/api/avatar/likeness", response_model=AvatarStatus)
def remove_likeness() -> AvatarStatus:
    settings = get_settings()
    delete_likeness(settings.twinverse_avatar_dir)
    return _status(settings)


def _verdict_summary(
    run_id: str, store: IdentityStore, sim_store: SimulationStore, eval_store, client: MetaClient
) -> str:
    run = sim_store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    if run.status == "running":
        raise HTTPException(status_code=409, detail="run still in progress")
    twin = store.get_twin(run.twin_id, run.identity_version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin snapshot not found")
    deterministic = [check_scenario(twin, s) for s in run.scenarios]
    cached = eval_store.get_comparison(
        run.id, run.twin_id, [s.scenario_id for s in run.scenarios], deterministic
    )
    if cached is not None:
        return cached.summary
    try:
        comparison = compute_comparison(
            run, twin, client, get_settings().meta_model_eval, eval_store
        )
    except MetaClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    return comparison.summary


@router.post(
    "/api/simulations/{run_id}/talking-verdict",
    response_model=TalkingVerdict,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_talking_verdict(
    run_id: str,
    background: BackgroundTasks,
    store: IdentityStore = Depends(get_store),
    sim_store: SimulationStore = Depends(get_sim_store),
    eval_store=Depends(get_eval_store),
    client: MetaClient = Depends(get_model_client),
    avatar_store: AvatarStore = Depends(get_avatar_store),
) -> TalkingVerdict:
    settings = get_settings()
    summary = _verdict_summary(run_id, store, sim_store, eval_store, client)
    try:
        job = request_verdict(run_id, summary, settings, avatar_store)
    except AvatarNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None
    background.add_task(render_job, job.id, settings, avatar_store)
    return job


@router.get(
    "/api/simulations/{run_id}/talking-verdict", response_model=TalkingVerdict
)
def get_talking_verdict(
    run_id: str,
    avatar_store: AvatarStore = Depends(get_avatar_store),
) -> TalkingVerdict:
    verdict = avatar_store.latest_for_run(run_id)
    if verdict is None:
        raise HTTPException(status_code=404, detail="no talking verdict for this run yet")
    return verdict


@router.get("/api/avatar/video/{job_id}")
def serve_video(job_id: str, avatar_store: AvatarStore = Depends(get_avatar_store)):
    verdict = avatar_store.get(job_id)
    if verdict is None or verdict.status != "done":
        raise HTTPException(status_code=404, detail="video not ready")
    videos_dir = (Path(get_settings().twinverse_avatar_dir) / "videos").resolve()
    path = (videos_dir / f"{verdict.id}.mp4").resolve()
    if path.parent != videos_dir or not path.is_file():
        raise HTTPException(status_code=404, detail="video file missing")
    return FileResponse(path, media_type="video/mp4", filename=f"twinverse-verdict-{job_id}.mp4")
