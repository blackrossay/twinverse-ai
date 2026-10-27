"""Schemas for live twin sessions, agenda points, and chat."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(UTC)


PLATFORMS = ["youtube", "twitch", "x", "tiktok", "linkedin"]
MODES = ["general", "business", "life", "socials"]


class AgendaPoint(BaseModel):
    id: str = Field(default_factory=lambda: f"pt_{uuid4().hex[:8]}")
    text: str
    done: bool = False


class LiveMessage(BaseModel):
    id: str = Field(default_factory=lambda: f"msg_{uuid4().hex[:10]}")
    kind: str = "chat"  # chat | point | system
    platform: str = "studio"
    username: str = ""
    message: str = ""
    priority: bool = False  # pinned / superchat-style messages jump the queue
    reply: str = ""  # the twin's spoken reply (for chat messages)
    created_at: datetime = Field(default_factory=_utcnow)
    model: str = ""
    latency_ms: int = 0
    fixture: bool = False
    voice_status: str = "idle"  # idle | queued | rendering | done | failed
    voice_url: str = ""
    video_status: str = "idle"
    video_url: str = ""
    render_mode: str = ""
    media_error: str = ""


class LiveSession(BaseModel):
    id: str
    twin_id: str
    identity_version: int
    title: str = ""
    mode: str = "general"
    platforms: list[str] = []
    status: str = "live"  # live | ended
    agenda: list[AgendaPoint] = []
    current_point: int = 0
    stream_status: str = "idle"  # idle | publishing | stopped | error
    youtube_configured: bool = False
    created_at: datetime = Field(default_factory=_utcnow)
    ended_at: datetime | None = None
    messages: list[LiveMessage] = []


class DestinationIn(BaseModel):
    rtmp_url: str = Field(default="rtmp://a.rtmp.youtube.com/live2", max_length=300)
    stream_key: str = Field(min_length=4, max_length=300)


class DestinationView(BaseModel):
    configured: bool
    rtmp_url: str = ""
    key_hint: str = ""  # last 4 only — the full key never leaves the server
    platform: str = "youtube"


class LiveCreate(BaseModel):
    title: str = Field(default="", max_length=160)
    mode: str = "general"
    platforms: list[str] = Field(default=[], max_length=5)
    agenda: list[str] = Field(default=[], max_length=20)


class AgendaAdd(BaseModel):
    text: str = Field(min_length=1, max_length=300)


class ChatCreate(BaseModel):
    platform: str = Field(default="studio", max_length=30)
    username: str = Field(default="viewer", min_length=1, max_length=60)
    message: str = Field(min_length=1, max_length=500)
    priority: bool = False
