import copy
import pytest

pytest.importorskip('numpy')
pytest.importorskip('manifold3d')
import numpy as np
from orbit_server.design.document import DesignError
from orbit_server.design.generation import generate
from orbit_server.design.geometry import apply
from orbit_server.design.schemas import check


def layered():
    doc = generate('dragon', 'arin')
    return apply(doc, {'tool':'layer_add','id':'shape','name':'Head shape','kind':'sculpt'})


def stroke():
    return {'tool':'pull','layer':'shape','regions':['head'],'samples':[[0,1.8,-1.5]],'radius':.8,'strength':.4}


def test_layer_hide_strength_and_delete_restore_base_without_losing_history():
    doc = layered(); changed = apply(doc, stroke())
    check('edit-document', changed)
    assert changed['regions'] != doc['regions'] and changed['layers'][0]['regions']
    hidden = apply(changed, {'tool':'layer_visibility','id':'shape','value':False})
    for a,b in zip(doc['regions'],hidden['regions']): np.testing.assert_allclose(a['positions'],b['positions'],atol=1e-6)
    restored = apply(hidden, {'tool':'layer_visibility','id':'shape','value':True})
    for a,b in zip(changed['regions'],restored['regions']): np.testing.assert_allclose(a['positions'],b['positions'],atol=1e-6)
    half = apply(changed, {'tool':'layer_strength','id':'shape','value':.5})
    for a,b,c in zip(doc['regions'],changed['regions'],half['regions']): np.testing.assert_allclose(c['positions'],(np.asarray(a['positions'])+b['positions'])/2,atol=1e-6)
    deleted = apply(changed, {'tool':'layer_delete','id':'shape'})
    assert not deleted['layers']


def test_layer_locks_masks_and_topology_require_explicit_bake():
    doc = apply(layered(), stroke()); original = copy.deepcopy(doc)
    with pytest.raises(DesignError): apply(doc, {'tool':'refine','regions':['head']})
    locked = apply(doc, {'tool':'layer_lock','id':'shape','value':True})
    with pytest.raises(DesignError): apply(locked, stroke())
    with pytest.raises(DesignError): apply(locked, {'tool':'layer_bake'})
    doc['regions'][2]['mask'] = [1.] * len(doc['regions'][2]['mask'])
    with pytest.raises(DesignError): apply(doc, {'tool':'layer_visibility','id':'shape','value':False})
    baked = apply(original, {'tool':'layer_bake'})
    assert not baked['layers'] and baked['regions'] == original['regions']
    assert apply(baked, {'tool':'refine','regions':['head']})['regions'] != original['regions']


def test_paint_layers_accumulate_and_validate_topology_references():
    doc = apply(generate('dragon','arin'), {'tool':'layer_add','id':'color','kind':'paint','name':'Green'})
    cmd = {'tool':'paint','layer':'color','regions':['head'],'samples':[[0,1.8,-1.5]],'radius':.8,'strength':.4,'color':[.5,.7,.2]}
    painted = apply(apply(doc,cmd),cmd)
    hidden = apply(painted, {'tool':'layer_visibility','id':'color','value':False})
    for a,b in zip(doc['regions'],hidden['regions']): np.testing.assert_allclose(a['colors'],b['colors'],atol=1e-6)
    painted['layers'][0]['regions']['head']['topology_revision'] += 1
    with pytest.raises(DesignError): apply(painted, {'tool':'rename','name':'Invalid'})
