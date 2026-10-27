"""Build the short spoken script a cloned avatar reads for a run's verdict."""

from __future__ import annotations

MAX_SCRIPT_CHARS = 700  # ~45-60s of speech; providers charge per second
OPENING = "Here's my verdict, in my own words. "


def build_verdict_script(summary: str) -> str:
    """Deterministic script: fixed opening + whitespace-collapsed summary, word-truncated."""
    body = " ".join((summary or "").split())
    if not body:
        return OPENING.strip()
    budget = MAX_SCRIPT_CHARS - len(OPENING)
    if len(body) > budget:
        cut = body[:budget].rsplit(" ", 1)[0].rstrip(" ,;:")
        body = (cut or body[:budget]) + "…"
    return OPENING + body
