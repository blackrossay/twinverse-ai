import pytest

from twinverse.auth.store import UserStore, issue_token, verify_token
from twinverse.main import app
from twinverse.routes.auth import get_user_store
from twinverse.settings import Settings


@pytest.fixture()
def auth_client(api_client, tmp_db):
    app.dependency_overrides[get_user_store] = lambda: UserStore(tmp_db)
    yield api_client
    app.dependency_overrides.pop(get_user_store, None)


def test_signup_login_me_flow(auth_client):
    resp = auth_client.post(
        "/api/auth/signup",
        json={"email": "Maya@Example.com", "password": "supersecret1", "name": "Maya"},
    )
    assert resp.status_code == 201, resp.text
    token = resp.json()["token"]
    assert resp.json()["user"]["email"] == "maya@example.com"  # normalized
    me = auth_client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["name"] == "Maya"

    dup = auth_client.post(
        "/api/auth/signup", json={"email": "maya@example.com", "password": "whatever123"}
    )
    assert dup.status_code == 409

    bad = auth_client.post(
        "/api/auth/login", json={"email": "maya@example.com", "password": "wrong"}
    )
    assert bad.status_code == 401
    ok = auth_client.post(
        "/api/auth/login", json={"email": "maya@example.com", "password": "supersecret1"}
    )
    assert ok.status_code == 200


def test_me_requires_valid_token(auth_client):
    assert auth_client.get("/api/auth/me").status_code == 401
    assert (
        auth_client.get("/api/auth/me", headers={"Authorization": "Bearer nope.sig"}).status_code
        == 401
    )


def test_token_round_trip_and_tamper():
    settings = Settings()
    token = issue_token("user_abc", settings)
    assert verify_token(token, settings) == "user_abc"
    assert verify_token(token[:-4] + "0000", settings) is None
    assert verify_token("garbage", settings) is None


def test_provider_http_readiness_without_url():
    from twinverse.avatar.provider import inference_ready, missing

    settings = Settings()
    settings.twinverse_avatar_provider = "http"
    settings.twinverse_inference_url = ""
    assert inference_ready(settings) is False
    assert "TWINVERSE_INFERENCE_URL" in missing(settings)[0]
