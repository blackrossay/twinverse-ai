"""Model-based evaluation service with deterministic fallback-free caching."""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..identity.schemas import TwinDetail
from ..meta_client import MetaClient, MetaClientError
from ..simulation.schemas import ScenarioResult, SimulationRun
from .deterministic import check_scenario
from .schemas import ComparisonResult, DimensionScore, ScenarioEvaluation
from .store import EvaluationStore

PROMPT_VERSION = "evaluation/v1"
SUMMARY_VERSION = "comparison_summary/v1"
_EVAL_PATH = Path(__file__).parent.parent / "prompts" / "v1" / "evaluation.md"
_SUMMARY_PATH = Path(__file__).parent.parent / "prompts" / "v1" / "comparison_summary.md"
EVAL_TIMEOUT_S = 120.0


def render_eval_prompt(twin: TwinDetail, result: ScenarioResult) -> str:
    assert result.output is not None
    facts = "\n".join(f"- [{f.id}] {f.statement}" for f in twin.payload.verified_facts) or "(none)"
    out = result.output
    output_block = (
        f"RESPONSE:\n{out.response_text}\n"
        f"DECISIONS: {json.dumps([d.model_dump() for d in out.decisions])}\n"
        f"ASSUMPTIONS: {json.dumps(out.assumptions)}\n"
        f"FACTS CITED: {json.dumps(out.identity_facts_used)}\n"
        f"CONTRADICTIONS: {json.dumps([c.model_dump() for c in out.contradictions])}\n"
        f"VARIABLES NOTED: {json.dumps(out.variables_noted)}"
    )
    return (
        _EVAL_PATH.read_text()
        .replace("{{IDENTITY}}", facts)
        .replace("{{TITLE}}", result.spec.title)
        .replace("{{OBJECTIVE}}", result.spec.objective)
        .replace("{{VARIABLES}}", json.dumps(result.spec.variables))
        .replace("{{OUTPUT}}", output_block)
    )


def evaluate_scenario(
    twin: TwinDetail, result: ScenarioResult, client: MetaClient, model: str
) -> ScenarioEvaluation:
    unevaluated = ScenarioEvaluation(
        scenario_id=result.scenario_id, template_id=result.spec.template_id,
        evaluated=False, model=model,
    )
    if result.output is None:
        unevaluated.skip_reason = f"scenario {result.status}: {result.error or 'no output'}"
        return unevaluated
    first = client.generate(render_eval_prompt(twin, result), model=model, timeout_s=EVAL_TIMEOUT_S)
    if first.fixture:
        raise MetaClientError("evaluation needs a live model call: set MODEL_API_KEY")
    try:
        return _to_evaluation(result, first.text, model)
    except ValueError as exc:
        repair = client.generate(
            f"Your last output was invalid ({exc}). Return corrected JSON only,"
            f" same schema, no commentary.\n\nInvalid output:\n{first.text[:2000]}",
            model=model, timeout_s=EVAL_TIMEOUT_S,
        )
        try:
            return _to_evaluation(result, repair.text, model)
        except ValueError:
            raise MetaClientError("evaluation failed: model returned invalid data twice") from None


def _to_evaluation(result: ScenarioResult, text: str, model: str) -> ScenarioEvaluation:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"not valid JSON: {exc}") from None
    if not isinstance(data, dict):
        raise ValueError("top-level JSON must be an object")
    try:
        return ScenarioEvaluation(
            scenario_id=result.scenario_id,
            template_id=result.spec.template_id,
            identity_consistency=DimensionScore.model_validate(data["identity_consistency"]),
            scenario_effectiveness=DimensionScore.model_validate(data["scenario_effectiveness"]),
            adaptation=DimensionScore.model_validate(data["adaptation"]),
            model=model,
        )
    except KeyError as exc:
        raise ValueError(f"missing score dimension: {exc}") from None


def summarize(evaluations: list[ScenarioEvaluation], client: MetaClient, model: str) -> str:
    lines = []
    for e in evaluations:
        if not e.evaluated or not e.identity_consistency:
            lines.append(f"- {e.template_id}: not evaluated ({e.skip_reason})")
            continue
        lines.append(
            f"- {e.template_id}: consistency={e.identity_consistency.score},"
            f" effectiveness={e.scenario_effectiveness.score},"
            f" adaptation={e.adaptation.score}"
        )
    prompt = _SUMMARY_PATH.read_text().replace("{{SCORES}}", "\n".join(lines))
    resp = client.generate(prompt, model=model, timeout_s=EVAL_TIMEOUT_S)
    if resp.fixture:
        raise MetaClientError("summary needs a live model call: set MODEL_API_KEY")
    return resp.text.strip()


def compute_comparison(
    run: SimulationRun,
    twin: TwinDetail,
    client: MetaClient,
    model: str,
    store: EvaluationStore,
) -> ComparisonResult:
    deterministic = [check_scenario(twin, s) for s in run.scenarios]
    with ThreadPoolExecutor(max_workers=3) as pool:
        evaluations = list(pool.map(
            lambda s: evaluate_scenario(twin, s, client, model), run.scenarios
        ))
    for e in evaluations:
        store.save_evaluation(run.id, e)
    try:
        summary = summarize(evaluations, client, model)
    except MetaClientError as exc:
        summary = f"Summary unavailable: {exc}"
    store.save_summary(run.id, summary, model)
    return ComparisonResult(
        run_id=run.id, twin_id=run.twin_id, deterministic=deterministic,
        evaluations=evaluations, summary=summary, model=model,
    )
