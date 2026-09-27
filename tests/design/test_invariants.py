import asyncio
import copy
import time

import pytest

pytest.importorskip("numpy")
pytest.importorskip("trimesh")
pytest.importorskip("manifold3d")
import numpy as np

from orbit_server.design.document import DesignError, new_document
from orbit_server.design.generation import TEMPLATES, generate, primitive
from orbit_server.design.geometry import apply, brush_weights
from orbit_server.design.schemas import check
from orbit_server.design.validation import analyze
from orbit_server.design.workers import GeometryWorkers, perform
from orbit_server.design.preview import blend, blendable


def sphere():
    return new_document("test", "Test", [primitive("sphere", [0, 0, 0], [1, 1, 1], "body")])


def slow_job(doc, operations):
    time.sleep(30)
    return doc


def test_timeout_kills_native_job_and_capacity_recovers():
    async def run():
        workers = GeometryWorkers(timeout=.1, concurrency=1, runner=slow_job)
        start = time.monotonic()
        with pytest.raises(DesignError, match="Zeitbudget"):
            await workers.run(sphere(), [])
        assert time.monotonic() - start < 5
        assert not workers.jobs
        workers.runner, workers.timeout = perform, 8
        result = await workers.run(sphere(), [{"tool": "rename", "name": "Recovered"}])
        assert result["name"] == "Recovered"
        await workers.close()
        with pytest.raises(DesignError): await workers.run(sphere(), [])
    asyncio.run(run())


def test_shutdown_cancels_jobs_without_leaving_capacity_or_waiting_for_native_work():
    async def run():
        workers = GeometryWorkers(timeout=60, concurrency=1, runner=slow_job)
        job = asyncio.create_task(workers.run(sphere(), []))
        await asyncio.sleep(.05)
        with pytest.raises(DesignError, match="ausgelastet"):
            await workers.run(sphere(), [])
        await asyncio.wait_for(workers.close(), 3)
        assert job.cancelled() and not workers.jobs
    asyncio.run(run())


def test_mirror_grab_moves_opposite_sides_in_opposite_directions():
    doc = sphere()
    op = {"tool": "grab", "regions": ["body"], "samples": [[1, 0, 0]], "radius": .5,
          "strength": 1, "delta": [.2, .1, 0], "symmetry": "x"}
    changed = apply(doc, op)
    a = np.asarray(doc["regions"][0]["positions"]).reshape(-1, 3)
    b = np.asarray(changed["regions"][0]["positions"]).reshape(-1, 3)
    for sign in (-1, 1):
        index = np.argmin(np.linalg.norm(a - [sign, 0, 0], axis=1))
        np.testing.assert_allclose(b[index] - a[index], [.2 * sign, .1, 0], atol=1e-6)


def test_radial_overlap_does_not_multiply_brush_strength():
    points = np.array([[0, 0, 0], [.1, 0, .1], [2, 0, 0]])
    a = brush_weights(points, np.zeros(3), 1, "", 1, 1)
    b = brush_weights(points, np.zeros(3), 1, "xyz", 12, 1)
    np.testing.assert_array_equal(a, b)


def test_masks_protect_material_and_solid_operations():
    doc = sphere(); doc["regions"][0]["mask"][0] = 1
    for operation in ({"tool": "material", "material": {"detail": "scales"}},
                      {"tool": "cut", "position": [0, 0, 0]}, {"tool": "simplify"}):
        with pytest.raises(DesignError): apply(doc, operation | {"regions": ["body"]})
    doc["regions"][0]["locked"] = True
    with pytest.raises(DesignError):
        apply(doc, {"tool": "mask", "regions": ["body"], "samples": [[1, 0, 0]], "value": 0})


def test_rig_invalidation_and_formal_document_schema():
    original = sphere(); rigged = apply(original, {"tool": "rig"})
    check("edit-document", rigged)
    posed = apply(rigged, {"tool": "pose", "bone": "body", "rotation": [0, .3, 0]})
    assert posed["rig"]["bones"][1]["rotation"][1] == pytest.approx(.3)
    sculpted = apply(posed, {"tool": "pull", "regions": ["body"], "samples": [[1, 0, 0]], "radius": .5})
    assert sculpted["rig"] == posed["rig"]
    remeshed = apply(sculpted, {"tool":"refine", "regions":["body"]})
    assert remeshed["rig"] == {"bones": [], "weights": {}}
    broken = copy.deepcopy(rigged); broken["rig"]["weights"]["body"]["weights"][0] = 2
    with pytest.raises(DesignError): apply(broken, {"tool": "rename", "name": "Invalid"})
    broken = copy.deepcopy(original); broken["unknown"] = True
    with pytest.raises(DesignError): check("edit-document", broken)


def test_validation_distinguishes_open_membranes_from_broken_volumes():
    doc = sphere(); report = analyze(doc)
    assert not any(i["code"] in {"non_manifold", "open_boundary"} for i in report["issues"])
    doc["regions"][0]["indices"] = doc["regions"][0]["indices"][3:]
    boundary = next(i for i in analyze(doc)["issues"] if i["code"] == "open_boundary")
    assert boundary["severity"] == "warning"
    doc["regions"][0]["solid"] = False
    assert next(i for i in analyze(doc)["issues"] if i["code"] == "open_boundary")["severity"] == "info"


def test_ai_blend_preserves_original_and_protected_vertices():
    before = sphere(); before['regions'][0]['mask'][0] = 1
    before['regions'].append(primitive('sphere', [3,0,0],[.5,.5,.5],'protected_other'))
    candidate = apply(before, {'tool':'pull', 'regions':['body'], 'samples':[[1,0,0]], 'radius':.5})
    assert blendable(before, candidate)
    half = blend(before, candidate, .5)
    a = np.array(before['regions'][0]['positions']); b = np.array(candidate['regions'][0]['positions'])
    np.testing.assert_allclose(half['regions'][0]['positions'], (a+b)/2, atol=1e-7)
    assert half['regions'][0]['positions'][:3] == before['regions'][0]['positions'][:3]
    assert half['regions'][1] == before['regions'][1]
    assert blend(before, candidate, 0) == before
    assert blend(before, candidate, 1) == candidate
    invalid = copy.deepcopy(candidate); invalid['regions'][0]['material']['detail'] = 'scales'
    with pytest.raises(DesignError): blend(before, invalid, .5)
    with pytest.raises(DesignError): blend(before, candidate, float('nan'))


@pytest.mark.parametrize('template', TEMPLATES)
def test_templates_have_current_normals_and_bounded_geometry(template):
    from orbit_server.design.document import normals
    doc = generate(template, 'example')
    for item in doc['regions']:
        computed = normals(np.asarray(item['positions']), np.asarray(item['indices']))
        np.testing.assert_allclose(np.asarray(item['normals']).reshape(-1,3), computed, atol=1e-5)


@pytest.mark.parametrize('kind', ['horn','tooth','claw','tail','tentacle','tube'])
def test_curved_parts_are_closed_volumes_usable_by_boolean_backend(kind):
    from orbit_server.design.geometry import to_manifold
    kwargs = {'points':[[0,0,0],[0,.4,0],[.1,.8,.1]]} if kind == 'tube' else {}
    part = primitive(kind,[0,0,0],[.1,.4,.1],'part',**kwargs)
    solid = to_manifold(part)
    assert solid.volume() > 0
    with pytest.raises(DesignError): primitive('tube',[0,0,0],[.1,.4,.1],'invalid',points=[[0,0,0],[0,0,0]])
