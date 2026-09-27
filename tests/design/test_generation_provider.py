import asyncio
import copy
import pytest

pytest.importorskip('numpy')
pytest.importorskip('manifold3d')
from aiohttp import web, ClientSession
from aiohttp.test_utils import TestServer
from orbit_server.design import ai
from orbit_server.design.document import DesignError
from orbit_server.design.generation import generate
from orbit_server.design.preview import blendable


def test_generation_provider_and_additions_are_validated_before_geometry(monkeypatch,tmp_path):
    async def run():
        response = {'speech':'Ein neuer Drache.','generation':{'template':'dragon','parameters':{'wing_span':3.}}}
        token = tmp_path/'token'; token.write_text('synthetic-token-for-local-contract-test')
        async def handler(request):
            assert request.headers['Authorization'] == 'Bearer ' + token.read_text()
            return web.json_response(response)
        app=web.Application(); app.router.add_post('/design',handler)
        async with TestServer(app) as server, ClientSession() as session:
            monkeypatch.setenv('ORBIT_DESIGN_AI_URL',str(server.make_url('/design')))
            monkeypatch.setenv('ORBIT_DESIGN_AI_TOKEN_FILE',str(token))
            result=await ai.generate_plan(session,'Ein freundlicher Drache')
            assert result['generation']['parameters']['wing_span'] == 3
            response['generation']['parameters']['program']='execute'
            with pytest.raises(DesignError): await ai.generate_plan(session,'Dragon')
            response.clear(); response.update(speech='Ein Horn.', operations=[{'tool':'add','regions':['head'],'target':'head','kind':'horn',
                'id':'new_horn','position':[0,2.,-1.2],'size':[.1,.3,.1]}])
            doc=generate('dragon','arin')
            plan,_=await ai.plan(session,doc,['head'],'Ein Horn')
            assert plan['operations'][0]['kind']=='horn'
            response['operations'][0]['position']=[50,50,50]
            with pytest.raises(DesignError): await ai.plan(session,doc,['head'],'Horn außerhalb')
    asyncio.run(run())


def test_blending_does_not_silently_drop_rig_or_layers():
    before=generate('dragon','arin'); after=copy.deepcopy(before)
    after['mount_points']=[{'id':'rider_seat','position':[0,2,0],'rotation':[0,0,0],'safe_radius':.3}]
    assert not blendable(before,after)
