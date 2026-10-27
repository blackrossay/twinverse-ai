"""Local open-source avatar pipeline.

Voice: MeloTTS base speech (MIT) + OpenVoice V2 tone conversion (MIT) so the
verdict speaks in the user's cloned voice. Video: a gently animated portrait
made with imageio-ffmpeg (MIT, static ffmpeg build) on any machine, or
MuseTalk lip-sync (MIT code, weights free incl. commercial) when an NVIDIA
GPU + MuseTalk checkout are present. Everything runs locally; no likeness
data ever leaves this machine.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

from ..settings import Settings
from .likeness import Likeness

MELO_INSTALL = "pip install git+https://github.com/myshell-ai/MeloTTS.git"
OPENVOICE_INSTALL = "pip install git+https://github.com/myshell-ai/OpenVoice.git"


class PipelineError(RuntimeError):
    """Render failed with a message safe to show the user."""


@dataclass
class PipelineInfo:
    voice_ready: bool
    missing: list[str]
    lipsync_ready: bool
    lipsync_note: str
    device: str  # cpu | cuda


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
    except ImportError:
        raise PipelineError(
            "video tools missing: pip install imageio-ffmpeg (see docs/AVATAR.md)"
        ) from None
    return imageio_ffmpeg.get_ffmpeg_exe()


def check_pipeline(settings: Settings) -> PipelineInfo:
    missing: list[str] = []
    try:
        import melo.api  # noqa: F401
    except ImportError:
        missing.append(f"voice engine (MeloTTS, MIT): {MELO_INSTALL}")
    try:
        import openvoice  # noqa: F401
    except ImportError:
        missing.append(f"voice cloning (OpenVoice V2, MIT): {OPENVOICE_INSTALL}")
    ckpt = Path(settings.twinverse_openvoice_ckpt)
    needed = [
        ckpt / "converter" / "config.json",
        ckpt / "converter" / "checkpoint.pth",
        ckpt / "base_speakers" / "ses" / "en-newest.pth",
    ]
    if not all(p.is_file() for p in needed):
        missing.append(
            f"voice models: download OpenVoice V2 checkpoints into {ckpt}/ (see docs/AVATAR.md)"
        )
    try:
        import imageio_ffmpeg  # noqa: F401
    except ImportError:
        missing.append("video tools (imageio-ffmpeg, MIT): pip install imageio-ffmpeg")

    device = "cpu"
    try:
        import torch

        if torch.cuda.is_available():
            device = "cuda"
    except ImportError:
        missing.append("compute (PyTorch): pip install torch")

    repo = Path(settings.twinverse_musetalk_repo) if settings.twinverse_musetalk_repo else None
    lipsync_ready = (
        device == "cuda" and repo is not None and (repo / "scripts" / "inference.py").is_file()
    )
    if lipsync_ready:
        note = "MuseTalk lip-sync on CUDA GPU."
    elif device != "cuda":
        note = "Lip-sync needs an NVIDIA GPU; using animated portrait on this machine."
    else:
        note = (
            "Lip-sync needs TWINVERSE_MUSETALK_REPO pointing at a MuseTalk"
            " checkout; using animated portrait."
        )
    return PipelineInfo(
        voice_ready=not missing,
        missing=missing,
        lipsync_ready=lipsync_ready,
        lipsync_note=note,
        device=device,
    )


def _run(cmd: list[str], label: str, cwd: Path | None = None, timeout: int = 600) -> None:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise PipelineError(f"{label} timed out after {timeout}s.") from None
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().replace("\n", " ")[:500]
        raise PipelineError(f"{label} failed: {tail or 'unknown error'}")


def _to_wav(src: Path, dst: Path) -> None:
    _run(
        [ffmpeg_exe(), "-y", "-i", str(src), "-ac", "1", "-ar", "24000", str(dst)],
        "voice sample conversion",
        timeout=120,
    )


def _wav_duration(path: Path) -> float:
    try:
        with wave.open(str(path), "rb") as fh:
            return fh.getnframes() / fh.getframerate()
    except (wave.Error, OSError, ZeroDivisionError):
        raise PipelineError("cloned audio is unreadable; voice render failed.") from None


def clone_voice(script_text: str, ref_audio: Path, out_wav: Path, settings: Settings) -> Path:
    """Render script_text in the cloned voice. Returns the wav path."""
    try:
        import torch
        from melo.api import TTS
        from openvoice import se_extractor
        from openvoice.api import ToneColorConverter
    except ImportError as exc:
        raise PipelineError(f"voice stack missing ({exc}); see docs/AVATAR.md") from None
    try:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        ckpt = Path(settings.twinverse_openvoice_ckpt)
        workdir = out_wav.parent
        workdir.mkdir(parents=True, exist_ok=True)
        ref_wav = workdir / "ref.wav"
        _to_wav(ref_audio, ref_wav)

        base_wav = workdir / "base.wav"
        tts = TTS(language="EN", device=device)
        speaker_ids = tts.hps.data.spk2id
        tts.tts_to_file(script_text, speaker_ids["EN-US"], str(base_wav), speed=1.0)

        converter = ToneColorConverter(str(ckpt / "converter" / "config.json"), device=device)
        converter.load_ckpt(str(ckpt / "converter" / "checkpoint.pth"))
        # Silero VAD downloads via torch.hub, which prompts interactively on
        # first use — pre-trust it so background renders never hang.
        try:
            torch.hub.load("snakers4/silero-vad", "silero_vad", trust_repo=True)
        except Exception:
            pass
        target_se, _ = se_extractor.get_se(str(ref_wav), converter, vad=True)
        source_se = torch.load(
            str(ckpt / "base_speakers" / "ses" / "en-newest.pth"), map_location=device
        )
        converter.convert(
            audio_src_path=str(base_wav),
            src_se=source_se,
            tgt_se=target_se,
            output_path=str(out_wav),
            message="@MyShell",
        )
        return out_wav
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError(f"voice render failed: {exc}".replace("\n", " ")[:400]) from None


def portrait_video(photo: Path, audio_wav: Path, out_mp4: Path) -> Path:
    """Gently animated portrait + cloned voice. Runs on any CPU."""
    ff = ffmpeg_exe()
    dur = _wav_duration(audio_wav)
    fancy = (
        "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,"
        "zoompan=z='min(1+0.0008*on,1.08)':d=1:s=1280x720:fps=25"
    )
    plain = "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=25"
    for vf in (fancy, plain):
        cmd = [
            ff, "-y", "-loop", "1", "-i", str(photo), "-i", str(audio_wav),
            "-filter_complex", f"[0:v]{vf}[v]", "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
            "-t", f"{dur + 0.5:.2f}", str(out_mp4),
        ]
        try:
            _run(cmd, "portrait video", timeout=900)
            return out_mp4
        except PipelineError:
            if vf == plain:
                raise
    return out_mp4


def musetalk_video(
    photo: Path, audio_wav: Path, out_mp4: Path, settings: Settings, task_id: str
) -> Path:
    """True lip-sync via a local MuseTalk checkout. Needs a CUDA GPU."""
    repo = Path(settings.twinverse_musetalk_repo)
    if not (repo / "scripts" / "inference.py").is_file():
        raise PipelineError("MuseTalk checkout not found; set TWINVERSE_MUSETALK_REPO.")
    ff = ffmpeg_exe()
    workdir = out_mp4.parent
    dur = _wav_duration(audio_wav)
    still = workdir / "still.mp4"
    _run(
        [
            ff, "-y", "-loop", "1", "-i", str(photo), "-vf",
            "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=25",
            "-t", f"{dur + 0.5:.2f}", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            str(still),
        ],
        "still video prep",
        timeout=300,
    )
    cfg = workdir / "musetalk.yaml"
    cfg.write_text(f'task_id: "{task_id}"\nvideo_path: "{still}"\naudio_path: "{audio_wav}"\n')
    resdir = workdir / "musetalk_out"
    resdir.mkdir(exist_ok=True)
    _run(
        [
            sys.executable, "-m", "scripts.inference",
            "--inference_config", str(cfg),
            "--result_dir", str(resdir),
            "--fps", "25",
            "--batch_size", "4",
        ],
        "MuseTalk lip-sync",
        cwd=repo,
        timeout=1800,
    )
    vids = sorted(resdir.rglob("*.mp4"), key=lambda p: p.stat().st_mtime)
    if not vids:
        raise PipelineError("MuseTalk finished without producing a video.")
    # Remux our audio track so the clip always has sound, whatever MuseTalk did.
    _run(
        [
            ff, "-y", "-i", str(vids[-1]), "-i", str(audio_wav),
            "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "copy", "-c:a", "aac", "-shortest", str(out_mp4),
        ],
        "lip-sync mux",
        timeout=300,
    )
    return out_mp4


def render_verdict(
    script_text: str,
    *,
    likeness: Likeness,
    videos_dir: str | Path,
    job_id: str,
    settings: Settings,
) -> tuple[Path, str]:
    """Full local render. Returns (video_path, mode) with mode lipsync|portrait."""
    info = check_pipeline(settings)
    if not info.voice_ready:
        raise PipelineError("avatar pipeline not installed: " + "; ".join(info.missing))
    if not likeness.present:
        raise PipelineError("likeness missing: upload your photo + voice sample first.")
    videos = Path(videos_dir)
    videos.mkdir(parents=True, exist_ok=True)
    workdir = videos / f"{job_id}_work"
    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True)
    out = videos / f"{job_id}.mp4"
    cloned = workdir / "cloned.wav"
    clone_voice(script_text, likeness.voice, cloned, settings)
    if info.lipsync_ready:
        musetalk_video(likeness.photo, cloned, out, settings, task_id=job_id)
        return out, "lipsync"
    portrait_video(likeness.photo, cloned, out)
    return out, "portrait"
