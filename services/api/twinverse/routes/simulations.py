"""Simulation launch/poll endpoints + scenario templates."""

from functools import lru_cache

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from ..identity.store import IdentityStore
from ..meta_client import MetaClient, default_client
from ..routes.twins import get_store
from ..settings import get_settings
from ..simulation.engine import execute_run
from ..simulation.schemas import (
    RerunCreate,
    RunCreate,
    ScenarioInput,
    ScenarioSpec,
    ScenarioTemplate,
    SimulationRun,
)
from ..simulation.store import SimulationStore
from ..simulation.templates import resolve_template

router = APIRouter(tags=["simulations"])


@lru_cache(maxsize=4)
def _sim_store_for(db_path: str) -> SimulationStore:
    return SimulationStore(db_path)


def get_sim_store() -> SimulationStore:
    return _sim_store_for(get_settings().twinverse_db_path)


def get_model_client() -> MetaClient:
    return default_client()


def _resolve(inp: ScenarioInput) -> ScenarioSpec:
    try:
        t = resolve_template(inp.template_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    variables = dict(t.variables)
    variables.update(inp.variables)
    return ScenarioSpec(
        template_id=t.template_id,
        type=t.type,
        title=t.title,
        context=inp.context_override or t.context,
        objective=inp.objective_override or t.objective,
        constraints=list(t.constraints),
        variables=variables,
        counterpart=t.counterpart,
        rubric_id=t.rubric_id,
    )


@router.get("/api/scenarios/templates", response_model=list[ScenarioTemplate])
def list_templates() -> list[ScenarioTemplate]:
    from ..simulation.templates import TEMPLATES

    return list(TEMPLATES.values())


@router.post("/api/simulations", response_model=SimulationRun, status_code=status.HTTP_202_ACCEPTED)
def launch_run(
    body: RunCreate,
    background: BackgroundTasks,
    store: IdentityStore = Depends(get_store),
    sim_store: SimulationStore = Depends(get_sim_store),
    client: MetaClient = Depends(get_model_client),
) -> SimulationRun:
    twin = store.get_twin(body.twin_id, body.version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin or version not found")
    specs = [_resolve(s) for s in body.scenarios]
    run = sim_store.create_run(twin.id, twin.version, specs)
    background.add_task(execute_run, run.id, twin, specs, client, sim_store)
    return run


@router.get("/api/simulations", response_model=list[SimulationRun])
def list_runs(
    twin_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    sim_store: SimulationStore = Depends(get_sim_store),
) -> list[SimulationRun]:
    return sim_store.list_runs(twin_id, limit=limit, offset=offset)


@router.get("/api/simulations/{run_id}", response_model=SimulationRun)
def get_run(run_id: str, sim_store: SimulationStore = Depends(get_sim_store)) -> SimulationRun:
    run = sim_store.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run


@router.post(
    "/api/simulations/{run_id}/rerun",
    response_model=SimulationRun,
    status_code=status.HTTP_202_ACCEPTED,
)
def rerun(
    run_id: str,
    body: RerunCreate,
    background: BackgroundTasks,
    store: IdentityStore = Depends(get_store),
    sim_store: SimulationStore = Depends(get_sim_store),
    client: MetaClient = Depends(get_model_client),
) -> SimulationRun:
    parent = sim_store.get_run(run_id)
    if parent is None:
        raise HTTPException(status_code=404, detail="run not found")
    twin = store.get_twin(parent.twin_id, parent.identity_version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin snapshot not found")
    wanted = body.scenario_ids or [s.scenario_id for s in parent.scenarios]
    by_id = {s.scenario_id: s for s in parent.scenarios}
    unknown = [i for i in wanted if i not in by_id]
    if unknown:
        raise HTTPException(status_code=422, detail=f"unknown scenario_ids: {unknown}")
    specs = []
    for sid in wanted:
        old = by_id[sid].spec
        variables = dict(old.variables)
        variables.update(body.variables.get(sid, {}))
        specs.append(
            ScenarioSpec(
                template_id=old.template_id,
                type=old.type,
                title=old.title,
                context=body.context_overrides.get(sid, old.context),
                objective=body.objective_overrides.get(sid, old.objective),
                constraints=list(old.constraints),
                variables=variables,
                counterpart=old.counterpart,
                rubric_id=old.rubric_id,
            )
        )
    run = sim_store.create_run(twin.id, twin.version, specs, parent_run_id=parent.id)
    background.add_task(execute_run, run.id, twin, specs, client, sim_store)
    return run
