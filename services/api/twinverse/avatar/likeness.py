"""Local likeness store: the user's own photo + voice sample.

Everything stays on this machine under <avatar_dir>/likeness/. Uploads
require an explicit self-consent flag, and DELETE removes every byte.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
VOICE_EXTS = {".wav", ".mp3", ".m4a", ".ogg", ".webm", ".flac"}
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_VOICE_BYTES = 15 * 1024 * 1024


class LikenessError(ValueError):
    """Upload validation failed; safe to show the message to the user."""


@dataclass
class Likeness:
    photo: Path
    voice: Path

    @property
    def present(self) -> bool:
        return self.photo.is_file() and self.voice.is_file()


def likeness_paths(avatar_dir: str | Path) -> Likeness:
    base = Path(avatar_dir) / "likeness"
    photo = next((p for p in base.glob("photo.*") if p.suffix.lower() in PHOTO_EXTS), base / "photo.jpg")
    voice = next((p for p in base.glob("voice.*") if p.suffix.lower() in VOICE_EXTS), base / "voice.wav")
    return Likeness(photo=photo, voice=voice)


def _check_consent(consent: str) -> None:
    if (consent or "").strip().lower() not in ("true", "1", "on", "yes"):
        raise LikenessError("Please confirm this is your own face and voice.")


def save_likeness(
    avatar_dir: str | Path,
    *,
    consent: str,
    photo_name: str,
    photo_type: str,
    photo_bytes: bytes,
    voice_name: str,
    voice_type: str,
    voice_bytes: bytes,
) -> Likeness:
    _check_consent(consent)
    photo_ext = Path(photo_name or "").suffix.lower()
    if photo_ext not in PHOTO_EXTS or not (photo_type or "").startswith("image/"):
        raise LikenessError(f"Photo must be one of {sorted(PHOTO_EXTS)} (got {photo_ext or 'none'}).")
    if len(photo_bytes) == 0 or len(photo_bytes) > MAX_PHOTO_BYTES:
        raise LikenessError("Photo must be non-empty and under 10 MB.")
    voice_ext = Path(voice_name or "").suffix.lower()
    if voice_ext not in VOICE_EXTS or not (
        (voice_type or "").startswith("audio/")
        or (voice_type or "") in ("application/octet-stream", "video/mp4", "")
    ):
        raise LikenessError(f"Voice sample must be one of {sorted(VOICE_EXTS)} (got {voice_ext or 'none'}).")
    if len(voice_bytes) == 0 or len(voice_bytes) > MAX_VOICE_BYTES:
        raise LikenessError("Voice sample must be non-empty and under 15 MB.")

    base = Path(avatar_dir) / "likeness"
    base.mkdir(parents=True, exist_ok=True)
    for stale in base.glob("photo.*"):
        stale.unlink()
    for stale in base.glob("voice.*"):
        stale.unlink()
    photo_path = base / f"photo{photo_ext}"
    voice_path = base / f"voice{voice_ext}"
    photo_path.write_bytes(photo_bytes)
    voice_path.write_bytes(voice_bytes)
    return Likeness(photo=photo_path, voice=voice_path)


def delete_likeness(avatar_dir: str | Path) -> None:
    base = Path(avatar_dir) / "likeness"
    for stale in list(base.glob("photo.*")) + list(base.glob("voice.*")):
        stale.unlink()
