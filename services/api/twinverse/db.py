"""Shared SQLite plumbing: WAL connections, one-time schema setup."""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

_lock = threading.Lock()
_initialized: set[tuple[str, int]] = set()


def connect(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(Path(db_path), timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(db_path: str | Path, schema: str) -> None:
    """Run DDL once per (process, path, schema) instead of on every request."""
    key = (str(Path(db_path)), hash(schema))
    with _lock:
        if key in _initialized:
            return
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with connect(path) as conn:
            conn.executescript(schema)
        _initialized.add(key)
