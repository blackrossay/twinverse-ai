"""Comparison endpoint: deterministic checks + cached model evaluation."""

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException

from ..evaluation.deterministic import check_scenario
from ..evaluation.schemas import ComparisonResult
from ..evaluation.service import compute_comparison
from ..evaluation.store import EvaluationStore
from ..identity.store import IdentityStore
from ..meta_client import MetaClient, MetaClientError, default_client
from ..routes.twins import get_store
from ..settings import get_settings
from ..simulation.store import SimulationStore
from .simulations import get_sim_store

router = APIRouter(tags=["simulations"])


@lru_cache(maxsize=4)
def _eval_store_for(db_path: str) -> EvaluationStore:
    return EvaluationStore(db_path)


def get_eval_store() -> EvaluationStore:
    return _eval_store_for(get_settings().twinverse_db_path)


def get_model_client() -> MetaClient:
    return default_client()


@router.get("/api/simulations/{run_id}/comparison", response_model=ComparisonResult)
def get_comparison(
    run_id: str,
    store: IdentityStore = Depends(get_store),
    sim_store: SimulationStore = Depends(get_sim_store),
    eval_store: EvaluationStore = Depends(get_eval_store),
    client: MetaClient = Depends(get_model_client),
) -> ComparisonResult:
    run = sim_store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    if run.status == "running":
        raise HTTPException(status_code=409, detail="run still in progress")
    twin = store.get_twin(run.twin_id, run.identity_version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin snapshot not found")
    deterministic = [check_scenario(twin, s) for s in run.scenarios]
    cached = eval_store.get_comparison(
        run.id, run.twin_id, [s.scenario_id for s in run.scenarios], deterministic
    )
    if cached is not None:
        return cached
    try:
        return compute_comparison(run, twin, client, get_settings().meta_model_eval, eval_store)
    except MetaClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
