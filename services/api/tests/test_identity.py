import json

import pytest

from twinverse.settings import Settings

GOOD_JSON = json.dumps({
    "verified_facts": [{"statement": "Led platform team", "category": "work"}],
    "skills": ["council-strategist"],
    "goals": ["Close the deal"],
    "constraints": ["No discount over 10%"],
    "behavioral_hypotheses": [
        {"statement": "Stays calm", "confidence": 0.6, "basis": "senior role"}
    ],
    "communication_style": {"tone": "direct"},
})

STRUCTURED = {
    "name": "Test Twin",
    "bio": "A test persona.",
    "verified_facts": [{"statement": "Knows testing", "category": "skill"}],
    "skills": ["pytest"],
    "goals": ["Ship green"],
    "constraints": ["No flaky tests"],
    "behavioral_hypotheses": [
        {"statement": "Writes tests first", "confidence": 0.5, "basis": "test body"}
    ],
    "communication_style": {"tone": "direct"},
}


def test_create_structured(api_client):
    resp = api_client.post("/api/twins", json=STRUCTURED)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["version"] == 1
    assert body["payload"]["verified_facts"][0]["statement"] == "Knows testing"
    assert body["payload"]["behavioral_hypotheses"][0]["confidence"] == 0.5
    assert body["payload"]["provenance"], "provenance must be recorded"


def test_create_requires_name_or_content(api_client):
    assert api_client.post("/api/twins", json={"name": ""}).status_code == 422
    assert api_client.post("/api/twins", json={"name": "Empty"}).status_code == 422


def test_create_rejects_bad_confidence(api_client):
    bad = dict(STRUCTURED, behavioral_hypotheses=[
        {"statement": "x", "confidence": 1.5, "basis": ""}])
    assert api_client.post("/api/twins", json=bad).status_code == 422


def test_patch_bumps_version_and_preserves_history(api_client):
    created = api_client.post("/api/twins", json=STRUCTURED).json()
    tid = created["id"]
    patched = api_client.patch("/api/twins/" + tid, json={"skills": ["a", "b"]})
    assert patched.status_code == 200
    assert patched.json()["version"] == 2
    assert patched.json()["payload"]["skills"] == ["a", "b"]
    # Unspecified lists preserved
    assert patched.json()["payload"]["goals"] == ["Ship green"]
    # v1 immutable and retrievable
    v1 = api_client.get(f"/api/twins/{tid}?version=1").json()
    assert v1["version"] == 1
    assert v1["payload"]["skills"] == ["pytest"]
    assert api_client.get(f"/api/twins/{tid}/versions").json() == [1, 2]


def test_list_and_delete(api_client):
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    assert any(t["id"] == tid for t in api_client.get("/api/twins").json())
    assert api_client.delete("/api/twins/" + tid).status_code == 204
    assert api_client.get("/api/twins/" + tid).status_code == 404
    assert api_client.delete("/api/twins/" + tid).status_code == 404


def test_seed_twins_idempotent(api_client):
    first = api_client.post("/api/twins/seed")
    assert first.status_code == 201
    names = {t["name"] for t in first.json()}
    assert {"Maya Chen", "Leo Park"} <= names
    assert first.json()[0]["payload"]["provenance"][0]["source"] == "seed"
    second = api_client.post("/api/twins/seed")
    assert second.json() == [], "re-seed must skip existing names"


def test_extraction_with_stub(api_client, stub_model_client):
    stub_model_client(GOOD_JSON)
    resp = api_client.post("/api/twins", json={"name": "Bio Twin", "bio": "Led teams."})
    assert resp.status_code == 201, resp.text
    payload = resp.json()["payload"]
    assert payload["verified_facts"][0]["statement"] == "Led platform team"
    assert payload["behavioral_hypotheses"][0]["confidence"] == 0.6
    assert payload["provenance"][0]["source"] == "model"
    # Facts and hypotheses stay in disjoint shapes with disjoint ids
    fact_ids = {f["id"] for f in payload["verified_facts"]}
    hyp_ids = {h["id"] for h in payload["behavioral_hypotheses"]}
    assert "confidence" not in payload["verified_facts"][0]
    assert fact_ids.isdisjoint(hyp_ids)


def test_extraction_repairs_once_then_serves(api_client, stub_model_client):
    stub = stub_model_client("not json at all", GOOD_JSON)
    resp = api_client.post("/api/twins", json={"name": "Fix", "bio": "x bio"})
    assert resp.status_code == 201, resp.text
    assert stub.calls == 2


def test_extraction_fails_clearly(api_client, stub_model_client):
    stub_model_client("still not json", "never json")
    resp = api_client.post("/api/twins", json={"name": "Bad", "bio": "x bio"})
    assert resp.status_code == 502
    assert "invalid" in resp.json()["detail"].lower()


def test_extraction_rejects_overconfident_hypothesis(api_client, stub_model_client):
    over = json.dumps({"behavioral_hypotheses": [
        {"statement": "x", "confidence": 0.95, "basis": ""}]})
    stub_model_client(over, over)
    resp = api_client.post("/api/twins", json={"name": "Cocky", "bio": "x bio"})
    assert resp.status_code == 502


def test_extraction_needs_live_model(api_client):
    resp = api_client.post("/api/twins", json={"name": "NoKey", "bio": "x bio"})
    assert resp.status_code == 502
    assert "MODEL_API_KEY" in resp.json()["detail"]


_LIVE = Settings().model_api_key


@pytest.mark.skipif(not _LIVE, reason="needs MODEL_API_KEY (env or .env)")
def test_live_extraction_smoke(api_client, monkeypatch):
    """Real extraction call. Skipped (not green) without a key."""
    monkeypatch.delenv("MODEL_API_KEY", raising=False)  # let .env key through
    resp = api_client.post("/api/twins", json={
        "name": "Live Probe",
        "bio": "Maya Chen is a data analyst with 3 years of experience in fintech.",
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["payload"]["verified_facts"], "expected extracted facts"
