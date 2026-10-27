"""Talking-verdict orchestration: readiness checks, job submit, local render."""

from __future__ import annotations

from pathlib import Path

from ..settings import Settings
from .likeness import likeness_paths
from .pipeline import PipelineError
from .provider import inference_ready
from .provider import missing as provider_missing
from .provider import render_verdict_media as render_verdict
from .schemas import TalkingVerdict
from .script import build_verdict_script
from .store import AvatarStore


class AvatarNotReady(RuntimeError):
    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__("talking verdicts not ready: " + "; ".join(missing))


def request_verdict(
    run_id: str, summary: str, settings: Settings, store: AvatarStore
) -> TalkingVerdict:
    """Validate readiness and queue a render job. The worker renders async."""
    if not inference_ready(settings):
        raise AvatarNotReady(provider_missing(settings))
    if not likeness_paths(settings.twinverse_avatar_dir).present:
        raise AvatarNotReady(["likeness: upload your photo + voice sample first"])
    job = store.new_job(run_id, provider="local")
    return store.touch(job, script=build_verdict_script(summary))


def render_job(job_id: str, settings: Settings, store: AvatarStore) -> TalkingVerdict | None:
    """Background worker: render one queued job to mp4. Never raises."""
    job = store.get(job_id)
    if job is None or job.status in ("done", "failed"):
        return job
    job = store.touch(job, status="rendering")
    try:
        _, mode = render_verdict(
            job.script,
            likeness=likeness_paths(settings.twinverse_avatar_dir),
            videos_dir=Path(settings.twinverse_avatar_dir) / "videos",
            job_id=job.id,
            settings=settings,
        )
    except PipelineError as exc:
        return store.touch(job, status="failed", error=str(exc)[:500])
    except Exception as exc:  # never leak a stack trace to the stored record
        return store.touch(job, status="failed", error=f"render crashed: {exc}"[:500])
    return store.touch(
        job, status="done", video_url=f"/api/avatar/video/{job.id}", render_mode=mode
    )
