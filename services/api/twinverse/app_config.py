"""UI-managed app settings, persisted in SQLite and layered over env.

Lets the owner choose render location (local machine vs cloud inference)
from the app's Your Clone page instead of editing env files. Only
non-model settings live here; the inference token is stored server-side
and only ever returned as a hint.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .db import connect, init_schema

_SCHEMA = """
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

_KEYS = ("avatar_provider", "inference_url", "inference_token")


class AppConfig:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        init_schema(self._db_path, _SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return connect(self._db_path)

    def get_all(self) -> dict[str, str]:
        try:
            with self._connect() as conn:
                rows = conn.execute("SELECT key, value FROM app_config").fetchall()
            return {r["key"]: r["value"] for r in rows}
        except Exception:
            return {}

    def set_many(self, values: dict[str, str]) -> dict[str, str]:
        with self._connect() as conn:
            for key, value in values.items():
                if key not in _KEYS:
                    continue
                if value:
                    conn.execute(
                        "INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)",
                        (key, value),
                    )
                else:
                    conn.execute("DELETE FROM app_config WHERE key = ?", (key,))
        return self.get_all()


def apply_overrides(settings):
    """Return settings with UI-saved inference overrides applied (if any)."""
    try:
        overrides = AppConfig(settings.twinverse_db_path).get_all()
    except Exception:
        return settings
    update = {}
    if overrides.get("avatar_provider") in ("local", "http"):
        update["twinverse_avatar_provider"] = overrides["avatar_provider"]
    if "inference_url" in overrides:
        update["twinverse_inference_url"] = overrides["inference_url"]
    if overrides.get("inference_token"):
        update["twinverse_inference_token"] = overrides["inference_token"]
    if not update:
        return settings
    return settings.model_copy(update=update)
