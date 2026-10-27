"""Conversational turn engine: identity + memory -> spoken-style twin reply.

Pipeline mirrors a voice agent (ASR happens in the browser, LLM here, TTS and
avatar rendering via the local avatar pipeline), but turn-based instead of
streaming: each reply can then be spoken in the cloned voice and rendered as
a talking-avatar clip.
"""

from __future__ import annotations

import logging
from pathlib import Path

from ..identity.schemas import TwinDetail
from ..meta_client import MetaClient, MetaClientError
from ..model_json import load_prompt, parse_json_object
from .schemas import Conversation, Turn
from .store import ConversationStore

logger = logging.getLogger("twinverse.conversation")

PROMPT_VERSION = "conversation/v1"
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "v1" / "conversation.md"
HISTORY_TURNS = 12
CALL_TIMEOUT_S = 60.0


def _identity_block(twin: TwinDetail) -> str:
    p = twin.payload
    style = [f"- {k}: {v}" for k, v in p.communication_style.items()] or ["- (unspecified)"]
    lines = [
        f"You are the twin of: {twin.name} (identity v{twin.version})",
        "VERIFIED FACTS:",
        *[f"- [{f.id}] ({f.category}) {f.statement}" for f in p.verified_facts],
        f"SKILLS: {', '.join(p.skills) or '(none)'}",
        f"GOALS: {', '.join(p.goals) or '(none)'}",
        f"CONSTRAINTS: {', '.join(p.constraints) or '(none)'}",
        "BEHAVIORAL HYPOTHESES (inferred, NOT verified):",
        *[f"- ({h.confidence:.2f}) {h.statement}" for h in p.behavioral_hypotheses],
        "COMMUNICATION STYLE:",
        *style,
    ]
    return "\n".join(lines)


def render_prompt(twin: TwinDetail, session: Conversation, message: str) -> str:
    history = session.turns[-HISTORY_TURNS:]
    history_text = (
        "\n".join(
            f"{'User' if t.role == 'user' else 'Twin'}: {t.text}" for t in history
        )
        or "(this is the first message)"
    )
    return (
        load_prompt(str(_PROMPT_PATH))
        .replace("{{IDENTITY}}", _identity_block(twin))
        .replace("{{HISTORY}}", f"{history_text}\nUser: {message}")
    )


def _parse_reply(text: str) -> tuple[str, list[str]]:
    try:
        data = parse_json_object(text)
        reply = str(data.get("reply") or "").strip()
        facts = [str(f) for f in data.get("facts_used") or []]
        if reply:
            return reply, facts
    except ValueError:
        pass
    # Conversation tolerates a plain-text reply instead of failing the turn.
    return text.strip(), []


def reply_to(
    session: Conversation, twin: TwinDetail, message: str, client: MetaClient, store: ConversationStore
) -> Turn:
    """Persist the user turn, generate the twin's reply, persist and return it."""
    store.add_turn(session.id, Turn(role="user", text=message))
    if not session.title:
        store.set_title_if_empty(session.id, message)
    fresh = store.get_session(session.id) or session
    result = client.generate(render_prompt(twin, fresh, message), timeout_s=CALL_TIMEOUT_S)
    if result.fixture:
        goals = ", ".join(twin.payload.goals[:2]) or "what matters most"
        reply = (
            "[OFFLINE FIXTURE — not a live model call] "
            f"As {twin.name}, I'd think that through against {goals} before answering. "
            "Set MODEL_API_KEY on the backend and I'll reply in character for real."
        )
        return store.add_turn(
            session.id,
            Turn(role="twin", text=reply, model=result.model, latency_ms=0, fixture=True),
        )
    reply, facts = _parse_reply(result.text)
    if not reply:
        raise MetaClientError("conversation failed: model returned an empty reply")
    known = {f.id for f in twin.payload.verified_facts}
    turn = Turn(
        role="twin",
        text=reply,
        model=result.model,
        latency_ms=result.latency_ms,
        facts_used=[f for f in facts if f in known],
    )
    logger.info(
        "conversation %s turn in %dms (%d chars)", session.id, result.latency_ms, len(reply)
    )
    return store.add_turn(session.id, turn)
