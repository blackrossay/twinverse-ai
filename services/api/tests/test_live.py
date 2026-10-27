import pytest

from twinverse.live.store import LiveStore
from twinverse.main import app
from twinverse.routes.live import get_live_store
from twinverse.routes.live import get_model_client as get_live_client

STRUCTURED = {
    "name": "Stream Twin",
    "verified_facts": [{"statement": "Streams design teardowns weekly", "category": "work"}],
    "skills": ["design critique"],
    "goals": ["grow the channel"],
}


@pytest.fixture()
def live_client(api_client, tmp_db):
    app.dependency_overrides[get_live_store] = lambda: LiveStore(tmp_db)
    yield api_client
    app.dependency_overrides.pop(get_live_store, None)
    app.dependency_overrides.pop(get_live_client, None)


def _stub(*texts):
    from twinverse.meta_client import ModelResult

    class Stub:
        def __init__(self):
            self.prompts = []

        def generate(self, prompt, *, model=None, timeout_s=None):
            self.prompts.append(prompt)
            text = texts[min(len(self.prompts) - 1, len(texts) - 1)]
            return ModelResult(text=text, model="stub", latency_ms=2, fixture=False)

    stub = Stub()
    app.dependency_overrides[get_live_client] = lambda: stub
    return stub


def _session(api_client, **kw):
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    body = {"title": "Friday teardown", "mode": "socials", "platforms": ["youtube", "tiktok"],
            "agenda": ["Intro and wins", "Live teardown of viewer work"]}
    body.update(kw)
    resp = api_client.post(f"/api/twins/{tid}/live-sessions", json=body)
    assert resp.status_code == 201, resp.text
    return tid, resp.json()


def test_create_session_validates_mode_and_platforms(live_client):
    tid = live_client.post("/api/twins", json=STRUCTURED).json()["id"]
    bad = live_client.post(f"/api/twins/{tid}/live-sessions", json={"mode": "chaos"})
    assert bad.status_code == 422
    _, session = _session(live_client, platforms=["youtube", "myspace"])
    assert session["platforms"] == ["youtube"]  # unknown platforms filtered out
    assert session["status"] == "live" and len(session["agenda"]) == 2


def test_chat_reply_and_memory_of_agenda(live_client):
    _, session = _session(live_client)
    stub = _stub('{"reply": "Love that, Sara — short answer: ship the draft, then iterate live!"}')
    resp = live_client.post(
        f"/api/live/{session['id']}/chat",
        json={"platform": "youtube", "username": "Sara", "message": "Should I ship or polish?"},
    )
    assert resp.status_code == 200, resp.text
    msg = resp.json()
    assert "Sara" in msg["reply"] and msg["kind"] == "chat"
    assert "Live teardown" in stub.prompts[0]  # agenda is in the prompt
    got = live_client.get(f"/api/live/{session['id']}").json()
    assert len(got["messages"]) == 1


def test_advance_points_then_system_close(live_client):
    _, session = _session(live_client)
    _stub('{"reply": "Welcome in! First up, your wins this week."}',
          '{"reply": "Now the fun part — live teardowns, send your work!"}')
    first = live_client.post(f"/api/live/{session['id']}/advance")
    assert first.status_code == 200
    # First advance only marks point 1's predecessor? No: it opens point index flow.
    second = live_client.post(f"/api/live/{session['id']}/advance")
    assert second.status_code == 200
    third = live_client.post(f"/api/live/{session['id']}/advance")
    assert third.json()["kind"] in ("point", "system")


def test_fixture_chat_is_labeled(live_client):
    _, session = _session(live_client)
    resp = live_client.post(
        f"/api/live/{session['id']}/chat",
        json={"username": "Jo", "message": "hello twin"},
    )
    assert resp.status_code == 200
    assert resp.json()["fixture"] is True
    assert "OFFLINE FIXTURE" in resp.json()["reply"]


def test_end_blocks_chat_and_voice_needs_pipeline(live_client):
    _, session = _session(live_client)
    _stub('{"reply": "Hey Jo, welcome in!"}')
    msg = live_client.post(
        f"/api/live/{session['id']}/chat", json={"username": "Jo", "message": "hi"}
    ).json()
    assert live_client.post(f"/api/live/messages/{msg['id']}/voice").status_code == 503
    ended = live_client.post(f"/api/live/{session['id']}/end")
    assert ended.json()["status"] == "ended"
    blocked = live_client.post(
        f"/api/live/{session['id']}/chat", json={"username": "Jo", "message": "still here?"}
    )
    assert blocked.status_code == 409
