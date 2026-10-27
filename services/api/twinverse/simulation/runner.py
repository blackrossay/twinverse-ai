"""Simulation runner: render prompt, call model, validate output."""

from __future__ import annotations

from pathlib import Path

from ..identity.schemas import TwinDetail
from ..meta_client import MetaClient, MetaClientError
from ..model_json import load_prompt, parse_json_object
from .schemas import ScenarioSpec, SimulationOutput

PROMPT_VERSION = "simulation/v1"
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "v1" / "simulation.md"
CALL_TIMEOUT_S = 120.0


def render_prompt(twin: TwinDetail, spec: ScenarioSpec) -> str:
    p = twin.payload
    style_lines = [f"- {k}: {v}" for k, v in p.communication_style.items()] or [
        "- (unspecified)"
    ]
    lines = [
        f"Twin: {twin.name} (id {twin.id}, identity v{twin.version})",
        "VERIFIED FACTS:",
        *[f"- [{f.id}] ({f.category}) {f.statement}" for f in p.verified_facts],
        f"SKILLS: {', '.join(p.skills) or '(none)'}",
        f"GOALS: {', '.join(p.goals) or '(none)'}",
        f"CONSTRAINTS: {', '.join(p.constraints) or '(none)'}",
        "BEHAVIORAL HYPOTHESES (inferred, confidence-scored, NOT verified):",
        *[f"- ({h.confidence:.2f}) {h.statement} [basis: {h.basis}]" for h in p.behavioral_hypotheses],
        "COMMUNICATION STYLE:",
        *style_lines,
    ]
    template = load_prompt(str(_PROMPT_PATH))
    return (
        template.replace("{{IDENTITY}}", "\n".join(lines))
        .replace("{{TITLE}}", spec.title)
        .replace("{{CONTEXT}}", spec.context)
        .replace("{{OBJECTIVE}}", spec.objective)
        .replace("{{CONSTRAINTS}}", "; ".join(spec.constraints) or "(none)")
        .replace(
            "{{VARIABLES}}",
            "; ".join(f"{k}={v}" for k, v in spec.variables.items()) or "(none)",
        )
        .replace(
            "{{COUNTERPART}}",
            f"{spec.counterpart.name} ({spec.counterpart.role}), attitude: {spec.counterpart.attitude}",
        )
    )


def run_scenario(
    twin: TwinDetail, spec: ScenarioSpec, client: MetaClient
) -> tuple[SimulationOutput, str, int]:
    """Returns (output, model, latency_ms). Raises MetaClientError on failure."""
    prompt = render_prompt(twin, spec)
    first = client.generate(prompt, timeout_s=CALL_TIMEOUT_S)
    if first.fixture:
        raise MetaClientError("simulation needs a live model call: set MODEL_API_KEY")
    try:
        return _parse(first.text), first.model, first.latency_ms
    except ValueError as exc:
        repair = client.generate(
            f"Your last output was invalid ({exc}). Return corrected JSON only,"
            f" same schema, no commentary.\n\nInvalid output:\n{first.text[:3000]}",
            timeout_s=CALL_TIMEOUT_S,
        )
        try:
            return _parse(repair.text), repair.model, first.latency_ms + repair.latency_ms
        except ValueError:
            raise MetaClientError(
                "simulation failed: model returned invalid data twice"
            ) from None


def _parse(text: str) -> SimulationOutput:
    return SimulationOutput.model_validate(parse_json_object(text))
