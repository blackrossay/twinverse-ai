"""Helpers for model text output: cached prompt files, tolerant JSON parsing."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=16)
def load_prompt(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def parse_json_object(text: str) -> dict:
    """Parse a JSON object from model output.

    Tolerates ```json fences and surrounding prose by falling back to the
    outermost brace span. Raises ValueError on anything else.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        lines = lines[1:]  # opening fence (``` or ```json)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("not valid JSON: no object found") from None
        try:
            data = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise ValueError(f"not valid JSON: {exc}") from None
    if not isinstance(data, dict):
        raise ValueError("top-level JSON must be an object")
    return data
