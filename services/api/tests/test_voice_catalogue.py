def test_catalogue_shape(api_client):
    resp = api_client.get("/api/voice/catalogue")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["instant"]["ready"] is True
    assert "cloned" in body and "elevenlabs" in body
    assert body["elevenlabs"]["voices"] == [] or isinstance(body["elevenlabs"]["voices"], list)


def test_speak_requires_hosted_key_or_503(api_client):
    # Tests run without ELEVENLABS_API_KEY -> clear 503, clones still work locally.
    resp = api_client.post("/api/voice/speak", json={"text": "hello", "voice_id": "x"})
    assert resp.status_code == 503
    assert "ELEVENLABS_API_KEY" in resp.json()["detail"]
