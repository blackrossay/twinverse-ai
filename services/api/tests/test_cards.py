from twinverse.identity.cards import build_prompt
from twinverse.identity.schemas import IdentityPayload, TwinDetail


def test_create_and_get_image(api_client, stub_model_client):
    stub_model_client()
    tid = api_client.post("/api/twins", json={
        "name": "Card Twin", "verified_facts": [{"statement": "s", "category": "w"}],
        "skills": ["negotiation"]}).json()["id"]
    assert api_client.get(f"/api/twins/{tid}/image").status_code == 404
    created = api_client.post(f"/api/twins/{tid}/image")
    assert created.status_code == 201, created.text
    assert created.json()["bytes"] == len(b"fakepng-bytes")
    got = api_client.get(f"/api/twins/{tid}/image")
    assert got.status_code == 200
    assert got.headers["content-type"] == "image/png"
    assert got.content == b"fakepng-bytes"


def test_image_unknown_twin(api_client, stub_model_client):
    stub_model_client()
    assert api_client.post("/api/twins/twin_nope/image").status_code == 404
    assert api_client.get("/api/twins/twin_nope/image").status_code == 404


def test_image_needs_live_model(api_client):
    tid = api_client.post("/api/twins", json={
        "name": "NoKey", "verified_facts": [{"statement": "s", "category": "w"}]}).json()["id"]
    resp = api_client.post(f"/api/twins/{tid}/image")
    assert resp.status_code == 502
    assert "MODEL_API_KEY" in resp.json()["detail"]


def test_delete_removes_card(api_client, stub_model_client, tmp_db):
    stub_model_client()
    tid = api_client.post("/api/twins", json={
        "name": "Gone", "verified_facts": [{"statement": "s", "category": "w"}]}).json()["id"]
    api_client.post(f"/api/twins/{tid}/image")
    assert (tmp_db.parent / "cards" / f"{tid}.png").exists()
    api_client.delete(f"/api/twins/{tid}")
    assert not (tmp_db.parent / "cards" / f"{tid}.png").exists()


def test_card_prompt_avoids_real_likeness():
    twin = TwinDetail(id="twin_x", name="X", current_version=1, version=1,
                      payload=IdentityPayload(skills=["negotiation"]))
    prompt = build_prompt(twin)
    assert "no real person" in prompt and "no photorealistic face" in prompt


def test_stage_image_round_trip(api_client, stub_model_client):
    stub_model_client()
    tid = api_client.post("/api/twins", json={
        "name": "Stage Twin", "verified_facts": [{"statement": "s", "category": "w"}],
        "skills": ["streaming"]}).json()["id"]
    assert api_client.get(f"/api/twins/{tid}/stage-image").status_code == 404
    created = api_client.post(f"/api/twins/{tid}/stage-image")
    assert created.status_code == 201, created.text
    got = api_client.get(f"/api/twins/{tid}/stage-image")
    assert got.status_code == 200 and got.content == b"fakepng-bytes"
