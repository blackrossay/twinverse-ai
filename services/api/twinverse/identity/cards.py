"""Identity card (avatar) generation and storage."""

from pathlib import Path

from ..settings import Settings
from .schemas import TwinDetail


def card_path(twin_id: str, card_dir: str | None = None) -> Path:
    base = Path(card_dir or Settings().twinverse_card_dir)
    base.mkdir(parents=True, exist_ok=True)
    return base / f"{twin_id}.png"


def build_prompt(twin: TwinDetail) -> str:
    skills = ", ".join(twin.payload.skills[:4]) or "general professional"
    style = twin.payload.communication_style.get("tone", "balanced")
    return (
        "Flat vector avatar badge for a fictional professional persona,"
        f" abstract geometric emblem suggesting {skills}, {style} mood,"
        " violet and indigo on dark navy, no text, no letters, no real person,"
        " no photorealistic face, minimalist, centered composition"
    )


def save_card(twin_id: str, png: bytes, card_dir: str | None = None) -> Path:
    path = card_path(twin_id, card_dir)
    path.write_bytes(png)
    return path


def delete_card(twin_id: str, card_dir: str | None = None) -> None:
    card_path(twin_id, card_dir).unlink(missing_ok=True)
