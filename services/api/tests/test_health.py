import os

import pytest
from fastapi.testclient import TestClient

from twinverse.main import app


@pytest.fixture()
def client():
    return TestClient(app)


def test_health_ok_shape(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "twinverse-api"
    assert body["model_mode"] in ("live", "fixture")
    assert isinstance(body["model"], str) and body["model"]
    assert isinstance(body["model_api_configured"], bool)


def test_health_fixture_mode_without_key(client, monkeypatch):
    # Empty env value overrides any project .env, keeping this hermetic.
    monkeypatch.setenv("MODEL_API_KEY", "")
    resp = client.get("/api/health")
    assert resp.json()["model_mode"] == "fixture"


def test_cors_allows_local_web_app(client):
    resp = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_health_live_mode_with_key(client, monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-key")
    resp = client.get("/api/health")
    assert resp.json()["model_mode"] == "live"
    assert os.environ["MODEL_API_KEY"] == "test-key"  # no key material in response
    assert "test-key" not in resp.text
