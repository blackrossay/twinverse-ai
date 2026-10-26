"""SQLite persistence for evaluations and comparison summaries."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .schemas import ComparisonResult, DeterministicReport, ScenarioEvaluation

_SCHEMA = """
CREATE TABLE IF NOT EXISTS scenario_evaluations (
    run_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    eval_json TEXT NOT NULL,
    PRIMARY KEY (run_id, scenario_id)
);
CREATE TABLE IF NOT EXISTS run_comparisons (
    run_id TEXT PRIMARY KEY,
    summary TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
"""


class EvaluationStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def save_evaluation(self, run_id: str, evaluation: ScenarioEvaluation) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO scenario_evaluations (run_id, scenario_id, eval_json)"
                " VALUES (?, ?, ?)",
                (run_id, evaluation.scenario_id, evaluation.model_dump_json()),
            )

    def save_summary(self, run_id: str, summary: str, model: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO run_comparisons (run_id, summary, model, created_at)"
                " VALUES (?, ?, ?, ?)",
                (run_id, summary, model, datetime.now(timezone.utc).isoformat()),
            )

    def get_comparison(
        self, run_id: str, twin_id: str, scenario_ids: list[str],
        deterministic: list[DeterministicReport],
    ) -> ComparisonResult | None:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT scenario_id, eval_json FROM scenario_evaluations WHERE run_id = ?",
                (run_id,),
            ).fetchall()
            found = {r["scenario_id"]: r["eval_json"] for r in rows}
            if any(sid not in found for sid in scenario_ids):
                return None
            srow = conn.execute(
                "SELECT summary, model, created_at FROM run_comparisons WHERE run_id = ?",
                (run_id,),
            ).fetchone()
            if srow is None:
                return None
            return ComparisonResult(
                run_id=run_id,
                twin_id=twin_id,
                deterministic=deterministic,
                evaluations=[
                    ScenarioEvaluation.model_validate_json(found[sid]) for sid in scenario_ids
                ],
                summary=srow["summary"],
                model=srow["model"],
                evaluated_at=srow["created_at"],
            )
