"""YouTube broadcaster: persona idle loop + rendered avatar segments -> RTMP.

One continuous ffmpeg process per live session pushes H.264/AAC over RTMP
directly to YouTube's ingest (no relay server needed for a single platform).
The stream loops: [idle stage loop, avatar reply segments...] so the channel
stays live between chat bursts; newly rendered segments join on republish.

The stream key never appears in logs, status, or API responses.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from ..avatar.likeness import likeness_paths
from ..avatar.pipeline import PipelineError, _run, ffmpeg_exe, portrait_video
from ..settings import Settings
from .schemas import LiveSession
from .store import LiveStore

logger = logging.getLogger("twinverse.live.streamer")

_processes: dict[str, subprocess.Popen] = {}


def _silent_wav(out: Path, seconds: int = 10) -> None:
    _run(
        [
            ffmpeg_exe(), "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
            "-t", str(seconds), str(out),
        ],
        "idle audio",
        timeout=60,
    )


def ensure_idle_loop(session_id: str, settings: Settings) -> Path:
    """Animated stage loop of the persona (photo + gentle zoom, silent)."""
    likeness = likeness_paths(settings.twinverse_avatar_dir)
    if not likeness.photo.is_file():
        raise PipelineError("likeness photo missing: upload your photo + voice sample first.")
    workdir = Path(settings.twinverse_avatar_dir) / "live" / session_id
    workdir.mkdir(parents=True, exist_ok=True)
    idle = workdir / "idle.mp4"
    if idle.is_file():
        return idle
    silent = workdir / "silent.wav"
    _silent_wav(silent)
    portrait_video(likeness.photo, silent, idle)
    return idle


def collect_segments(session: LiveSession, settings: Settings) -> list[Path]:
    """Rendered avatar clips (MuseTalk/portrait) for this session, in order."""
    videos = Path(settings.twinverse_avatar_dir) / "videos"
    out: list[Path] = []
    for msg in session.messages:
        if msg.video_status == "done":
            path = videos / f"{msg.id}.mp4"
            if path.is_file():
                out.append(path)
    return out


def build_concat_file(paths: list[Path], workdir: Path) -> Path:
    concat = workdir / "playlist.txt"
    lines = []
    for p in paths:
        escaped = str(p.resolve()).replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    concat.write_text("\n".join(lines) + "\n")
    return concat


def build_publish_command(ffmpeg: str, concat: Path, rtmp_full_url: str) -> list[str]:
    return [
        ffmpeg, "-y",
        "-re", "-stream_loop", "-1",
        "-f", "concat", "-safe", "0", "-i", str(concat),
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,"
               "pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=25",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
        "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
        "-f", "flv", rtmp_full_url,
    ]


def is_publishing(session_id: str) -> bool:
    proc = _processes.get(session_id)
    return proc is not None and proc.poll() is None


def publish_session(session: LiveSession, settings: Settings, store: LiveStore) -> str:
    """Start (or restart) the RTMP push for a session. Returns status."""
    dest = store.get_destination(session.id)
    if dest is None:
        raise PipelineError("YouTube destination not configured for this session.")
    if is_publishing(session.id):
        stop_session(session.id)
    idle = ensure_idle_loop(session.id, settings)
    segments = collect_segments(session, settings)
    workdir = Path(settings.twinverse_avatar_dir) / "live" / session.id
    playlist: list[Path] = []
    for seg in segments:
        playlist.append(idle)
        playlist.append(seg)
    playlist.append(idle)
    concat = build_concat_file(playlist, workdir)
    rtmp_full = f"{dest['rtmp_url'].rstrip('/')}/{dest['stream_key']}"
    cmd = build_publish_command(ffmpeg_exe(), concat, rtmp_full)
    log_path = workdir / "ffmpeg.log"
    log_fh = log_path.open("ab")
    proc = subprocess.Popen(cmd, stdout=log_fh, stderr=subprocess.STDOUT)
    _processes[session.id] = proc
    logger.info(
        "live %s publishing to youtube (%d segment(s), pid %d)",
        session.id, len(segments), proc.pid,
    )
    return "publishing"


def stop_session(session_id: str) -> str:
    proc = _processes.pop(session_id, None)
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
    return "stopped"
