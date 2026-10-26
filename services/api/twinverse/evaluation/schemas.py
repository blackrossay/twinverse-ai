"""Schemas for deterministic checks, model evaluations, and comparisons."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CheckDetail(BaseModel):
    name: str
    passed: bool
    detail: str = ""


class DeterministicReport(BaseModel):
    scenario_id: str
    checks_passed: int
    checks_total: int
    details: list[CheckDetail] = []


class DimensionScore(BaseModel):
    score: int = Field(ge=1, le=5)
    evidence: list[str] = []
    notes: str = ""


class ScenarioEvaluation(BaseModel):
    scenario_id: str
    template_id: str
    evaluated: bool = True
    skip_reason: str = ""
    identity_consistency: DimensionScore | None = None
    scenario_effectiveness: DimensionScore | None = None
    adaptation: DimensionScore | None = None
    model: str = ""
    prompt_version: str = "evaluation/v1"


class ComparisonResult(BaseModel):
    run_id: str
    twin_id: str
    deterministic: list[DeterministicReport] = []
    evaluations: list[ScenarioEvaluation] = []
    summary: str = ""
    model: str = ""
    evaluated_at: datetime = Field(default_factory=_utcnow)
