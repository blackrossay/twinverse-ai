"""SQLite-backed versioned identity store. Versions are immutable."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from ..db import connect, init_schema
from .schemas import IdentityPayload, Twin, TwinDetail

_SCHEMA = """
CREATE TABLE IF NOT EXISTS twins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    profile_type TEXT NOT NULL DEFAULT 'professional',
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS identity_versions (
    twin_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (twin_id, version),
    FOREIGN KEY (twin_id) REFERENCES twins(id) ON DELETE CASCADE
);
"""


def _utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


class IdentityStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        init_schema(self._db_path, _SCHEMA)

    def _connect(self):
        return connect(self._db_path)

    def create_twin(
        self, name: str, payload: IdentityPayload, profile_type: str = "professional"
    ) -> TwinDetail:
        twin_id = f"twin_{uuid4().hex[:8]}"
        now = _utcnow_iso()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO twins (id, name, profile_type, current_version,"
                " created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)",
                (twin_id, name, profile_type, now, now),
            )
            conn.execute(
                "INSERT INTO identity_versions (twin_id, version, payload_json,"
                " created_at) VALUES (?, 1, ?, ?)",
                (twin_id, payload.model_dump_json(), now),
            )
        return self.get_twin(twin_id)  # type: ignore[return-value]

    def get_twin(self, twin_id: str, version: int | None = None) -> TwinDetail | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM twins WHERE id = ?", (twin_id,)).fetchone()
            if row is None:
                return None
            want = version or row["current_version"]
            vrow = conn.execute(
                "SELECT payload_json FROM identity_versions WHERE twin_id = ?"
                " AND version = ?",
                (twin_id, want),
            ).fetchone()
            if vrow is None:
                return None
            return TwinDetail(
                id=row["id"],
                name=row["name"],
                profile_type=row["profile_type"],
                current_version=row["current_version"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                version=want,
                payload=IdentityPayload.model_validate_json(vrow["payload_json"]),
            )

    def list_twins(self, limit: int = 100, offset: int = 0) -> list[Twin]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM twins ORDER BY created_at LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            return [
                Twin(
                    id=r["id"],
                    name=r["name"],
                    profile_type=r["profile_type"],
                    current_version=r["current_version"],
                    created_at=r["created_at"],
                    updated_at=r["updated_at"],
                )
                for r in rows
            ]

    def list_versions(self, twin_id: str) -> list[int]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT version FROM identity_versions WHERE twin_id = ? ORDER BY version",
                (twin_id,),
            ).fetchall()
            return [r["version"] for r in rows]

    def update_twin(
        self, twin_id: str, payload: IdentityPayload, name: str | None = None
    ) -> TwinDetail | None:
        now = _utcnow_iso()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT current_version FROM twins WHERE id = ?", (twin_id,)
            ).fetchone()
            if row is None:
                return None
            new_version = row["current_version"] + 1
            conn.execute(
                "INSERT INTO identity_versions (twin_id, version, payload_json,"
                " created_at) VALUES (?, ?, ?, ?)",
                (twin_id, new_version, payload.model_dump_json(), now),
            )
            conn.execute(
                "UPDATE twins SET current_version = ?, updated_at = ?"
                + (", name = ?" if name else "")
                + " WHERE id = ?",
                (new_version, now, *((name,) if name else ()), twin_id),
            )
        return self.get_twin(twin_id)

    def delete_twin(self, twin_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM identity_versions WHERE twin_id = ?", (twin_id,))
            cur = conn.execute("DELETE FROM twins WHERE id = ?", (twin_id,))
            return cur.rowcount > 0
