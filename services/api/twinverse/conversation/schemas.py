"""Schemas for conversational twin sessions and turns."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Turn(BaseModel):
    id: str = Field(default_factory=lambda: f"turn_{uuid4().hex[:10]}")
    role: str  # user | twin
    text: str
    created_at: datetime = Field(default_factory=_utcnow)
    model: str = ""
    latency_ms: int = 0
    fixture: bool = False
    facts_used: list[str] = []
    # Cloned-voice audio and talking-avatar video for twin turns.
    voice_status: str = "idle"  # idle | queued | rendering | done | failed
    voice_url: str = ""
    video_status: str = "idle"  # idle | queued | rendering | done | failed
    video_url: str = ""
    render_mode: str = ""
    media_error: str = ""


class Conversation(BaseModel):
    id: str
    twin_id: str
    identity_version: int
    title: str = ""
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    turns: list[Turn] = []


class ConversationCreate(BaseModel):
    title: str = Field(default="", max_length=120)


class TurnCreate(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
