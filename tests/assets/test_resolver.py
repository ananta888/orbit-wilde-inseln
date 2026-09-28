import asyncio
import io
import json
import socket
import zipfile

import pytest

from orbit_server.assets.contracts import AssetError, check, sha256
from orbit_server.assets.licenses import LicensePolicy, license_record, credits
from orbit_server.assets.providers import PolyHaven, AmbientCG, Sketchfab, LinkProvider
from orbit_server.assets.safety import safe_name, validate_url, unpack, PublicResolver
from orbit_server.assets.search import parse_query, matches, deduplicate
from orbit_server.assets.service import Resolver
from orbit_server.assets.store import AssetStore
from .fixtures import triangle


def metadata(kind='CC0'):
    return {'name': 'Fixture dragon', 'type': 'creature', 'tags': ['dragon','flying'],
            'license': license_record(kind, 'Fixture creator', 'fixture', 'triangle', 'https://assets.example/triangle')}


class Offline:
    def __init__(self): self.calls=[]
    async def start(self): pass
    async def close(self): pass
    async def fetch(self, url, hosts, **kwargs):
        self.calls.append(url)
        validate_url(url, hosts)
        if url == 'https://dl.polyhaven.org/model.glb': return triangle(rigged=True, morph=True)
        raise AssetError('offline', 'network')
    async def json(self, url, hosts, **kwargs):
        self.calls.append(url)
        if '/search?' in url: return {'results':[{'slug':'fixture'}]}
        if '/info/' in url:
            return {'name':'Fixture dragon','authors':{'Fixture creator':'All'},'type':2,'tags':['dragon'],'polycount':1}
        if '/files/' in url:
            # Use a standalone GLB as the named glTF file to exercise provider normalization
            # separately. Pipeline tests use a regular source provider below.
            return {'gltf':{'2k':{'gltf':{'url':'https://dl.polyhaven.org/model.glb','size':len(triangle(rigged=True,morph=True)),'include':{}}}}}
        raise AssetError('offline', 'network')


@pytest.mark.parametrize('kind,allowed',[('CC0',True),('Public Domain',True),('CC-BY',True),('CC-BY-SA',False),('CC-BY-NC',False),('CC-BY-ND',False),('CC-BY-NC-SA',False),('CC-BY-NC-ND',False),('Custom',False),('Unknown',False)])
def test_license_policy(kind,allowed):
    assert LicensePolicy().decision(metadata(kind)['license'])['allowed'] is allowed
    if 'NC' in kind or 'ND' in kind:
        assert not LicensePolicy(allowed=(kind,)).decision(metadata(kind)['license'])['allowed']


def test_explicit_license_policy_and_attribution():
    license=metadata('CC-BY-SA')['license']
    assert LicensePolicy(allowed=('CC-BY-SA',)).decision(license)['shareAlike']
    assert LicensePolicy(allowed=('CC-BY-SA',)).decision(license)['allowed']
    license['creator']=''
    assert not LicensePolicy(allowed=('CC-BY-SA',)).decision(license)['allowed']
    custom=metadata('Custom')['license']
    assert not LicensePolicy(allowed=('Custom',)).decision(custom)['allowed']
    assert LicensePolicy(allowed=('Custom',),custom_evidence=(custom['evidenceUrl'],)).decision(custom)['allowed']
    by=metadata('CC-BY')['license'];by['modifications']=['resized texture'];by['notice']='Original notice'
    text=credits([{'id':'asset_x','name':'A','sha256':'a'*64,'license':by}],LicensePolicy())
    assert all(s in text for s in ['Fixture creator','4.0','Original notice','resized texture',by['sourceUrl']])


@pytest.mark.parametrize('name',['../x.glb','/tmp/x.glb','a/../../x.glb','C:/x.glb','a\\x.glb','a/%2e%2e/x.glb','a//x.glb','evil.py','x.exe','a\x00.glb'])
def test_paths(name):
    with pytest.raises(AssetError): safe_name(name)


@pytest.mark.parametrize('url',['http://example.com/a','https://127.0.0.1/a','https://user:password@example.com/a','https://example.com:444/a','file:///etc/passwd','https://evil.example/a'])
def test_url_boundary(url):
    with pytest.raises(AssetError): validate_url(url,('example.com','127.0.0.1'))


def test_dns_uses_validated_addresses(monkeypatch):
    async def run():
        async def answers(*args,**kwargs): return [(socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))]
        monkeypatch.setattr(asyncio.get_running_loop(),'getaddrinfo',answers)
        with pytest.raises(AssetError): await PublicResolver().resolve('public.example',443)
    asyncio.run(run())


def test_archive_traversal_links_collisions_and_budget(tmp_path):
    for member,contents,mode in [('../escape.glb',b'x',0),('script.py',b'x',0),('link.glb',b'x',0o120777),('huge.bin',bytes(1000000),0)]:
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w',compression=zipfile.ZIP_DEFLATED) as z:
            info=zipfile.ZipInfo(member);info.external_attr=mode<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,contents)
        source=tmp_path/'input.zip';source.write_bytes(data.getvalue());folder=tmp_path/member.replace('/','_');folder.mkdir()
        with pytest.raises(AssetError):unpack(source,folder)
    assert not (tmp_path/'escape.glb').exists()


def test_cache_dedup_quota_integrity_and_profile_scope(tmp_path):
    store=AssetStore(tmp_path,quota=8)
    try:
        key=store.put(b'1234','source');assert key==store.put(b'1234','canonical')
        assert store.db.execute('SELECT count(*) FROM blobs').fetchone()[0]==1
        with pytest.raises(AssetError):store.put(b'0123456789','source')
        (tmp_path/'source'/key).write_bytes(b'4321')
        with pytest.raises(AssetError):store.read(key)
    finally:store.close()


def test_contracts_and_language():
    assert parse_query({'query':'Ich brauche einen mittelalterlichen Brunnen'})['text']=='medieval well'
    q=parse_query({'query':'animated flying dragon CC0'})
    assert q['animated'] and q['licenses']==['CC0','Public Domain']
    with pytest.raises(AssetError):check('search',{'query':'dragon','command':'rm'})
    with pytest.raises(AssetError):check('normalize',{'scale':float('nan'),'up':'Y'})


def test_provider_contracts():
    async def run():
        transport=Offline();provider=PolyHaven(transport)
        results=await provider.search(parse_query({'query':'dragon','limit':1}))
        assert results[0]['license']['license']=='CC0'
        assert results[0]['geometry'] is None and not results[0]['verified']
        plan=await provider.download('fixture');assert plan.files[0].size>0
        assert not LinkProvider('quaternius').capabilities().search
        assert 'keys=dragon' in LinkProvider('opengameart').link({'text':'dragon'})
        assert not Sketchfab(transport).capabilities().download
        ambient=AmbientCG(transport)
        item=ambient.normalize({'assetId':'Stone001','tags':['stone'],'displayName':'Stone'})
        assert item['type']=='material' and item['license']['evidenceUrl'].endswith('/license/')
        assert not matches(results[0],{'rigged':True},LicensePolicy())
        assert len(deduplicate(results*2))==1
    asyncio.run(run())


def test_local_pipeline_and_tools(tmp_path, monkeypatch):
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            uploaded=await resolver.upload('one','dragon.glb',triangle(rigged=True,morph=True),metadata())
            asset=uploaded['asset'];check('asset',asset)
            assert asset['geometry']['triangles']==1 and asset['skeleton']['bones']==1
            assert asset['report']['morphTargets']==1 and asset['animations'][0]['tags']==['flight']
            found=await resolver.tool('one','search_assets',{'query':'animated dragon','providers':['local']})
            assert found['results'][0]['id']==asset['id']
            optimized=(await resolver.tool('one','optimize_asset',{'id':asset['id'],'profile':'quest3-balanced','lod':True}))['asset']
            assert len(optimized['lod'])==3 and optimized['report']['morphTargets']==1
            assert optimized['skeleton']==asset['skeleton'] and optimized['animations']==asset['animations']
            again=await resolver.optimize('one',asset['id'],'quest3-balanced')
            assert again['sha256']==optimized['sha256']
            preview=await resolver.tool('one','preview_asset',{'id':optimized['id']})
            assert preview['sha256']==sha256(resolver.store.read(preview['sha256']))
            with pytest.raises(AssetError):resolver.descriptor('two',asset['id'])
            placed=await resolver.tool('one','place_asset',{'id':optimized['id'],'revision':0,'position':[0,1,-3],'rotation':[0,0,0],'scale':1})
            assert placed['revision']==1
            with pytest.raises(AssetError):await resolver.tool('one','remove_placement',{'placement_id':placed['items'][0]['id'],'revision':0})
            removed=await resolver.tool('one','remove_placement',{'placement_id':placed['items'][0]['id'],'revision':1});assert not removed['items']
            attribution=await resolver.tool('one','export_credits',{'ids':[optimized['id']]})
            assert 'Fixture creator' in attribution['text'] and 'optimize' in attribution['text']
            assert (await resolver.tool('one','find_animations',{'query':'dragon'}))['animations']
            quarantined=await resolver.upload('one','unknown.glb',triangle(),metadata('Unknown'))
            assert quarantined['asset']['status']=='quarantine'
            assert not quarantined['decision']['allowed']
            with pytest.raises(AssetError):resolver.descriptor('one',quarantined['asset']['id'])
            source=await resolver.upload('one','animation.glb',triangle(rigged=True),dict(metadata(),name='Rotation clip'))
            mapped=(await resolver.tool('one','retarget_animation',{'id':asset['id'],'source':source['asset']['id'],'clip':0,'mapping':{'head':'head'}}))['asset']
            assert len(mapped['animations'])==2
            with pytest.raises(AssetError):await resolver.tool('one','retarget_animation',{'id':asset['id'],'source':source['asset']['id'],'clip':0,'mapping':{'head':'missing'}})
        finally:await resolver.close()
    asyncio.run(run())


def test_bad_glb_and_external_resources_keep_original(tmp_path):
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            with pytest.raises(AssetError): await resolver.upload('one','bad.glb',b'not a GLB',metadata())
            assert resolver.store.read(sha256(b'not a GLB'))==b'not a GLB'
            source=json.dumps({'asset':{'version':'2.0'},'buffers':[{'uri':'https://127.0.0.1/secret','byteLength':4}]}).encode()
            with pytest.raises(AssetError):await resolver.upload('one','evil.gltf',source,metadata())
            source=json.dumps({'asset':{'version':'2.0'},'extensionsUsed':['UNKNOWN_skin_extension']}).encode()
            with pytest.raises(AssetError):await resolver.upload('one','unknown.gltf',source,metadata())
        finally:await resolver.close()
    asyncio.run(run())
