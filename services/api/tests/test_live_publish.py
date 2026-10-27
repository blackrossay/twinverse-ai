import pytest

from twinverse.live import streamer
from twinverse.live.store import LiveStore
from twinverse.main import app
from twinverse.routes.live import get_live_store

STRUCTURED = {
    "name": "Publisher Twin",
    "verified_facts": [{"statement": "Streams weekly", "category": "work"}],
}


@pytest.fixture()
def pub_client(api_client, tmp_db, monkeypatch):
    app.dependency_overrides[get_live_store] = lambda: LiveStore(tmp_db)
    monkeypatch.setattr(streamer, "_processes", {})
    yield api_client
    app.dependency_overrides.pop(get_live_store, None)


def _session(api_client) -> str:
    tid = api_client.post("/api/twins", json=STRUCTURED).json()["id"]
    return api_client.post(
        f"/api/twins/{tid}/live-sessions", json={"title": "Show", "platforms": []}
    ).json()["id"]


def test_destination_is_masked(pub_client):
    sid = _session(pub_client)
    assert pub_client.get(f"/api/live/{sid}/destination").json()["configured"] is False
    saved = pub_client.post(
        f"/api/live/{sid}/destination",
        json={"rtmp_url": "rtmp://a.rtmp.youtube.com/live2", "stream_key": "abcd-secret-9876"},
    )
    assert saved.status_code == 200, saved.text
    view = saved.json()
    assert view["configured"] is True and view["key_hint"].endswith("9876")
    assert "secret" not in str(view)  # full key never leaves the server
    session = pub_client.get(f"/api/live/{sid}").json()
    assert session["youtube_configured"] is True and "youtube" in session["platforms"]
    bad = pub_client.post(
        f"/api/live/{sid}/destination",
        json={"rtmp_url": "https://example.com", "stream_key": "abcd-secret-9876"},
    )
    assert bad.status_code == 422


def test_publish_requires_destination(pub_client):
    sid = _session(pub_client)
    resp = pub_client.post(f"/api/live/{sid}/publish")
    assert resp.status_code == 503
    assert "destination" in resp.json()["detail"].lower()


def test_publish_flow_with_fake_ffmpeg(pub_client, monkeypatch):
    sid = _session(pub_client)
    pub_client.post(
        f"/api/live/{sid}/destination",
        json={"stream_key": "abcd-secret-9876"},
    )
    calls = {}

    def fake_publish(session, settings, store):
        calls["session"] = session.id
        return "publishing"

    monkeypatch.setattr(streamer, "publish_session", fake_publish)
    monkeypatch.setattr(streamer, "is_publishing", lambda _sid: True)
    resp = pub_client.post(f"/api/live/{sid}/publish")
    assert resp.status_code == 200, resp.text
    assert resp.json()["stream_status"] == "publishing"
    assert calls["session"] == sid


def test_command_builder_hides_nothing_but_shape_is_right(tmp_path):
    concat = tmp_path / "playlist.txt"
    concat.write_text("file 'x.mp4'\n")
    cmd = streamer.build_publish_command("ffmpeg", concat, "rtmp://ingest/key")
    assert cmd[-1] == "rtmp://ingest/key" and "-f" in cmd and "flv" in cmd
    assert "1280:720" in " ".join(cmd) and "2500k" in cmd
