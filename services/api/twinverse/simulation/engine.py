"""Run executor. D3: sequential; D4 upgrades the loop to bounded parallel."""

from __future__ import annotations

from ..identity.schemas import TwinDetail
from ..meta_client import MetaClient, MetaClientError
from .runner import PROMPT_VERSION, run_scenario
from .schemas import ScenarioResult, ScenarioSpec
from .store import SimulationStore


def execute_run(
    run_id: str,
    twin: TwinDetail,
    specs: list[ScenarioSpec],
    client: MetaClient,
    store: SimulationStore,
) -> None:
    for spec in specs:
        result = ScenarioResult(scenario_id=spec.scenario_id, spec=spec)
        try:
            output, model, latency = run_scenario(twin, spec, client)
            result.status = "done"
            result.output = output
            result.model = model
            result.latency_ms = latency
            result.prompt_version = PROMPT_VERSION
        except MetaClientError as exc:
            result.status = "failed"
            result.error = str(exc)
        store.update_scenario(run_id, result)
    store.update_run_status(run_id, _rollup(store, run_id))


def _rollup(store: SimulationStore, run_id: str) -> str:
    run = store.get_run(run_id)
    assert run is not None
    statuses = [s.status for s in run.scenarios]
    if all(s == "done" for s in statuses):
        return "done"
    if all(s == "failed" for s in statuses):
        return "failed"
    return "partial"
