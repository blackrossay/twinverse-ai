"""Kokoro TTS (Apache 2.0): ElevenLabs-style catalogue voices, fully local.

82M-parameter open model, ~realtime on CPU, 50+ catalogue voices. Used two
ways: (1) studio instant voices — fast, natural, no cloning; (2) as the
base speaker inside OpenVoice tone conversion for higher-quality clones.
Model files live under models/kokoro/ (external disk via symlink is fine).
"""

from __future__ import annotations

import threading
from pathlib import Path

from ..settings import Settings
from .pipeline import PipelineError

_lock = threading.Lock()
_instance = None

# Curated catalogue (full list comes from the model at runtime).
FEATURED_VOICES = [
    ("af_heart", "Heart · warm female (US)"),
    ("af_bella", "Bella · bright female (US)"),
    ("af_nova", "Nova · upbeat female (US)"),
    ("am_adam", "Adam · warm male (US)"),
    ("am_michael", "Michael · calm male (US)"),
    ("bf_emma", "Emma · female (UK)"),
    ("bm_george", "George · male (UK)"),
    ("af_sky", "Sky · soft female (US)"),
]


def _paths(settings: Settings) -> tuple[Path, Path]:
    base = Path(settings.twinverse_kokoro_dir)
    return base / "kokoro-v1.0.onnx", base / "voices-v1.0.bin"


def kokoro_available(settings: Settings) -> bool:
    model, voices = _paths(settings)
    if not (model.is_file() and voices.is_file()):
        return False
    try:
        import kokoro_onnx  # noqa: F401
    except ImportError:
        return False
    return True


def _get(settings: Settings):
    global _instance
    if _instance is None:
        with _lock:
            if _instance is None:
                model, voices = _paths(settings)
                if not (model.is_file() and voices.is_file()):
                    raise PipelineError(
                        "Kokoro model missing: download kokoro-v1.0.onnx + voices-v1.0.bin"
                        f" into {model.parent}/ (see docs/AVATAR.md)"
                    )
                try:
                    from kokoro_onnx import Kokoro
                except ImportError:
                    raise PipelineError(
                        "Kokoro not installed: pip install kokoro-onnx (avatar venv)"
                    ) from None
                _instance = Kokoro(str(model), str(voices))
    return _instance


def list_voices(settings: Settings) -> list[dict]:
    if not kokoro_available(settings):
        return []
    try:
        all_voices = _get(settings).get_voices()
    except Exception:
        return [{"id": vid, "name": label} for vid, label in FEATURED_VOICES]
    featured = [vid for vid, _ in FEATURED_VOICES]
    labels = dict(FEATURED_VOICES)
    ordered = [v for v in featured if v in all_voices] + [v for v in all_voices if v not in featured]
    return [{"id": v, "name": labels.get(v, v)} for v in ordered]


def synthesize(text: str, voice: str, out_wav: Path, settings: Settings, speed: float = 1.0) -> Path:
    """Write text spoken in a Kokoro catalogue voice to out_wav."""
    kokoro = _get(settings)
    if voice not in kokoro.get_voices():
        raise PipelineError(f"unknown Kokoro voice: {voice}")
    try:
        import soundfile as sf

        samples, sr = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
        out_wav.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(out_wav), samples, sr)
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError(f"Kokoro synthesis failed: {exc}") from None
    return out_wav
