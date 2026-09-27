import asyncio

import aiohttp
from aiohttp import web
from aiohttp.test_utils import TestServer
import pytest

pytest.importorskip('numpy')
pytest.importorskip('trimesh')
pytest.importorskip('manifold3d')
from orbit_server.design.ai import plan
from orbit_server.design.document import DesignError
from orbit_server.design.generation import generate


def test_configured_provider_is_bounded_and_cannot_escape_selection(monkeypatch):
    async def run():
        observed = []
        answer = {'speech':'Vorschau', 'operations':[{'tool':'smooth', 'regions':['head'],
                  'samples':[[0,1.8,-1.6]], 'radius':.2, 'strength':.3}]}
        async def handler(request):
            observed.append(await request.json())
            return web.json_response(answer)
        app = web.Application(); app.router.add_post('/design',handler)
        async with TestServer(app) as server, aiohttp.ClientSession() as session:
            monkeypatch.setenv('ORBIT_DESIGN_AI_URL',str(server.make_url('/design')))
            result, source = await plan(session,generate('dragon','arin'),['head'],'Übergang glätten')
            assert result == answer and source == 'configured-design-provider'
            context = observed[0]['context']
            assert [p['id'] for p in context['selected_parts']] == ['head']
            assert 'regions' not in context and 'positions' not in str(context)
            answer['operations'][0]['regions'] = ['torso']
            with pytest.raises(DesignError,match='Auswahl'):
                await plan(session,generate('dragon','arin'),['head'],'Alles verändern')
            answer['speech'] = 'x'*40000
            with pytest.raises(DesignError,match='Budget'):
                await plan(session,generate('dragon','arin'),['head'],'Glätten')
    asyncio.run(run())
