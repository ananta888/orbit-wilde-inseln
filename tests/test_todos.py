import copy
import importlib.util
import json

from orbit_server.paths import ROOT

spec = importlib.util.spec_from_file_location("orbit_todos", ROOT / "tools/validate_todos.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def track():
    return json.loads((ROOT / "todos/active/todo.orbit-core-foundation.json").read_text())


def test_track_matches_schema_and_derived_counts():
    assert module.validate_track(track()) == []


def test_duplicate_cycle_unknown_dependency_and_stale_counts_are_rejected():
    data = track(); data["tasks"].append(copy.deepcopy(data["tasks"][0]))
    assert module.validate_track(data)
    data = track(); data["tasks"][0]["dependencies"] = [data["tasks"][0]["id"]]
    assert any("cycle" in error for error in module.validate_track(data))
    data = track(); data["tasks"][0]["dependencies"] = ["MISSING"]
    assert module.validate_track(data)
    data = track(); data["tasks_status_summary"]["total"] += 1
    assert any("summary" in error for error in module.validate_track(data))
