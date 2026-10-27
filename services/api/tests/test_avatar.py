"""Tests for talking-verdict avatars. The heavy ML pipeline is stubbed; no torch."""

import sys
from pathlib import Path
from types import ModuleType

import pytest

from twinverse.avatar import pipeline, service
from twinverse.avatar.likeness import (
    LikenessError,
    delete_likeness,
    likeness_paths,
    save_likeness,
)
from twinverse.avatar.pipeline import PipelineError, PipelineInfo, check_pipeline
from twinverse.avatar.schemas import TalkingVerdict
from twinverse.avatar.script import MAX_SCRIPT_CHARS, OPENING, build_verdict_script
from twinverse.avatar.service import AvatarNotReady, render_job, request_verdict
from twinverse.avatar.store import AvatarStore
from twinverse.main import app
from twinverse.routes.avatar import get_avatar_store
from twinverse.settings import Settings
from twinverse.simulation.schemas import ScenarioSpec
from twinverse.simulation.store import SimulationStore
from twinverse.simulation.templates import resolve_template
from twinverse.evaluation.store import EvaluationStore
from twinverse.routes.comparison import get_eval_store

import json

STRUCTURED = {
    "name": "Avatar Twin",
    "verified_facts": [{"statement": "Owns pricing", "category": "work"}],
}

GOOD_SIM = json.dumps({
    "response_text": "Here is my in-character verdict with enough length to pass checks.",
    "decisions": [{"decision": "Take the offer", "rationale": "Growth"}],
    "assumptions": ["Offer is real"],
    "identity_facts_used": [],
    "contradictions": [],
    "variables_noted": {"depth": "noted"},
})

EVAL_JSON = json.dumps({
    "identity_consistency": {"score": 4, "evidence": ["cites facts"], "notes": "ok"},
    "scenario_effectiveness": {"score": 5, "evidence": ["clear pick"], "notes": "ok"},
    "adaptation": {"score": 3, "evidence": ["mentions risk"], "notes": "ok"},
})


def _spec(template_id="council-strategist"):
    t = resolve_template(template_id)
    return ScenarioSpec(
        template_id=t.template_id, type=t.type, title=t.title, context=t.context,
        objective=t.objective, constraints=list(t.constraints),
        variables=dict(t.variables), counterpart=t.counterpart, rubric_id=t.rubric_id,
    )


@pytest.fixture()
def avatar_dir(tmp_path, monkeypatch):
    path = tmp_path / "avatars"
    monkeypatch.setenv("TWINVERSE_AVATAR_DIR", str(path))
    monkeypatch.setenv("TWINVERSE_OPENVOICE_CKPT", str(tmp_path / "ckpt"))
    monkeypatch.delenv("TWINVERSE_MUSETALK_REPO", raising=False)
    return path


@pytest.fixture()
def avatar_overrides(api_client, tmp_db):
    app.dependency_overrides[get_avatar_store] = lambda: AvatarStore(tmp_db)
    return api_client


def _fake_ml(monkeypatch, cuda=False):
    """Pretend the voice/video pip packages are installed (imports only)."""
    melo_pkg = ModuleType("melo")
    melo_pkg.__path__ = []
    monkeypatch.setitem(sys.modules, "melo", melo_pkg)
    monkeypatch.setitem(sys.modules, "melo.api", ModuleType("melo.api"))
    monkeypatch.setitem(sys.modules, "openvoice", ModuleType("openvoice"))
    monkeypatch.setitem(sys.modules, "imageio_ffmpeg", ModuleType("imageio_ffmpeg"))
    torch = ModuleType("torch")
    torch.cuda = ModuleType("torch.cuda")
    torch.cuda.is_available = lambda: cuda
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "torch.cuda", torch.cuda)


def _make_ckpt(monkeypatch, tmp_path):
    ckpt = tmp_path / "ckpt"
    (ckpt / "converter").mkdir(parents=True)
    (ckpt / "base_speakers" / "ses").mkdir(parents=True)
    (ckpt / "converter" / "config.json").write_text("{}")
    (ckpt / "converter" / "checkpoint.pth").write_bytes(b"x")
    (ckpt / "base_speakers" / "ses" / "en-newest.pth").write_bytes(b"x")
    monkeypatch.setenv("TWINVERSE_OPENVOICE_CKPT", str(ckpt))
    return ckpt


# --- script -----------------------------------------------------------------


def test_script_empty_summary():
    assert build_verdict_script("") == OPENING.strip()


def test_script_short_passthrough():
    assert build_verdict_script("Take the offer.") == OPENING + "Take the offer."


def test_script_truncates_at_word_boundary():
    out = build_verdict_script("word " * 500)
    assert len(out) <= MAX_SCRIPT_CHARS
    assert out.startswith(OPENING) and out.endswith("…")


# --- likeness ----------------------------------------------------------------


def _save(tmp_path, **kw):
    args = dict(
        consent="true",
        photo_name="me.jpg", photo_type="image/jpeg", photo_bytes=b"fakeimg",
        voice_name="me.wav", voice_type="audio/wav", voice_bytes=b"fakewav",
    )
    args.update(kw)
    return save_likeness(str(tmp_path), **args)


def test_likeness_roundtrip_and_delete(tmp_path):
    assert likeness_paths(tmp_path).present is False
    like = _save(tmp_path)
    assert like.present and like.photo.is_file() and like.voice.is_file()
    assert likeness_paths(tmp_path).present is True
    delete_likeness(tmp_path)
    assert likeness_paths(tmp_path).present is False


def test_likeness_requires_consent(tmp_path):
    with pytest.raises(LikenessError, match="your own"):
        _save(tmp_path, consent="")
    with pytest.raises(LikenessError, match="your own"):
        _save(tmp_path, consent="false")


def test_likeness_validates_files(tmp_path):
    with pytest.raises(LikenessError, match="Photo must be"):
        _save(tmp_path, photo_name="me.txt", photo_type="text/plain")
    with pytest.raises(LikenessError, match="Voice sample must be"):
        _save(tmp_path, voice_name="me.txt", voice_type="text/plain")
    with pytest.raises(LikenessError, match="under 10 MB"):
        _save(tmp_path, photo_bytes=b"")
    with pytest.raises(LikenessError, match="under 15 MB"):
        _save(tmp_path, voice_bytes=b"x" * (16 * 1024 * 1024))


def test_likeness_replace_clears_old(tmp_path):
    _save(tmp_path)
    _save(tmp_path, photo_name="me.png", photo_type="image/png")
    assert likeness_paths(tmp_path).photo.suffix == ".png"
    assert len(list((tmp_path / "likeness").glob("photo.*"))) == 1


# --- pipeline readiness -------------------------------------------------------


def test_pipeline_missing_everything_by_default(avatar_dir):
    info = check_pipeline(Settings())
    assert info.voice_ready is False
    assert info.lipsync_ready is False
    assert info.device == "cpu"
    blob = " ".join(info.missing)
    assert "MeloTTS" in blob and "OpenVoice" in blob and "torch" in blob


def test_pipeline_ready_with_stack_and_checkpoints(avatar_dir, monkeypatch, tmp_path):
    _fake_ml(monkeypatch)
    _make_ckpt(monkeypatch, tmp_path)
    info = check_pipeline(Settings())
    assert info.voice_ready is True and info.missing == []
    assert info.lipsync_ready is False  # cpu box
    assert "NVIDIA GPU" in info.lipsync_note


def test_pipeline_lipsync_when_cuda_and_repo(avatar_dir, monkeypatch, tmp_path):
    _fake_ml(monkeypatch, cuda=True)
    _make_ckpt(monkeypatch, tmp_path)
    repo = tmp_path / "MuseTalk"
    (repo / "scripts").mkdir(parents=True)
    (repo / "scripts" / "inference.py").write_text("# fake")
    monkeypatch.setenv("TWINVERSE_MUSETALK_REPO", str(repo))
    info = check_pipeline(Settings())
    assert info.device == "cuda" and info.lipsync_ready is True


# --- store --------------------------------------------------------------------


def test_store_roundtrip(tmp_db):
    store = AvatarStore(tmp_db)
    assert store.latest_for_run("run_x") is None
    job = store.new_job("run_x", provider="local")
    assert job.status == "queued" and job.render_mode == "portrait"
    assert store.get(job.id) is not None
    updated = store.touch(job, status="rendering")
    assert store.latest_for_run("run_x").status == "rendering"
    assert updated.updated_at >= job.updated_at


def test_store_migrates_old_databases(tmp_path):
    import sqlite3

    db = tmp_path / "old.db"
    conn = sqlite3.connect(db)
    conn.execute(
        "CREATE TABLE talking_verdicts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL,"
        " provider TEXT NOT NULL, provider_job_id TEXT NOT NULL DEFAULT '',"
        " status TEXT NOT NULL DEFAULT 'queued', script TEXT NOT NULL DEFAULT '',"
        " video_url TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',"
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    conn.execute(
        "INSERT INTO talking_verdicts (id, run_id, provider, created_at, updated_at)"
        " VALUES ('tv_old', 'run_x', 'local', '2026-01-01', '2026-01-01')"
    )
    conn.commit()
    conn.close()
    store = AvatarStore(db)  # migrates on open
    assert store.get("tv_old").render_mode == "portrait"


# --- service -------------------------------------------------------------------


def test_service_requires_pipeline_and_likeness(tmp_db, avatar_dir):
    settings = Settings()
    with pytest.raises(AvatarNotReady) as exc:
        request_verdict("run_x", "summary", settings, AvatarStore(tmp_db))
    assert "MeloTTS" in " ".join(exc.value.missing)


def test_service_queues_job_when_ready(tmp_db, avatar_dir, monkeypatch, tmp_path):
    _fake_ml(monkeypatch)
    _make_ckpt(monkeypatch, tmp_path)
    _save(avatar_dir)
    settings = Settings()
    job = request_verdict("run_x", "Take the offer.", settings, AvatarStore(tmp_db))
    assert job.status == "queued" and job.provider == "local"
    assert job.script == OPENING + "Take the offer."


def test_service_render_job_success_and_failure(tmp_db, avatar_dir, monkeypatch):
    store = AvatarStore(tmp_db)
    settings = Settings()

    def fake_render(script_text, **kw):
        assert script_text.startswith(OPENING)
        out = Path(kw["videos_dir"]) / f"{kw['job_id']}.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"fakemp4")
        return out, "portrait"

    monkeypatch.setattr(service, "render_verdict", fake_render)
    job = store.touch(store.new_job("run_x", "local"), script=OPENING + "hi")
    done = render_job(job.id, settings, store)
    assert done.status == "done" and done.render_mode == "portrait"
    assert done.video_url == f"/api/avatar/video/{job.id}"

    def boom(script_text, **kw):
        raise PipelineError("voice stack exploded")

    monkeypatch.setattr(service, "render_verdict", boom)
    job2 = store.touch(store.new_job("run_x", "local"), script=OPENING + "hi")
    failed = render_job(job2.id, settings, store)
    assert failed.status == "failed" and "exploded" in failed.error

    assert render_job("tv_nope", settings, store) is None  # unknown job: no-op
    assert render_job(job.id, settings, store).status == "done"  # terminal: no-op


# --- endpoints ------------------------------------------------------------------


def test_avatar_status_shape(avatar_overrides, avatar_dir):
    body = avatar_overrides.get("/api/avatar/status").json()
    assert body["voice_ready"] is False
    assert body["likeness_present"] is False
    assert body["configured"] is False
    assert body["device"] == "cpu"
    assert isinstance(body["missing"], list) and body["missing"]
    assert "lipsync_note" in body


def test_likeness_upload_and_delete(avatar_overrides, avatar_dir):
    files = {
        "photo": ("me.jpg", b"fakeimg", "image/jpeg"),
        "voice": ("me.wav", b"fakewav", "audio/wav"),
    }
    denied = avatar_overrides.post("/api/avatar/likeness", files=files, data={"consent": ""})
    assert denied.status_code == 422
    bad = avatar_overrides.post(
        "/api/avatar/likeness",
        files={"photo": ("me.txt", b"x", "text/plain"), "voice": ("v.wav", b"x", "audio/wav")},
        data={"consent": "true"},
    )
    assert bad.status_code == 422

    ok = avatar_overrides.post("/api/avatar/likeness", files=files, data={"consent": "true"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["likeness_present"] is True
    assert likeness_paths(avatar_dir).present is True

    gone = avatar_overrides.delete("/api/avatar/likeness")
    assert gone.json()["likeness_present"] is False
    assert likeness_paths(avatar_dir).present is False


def test_post_verdict_run_guards(avatar_overrides, avatar_dir, tmp_db):
    assert avatar_overrides.post("/api/simulations/run_nope/talking-verdict").status_code == 404
    sims = SimulationStore(tmp_db)
    running = sims.create_run("twin_x", 1, [_spec()])
    assert avatar_overrides.post(
        f"/api/simulations/{running.id}/talking-verdict").status_code == 409


def test_post_verdict_needs_pipeline(avatar_overrides, avatar_dir, stub_model_client):
    stub_model_client(GOOD_SIM, EVAL_JSON, "The council says: take the offer.")
    tid = avatar_overrides.post("/api/twins", json=STRUCTURED).json()["id"]
    run_id = avatar_overrides.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "council-strategist"}]}).json()["id"]
    resp = avatar_overrides.post(f"/api/simulations/{run_id}/talking-verdict")
    assert resp.status_code == 503
    assert "MeloTTS" in resp.json()["detail"]


def test_post_and_get_verdict_flow(avatar_overrides, avatar_dir, stub_model_client,
                                   monkeypatch, tmp_path):
    _fake_ml(monkeypatch)
    _make_ckpt(monkeypatch, tmp_path)
    _save(avatar_dir)

    def fake_render(script_text, **kw):
        out = Path(kw["videos_dir"]) / f"{kw['job_id']}.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"fakemp4-bytes")
        return out, "portrait"

    monkeypatch.setattr(service, "render_verdict", fake_render)

    stub_model_client(GOOD_SIM, EVAL_JSON, "The council says: take the offer.")
    tid = avatar_overrides.post("/api/twins", json=STRUCTURED).json()["id"]
    run_id = avatar_overrides.post("/api/simulations", json={
        "twin_id": tid, "scenarios": [{"template_id": "council-strategist"}]}).json()["id"]

    assert avatar_overrides.get(
        f"/api/simulations/{run_id}/talking-verdict").status_code == 404

    created = avatar_overrides.post(f"/api/simulations/{run_id}/talking-verdict")
    assert created.status_code == 202, created.text
    assert "take the offer" in created.json()["script"]

    fetched = avatar_overrides.get(f"/api/simulations/{run_id}/talking-verdict").json()
    assert fetched["status"] == "done"
    assert fetched["render_mode"] == "portrait"
    assert fetched["video_url"].endswith(".mp4") is False  # served via endpoint
    assert fetched["video_url"].startswith("/api/avatar/video/")

    video = avatar_overrides.get(fetched["video_url"])
    assert video.status_code == 200
    assert video.headers["content-type"] == "video/mp4"
    assert video.content == b"fakemp4-bytes"


def test_video_not_ready_is_404(avatar_overrides, avatar_dir, tmp_db):
    store = AvatarStore(tmp_db)
    job = store.new_job("run_x", "local")
    assert avatar_overrides.get(f"/api/avatar/video/{job.id}").status_code == 404
    assert avatar_overrides.get("/api/avatar/video/tv_nope").status_code == 404


def test_no_proprietary_avatar_calls(monkeypatch):
    """The avatar stack makes no third-party API calls: local pipeline only."""
    import twinverse.avatar.pipeline as pipe

    assert not hasattr(pipe, "heygen_create")
    assert not hasattr(pipe, "did_create")
    src = Path(pipe.__file__).read_text()
    assert "heygen" not in src.lower() and "d-id" not in src.lower()
