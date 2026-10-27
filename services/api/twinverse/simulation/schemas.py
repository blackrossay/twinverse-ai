"""Schemas for scenarios, runs, and simulation outputs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


def _coerce_str_map(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    return {str(k): (v if isinstance(v, str) else json.dumps(v)) for k, v in value.items()}


def _coerce_str_list(value: Any) -> Any:
    if not isinstance(value, list):
        return value
    return [v if isinstance(v, str) else json.dumps(v) for v in value]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Counterpart(BaseModel):
    name: str = ""
    role: str = ""
    attitude: str = ""


class ScenarioTemplate(BaseModel):
    template_id: str
    type: str
    title: str
    context: str
    objective: str
    constraints: list[str] = []
    variables: dict[str, str] = {}
    counterpart: Counterpart = Counterpart()
    rubric_id: str = "default_v1"


class ScenarioInput(BaseModel):
    template_id: str
    variables: dict[str, str] = {}
    objective_override: str = ""
    context_override: str = ""


class ScenarioSpec(BaseModel):
    """A template resolved with caller overrides — the frozen per-scenario context."""

    scenario_id: str = Field(default_factory=lambda: f"sc_{uuid4().hex[:8]}")
    template_id: str
    type: str
    title: str
    context: str
    objective: str
    constraints: list[str] = []
    variables: dict[str, str] = {}
    counterpart: Counterpart = Counterpart()
    rubric_id: str = "default_v1"


class Decision(BaseModel):
    decision: str
    rationale: str = ""


class Contradiction(BaseModel):
    claim: str
    issue: str


class SimulationOutput(BaseModel):
    response_text: str = Field(min_length=1)
    decisions: list[Decision] = []
    assumptions: list[str] = []
    identity_facts_used: list[str] = []
    contradictions: list[Contradiction] = []
    variables_noted: dict[str, str] = {}

    _vars = field_validator("variables_noted", mode="before")(_coerce_str_map)
    _assume = field_validator("assumptions", "identity_facts_used", mode="before")(_coerce_str_list)


class ScenarioResult(BaseModel):
    scenario_id: str
    spec: ScenarioSpec
    status: str = "running"  # running | done | failed
    output: SimulationOutput | None = None
    error: str = ""
    model: str = ""
    latency_ms: int = 0
    prompt_version: str = "simulation/v1"


class SimulationRun(BaseModel):
    id: str
    twin_id: str
    identity_version: int
    status: str = "running"  # running | done | partial | failed
    parent_run_id: str = ""
    created_at: datetime = Field(default_factory=_utcnow)
    scenarios: list[ScenarioResult] = []


class RunCreate(BaseModel):
    twin_id: str
    version: int | None = None
    scenarios: list[ScenarioInput] = Field(min_length=1, max_length=3)


class RerunCreate(BaseModel):
    scenario_ids: list[str] | None = None  # default: all parent scenarios
    variables: dict[str, dict[str, str]] = {}  # scenario_id -> variable updates
    objective_overrides: dict[str, str] = {}
    context_overrides: dict[str, str] = {}
