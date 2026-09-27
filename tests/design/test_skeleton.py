import copy
import pytest

pytest.importorskip('numpy')
pytest.importorskip('manifold3d')
import numpy as np
from orbit_server.design.document import DesignError
from orbit_server.design.generation import generate
from orbit_server.design.geometry import apply
from orbit_server.design.schemas import check
from orbit_server.design.skeleton import solve_ik, world_joints


def rigged(): return apply(generate('dragon', 'arin'), {'tool': 'rig'})


def test_weighted_hierarchy_preserves_rest_positions_and_normalized_weights():
    doc = rigged(); check('edit-document', doc)
    positions = world_joints(doc['rig']['bones'])
    assert np.allclose(positions['root'], [0, 0, 0])
    assert next(b for b in doc['rig']['bones'] if b['id'] == 'head')['parent'] == 'neck'
    weights = np.asarray(doc['rig']['weights']['left_wing']['weights']).reshape(-1,4)
    np.testing.assert_allclose(weights.sum(axis=1), 1, atol=1e-6)
    assert np.any((weights > .1) & (weights < .9))
    assert len(doc['rig']['bones']) <= 128


def test_weight_paint_respects_mask_and_locks_and_preserves_other_regions():
    doc = rigged(); region = next(r for r in doc['regions'] if r['id'] == 'left_wing')
    region['mask'][0] = 1
    command = {'tool':'weight','bone':'torso','regions':['left_wing'], 'samples':[region['positions'][:3]], 'radius':2, 'strength':.8}
    changed = apply(doc, command)
    before, after = doc['rig']['weights']['left_wing'], changed['rig']['weights']['left_wing']
    assert before['weights'][:4] == after['weights'][:4]
    assert before != after
    assert changed['rig']['weights']['head'] == doc['rig']['weights']['head']
    region['locked'] = True
    with pytest.raises(DesignError): apply(doc, command)


def test_ik_reduces_error_without_violating_joint_limits():
    doc = rigged()
    doc = apply(doc, {'tool':'joint_limits','bone':'left_wing','angle':.4})
    start = world_joints(doc['rig']['bones'])['left_wing_tip'].copy()
    target = (start + [0, .3, .1]).tolist()
    report = solve_ik(doc, 'left_wing_tip', target)
    assert report['after'] < report['before']
    assert max(abs(v) for v in next(b for b in doc['rig']['bones'] if b['id']=='left_wing')['rotation']) <= .4
    check('edit-document', doc)


def test_pose_outside_limit_rejects_and_keeps_input_unchanged():
    doc = apply(rigged(), {'tool':'joint_limits','bone':'head','angle':.3})
    old = copy.deepcopy(doc)
    with pytest.raises(DesignError): apply(doc, {'tool':'pose','bone':'head','rotation':[0,.5,0]})
    assert doc == old


def test_clips_cannot_bypass_joint_limits_or_duplicate_keys():
    doc = apply(rigged(), {'tool': 'joint_limits', 'bone': 'head', 'angle': .3})
    before = copy.deepcopy(doc)
    key = {'bone': 'head', 'time': 0, 'rotation': [0, .5, 0]}
    with pytest.raises(DesignError, match='Gelenkgrenzen'):
        apply(doc, {'tool': 'clip', 'id': 'invalid', 'duration': 1, 'keys': [key]})
    key['rotation'] = [0, .1, 0]
    with pytest.raises(DesignError, match='Doppelter Keyframe'):
        apply(doc, {'tool': 'clip', 'id': 'invalid', 'duration': 1, 'keys': [key, key]})
    assert doc == before
