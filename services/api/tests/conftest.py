import pytest
from fastapi.testclient import TestClient

from twinverse.evaluation.store import EvaluationStore
from twinverse.identity.store import IdentityStore
from twinverse.main import app
from twinverse.routes.comparison import get_eval_store
from twinverse.routes.comparison import get_model_client as get_eval_client
from twinverse.routes.simulations import get_sim_store
from twinverse.routes.simulations import get_model_client as get_sim_client
from twinverse.routes.twins import get_card_dir
from twinverse.routes.twins import get_model_client as get_twin_client
from twinverse.routes.twins import get_store
from twinverse.simulation.store import SimulationStore


@pytest.fixture()
def tmp_db(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture()
def api_client(tmp_db, monkeypatch):
    """API test client with an isolated temp database and no live key."""
    monkeypatch.setenv("MODEL_API_KEY", "")
    app.dependency_overrides[get_store] = lambda: IdentityStore(tmp_db)
    app.dependency_overrides[get_sim_store] = lambda: SimulationStore(tmp_db)
    app.dependency_overrides[get_eval_store] = lambda: EvaluationStore(tmp_db)
    app.dependency_overrides[get_card_dir] = lambda: str(tmp_db.parent / "cards")
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def stub_model_client(api_client):
    """Override model clients with canned generate() responses."""
    from twinverse.meta_client import ModelResult

    class Stub:
        def __init__(self, texts):
            self.texts = list(texts)
            self.calls = 0

        def generate(self, prompt, *, model=None, timeout_s=None):
            self.calls += 1
            text = self.texts[min(self.calls - 1, len(self.texts) - 1)]
            return ModelResult(text=text, model="stub", latency_ms=1, fixture=False)

        def generate_image(self, prompt, *, model=None):
            return b"fakepng-bytes"

    def _use(*texts):
        stub = Stub(texts)
        app.dependency_overrides[get_twin_client] = lambda: stub
        app.dependency_overrides[get_sim_client] = lambda: stub
        app.dependency_overrides[get_eval_client] = lambda: stub
        return stub

    return _use
