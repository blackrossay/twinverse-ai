"""Deterministic (code, not model) checks on scenario outputs."""

from ..identity.schemas import TwinDetail
from ..simulation.schemas import ScenarioResult
from .schemas import CheckDetail, DeterministicReport


def check_scenario(twin: TwinDetail, result: ScenarioResult) -> DeterministicReport:
    details: list[CheckDetail] = []
    output = result.output
    if output is None:
        return DeterministicReport(
            scenario_id=result.scenario_id,
            checks_passed=0,
            checks_total=0,
            details=[CheckDetail(name="has_output", passed=False, detail=result.error or "no output")],
        )

    fact_ids = {f.id for f in twin.payload.verified_facts}
    used = output.identity_facts_used
    unknown = [i for i in used if i not in fact_ids]
    details.append(CheckDetail(
        name="facts_grounded",
        passed=not unknown,
        detail=f"{len(used) - len(unknown)}/{len(used)} cited ids exist in snapshot"
        + (f"; unknown: {unknown}" if unknown else ""),
    ))
    details.append(CheckDetail(
        name="has_decisions",
        passed=len(output.decisions) > 0,
        detail=f"{len(output.decisions)} decision(s)",
    ))
    details.append(CheckDetail(
        name="has_response",
        passed=len(output.response_text.strip()) >= 50,
        detail=f"{len(output.response_text)} chars",
    ))
    spec_vars = set(result.spec.variables)
    noted = {k for k in output.variables_noted if k in spec_vars}
    details.append(CheckDetail(
        name="variables_acknowledged",
        passed=not spec_vars or bool(noted),
        detail=f"acknowledged {sorted(noted) or 'none'} of {sorted(spec_vars) or 'none'}",
    ))
    details.append(CheckDetail(
        name="no_contradictions",
        passed=len(output.contradictions) == 0,
        detail=f"{len(output.contradictions)} flagged",
    ))
    passed = sum(1 for d in details if d.passed)
    return DeterministicReport(
        scenario_id=result.scenario_id,
        checks_passed=passed,
        checks_total=len(details),
        details=details,
    )
