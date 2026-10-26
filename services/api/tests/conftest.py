import pytest
from fastapi.testclient import TestClient

from twinverse.identity.store import IdentityStore
from twinverse.main import app
from twinverse.routes.simulations import get_sim_store
from twinverse.simulation.store import SimulationStore
from twinverse.routes.simulations import get_model_client as get_sim_client
from twinverse.routes.twins import get_model_client as get_twin_client
from twinverse.routes.twins import get_store


@pytest.fixture()
def api_client(tmp_path, monkeypatch):
    """API test client with an isolated temp database and no live key."""
    monkeypatch.setenv("MODEL_API_KEY", "")
    db = tmp_path / "test.db"
    app.dependency_overrides[get_store] = lambda: IdentityStore(db)
    app.dependency_overrides[get_sim_store] = lambda: SimulationStore(db)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def stub_model_client(api_client):
    """Override model clients (twins + simulations) with canned responses."""
    from twinverse.meta_client import ModelResult

    class Stub:
        def __init__(self, texts):
            self.texts = list(texts)
            self.calls = 0

        def generate(self, prompt, *, model=None, timeout_s=None):
            self.calls += 1
            text = self.texts[min(self.calls - 1, len(self.texts) - 1)]
            return ModelResult(text=text, model="stub", latency_ms=1, fixture=False)

    def _use(*texts):
        stub = Stub(texts)
        app.dependency_overrides[get_twin_client] = lambda: stub
        app.dependency_overrides[get_sim_client] = lambda: stub
        return stub

    return _use
