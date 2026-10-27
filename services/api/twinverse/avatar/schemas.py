"""Schemas for talking-verdict avatar jobs."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TalkingVerdict(BaseModel):
    """One async render job: a run's verdict spoken by the user's twin."""

    id: str
    run_id: str
    provider: str = "local"  # local open-source pipeline, rendered on this machine
    provider_job_id: str = ""
    status: str = "queued"  # queued | rendering | done | failed
    render_mode: str = "portrait"  # portrait | lipsync
    script: str = ""
    video_url: str = ""
    error: str = ""
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class AvatarStatus(BaseModel):
    """Local pipeline state. Never includes secrets or likeness bytes."""

    configured: bool  # voice stack ready AND likeness present
    voice_ready: bool
    lipsync_ready: bool
    likeness_present: bool
    device: str  # cpu | cuda
    missing: list[str] = []
    lipsync_note: str = ""
