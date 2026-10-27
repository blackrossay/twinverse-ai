import pytest

from twinverse.conversation.store import ConversationStore
from twinverse.main import app
from twinverse.routes.conversations import get_conv_store
from twinverse.routes.conversations import get_model_client as get_conv_client

STRUCTURED = {
    "name": "Chat Twin",
    "verified_facts": [{"statement": "Is a product designer in Berlin", "category": "work"}],
    "skills": ["negotiation"],
    "goals": ["grow a studio"],
}


@pytest.fixture()
def conv_client(api_client, tmp_db):
    app.dependency_overrides[get_conv_store] = lambda: ConversationStore(tmp_db)
    yield api_client
    app.dependency_overrides.pop(get_conv_store, None)
    app.dependency_overrides.pop(get_conv_client, None)


def _twin(api_client) -> str:
    return api_client.post("/api/twins", json=STRUCTURED).json()["id"]


def _stub(*texts):
    from twinverse.meta_client import ModelResult

    class Stub:
        def __init__(self):
            self.prompts = []

        def generate(self, prompt, *, model=None, timeout_s=None):
            self.prompts.append(prompt)
            text = texts[min(len(self.prompts) - 1, len(texts) - 1)]
            return ModelResult(text=text, model="stub", latency_ms=3, fixture=False)

    stub = Stub()
    app.dependency_overrides[get_conv_client] = lambda: stub
    return stub


def test_create_list_and_get_session(conv_client):
    tid = _twin(conv_client)
    created = conv_client.post(f"/api/twins/{tid}/conversations", json={})
    assert created.status_code == 201, created.text
    session = created.json()
    assert session["twin_id"] == tid and session["turns"] == []
    listed = conv_client.get(f"/api/twins/{tid}/conversations")
    assert [s["id"] for s in listed.json()] == [session["id"]]
    got = conv_client.get(f"/api/conversations/{session['id']}")
    assert got.status_code == 200


def test_unknown_twin_and_session(conv_client):
    assert conv_client.post("/api/twins/twin_nope/conversations", json={}).status_code == 404
    assert conv_client.get("/api/conversations/conv_nope").status_code == 404
    assert (
        conv_client.post("/api/conversations/conv_nope/turns", json={"message": "hi"}).status_code
        == 404
    )


def test_turn_round_trip_and_memory(conv_client):
    tid = _twin(conv_client)
    sid = conv_client.post(f"/api/twins/{tid}/conversations", json={}).json()["id"]
    stub = _stub(
        '{"reply": "I would negotiate, but keep Fridays free.", "facts_used": []}',
        '{"reply": "Still no Fridays — that boundary matters to me.", "facts_used": []}',
    )
    first = conv_client.post(f"/api/conversations/{sid}/turns", json={"message": "Take the gig?"})
    assert first.status_code == 200, first.text
    turn = first.json()
    assert turn["role"] == "twin" and "negotiate" in turn["text"] and turn["fixture"] is False

    second = conv_client.post(
        f"/api/conversations/{sid}/turns", json={"message": "Even if it needs Fridays?"}
    )
    assert second.status_code == 200
    # Second prompt must carry the conversation history.
    assert "Take the gig?" in stub.prompts[1]
    assert "I would negotiate" in stub.prompts[1]

    session = conv_client.get(f"/api/conversations/{sid}").json()
    assert [t["role"] for t in session["turns"]] == ["user", "twin", "user", "twin"]
    assert session["title"] == "Take the gig?"


def test_turn_tolerates_plain_text_reply(conv_client):
    tid = _twin(conv_client)
    sid = conv_client.post(f"/api/twins/{tid}/conversations", json={}).json()["id"]
    _stub("Honestly, I would sleep on it first.")
    resp = conv_client.post(f"/api/conversations/{sid}/turns", json={"message": "Rush or wait?"})
    assert resp.status_code == 200
    assert resp.json()["text"] == "Honestly, I would sleep on it first."


def test_fixture_turn_is_labeled(conv_client):
    # No stub override: the real client has no key in tests -> fixture reply.
    tid = _twin(conv_client)
    sid = conv_client.post(f"/api/twins/{tid}/conversations", json={}).json()["id"]
    resp = conv_client.post(f"/api/conversations/{sid}/turns", json={"message": "Hello?"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["fixture"] is True
    assert "OFFLINE FIXTURE" in resp.json()["text"]


def test_voice_requires_avatar_pipeline(conv_client):
    tid = _twin(conv_client)
    sid = conv_client.post(f"/api/twins/{tid}/conversations", json={}).json()["id"]
    _stub('{"reply": "Sure thing.", "facts_used": []}')
    turn = conv_client.post(f"/api/conversations/{sid}/turns", json={"message": "Hi"}).json()
    resp = conv_client.post(f"/api/conversations/turns/{turn['id']}/voice")
    assert resp.status_code == 503  # MeloTTS/OpenVoice not installed in CI env
    audio = conv_client.get(f"/api/conversations/turns/{turn['id']}/audio")
    assert audio.status_code == 404


def test_delete_session(conv_client):
    tid = _twin(conv_client)
    sid = conv_client.post(f"/api/twins/{tid}/conversations", json={}).json()["id"]
    assert conv_client.delete(f"/api/conversations/{sid}").status_code == 204
    assert conv_client.get(f"/api/conversations/{sid}").status_code == 404
