import pytest

from twinverse.model_json import parse_json_object
from twinverse.simulation.store import SimulationStore


def test_parse_plain_object():
    assert parse_json_object('{"a": 1}') == {"a": 1}


def test_parse_fenced_json():
    assert parse_json_object('```json\n{"a": "x`"}\n```') == {"a": "x`"}


def test_parse_prose_wrapped_json():
    assert parse_json_object('Here you go: {"a": 2} hope that helps') == {"a": 2}


def test_parse_rejects_non_object():
    with pytest.raises(ValueError):
        parse_json_object("[1, 2]")
    with pytest.raises(ValueError):
        parse_json_object("no json here")


def test_recover_interrupted_runs(tmp_path):
    store = SimulationStore(tmp_path / "t.db")
    from twinverse.simulation.schemas import ScenarioSpec

    spec = ScenarioSpec(
        template_id="council-strategist", type="council", title="T",
        context="c", objective="o",
    )
    run = store.create_run("twin_x", 1, [spec])
    assert store.recover_interrupted() == 1
    recovered = store.get_run(run.id)
    assert recovered is not None
    assert recovered.status == "failed"
    assert recovered.scenarios[0].status == "failed"
    assert "restart" in recovered.scenarios[0].error
    assert store.recover_interrupted() == 0
