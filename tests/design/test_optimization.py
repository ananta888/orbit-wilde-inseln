import copy
import os
import shutil
import pytest

pytest.importorskip('numpy')
pytest.importorskip('manifold3d')
from orbit_server.design.document import DesignError
from orbit_server.design.generation import generate
from orbit_server.design.geometry import apply
from orbit_server.design.optimization import optimize


def test_missing_optimizer_keeps_original(monkeypatch):
    doc = generate('dragon','arin'); before = copy.deepcopy(doc)
    monkeypatch.setenv('ORBIT_NODE', '/nonexistent/orbit-node')
    with pytest.raises(DesignError): optimize(doc)
    assert doc == before


@pytest.mark.skipif(not (os.getenv('ORBIT_NODE') or shutil.which('node')), reason='Optional laptop Node optimizer not installed')
def test_meshopt_preserves_skin_clips_protection_and_original():
    doc = apply(generate('dragon','arin'), {'tool':'prepare_mount'})
    doc['regions'][0]['locked'] = True
    before = copy.deepcopy(doc)
    result, report = optimize(doc, tolerance=.02)
    assert doc == before
    assert sum(len(r['indices']) for r in result['regions']) < sum(len(r['indices']) for r in doc['regions'])
    assert result['regions'][0] == doc['regions'][0]
    assert result['rig']['bones'] == doc['rig']['bones'] and result['clips'] == doc['clips']
    for region in result['regions']:
        assert len(result['rig']['weights'][region['id']]['weights']) == len(region['mask'])*4
    assert all(r.get('error',0) <= .02001 for r in report)
