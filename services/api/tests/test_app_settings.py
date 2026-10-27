import pytest

from twinverse.app_config import AppConfig
from twinverse.main import app
from twinverse.routes.settings import get_config


@pytest.fixture()
def settings_client(api_client, tmp_db):
    app.dependency_overrides[get_config] = lambda: AppConfig(tmp_db)
    yield api_client
    app.dependency_overrides.pop(get_config, None)


def test_inference_settings_round_trip(settings_client):
    view = settings_client.get("/api/settings/inference")
    assert view.status_code == 200, view.text
    assert view.json()["provider"] == "local"

    saved = settings_client.put(
        "/api/settings/inference",
        json={
            "provider": "http",
            "inference_url": "https://inference.example.com",
            "inference_token": "shared-secret-42",
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["provider"] == "http"
    assert body["inference_url"] == "https://inference.example.com"
    assert body["token_hint"].endswith("t-42")  # token masked, never returned whole
    assert "shared-secret" not in str(body)

    again = settings_client.get("/api/settings/inference").json()
    assert again["provider"] == "http"  # persisted, survives across requests


def test_inference_settings_validation(settings_client):
    bad_provider = settings_client.put(
        "/api/settings/inference", json={"provider": "gpu-magic"}
    )
    assert bad_provider.status_code == 422
    bad_url = settings_client.put(
        "/api/settings/inference",
        json={"provider": "http", "inference_url": "ftp://nope"},
    )
    assert bad_url.status_code == 422
