"""SQLite store for simulation runs and scenario results."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from ..db import connect, init_schema
from .schemas import ScenarioResult, ScenarioSpec, SimulationRun

_SCHEMA = """
CREATE TABLE IF NOT EXISTS simulation_runs (
    id TEXT PRIMARY KEY,
    twin_id TEXT NOT NULL,
    identity_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    parent_run_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scenario_results (
    run_id TEXT NOT NULL,
    scenario_id TEXT NOT NULL,
    spec_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    output_json TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    latency_ms INTEGER NOT NULL DEFAULT 0,
    prompt_version TEXT NOT NULL DEFAULT 'simulation/v1',
    PRIMARY KEY (run_id, scenario_id),
    FOREIGN KEY (run_id) REFERENCES simulation_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_runs_twin_created ON simulation_runs (twin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_results_run ON scenario_results (run_id);
"""


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


class SimulationStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        init_schema(self._db_path, _SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return connect(self._db_path)

    def recover_interrupted(self) -> int:
        """Fail runs left 'running' by a previous process (restart/crash)."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE scenario_results SET status = 'failed',"
                " error = 'interrupted by server restart'"
                " WHERE status = 'running' AND run_id IN"
                " (SELECT id FROM simulation_runs WHERE status = 'running')"
            )
            cur = conn.execute(
                "UPDATE simulation_runs SET status = 'failed' WHERE status = 'running'"
            )
            return cur.rowcount

    def create_run(
        self,
        twin_id: str,
        identity_version: int,
        specs: list[ScenarioSpec],
        parent_run_id: str = "",
    ) -> SimulationRun:
        run_id = f"run_{uuid4().hex[:8]}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO simulation_runs (id, twin_id, identity_version, status,"
                " parent_run_id, created_at) VALUES (?, ?, ?, 'running', ?, ?)",
                (run_id, twin_id, identity_version, parent_run_id, _utcnow_iso()),
            )
            for spec in specs:
                conn.execute(
                    "INSERT INTO scenario_results (run_id, scenario_id, spec_json)"
                    " VALUES (?, ?, ?)",
                    (run_id, spec.scenario_id, spec.model_dump_json()),
                )
        return self.get_run(run_id)  # type: ignore[return-value]

    def get_run(self, run_id: str) -> SimulationRun | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM simulation_runs WHERE id = ?", (run_id,)
            ).fetchone()
            if row is None:
                return None
            srows = conn.execute(
                "SELECT * FROM scenario_results WHERE run_id = ? ORDER BY rowid",
                (run_id,),
            ).fetchall()
            scenarios = [_row_to_result(r) for r in srows]
            return SimulationRun(
                id=row["id"],
                twin_id=row["twin_id"],
                identity_version=row["identity_version"],
                status=row["status"],
                parent_run_id=row["parent_run_id"],
                created_at=row["created_at"],
                scenarios=scenarios,
            )

    def list_runs(
        self, twin_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[SimulationRun]:
        with self._connect() as conn:
            if twin_id:
                rows = conn.execute(
                    "SELECT * FROM simulation_runs WHERE twin_id = ?"
                    " ORDER BY created_at DESC LIMIT ? OFFSET ?",
                    (twin_id, limit, offset),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM simulation_runs ORDER BY created_at DESC"
                    " LIMIT ? OFFSET ?",
                    (limit, offset),
                ).fetchall()
            if not rows:
                return []
            ids = [r["id"] for r in rows]
            marks = ",".join("?" for _ in ids)
            srows = conn.execute(
                f"SELECT * FROM scenario_results WHERE run_id IN ({marks}) ORDER BY rowid",
                ids,
            ).fetchall()
            by_run: dict[str, list[ScenarioResult]] = {i: [] for i in ids}
            for sr in srows:
                by_run[sr["run_id"]].append(_row_to_result(sr))
            return [
                SimulationRun(
                    id=r["id"],
                    twin_id=r["twin_id"],
                    identity_version=r["identity_version"],
                    status=r["status"],
                    parent_run_id=r["parent_run_id"],
                    created_at=r["created_at"],
                    scenarios=by_run[r["id"]],
                )
                for r in rows
            ]

    def update_scenario(self, run_id: str, result: ScenarioResult) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE scenario_results SET status = ?, output_json = ?, error = ?,"
                " model = ?, latency_ms = ?, prompt_version = ?"
                " WHERE run_id = ? AND scenario_id = ?",
                (
                    result.status,
                    result.output.model_dump_json() if result.output else "",
                    result.error,
                    result.model,
                    result.latency_ms,
                    result.prompt_version,
                    run_id,
                    result.scenario_id,
                ),
            )

    def update_run_status(self, run_id: str, status: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE simulation_runs SET status = ? WHERE id = ?", (status, run_id)
            )


def _row_to_result(r: sqlite3.Row) -> ScenarioResult:
    from .schemas import SimulationOutput

    return ScenarioResult(
        scenario_id=r["scenario_id"],
        spec=ScenarioSpec.model_validate_json(r["spec_json"]),
        status=r["status"],
        output=SimulationOutput.model_validate_json(r["output_json"]) if r["output_json"] else None,
        error=r["error"],
        model=r["model"],
        latency_ms=r["latency_ms"],
        prompt_version=r["prompt_version"],
    )
