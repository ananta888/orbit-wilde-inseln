import io
import json
import unittest
import zipfile

from aiohttp import FormData
from aiohttp.test_utils import TestClient, TestServer

from orbit_server.assets.contracts import Capabilities, DownloadFile, DownloadPlan, result
from orbit_server.assets.http import KEY
from orbit_server.networking.http import make_app
from .fixtures import triangle
from .test_resolver import Offline, metadata


class FixtureProvider:
    id='fixture'
    hosts=('dl.polyhaven.org',)
    def capabilities(self):return Capabilities(search=True,metadata=True,download=True)
    async def search(self,query):return [await self.get_metadata('triangle')]
    async def get_metadata(self,ident):
        m=metadata();return result('fixture',ident,m['name'],m['license']['sourceUrl'],m['license'],kind='creature',tags=m['tags'])
    async def get_license(self,ident):return (await self.get_metadata(ident))['license']
    async def download(self,ident):return DownloadPlan((DownloadFile('dragon.glb','https://dl.polyhaven.org/model.glb',len(triangle(rigged=True,morph=True))),),'dragon.glb')


class ResolverHTTPTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        app=make_app();self.resolver=app[KEY];self.transport=Offline();self.resolver.transport=self.transport
        self.resolver.providers={'fixture':FixtureProvider()}
        self.client=TestClient(TestServer(app));await self.client.start_server()
        await self.client.get('/api/assets/capabilities')
        self.origin=str(self.client.make_url('/')).rstrip('/')
    async def asyncTearDown(self):await self.client.close()
    async def tool(self,name,args):
        response=await self.client.post('/api/assets/tools/'+name,json=args,headers={'Origin':self.origin})
        return response,await response.json()

    async def test_remote_to_cache_preview_game_and_build(self):
        response,search=await self.tool('search_assets',{'query':'dragon','providers':['fixture']})
        self.assertEqual(response.status,200);self.assertEqual(len(search['results']),1)
        response,imported=await self.tool('import_asset',{'id':'fixture:triangle','profile':'quest3-balanced'})
        self.assertEqual(response.status,200,imported);asset=imported['asset']
        calls=len(self.transport.calls)
        response,again=await self.tool('import_asset',{'id':'fixture:triangle','profile':'quest3-balanced'})
        self.assertEqual(asset['id'],again['asset']['id']);self.assertEqual(calls,len(self.transport.calls))
        response,preview=await self.tool('preview_asset',{'id':asset['id']})
        glb=await self.client.get(preview['url']);self.assertEqual(glb.status,200);self.assertEqual((await glb.read())[:4],b'glTF')
        response,placed=await self.tool('place_asset',{'id':asset['id'],'revision':0,'position':[0,1,-3],'rotation':[0,0,0],'scale':1})
        self.assertEqual(response.status,200,placed)
        items=await (await self.client.get('/api/assets/placements')).json();self.assertEqual(items['items'][0]['asset']['sha256'],asset['sha256'])
        response=await self.client.post('/api/assets/build',json={'ids':[asset['id']]},headers={'Origin':self.origin})
        self.assertEqual(response.status,200)
        build = await response.read()
        repeated=await self.client.post('/api/assets/build',json={'ids':[asset['id']]},headers={'Origin':self.origin})
        self.assertEqual(build,await repeated.read())
        with zipfile.ZipFile(io.BytesIO(build)) as archive:
            self.assertIn('ASSET-CREDITS.md',archive.namelist());self.assertIn('manifest.json',archive.namelist())
            self.assertIn('Fixture creator',archive.read('ASSET-CREDITS.md').decode())
            self.assertIn('assets/'+asset['sha256']+'.glb',archive.namelist())

    async def test_origins_contracts_quarantine_and_profile_isolation(self):
        response=await self.client.post('/api/assets/tools/search_assets',json={'query':''})
        self.assertEqual(response.status,403)
        response,data=await self.tool('search_assets',{'query':'','unexpected':True});self.assertEqual(response.status,400)
        form=FormData();form.add_field('metadata',json.dumps(metadata('Unknown')));form.add_field('file',triangle(),filename='local.glb')
        response=await self.client.post('/api/assets/upload',data=form,headers={'Origin':self.origin})
        self.assertEqual(response.status,202);asset=(await response.json())['asset']
        response,_=await self.tool('preview_asset',{'id':asset['id']});self.assertEqual(response.status,404)
        response,data=await self.tool('import_asset',{'id':'fixture:triangle'});self.assertEqual(response.status,200,data)
        ident=data['asset']['id'];self.client.session.cookie_jar.clear()
        response,_=await self.tool('inspect_asset',{'id':ident});self.assertEqual(response.status,404)
        for url in ['/library/index.html','/src/assets/browser.js','/api/assets/tools']:
            self.assertEqual((await self.client.get(url)).status,200)

    async def test_designer_publication_rechecks_pinned_source_policy(self):
        from orbit_server.design.generation import generate
        from orbit_server.design.geometry import apply
        from orbit_server.assets.licenses import LicensePolicy
        _, imported = await self.tool('import_asset', {'id': 'fixture:triangle'})
        source = imported['asset']
        doc = apply(generate('dragon', 'licensed'), {'tool': 'prepare_mount'})
        response = await self.client.post('/api/design/import?source_asset=' + source['id'], json=doc, headers={'Origin': self.origin})
        self.assertEqual(response.status, 200, await response.text())
        ident = (await response.json())['id']
        body = {'asset_id': ident, 'revision': 0, 'activate': True}
        response = await self.client.post('/api/design/publish', json=body, headers={'Origin': self.origin})
        self.assertEqual(response.status, 200, await response.text())
        published = await response.json()
        runtime = await (await self.client.get(published['url'])).json()
        self.assertEqual(runtime['document']['provenance']['asset']['sha256'], source['sha256'])
        self.resolver.policy = LicensePolicy(allowed=())
        response = await self.client.post('/api/design/publish', json=body, headers={'Origin': self.origin})
        self.assertEqual(response.status, 400)
        self.assertEqual((await self.client.get(published['url'])).status, 404)
        self.assertIsNone((await (await self.client.get('/api/creatures/active')).json())['asset'])
