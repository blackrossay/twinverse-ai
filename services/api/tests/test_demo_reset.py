def test_demo_reset_wipes_and_reseeds(api_client):
    created = api_client.post(
        "/api/twins",
        json={"name": "Temp", "verified_facts": [{"statement": "s", "category": "w"}]},
    )
    assert created.status_code == 201
    assert any(t["name"] == "Temp" for t in api_client.get("/api/twins").json())

    resp = api_client.post("/api/demo/reset")
    assert resp.status_code == 200, resp.text
    names = [t["name"] for t in resp.json()]
    assert names, "reset must reseed demo personas"
    after = [t["name"] for t in api_client.get("/api/twins").json()]
    assert "Temp" not in after
    assert sorted(after) == sorted(names)
