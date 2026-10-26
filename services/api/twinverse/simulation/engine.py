"""Run executor: bounded parallel execution with per-scenario timeouts."""

from __future__ import annotations

import asyncio

from ..identity.schemas import TwinDetail
from ..meta_client import MetaClient, MetaClientError
from .runner import PROMPT_VERSION, run_scenario
from .schemas import ScenarioResult, ScenarioSpec
from .store import SimulationStore

MAX_PARALLEL = 3
SCENARIO_TIMEOUT_S = 180.0


def execute_run(
    run_id: str,
    twin: TwinDetail,
    specs: list[ScenarioSpec],
    client: MetaClient,
    store: SimulationStore,
    scenario_timeout_s: float = SCENARIO_TIMEOUT_S,
) -> None:
    asyncio.run(_execute_parallel(run_id, twin, specs, client, store, scenario_timeout_s))


async def _execute_parallel(
    run_id: str,
    twin: TwinDetail,
    specs: list[ScenarioSpec],
    client: MetaClient,
    store: SimulationStore,
    scenario_timeout_s: float,
) -> None:
    sem = asyncio.Semaphore(MAX_PARALLEL)

    async def one(spec: ScenarioSpec) -> None:
        async with sem:
            result = ScenarioResult(scenario_id=spec.scenario_id, spec=spec)
            try:
                output, model, latency = await asyncio.wait_for(
                    asyncio.to_thread(run_scenario, twin, spec, client),
                    timeout=scenario_timeout_s,
                )
                result.status = "done"
                result.output = output
                result.model = model
                result.latency_ms = latency
                result.prompt_version = PROMPT_VERSION
            except (asyncio.TimeoutError, TimeoutError):
                result.status = "failed"
                result.error = f"scenario timed out after {scenario_timeout_s:g}s"
            except MetaClientError as exc:
                result.status = "failed"
                result.error = str(exc)
            await asyncio.to_thread(store.update_scenario, run_id, result)

    await asyncio.gather(*(one(spec) for spec in specs))
    await asyncio.to_thread(store.update_run_status, run_id, _rollup(store, run_id))


def _rollup(store: SimulationStore, run_id: str) -> str:
    run = store.get_run(run_id)
    assert run is not None
    statuses = [s.status for s in run.scenarios]
    if all(s == "done" for s in statuses):
        return "done"
    if all(s == "failed" for s in statuses):
        return "failed"
    return "partial"
