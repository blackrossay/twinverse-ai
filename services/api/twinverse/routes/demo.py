"""Demo reset: wipe all runtime data and reseed personas (judge support)."""

from fastapi import APIRouter, Depends

from ..db import connect
from ..identity.schemas import TwinDetail
from ..identity.seeds import SEEDS, seed_payload
from ..identity.store import IdentityStore
from .twins import get_store

router = APIRouter(tags=["demo"])

_TABLES = [
    "conversation_turns",
    "conversations",
    "live_messages",
    "live_destinations",
    "live_sessions",
    "scenario_evaluations",
    "run_comparisons",
    "talking_verdicts",
    "scenario_results",
    "simulation_runs",
    "identity_versions",
    "twins",
]


@router.post("/api/demo/reset", response_model=list[TwinDetail])
def demo_reset(store: IdentityStore = Depends(get_store)) -> list[TwinDetail]:
    """Delete every twin/run/conversation/live row, then seed demo personas."""
    with connect(store._db_path) as conn:  # same DB the injected store uses
        existing = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
        for table in _TABLES:  # fixed allowlist, no user input
            if table in existing:
                conn.execute(f"DELETE FROM {table}")
    return [store.create_twin(s.name, seed_payload(s), s.profile_type) for s in SEEDS]
