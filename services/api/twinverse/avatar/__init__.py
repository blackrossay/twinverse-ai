"""Talking-verdict avatars: local open-source face + voice renders."""

from .schemas import AvatarStatus, TalkingVerdict
from .service import AvatarNotReady, render_job, request_verdict

__all__ = [
    "AvatarNotReady",
    "AvatarStatus",
    "TalkingVerdict",
    "render_job",
    "request_verdict",
]
