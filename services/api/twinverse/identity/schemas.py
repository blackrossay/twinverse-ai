"""Pydantic schemas for twins and versioned identity payloads."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:8]}"


class Fact(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("f"))
    statement: str = Field(min_length=1, max_length=2000)
    category: str = "general"


class Hypothesis(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("h"))
    statement: str = Field(min_length=1, max_length=2000)
    confidence: float = Field(ge=0.0, le=1.0)
    basis: str = ""


class ProvenanceEntry(BaseModel):
    field: str
    source: str  # user | model | seed | user-edit
    detail: str = ""
    at: datetime = Field(default_factory=_utcnow)


class IdentityPayload(BaseModel):
    """Immutable content of one identity version."""

    verified_facts: list[Fact] = []
    skills: list[str] = []
    goals: list[str] = []
    constraints: list[str] = []
    behavioral_hypotheses: list[Hypothesis] = []
    communication_style: dict[str, str] = {}
    consent: dict = {}
    bio: str = ""
    provenance: list[ProvenanceEntry] = []


class Twin(BaseModel):
    id: str
    name: str
    profile_type: str = "professional"
    current_version: int = 1
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class TwinDetail(Twin):
    version: int
    payload: IdentityPayload


# --- API inputs ---


class FactInput(BaseModel):
    statement: str = Field(min_length=1, max_length=2000)
    category: str = "general"


class HypothesisInput(BaseModel):
    statement: str = Field(min_length=1, max_length=2000)
    confidence: float = Field(ge=0.0, le=1.0)
    basis: str = ""


class TwinCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    profile_type: str = Field(default="professional", max_length=50)
    bio: str = Field(default="", max_length=20_000)
    verified_facts: list[FactInput] = Field(default=[], max_length=100)
    skills: list[str] = Field(default=[], max_length=50)
    goals: list[str] = Field(default=[], max_length=50)
    constraints: list[str] = Field(default=[], max_length=50)
    behavioral_hypotheses: list[HypothesisInput] = Field(default=[], max_length=50)
    communication_style: dict[str, str] = Field(default={}, max_length=20)
    consent: dict = {}

    @property
    def has_structured_input(self) -> bool:
        return bool(
            self.verified_facts
            or self.skills
            or self.goals
            or self.constraints
            or self.behavioral_hypotheses
            or self.communication_style
        )


class TwinPatch(BaseModel):
    """Provided lists replace those lists wholesale; omitted fields are preserved."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    bio: str | None = Field(default=None, max_length=20_000)
    verified_facts: list[FactInput] | None = Field(default=None, max_length=100)
    skills: list[str] | None = Field(default=None, max_length=50)
    goals: list[str] | None = Field(default=None, max_length=50)
    constraints: list[str] | None = Field(default=None, max_length=50)
    behavioral_hypotheses: list[HypothesisInput] | None = Field(default=None, max_length=50)
    communication_style: dict[str, str] | None = Field(default=None, max_length=20)
    consent: dict | None = None
