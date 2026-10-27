"""Repeatable benchmark: structured TWINVERSE vs naive flat-prompt baseline.

Reads MODEL_API_KEY from env or project .env. Writes results JSON to stdout
and to the path given by --out. Live-model only (no fixtures).

Usage (from repo root):
    .venv/bin/python services/api/benchmarks/run.py --db /tmp/bench.db --out /tmp/bench.json
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "services" / "api"))

from twinverse.evaluation.deterministic import check_scenario  # noqa: E402
from twinverse.evaluation.schemas import ScenarioEvaluation  # noqa: E402
from twinverse.evaluation.service import compute_comparison, evaluate_scenario  # noqa: E402
from twinverse.evaluation.store import EvaluationStore  # noqa: E402
from twinverse.identity.schemas import TwinDetail  # noqa: E402
from twinverse.identity.seeds import SEEDS, seed_payload  # noqa: E402
from twinverse.identity.store import IdentityStore  # noqa: E402
from twinverse.meta_client import MetaClient, MetaClientError  # noqa: E402
from twinverse.settings import Settings  # noqa: E402
from twinverse.simulation import runner as sim_runner  # noqa: E402
from twinverse.simulation.engine import execute_run  # noqa: E402
from twinverse.simulation.schemas import ScenarioResult, ScenarioSpec  # noqa: E402
from twinverse.simulation.store import SimulationStore  # noqa: E402
from twinverse.simulation.templates import TEMPLATES  # noqa: E402


def _spec(tid: str) -> ScenarioSpec:
    t = TEMPLATES[tid]
    return ScenarioSpec(
        template_id=t.template_id, type=t.type, title=t.title, context=t.context,
        objective=t.objective, constraints=list(t.constraints),
        variables=dict(t.variables), counterpart=t.counterpart, rubric_id=t.rubric_id,
    )


NAIVE_PROMPT = """You are {name}, {bio}

Scenario: {title}
Context: {context}
Objective: {objective}

Respond IN CHARACTER, then reply with JSON ONLY in exactly this schema
(no markdown fences, no commentary):
{{"response_text": string, "decisions": [{{"decision": string, "rationale": string}}],
"assumptions": [string], "identity_facts_used": [string],
"contradictions": [{{"claim": string, "issue": string}}], "variables_noted": {{}}}}"""


def run_baseline(twin: TwinDetail, spec: ScenarioSpec, client: MetaClient) -> ScenarioResult:
    prompt = NAIVE_PROMPT.format(
        name=twin.name, bio=twin.payload.bio or "(no bio)",
        title=spec.title, context=spec.context, objective=spec.objective)
    started = time.monotonic()
    first = client.generate(prompt, timeout_s=180.0)
    try:
        output = sim_runner._parse(first.text)
        latency = int((time.monotonic() - started) * 1000)
    except ValueError as exc:
        repair = client.generate(f"Return corrected JSON only, same schema ({exc}):\n{first.text[:3000]}",
                                 timeout_s=180.0)
        output = sim_runner._parse(repair.text)
        latency = int((time.monotonic() - started) * 1000)
    return ScenarioResult(scenario_id="sc_baseline", spec=spec, status="done",
                          output=output, model=first.model, latency_ms=latency)


def scores(e: ScenarioEvaluation) -> dict:
    if not e.evaluated or not e.identity_consistency:
        return {"evaluated": False, "skip": e.skip_reason}
    return {
        "consistency": e.identity_consistency.score,
        "effectiveness": e.scenario_effectiveness.score,  # type: ignore[union-attr]
        "adaptation": e.adaptation.score,  # type: ignore[union-attr]
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="/tmp/bench.db")
    ap.add_argument("--out", default="/tmp/bench.json")
    args = ap.parse_args()

    settings = Settings()
    if not settings.model_api_key:
        print("MODEL_API_KEY required (env or .env)", file=sys.stderr)
        sys.exit(2)
    client = MetaClient(settings)
    ids = IdentityStore(args.db)
    sims = SimulationStore(args.db)
    evals = EvaluationStore(args.db)

    seed = next(s for s in SEEDS if s.name == "Alex Morgan")
    twin = ids.create_twin(seed.name, seed_payload(seed), seed.profile_type)
    print(f"twin={twin.id} model={settings.meta_model_sim} eval={settings.meta_model_eval}", flush=True)

    specs = [_spec("negotiation"), _spec("escalation"), _spec("leadership")]
    run = sims.create_run(twin.id, 1, specs)
    t0 = time.monotonic()
    execute_run(run.id, twin, specs, client, sims)
    sim_wall = time.monotonic() - t0
    run = sims.get_run(run.id)
    assert run is not None
    print(f"structured run status={run.status} wall={sim_wall:.1f}s", flush=True)
    if run.status == "failed":
        print("structured run failed; aborting", file=sys.stderr)
        sys.exit(1)

    t0 = time.monotonic()
    comp = compute_comparison(run, twin, client, settings.meta_model_eval, evals)
    eval_wall = time.monotonic() - t0
    print(f"comparison wall={eval_wall:.1f}s", flush=True)

    t0 = time.monotonic()
    baseline = run_baseline(twin, _spec("negotiation"), client)
    base_wall = time.monotonic() - t0
    base_det = check_scenario(twin, baseline)
    base_eval = evaluate_scenario(twin, baseline, client, settings.meta_model_eval)
    print(f"baseline negotiation wall={base_wall:.1f}s", flush=True)

    results = {
        "model_sim": settings.meta_model_sim,
        "model_eval": settings.meta_model_eval,
        "structured": {
            "run_id": run.id, "status": run.status, "sim_wall_s": round(sim_wall, 1),
            "eval_wall_s": round(eval_wall, 1),
            "scenarios": [
                {
                    "template": s.spec.template_id, "status": s.status,
                    "latency_ms": s.latency_ms, "model": s.model,
                    "deterministic": next(
                        d.model_dump() for d in comp.deterministic
                        if d.scenario_id == s.scenario_id),
                    "scores": scores(next(
                        e for e in comp.evaluations if e.scenario_id == s.scenario_id)),
                }
                for s in run.scenarios
            ],
            "summary": comp.summary,
        },
        "baseline_naive_negotiation": {
            "latency_ms": baseline.latency_ms,
            "deterministic": base_det.model_dump(),
            "scores": scores(base_eval),
        },
    }
    Path(args.out).write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    try:
        main()
    except MetaClientError as exc:
        print(f"BENCH FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
