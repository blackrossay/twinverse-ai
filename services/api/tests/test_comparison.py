import json
import time

import pytest

from twinverse.evaluation.deterministic import check_scenario
from twinverse.identity.schemas import Fact, IdentityPayload, TwinDetail
from twinverse.settings import Settings
from twinverse.simulation.schemas import ScenarioResult, ScenarioSpec, SimulationOutput
from twinverse.simulation.store import SimulationStore

GOOD_SIM = json.dumps({
    "response_text": "A sufficiently long in-character response about the counter-proposal and next steps.",
    "decisions": [{"decision": "Offer 7%", "rationale": "Within authority"}],
    "assumptions": ["Bid is real"],
    "identity_facts_used": ["f_known"],
    "contradictions": [],
    "variables_noted": {"depth": "noted at requested depth"},
})

EVAL_JSON = json.dumps({
    "identity_consistency": {"score": 4, "evidence": ["cites margin"], "notes": "grounded"},
    "scenario_effectiveness": {"score": 5, "evidence": ["counter-offer"], "notes": "strong"},
    "adaptation": {"score": 3, "evidence": ["mentions deadline"], "notes": "partial"},
})

STRUCTURED = {
    "name": "Eval Twin",
    "verified_facts": [{"statement": "Owns pricing", "category": "work"}],
}


def _twin_and_result(fact_ids=("f_known",), output_json=GOOD_SIM):
    twin = TwinDetail(
        id="twin_x", name="X", current_version=1, version=1,
        payload=IdentityPayload(verified_facts=[
            Fact(id=fid, statement="s", category="w") for fid in fact_ids]),
    )
    data = json.loads(output_json)
    spec = ScenarioSpec(template_id="council-strategist", type="t", title="t",
                        context="c", objective="o", variables={"depth": "quick take"})
    result = ScenarioResult(scenario_id="sc_1", spec=spec, status="done",
                            output=SimulationOutput.model_validate(data))
    return twin, result


def test_deterministic_all_pass():
    report = check_scenario(*_twin_and_result())
    assert (report.checks_passed, report.checks_total) == (5, 5)


def test_deterministic_flags_problems():
    bad = json.loads(GOOD_SIM)
    bad["identity_facts_used"] = ["f_nope"]
    bad["variables_noted"] = {}
    bad["contradictions"] = [{"claim": "x", "issue": "y"}]
    report = check_scenario(*_twin_and_result(output_json=json.dumps(bad)))
    by_name = {d.name: d for d in report.details}
    assert by_name["facts_grounded"].passed is False
    assert "f_nope" in by_name["facts_grounded"].detail
    assert by_name["variables_acknowledged"].passed is False
    assert by_name["no_contradictions"].passed is False
    assert report.checks_passed == 2


def test_comparison_endpoint_and_cache(api_client, stub_model_client):
    stub = stub_model_client(GOOD_SIM, EVAL_JSON, "Negotiation went best.")
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    run_id = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "council-strategist"}]}).json()["id"]
    first = api_client.get(f"/api/simulations/{run_id}/comparison")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["deterministic"][0]["checks_total"] == 5
    ev = body["evaluations"][0]
    assert ev["evaluated"] is True
    assert ev["identity_consistency"]["score"] == 4
    assert ev["scenario_effectiveness"]["evidence"] == ["counter-offer"]
    assert body["summary"] == "Negotiation went best."
    calls_after_first = stub.calls
    second = api_client.get(f"/api/simulations/{run_id}/comparison").json()
    second.pop("evaluated_at")
    body.pop("evaluated_at")
    assert second == body
    assert stub.calls == calls_after_first, "second GET must hit cache, not the model"


def test_comparison_conflict_while_running(api_client, tmp_db):
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    sims = SimulationStore(tmp_db)
    run = sims.create_run(tid, 1, [_twin_and_result()[1].spec])
    resp = api_client.get(f"/api/simulations/{run.id}/comparison")
    assert resp.status_code == 409


def test_comparison_skips_failed_scenarios(api_client, stub_model_client):
    stub_model_client("bad", "bad", "summary anyway")
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    run_id = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "council-strategist"}]}).json()["id"]
    body = api_client.get(f"/api/simulations/{run_id}/comparison").json()
    assert body["evaluations"][0]["evaluated"] is False
    assert body["deterministic"][0]["checks_total"] == 0


_LIVE = Settings().model_api_key


@pytest.mark.skipif(not _LIVE, reason="needs MODEL_API_KEY (env or .env)")
def test_live_three_scenario_comparison(api_client, monkeypatch):
    """Full Parallel Reality Engine proof: 3 live sims + comparison."""
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    api_client.post("/api/twins/seed")
    twins = {t["name"]: t for t in api_client.get("/api/twins").json()}
    tid = twins["Maya Chen"]["id"]
    run_id = api_client.post("/api/simulations", json={"twin_id": tid, "scenarios": [
        {"template_id": "council-strategist"}, {"template_id": "council-skeptic"},
        {"template_id": "council-empath"}]}).json()["id"]
    deadline = time.time() + 420
    while time.time() < deadline:
        run = api_client.get(f"/api/simulations/{run_id}").json()
        if run["status"] in ("done", "partial", "failed"):
            break
        time.sleep(5)
    assert run["status"] in ("done", "partial"), run
    comp = api_client.get(f"/api/simulations/{run_id}/comparison")
    assert comp.status_code == 200, comp.text
    body = comp.json()
    assert len(body["evaluations"]) == 3
    for ev in body["evaluations"]:
        if ev["evaluated"]:
            for dim in ("identity_consistency", "scenario_effectiveness", "adaptation"):
                assert 1 <= ev[dim]["score"] <= 5
                assert ev[dim]["evidence"], "each score needs evidence"
    assert len(body["summary"]) > 20
