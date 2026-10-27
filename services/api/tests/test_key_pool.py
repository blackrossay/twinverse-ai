from twinverse.meta_client.client import MetaClient
from twinverse.settings import Settings


class _Err(Exception):
    def __init__(self, status_code):
        super().__init__(f"http {status_code}")
        self.status_code = status_code


class _Resp:
    output_text = "pooled-ok"

    def model_dump(self):
        return {}


def test_key_pool_rotates_on_429(monkeypatch):
    settings = Settings()
    settings.model_api_key = "key-one"
    settings.model_api_key_fallbacks = "key-two,key-three"
    client = MetaClient(settings)
    seen = []

    class FakeResponses:
        def create(self, model, input):
            seen.append(model)
            if len(seen) == 1:
                raise _Err(429)
            return _Resp()

    class FakeClient:
        def __init__(self):
            self.responses = FakeResponses()

        def with_options(self, timeout=None):
            return self

    monkeypatch.setattr(client, "_live_client", lambda api_key=None: FakeClient())
    result = client.generate("hi")
    assert result.text == "pooled-ok"
    assert len(seen) == 2  # first key rate-limited, second served


def test_key_pool_surfaces_non_auth_errors():
    import pytest

    settings = Settings()
    settings.model_api_key = "key-one"
    settings.model_api_key_fallbacks = "key-two"
    client = MetaClient(settings)

    def boom(_client):
        raise _Err(500)

    with pytest.raises(_Err):  # 500 is not a rotation trigger; surfaces as-is
        client._with_key_pool(boom)


def test_api_keys_parsing():
    settings = Settings()
    settings.model_api_key = "a"
    settings.model_api_key_fallbacks = " b , ,c "
    assert settings.api_keys == ["a", "b", "c"]
