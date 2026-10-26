import json
import threading
import time

from twinverse.identity.schemas import Fact, IdentityPayload
from twinverse.identity.store import IdentityStore
from twinverse.meta_client import ModelResult
from twinverse.simulation.engine import execute_run
from twinverse.simulation.schemas import ScenarioSpec
from twinverse.simulation.store import SimulationStore
from twinverse.simulation.templates import resolve_template

GOOD_SIM = json.dumps({
    "response_text": "parallel response",
    "decisions": [],
    "assumptions": [],
    "identity_facts_used": [],
    "contradictions": [],
    "variables_noted": {},
})

STRUCTURED = {
    "name": "Parallel Twin",
    "verified_facts": [{"statement": "Owns pricing", "category": "work"}],
}


def _spec(template_id: str) -> ScenarioSpec:
    t = resolve_template(template_id)
    return ScenarioSpec(
        template_id=t.template_id, type=t.type, title=t.title, context=t.context,
        objective=t.objective, constraints=list(t.constraints),
        variables=dict(t.variables), counterpart=t.counterpart, rubric_id=t.rubric_id,
    )


def _setup(tmp_path):
    ids = IdentityStore(tmp_path / "t.db")
    sims = SimulationStore(tmp_path / "t.db")
    twin = ids.create_twin("P", IdentityPayload(verified_facts=[Fact(statement="s", category="w")]))
    return twin, sims


def test_scenarios_execute_in_parallel(tmp_path):
    active = 0
    peak = 0
    lock = threading.Lock()

    class OverlapStub:
        def generate(self, prompt, *, model=None, timeout_s=None):
            nonlocal active, peak
            with lock:
                active += 1
                peak = max(peak, active)
            time.sleep(0.4)
            with lock:
                active -= 1
            return ModelResult(text=GOOD_SIM, model="stub", latency_ms=400, fixture=False)

    twin, sims = _setup(tmp_path)
    specs = [_spec("negotiation"), _spec("escalation"), _spec("leadership")]
    run = sims.create_run(twin.id, 1, specs)
    execute_run(run.id, twin, specs, OverlapStub(), sims)
    assert peak == 3, f"expected 3-way overlap, saw peak={peak}"
    assert sims.get_run(run.id).status == "done"


def test_scenario_timeout_marks_failed(tmp_path):
    class SlowStub:
        def generate(self, prompt, *, model=None, timeout_s=None):
            time.sleep(2)
            return ModelResult(text=GOOD_SIM, model="stub", latency_ms=2000, fixture=False)

    twin, sims = _setup(tmp_path)
    run = sims.create_run(twin.id, 1, [_spec("negotiation")])
    execute_run(run.id, twin, [run.scenarios[0].spec], SlowStub(), sims,
                scenario_timeout_s=0.3)
    got = sims.get_run(run.id)
    assert got.status == "failed"
    assert "timed out" in got.scenarios[0].error


def test_rerun_applies_changes_and_preserves_parent(api_client, stub_model_client):
    stub_model_client(GOOD_SIM)
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    parent_id = api_client.post("/api/simulations", json={"twin_id": tid, "scenarios": [
        {"template_id": "negotiation"}, {"template_id": "escalation"}]}).json()["id"]
    before = api_client.get(f"/api/simulations/{parent_id}").json()
    assert before["status"] == "done"
    neg_id = [s for s in before["scenarios"] if s["spec"]["template_id"] == "negotiation"][0]["scenario_id"]

    rerun = api_client.post(f"/api/simulations/{parent_id}/rerun", json={
        "scenario_ids": [neg_id],
        "variables": {neg_id: {"time_pressure": "extreme — 4 hours"}},
    })
    assert rerun.status_code == 202, rerun.text
    child_id = rerun.json()["id"]
    assert rerun.json()["parent_run_id"] == parent_id
    child = api_client.get(f"/api/simulations/{child_id}").json()
    assert child["status"] == "done"
    assert len(child["scenarios"]) == 1
    assert child["scenarios"][0]["spec"]["variables"]["time_pressure"] == "extreme — 4 hours"

    after = api_client.get(f"/api/simulations/{parent_id}").json()
    assert after == before, "parent run must be byte-identical after rerun"


def test_rerun_validates(api_client, stub_model_client):
    stub_model_client(GOOD_SIM)
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    parent_id = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "negotiation"}]}).json()["id"]
    assert api_client.post("/api/simulations/run_nope/rerun", json={}).status_code == 404
    bad = api_client.post(f"/api/simulations/{parent_id}/rerun",
                          json={"scenario_ids": ["sc_nope"]})
    assert bad.status_code == 422
