"""SQLite store for simulation runs and scenario results."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

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
"""


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SimulationStore:
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

    def list_runs(self, twin_id: str | None = None) -> list[SimulationRun]:
        with self._connect() as conn:
            if twin_id:
                rows = conn.execute(
                    "SELECT id FROM simulation_runs WHERE twin_id = ? ORDER BY created_at DESC",
                    (twin_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id FROM simulation_runs ORDER BY created_at DESC"
                ).fetchall()
            runs = [self.get_run(r["id"]) for r in rows]
            return [r for r in runs if r is not None]

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
