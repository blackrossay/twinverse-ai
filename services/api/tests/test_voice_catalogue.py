def test_catalogue_shape(api_client):
    resp = api_client.get("/api/voice/catalogue")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["instant"]["ready"] is True
    assert "cloned" in body and "studio" in body
    assert "elevenlabs" not in body  # no third-party voice APIs in the hackathon build
    assert isinstance(body["studio"]["voices"], list)


def test_studio_503_without_kokoro_in_test_env(api_client):
    # The plain test venv has no kokoro-onnx/models -> honest 503, not a fake.
    resp = api_client.post("/api/voice/studio", json={"text": "hello", "voice": "af_heart"})
    assert resp.status_code == 503
