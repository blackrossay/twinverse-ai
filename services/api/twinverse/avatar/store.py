"""SQLite store for talking-verdict render jobs."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .schemas import TalkingVerdict

_SCHEMA = """
CREATE TABLE IF NOT EXISTS talking_verdicts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_job_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    render_mode TEXT NOT NULL DEFAULT 'portrait',
    script TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_talking_verdicts_run ON talking_verdicts (run_id, created_at);
"""


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AvatarStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            cols = [r[1] for r in conn.execute("PRAGMA table_info(talking_verdicts)")]
            if "render_mode" not in cols:  # pre-lipsync databases
                conn.execute(
                    "ALTER TABLE talking_verdicts ADD COLUMN render_mode"
                    " TEXT NOT NULL DEFAULT 'portrait'"
                )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def save(self, verdict: TalkingVerdict) -> TalkingVerdict:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO talking_verdicts"
                " (id, run_id, provider, provider_job_id, status, render_mode, script,"
                " video_url, error, created_at, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    verdict.id,
                    verdict.run_id,
                    verdict.provider,
                    verdict.provider_job_id,
                    verdict.status,
                    verdict.render_mode,
                    verdict.script,
                    verdict.video_url,
                    verdict.error,
                    verdict.created_at.isoformat(),
                    verdict.updated_at.isoformat(),
                ),
            )
        return verdict

    def new_job(self, run_id: str, provider: str) -> TalkingVerdict:
        now = datetime.now(timezone.utc)
        return self.save(
            TalkingVerdict(
                id=f"tv_{uuid4().hex[:8]}",
                run_id=run_id,
                provider=provider,
                created_at=now,
                updated_at=now,
            )
        )

    def get(self, verdict_id: str) -> TalkingVerdict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM talking_verdicts WHERE id = ?", (verdict_id,)
            ).fetchone()
        return _row_to_verdict(row) if row else None

    def latest_for_run(self, run_id: str) -> TalkingVerdict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM talking_verdicts WHERE run_id = ?"
                " ORDER BY created_at DESC LIMIT 1",
                (run_id,),
            ).fetchone()
        return _row_to_verdict(row) if row else None

    def touch(self, verdict: TalkingVerdict, **fields: object) -> TalkingVerdict:
        updated = verdict.model_copy(
            update={**fields, "updated_at": datetime.now(timezone.utc)}
        )
        return self.save(updated)


def _row_to_verdict(r: sqlite3.Row) -> TalkingVerdict:
    return TalkingVerdict(
        id=r["id"],
        run_id=r["run_id"],
        provider=r["provider"],
        provider_job_id=r["provider_job_id"],
        status=r["status"],
        render_mode=r["render_mode"] if "render_mode" in r.keys() else "portrait",
        script=r["script"],
        video_url=r["video_url"],
        error=r["error"],
        created_at=datetime.fromisoformat(r["created_at"]),
        updated_at=datetime.fromisoformat(r["updated_at"]),
    )
