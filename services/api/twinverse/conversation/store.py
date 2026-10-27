"""SQLite store for conversation sessions and turns."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from ..db import connect, init_schema
from .schemas import Conversation, Turn

_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    twin_id TEXT NOT NULL,
    identity_version INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_turns (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    turn_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conv_twin ON conversations (twin_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_turns_conv ON conversation_turns (conversation_id, created_at);
"""


def _now() -> datetime:
    return datetime.now(UTC)


class ConversationStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        init_schema(self._db_path, _SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return connect(self._db_path)

    def create_session(self, twin_id: str, identity_version: int, title: str = "") -> Conversation:
        now = _now()
        session_id = f"conv_{uuid4().hex[:10]}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO conversations (id, twin_id, identity_version, title,"
                " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, twin_id, identity_version, title, now.isoformat(), now.isoformat()),
            )
        return self.get_session(session_id)  # type: ignore[return-value]

    def get_session(self, session_id: str) -> Conversation | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?", (session_id,)
            ).fetchone()
            if row is None:
                return None
            trows = conn.execute(
                "SELECT turn_json FROM conversation_turns WHERE conversation_id = ?"
                " ORDER BY created_at, rowid",
                (session_id,),
            ).fetchall()
            return Conversation(
                id=row["id"],
                twin_id=row["twin_id"],
                identity_version=row["identity_version"],
                title=row["title"],
                created_at=datetime.fromisoformat(row["created_at"]),
                updated_at=datetime.fromisoformat(row["updated_at"]),
                turns=[Turn.model_validate_json(r["turn_json"]) for r in trows],
            )

    def list_sessions(self, twin_id: str, limit: int = 20) -> list[Conversation]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id FROM conversations WHERE twin_id = ?"
                " ORDER BY updated_at DESC LIMIT ?",
                (twin_id, limit),
            ).fetchall()
        sessions = [self.get_session(r["id"]) for r in rows]
        return [s for s in sessions if s is not None]

    def add_turn(self, session_id: str, turn: Turn) -> Turn:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO conversation_turns (id, conversation_id, role, text,"
                " turn_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    turn.id,
                    session_id,
                    turn.role,
                    turn.text,
                    turn.model_dump_json(),
                    turn.created_at.isoformat(),
                ),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (_now().isoformat(), session_id),
            )
        return turn

    def set_title_if_empty(self, session_id: str, title: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE conversations SET title = ? WHERE id = ? AND title = ''",
                (title[:120], session_id),
            )

    def get_turn(self, turn_id: str) -> Turn | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT turn_json FROM conversation_turns WHERE id = ?", (turn_id,)
            ).fetchone()
        return Turn.model_validate_json(row["turn_json"]) if row else None

    def update_turn(self, turn: Turn) -> Turn:
        with self._connect() as conn:
            conn.execute(
                "UPDATE conversation_turns SET turn_json = ?, text = ? WHERE id = ?",
                (turn.model_dump_json(), turn.text, turn.id),
            )
        return turn

    def delete_session(self, session_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM conversation_turns WHERE conversation_id = ?", (session_id,))
            cur = conn.execute("DELETE FROM conversations WHERE id = ?", (session_id,))
            return cur.rowcount > 0

    def recover_interrupted_media(self) -> int:
        """Fail voice/video renders left in-flight by a previous process."""
        count = 0
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT turn_json FROM conversation_turns"
                " WHERE turn_json LIKE '%\"voice_status\": \"rendering\"%'"
                " OR turn_json LIKE '%\"video_status\": \"rendering\"%'"
                " OR turn_json LIKE '%\"voice_status\": \"queued\"%'"
                " OR turn_json LIKE '%\"video_status\": \"queued\"%'"
            ).fetchall()
            for r in rows:
                turn = Turn.model_validate_json(r["turn_json"])
                changed = False
                for field in ("voice_status", "video_status"):
                    if getattr(turn, field) in ("queued", "rendering"):
                        setattr(turn, field, "failed")
                        changed = True
                if changed:
                    turn.media_error = "interrupted by server restart"
                    self.update_turn(turn)
                    count += 1
        return count
