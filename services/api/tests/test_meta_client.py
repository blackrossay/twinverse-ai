import pytest

from twinverse.meta_client import FIXTURE_LABEL, MetaClient, MetaClientError
from twinverse.settings import Settings


def _settings(**overrides):
    base = dict(model_api_key="", twinverse_fixtures="auto")
    base.update(overrides)
    return Settings(**base)


def test_fixture_output_is_labeled():
    result = MetaClient(_settings()).generate("hello")
    assert result.fixture is True
    assert result.text.startswith(FIXTURE_LABEL)
    assert result.model == "muse-spark-1.3"


def test_missing_key_with_fixtures_off_raises_clear_error():
    with pytest.raises(MetaClientError, match="MODEL_API_KEY is not set"):
        MetaClient(_settings(twinverse_fixtures="off")).generate("hello")


def test_fixture_mode_property():
    assert MetaClient(_settings()).mode == "fixture"
    assert MetaClient(_settings(model_api_key="k")).mode == "live"


_LIVE_KEY = Settings().model_api_key  # env + project .env merged


@pytest.mark.skipif(not _LIVE_KEY, reason="needs MODEL_API_KEY (env or .env)")
def test_live_generate_smoke():
    """Real Model API call. Skipped (not green) when no key is configured."""
    result = MetaClient(Settings()).generate("Reply with exactly: TWINVERSE-OK")
    assert result.fixture is False
    assert "TWINVERSE-OK" in result.text
