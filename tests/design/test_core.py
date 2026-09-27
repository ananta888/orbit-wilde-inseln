import copy
import json

import pytest

pytest.importorskip("numpy")
pytest.importorskip("trimesh")
pytest.importorskip("manifold3d")
import numpy as np

from orbit_server.design.ai import local_plan, validate_plan
from orbit_server.design.document import DesignError, Conflict, canonical, validate
from orbit_server.design.generation import generate, primitive
from orbit_server.design.geometry import apply
from orbit_server.design.repository import Repository
from orbit_server.design.streaming import changes, decode


@pytest.fixture
def doc():
    result = generate("dragon", "arin")
    result["regions"] = [next(r for r in result["regions"] if r["id"] == "head")]
    return result


def pull():
    return {"tool": "pull", "regions": ["head"], "samples": [[0, 1.8, -1.6]], "radius": .5, "strength": .5}


def test_local_sculpt_is_bounded_masked_and_does_not_mutate_source(doc):
    source = canonical(doc)
    doc["regions"][0]["mask"][:20] = [1.] * 20
    before = copy.deepcopy(doc)
    result = apply(doc, pull())
    assert canonical(doc) == canonical(before)
    a = np.array(before["regions"][0]["positions"]).reshape(-1, 3)
    b = np.array(result["regions"][0]["positions"]).reshape(-1, 3)
    np.testing.assert_array_equal(a[:20], b[:20])
    assert np.any(a != b)
    assert np.linalg.norm(b - a, axis=1).max() <= .5 * .5 * .35 + 1e-6
    assert source != canonical(doc)


@pytest.mark.parametrize("tool", ["push", "pull", "inflate", "deflate", "smooth", "flatten", "pinch",
                                        "crease", "clay", "scale", "stretch", "grab", "move", "bend", "twist"])
def test_sculpt_kernels_return_valid_finite_documents(doc, tool):
    result = apply(doc, pull() | {"tool": tool, "delta": [.1, 0, 0]})
    validate(result)
    assert np.isfinite(result["regions"][0]["positions"]).all()


def test_patch_roundtrip_is_smaller_than_snapshot_and_checked(doc):
    modified = apply(doc, pull()); modified["revision"] = 1
    snapshot = changes(None, doc); patch = changes(doc, modified)
    assert len(patch) == 1 and len(patch[0]) < len(snapshot[0])
    header, arrays = decode(patch[0]); assert header["mode"] == "patch"
    points = np.array(doc["regions"][0]["positions"], dtype=np.float32).reshape(-1, 3)
    points[arrays["vertex_ids"]] = arrays["positions"].reshape(-1, 3)
    np.testing.assert_array_equal(points.ravel(), modified["regions"][0]["positions"])
    damaged = bytearray(patch[0]); damaged[-1] ^= 1
    with pytest.raises(DesignError, match="prüfsumme"): decode(bytes(damaged))


def test_history_survives_restart_and_command_ids_are_idempotent(tmp_path, doc):
    path = tmp_path / "creatures.sqlite3"
    store = Repository(path); store.create("me", doc)
    edited = apply(doc, pull())
    first = store.commit("me", edited, "a", "hash", "Pull")
    assert store.commit("me", edited, "a", "hash", "Pull") == first
    with pytest.raises(Conflict): store.commit("me", edited, "a", "other", "Pull")
    with pytest.raises(Conflict): store.commit("me", edited, "stale", "hash", "Pull")
    store.close(); store = Repository(path)
    assert store.load("me", "arin") == first
    undone = store.commit("me", first, "b", "undo", "Undo", history_action="undo")
    assert undone["revision"] == 2 and undone["regions"] == doc["regions"]
    redone = store.commit("me", undone, "c", "redo", "Redo", history_action="redo")
    assert redone["regions"] == first["regions"]
    with pytest.raises(DesignError): store.load("someone_else", "arin")
    store.close()


@pytest.mark.parametrize("mode", ["brush", "airbrush", "spray", "fill", "gradient", "eraser", "smudge", "stamp"])
def test_paint_and_protected_vertices(doc, mode):
    doc["regions"][0]["mask"][:20] = [1.] * 20
    before = copy.deepcopy(doc)
    result = apply(doc, pull() | {"tool": "paint", "paint_tool": mode, "color": [1, .1, .1]})
    assert result["regions"][0]["positions"] == before["regions"][0]["positions"]
    assert result["regions"][0]["colors"][:60] == before["regions"][0]["colors"][:60]


def test_ai_cannot_escape_explicit_selection(doc):
    proposal = local_plan(doc, ["head"], "Mach den Kopf 20 Prozent größer")
    validate_plan(proposal, ["head"])
    assert proposal["operations"][0]["value"] == 1.2
    with pytest.raises(DesignError): validate_plan({"speech": "ok", "operations": [{"tool": "delete", "regions": ["head"]}]}, ["head"])
    with pytest.raises(DesignError): validate_plan({"speech": "ok", "operations": [{"tool": "scale", "regions": ["torso"]}]}, ["head"])
    with pytest.raises(DesignError): apply(doc, {"tool": "pull", "exec": "os.system('x')"})


def test_boolean_is_real_union_and_rejects_masked_inputs(doc):
    a = primitive("sphere", [0, 0, 0], [.5, .5, .5], "a")
    b = primitive("sphere", [.4, 0, 0], [.5, .5, .5], "b")
    doc["regions"] = [a, b]
    merged = apply(doc, {"tool": "union", "regions": ["a", "b"]})
    assert len(merged["regions"]) == 1 and merged["regions"][0]["topology_revision"] == 1
    assert len(merged["regions"][0]["positions"]) != len(a["positions"]) + len(b["positions"])
    doc["regions"][0]["mask"][0] = 1
    with pytest.raises(DesignError): apply(doc, {"tool": "union", "regions": ["a", "b"]})


def test_invalid_geometry_and_asset_limits(doc):
    bad = copy.deepcopy(doc); bad["regions"][0]["positions"][0] = float("nan")
    with pytest.raises(DesignError): validate(bad)
    bad = copy.deepcopy(doc); bad["regions"][0]["indices"][0] = 999999
    with pytest.raises(DesignError): validate(bad)
    bad = copy.deepcopy(doc); bad["regions"][0]["positions"].append(1)
    with pytest.raises(DesignError): validate(bad)
    bad = json.loads(canonical(doc)); bad["schema_version"] = "99"
    with pytest.raises(DesignError): validate(bad)
