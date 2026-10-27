"""User accounts + HMAC-signed session tokens (stdlib only, no new deps).

Passwords: PBKDF2-HMAC-SHA256, 240k iterations, per-user salt.
Tokens: base64(user_id.exp) + HMAC signature, 7-day expiry.
Full per-user data tenancy (owner_id on twins/sessions) is the next
migration on top of this foundation — see docs/CLOUD.md.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from pydantic import BaseModel, Field

from ..db import connect, init_schema

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

_TOKEN_TTL_S = 7 * 24 * 3600
_PBKDF2_ROUNDS = 240_000


class User(BaseModel):
    id: str
    email: str
    name: str = ""
    created_at: datetime


class Signup(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(default="", max_length=100)


class Login(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class AuthResult(BaseModel):
    token: str
    user: User


def _hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"{salt.hex()}${digest.hex()}"


def _check_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), _PBKDF2_ROUNDS
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


class UserStore:
    def __init__(self, db_path: str | Path) -> None:
        self._db_path = Path(db_path)
        init_schema(self._db_path, _SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return connect(self._db_path)

    def create_user(self, email: str, password: str, name: str = "") -> User | None:
        email = email.strip().lower()
        user = User(
            id=f"user_{uuid4().hex[:10]}",
            email=email,
            name=name.strip(),
            created_at=datetime.now(UTC),
        )
        try:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO users (id, email, name, password_hash, created_at)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (user.id, user.email, user.name, _hash_password(password),
                     user.created_at.isoformat()),
                )
        except sqlite3.IntegrityError:
            return None
        return user

    def verify(self, email: str, password: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email.strip().lower(),)
            ).fetchone()
        if row is None or not _check_password(password, row["password_hash"]):
            return None
        return User(
            id=row["id"], email=row["email"], name=row["name"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    def get_user(self, user_id: str) -> User | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            return None
        return User(
            id=row["id"], email=row["email"], name=row["name"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )


def _secret(settings) -> bytes:
    return (settings.twinverse_auth_secret or "dev-only-secret-change-me").encode()


def issue_token(user_id: str, settings) -> str:
    exp = int(time.time()) + _TOKEN_TTL_S
    payload = base64.urlsafe_b64encode(f"{user_id}.{exp}".encode()).decode().rstrip("=")
    sig = hmac.new(_secret(settings), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_token(token: str, settings) -> str | None:
    """Return user_id if the token is well-signed and unexpired."""
    try:
        payload, sig = token.rsplit(".", 1)
        expected = hmac.new(_secret(settings), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)).decode()
        user_id, exp = raw.rsplit(".", 1)
        if int(exp) < int(time.time()):
            return None
        return user_id
    except Exception:
        return None
