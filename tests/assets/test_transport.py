import asyncio
import json

import pytest

from orbit_server.assets.contracts import AssetError
from orbit_server.assets.safety import Transport
from orbit_server.assets.providers import AmbientCG, Sketchfab
from .test_resolver import Offline


class Response:
    def __init__(self,status=200,headers=None,chunks=(),length=None):
        self.status,self.headers,self.content_length=status,headers or {},length
        self.chunks=chunks;self.content=self;self.read=0
    async def iter_chunked(self,size):
        for chunk in self.chunks:
            self.read+=1;yield chunk
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass


class Session:
    def __init__(self,responses):self.responses=iter(responses);self.calls=[]
    def get(self,url,**kwargs):self.calls.append((url,kwargs));return next(self.responses)


def test_redirect_credentials_and_untrusted_destination():
    async def run():
        transport=Transport()
        transport.session=Session([Response(302,{'Location':'https://download.example/model.glb'}),Response(chunks=[b'GLB'])])
        assert await transport.fetch('https://api.example/download',('api.example','download.example'),headers={'Authorization':'Token fixture'})==b'GLB'
        assert transport.session.calls[0][1]['headers'] and transport.session.calls[1][1]['headers'] is None
        transport.session=Session([Response(302,{'Location':'https://127.0.0.1/private'})])
        with pytest.raises(AssetError):await transport.fetch('https://api.example/download',('api.example',))
        assert len(transport.session.calls)==1
    asyncio.run(run())


def test_download_and_compression_limits():
    async def run():
        transport=Transport()
        for response in [Response(length=5),Response(headers={'Content-Encoding':'gzip'}),Response(chunks=[b'123',b'45',b'never'])]:
            transport.session=Session([response])
            with pytest.raises(AssetError):await transport.fetch('https://api.example/file',('api.example',),limit=4)
            assert response.read<=2
        transport.session=Session([Response(302,{'Location':'/loop'}) for _ in range(4)])
        with pytest.raises(AssetError,match='Weiterleitungen'):await transport.fetch('https://api.example/loop',('api.example',))
    asyncio.run(run())


def test_sketchfab_and_ambient_download_manifests():
    class Fixtures(Offline):
        async def json(self,url,hosts,**kwargs):
            if '/licenses/' in url:return {'slug':'by','url':'http://creativecommons.org/licenses/by/4.0/'}
            if url.endswith('/download'):
                assert kwargs['headers']=={'Authorization':'Token fixture'}
                return {'glb':{'url':'https://media.sketchfab.com/model.glb','size':123}}
            if '/models/' in url or '/search?' in url:
                model={'uid':'dragon1','name':'Dragon','viewerUrl':'https://sketchfab.com/3d-models/dragon1','license':{'uid':'ccby'},'user':{'displayName':'Creator'},'animationCount':12,'tags':[]}
                return {'results':[model]} if '/search?' in url else model
            if 'ambientcg.com/' in url:
                return {'foundAssets':[{'assetId':'Rock001','downloadFolders':{'default':{'downloadFiletypeCategories':{'zip':{'downloads':[{'attribute':'1K-JPG','downloadLink':'https://download.ambientcg.com/rock.zip','size':456}]}}}}}]}
            raise AssertionError(url)
    async def run():
        transport=Fixtures();sketchfab=Sketchfab(transport,{'token':'fixture'})
        found=await sketchfab.search({'text':'dragon','limit':3})
        assert found[0]['license']['license']=='CC-BY' and found[0]['license']['version']=='4.0'
        assert found[0]['advertised']['animationCount']==12
        plan=await sketchfab.download('dragon1');assert plan.entry=='model.glb' and not plan.headers
        ambient=AmbientCG(transport);plan=await ambient.download('Rock001')
        assert plan.kind=='material' and plan.files[0].size==456
        # Provider fixtures remain ordinary serializable metadata with no credentials.
        assert 'Token fixture' not in json.dumps(found)
    asyncio.run(run())
