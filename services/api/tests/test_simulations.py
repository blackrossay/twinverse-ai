import json
import time

import pytest

from twinverse.settings import Settings

GOOD_SIM = json.dumps({
    "response_text": "Here is my counter-proposal, grounded in our margin constraints.",
    "decisions": [{"decision": "Offer 7% discount", "rationale": "Within authority"}],
    "assumptions": ["Competitor bid is real"],
    "identity_facts_used": ["f_abc123"],
    "contradictions": [],
    "variables_noted": {"time_pressure": "acknowledged 3-day deadline"},
})

STRUCTURED = {
    "name": "Sim Twin",
    "verified_facts": [{"statement": "Owns pricing", "category": "work"}],
    "skills": ["negotiation"],
    "constraints": ["No discount over 10%"],
}


def _make_twin(api_client):
    return api_client.post("/api/twins", json=STRUCTURED).json()


def test_templates_list(api_client):
    resp = api_client.get("/api/scenarios/templates")
    assert resp.status_code == 200
    ids = {t["template_id"] for t in resp.json()}
    assert ids == {"negotiation", "escalation", "leadership"}
    assert all(t["objective"] and t["context"] for t in resp.json())


def test_launch_and_poll_single(api_client, stub_model_client):
    stub_model_client(GOOD_SIM)
    tid = _make_twin(api_client)["id"]
    launched = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "negotiation"}]})
    assert launched.status_code == 202, launched.text
    run_id = launched.json()["id"]
    run = api_client.get(f"/api/simulations/{run_id}").json()
    assert run["status"] == "done"
    assert run["identity_version"] == 1
    sc = run["scenarios"][0]
    assert sc["status"] == "done"
    assert sc["output"]["decisions"][0]["decision"] == "Offer 7% discount"
    assert sc["output"]["identity_facts_used"] == ["f_abc123"]
    assert sc["model"] == "stub"


def test_launch_validates_input(api_client, stub_model_client):
    stub_model_client(GOOD_SIM)
    tid = _make_twin(api_client)["id"]
    assert api_client.post("/api/simulations", json={
        "twin_id": "twin_nope", "scenarios": [{"template_id": "negotiation"}]}).status_code == 404
    bad = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "nope"}]})
    assert bad.status_code == 422
    empty = api_client.post("/api/simulations", json={"twin_id": tid, "scenarios": []})
    assert empty.status_code == 422


def test_failed_scenario_marks_run_failed(api_client, stub_model_client):
    stub_model_client("bad", "bad")
    tid = _make_twin(api_client)["id"]
    run_id = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "negotiation"}]}).json()["id"]
    run = api_client.get(f"/api/simulations/{run_id}").json()
    assert run["status"] == "failed"
    assert run["scenarios"][0]["status"] == "failed"
    assert "invalid" in run["scenarios"][0]["error"].lower()


def test_partial_rollup(api_client, stub_model_client):
    stub_model_client(GOOD_SIM, "bad", "bad")
    tid = _make_twin(api_client)["id"]
    run_id = api_client.post("/api/simulations", json={"twin_id": tid, "scenarios": [
        {"template_id": "negotiation"}, {"template_id": "escalation"}]}).json()["id"]
    run = api_client.get(f"/api/simulations/{run_id}").json()
    assert run["status"] == "partial"
    assert [s["status"] for s in run["scenarios"]] == ["done", "failed"]


def test_variable_override_and_snapshot_version(api_client, stub_model_client):
    stub_model_client(GOOD_SIM)
    tid = _make_twin(api_client)["id"]
    api_client.patch(f"/api/twins/{tid}", json={"skills": ["v2 skill"]})
    run_id = api_client.post("/api/simulations", json={
        "twin_id": tid, "version": 1,
        "scenarios": [{"template_id": "negotiation",
                       "variables": {"time_pressure": "extreme — 4 hours"}}]}).json()["id"]
    run = api_client.get(f"/api/simulations/{run_id}").json()
    assert run["identity_version"] == 1
    assert run["scenarios"][0]["spec"]["variables"]["time_pressure"] == "extreme — 4 hours"


_LIVE = Settings().model_api_key


@pytest.mark.skipif(not _LIVE, reason="needs MODEL_API_KEY (env or .env)")
def test_live_single_simulation(api_client, monkeypatch):
    """Real end-to-end simulation. Skipped (not green) without a key."""
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    tid = _make_twin(api_client)["id"]
    run_id = api_client.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "negotiation"}]}).json()["id"]
    deadline = time.time() + 240
    while time.time() < deadline:
        run = api_client.get(f"/api/simulations/{run_id}").json()
        if run["status"] in ("done", "partial", "failed"):
            break
        time.sleep(5)
    assert run["status"] == "done", run["scenarios"][0].get("error", run["status"])
    assert len(run["scenarios"][0]["output"]["response_text"]) > 50
