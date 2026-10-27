"""Schemas for deterministic checks, model evaluations, and comparisons."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, field_validator


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

    @field_validator("score", mode="before")
    @classmethod
    def _coerce_score(cls, value: Any) -> Any:
        if isinstance(value, str) and value.strip().isdigit():
            return int(value.strip())
        return value

    @field_validator("evidence", mode="before")
    @classmethod
    def _coerce_evidence(cls, value: Any) -> Any:
        import json

        if isinstance(value, list):
            return [v if isinstance(v, str) else json.dumps(v) for v in value]
        return value


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
