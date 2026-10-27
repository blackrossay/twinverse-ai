def test_catalogue_shape(api_client):
    resp = api_client.get("/api/voice/catalogue")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["instant"]["ready"] is True
    assert "cloned" in body and "elevenlabs" in body and "studio" in body
    assert isinstance(body["studio"]["voices"], list)
    assert body["elevenlabs"]["voices"] == [] or isinstance(body["elevenlabs"]["voices"], list)


def test_speak_requires_hosted_key_or_503(api_client):
    # Tests run without ELEVENLABS_API_KEY -> clear 503, clones still work locally.
    resp = api_client.post("/api/voice/speak", json={"text": "hello", "voice_id": "x"})
    assert resp.status_code == 503
    assert "ELEVENLABS_API_KEY" in resp.json()["detail"]


def test_studio_503_without_kokoro_in_test_env(api_client):
    # The plain test venv has no kokoro-onnx/models -> honest 503, not a fake.
    resp = api_client.post("/api/voice/studio", json={"text": "hello", "voice": "af_heart"})
    assert resp.status_code == 503
