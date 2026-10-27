"""SQLite store for live sessions, agenda, and chat messages."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from ..db import connect, init_schema
from .schemas import AgendaPoint, LiveMessage, LiveSession

_SCHEMA = """
CREATE TABLE IF NOT EXISTS live_sessions (
    id TEXT PRIMARY KEY,
    twin_id TEXT NOT NULL,
    identity_version INTEGER NOT NULL,
    session_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS live_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    msg_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_live_twin ON live_sessions (twin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_msgs ON live_messages (session_id, created_at);
CREATE TABLE IF NOT EXISTS live_destinations (
    session_id TEXT PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT 'youtube',
    rtmp_url TEXT NOT NULL,
    stream_key TEXT NOT NULL,
    key_last4 TEXT NOT NULL DEFAULT ''
);
"""


def _now() -> datetime:
    return datetime.now(UTC)


class LiveStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        init_schema(self._db_path, _SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return connect(self._db_path)

    def create_session(
        self,
        twin_id: str,
        identity_version: int,
        title: str,
        mode: str,
        platforms: list[str],
        agenda: list[str],
    ) -> LiveSession:
        session = LiveSession(
            id=f"live_{uuid4().hex[:10]}",
            twin_id=twin_id,
            identity_version=identity_version,
            title=title,
            mode=mode,
            platforms=platforms,
            agenda=[AgendaPoint(text=a.strip()) for a in agenda if a.strip()],
        )
        now = _now().isoformat()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO live_sessions (id, twin_id, identity_version, session_json,"
                " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (session.id, twin_id, identity_version, session.model_dump_json(), now, now),
            )
        return session

    def get_session(self, session_id: str) -> LiveSession | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT session_json FROM live_sessions WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                return None
            session = LiveSession.model_validate_json(row["session_json"])
            mrows = conn.execute(
                "SELECT msg_json FROM live_messages WHERE session_id = ?"
                " ORDER BY created_at, rowid",
                (session_id,),
            ).fetchall()
            session.messages = [LiveMessage.model_validate_json(r["msg_json"]) for r in mrows]
            return session

    def list_sessions(self, twin_id: str, limit: int = 20) -> list[LiveSession]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id FROM live_sessions WHERE twin_id = ?"
                " ORDER BY created_at DESC LIMIT ?",
                (twin_id, limit),
            ).fetchall()
        sessions = [self.get_session(r["id"]) for r in rows]
        return [s for s in sessions if s is not None]

    def save_session(self, session: LiveSession) -> LiveSession:
        with self._connect() as conn:
            conn.execute(
                "UPDATE live_sessions SET session_json = ?, updated_at = ? WHERE id = ?",
                (
                    session.model_dump_json(exclude={"messages"}),
                    _now().isoformat(),
                    session.id,
                ),
            )
        return session

    def add_message(self, session_id: str, msg: LiveMessage) -> LiveMessage:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO live_messages (id, session_id, msg_json, created_at)"
                " VALUES (?, ?, ?, ?)",
                (msg.id, session_id, msg.model_dump_json(), msg.created_at.isoformat()),
            )
        return msg

    def get_message(self, msg_id: str) -> LiveMessage | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT msg_json FROM live_messages WHERE id = ?", (msg_id,)
            ).fetchone()
        return LiveMessage.model_validate_json(row["msg_json"]) if row else None

    def update_message(self, msg: LiveMessage) -> LiveMessage:
        with self._connect() as conn:
            conn.execute(
                "UPDATE live_messages SET msg_json = ? WHERE id = ?",
                (msg.model_dump_json(), msg.id),
            )
        return msg

    def save_destination(self, session_id: str, rtmp_url: str, stream_key: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO live_destinations"
                " (session_id, platform, rtmp_url, stream_key, key_last4)"
                " VALUES (?, 'youtube', ?, ?, ?)",
                (session_id, rtmp_url, stream_key, stream_key[-4:]),
            )

    def get_destination(self, session_id: str) -> dict | None:
        """Full destination incl. key — server-side only, never serialized."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM live_destinations WHERE session_id = ?", (session_id,)
            ).fetchone()
        return dict(row) if row else None

    def delete_destination(self, session_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM live_destinations WHERE session_id = ?", (session_id,))

    def delete_session(self, session_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM live_destinations WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM live_messages WHERE session_id = ?", (session_id,))
            cur = conn.execute("DELETE FROM live_sessions WHERE id = ?", (session_id,))
            return cur.rowcount > 0

    def recover_interrupted_media(self) -> int:
        count = 0
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT msg_json FROM live_messages"
                " WHERE msg_json LIKE '%\"voice_status\": \"rendering\"%'"
                " OR msg_json LIKE '%\"video_status\": \"rendering\"%'"
                " OR msg_json LIKE '%\"voice_status\": \"queued\"%'"
                " OR msg_json LIKE '%\"video_status\": \"queued\"%'"
            ).fetchall()
            for r in rows:
                msg = LiveMessage.model_validate_json(r["msg_json"])
                changed = False
                for field in ("voice_status", "video_status"):
                    if getattr(msg, field) in ("queued", "rendering"):
                        setattr(msg, field, "failed")
                        changed = True
                if changed:
                    msg.media_error = "interrupted by server restart"
                    self.update_message(msg)
                    count += 1
        return count
