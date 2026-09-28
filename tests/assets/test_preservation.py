"""Loss and capability regressions using actual isolated GLB processing, no network."""
import asyncio
import base64
import io
import zipfile

import pytest

from orbit_server.assets.contracts import AssetError, check
from orbit_server.assets.service import Resolver
from .fixtures import triangle, edit_glb
from .test_resolver import Offline, metadata


def test_embedded_license_cannot_be_laundered(tmp_path):
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            for kind in ('CC-BY-NC','Unknown'):
                data=edit_glb(triangle(),lambda d: d.update(extras={'orbitLicense':metadata(kind)['license']}))
                with pytest.raises(AssetError, match='kommerziell|Unbekannte|freigegeben'):
                    await resolver.upload('one','claim.glb',data,metadata())
            by=metadata('CC-BY')['license'];by['creator']='Embedded creator';by['notice']='Keep this notice'
            data=edit_glb(triangle(),lambda d:d.update(extras={'orbitLicense':by}))
            asset=(await resolver.upload('one','licensed.glb',data,metadata(),profile='quest3-balanced'))['asset']
            assert any(s['creator']=='Embedded creator' for s in asset['sourceLicenses'])
            attribution=await resolver.tool('one','export_credits',{'ids':[asset['id']]})
            assert 'Embedded creator' in attribution['text'] and 'Keep this notice' in attribution['text']
            invalid=dict(asset,geometry=dict(asset['geometry'],executable='unexpected'))
            with pytest.raises(AssetError):check('asset',invalid)
        finally:await resolver.close()
    asyncio.run(run())


def test_bundled_dragon_preserves_rig_clips_and_original(tmp_path):
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            source=await resolver.download('one','bundled:arin_cethiel')
            original=resolver.store.read(source['sourceFiles'][0]['sha256'])
            asset=await resolver.import_asset('one',source['id'],profile='quest3-balanced')
            assert asset['skeleton']['bones']>10 and len(asset['animations'])==4
            assert asset['report']['warnings']
            assert resolver.store.read(source['sourceFiles'][0]['sha256'])==original
            assert asset['license']['license']=='CC0'
            assert resolver.descriptor('one',asset['id'])['sha256']==asset['sha256']
        finally:await resolver.close()
    asyncio.run(run())


def test_animation_only_library_can_be_catalogued_and_retargeted(tmp_path):
    def remove_model(d):
        d.pop('meshes');d.pop('materials');d.pop('skins')
        d['nodes'][0].pop('mesh');d['nodes'][0].pop('skin')
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            data=edit_glb(triangle(rigged=True),remove_model)
            asset=(await resolver.upload('one','flight.glb',data,metadata()))['asset']
            assert asset['geometry']['meshes']==0 and asset['animations'][0]['duration']==1
            clips=await resolver.tool('one','find_animations',{'query':'flight','rig_family':'dragon'})
            assert clips['animations'][0]['rig_family']=='unclassified'
            with pytest.raises(AssetError,match='Animationsbibliothek'):resolver.descriptor('one',asset['id'])
            target=(await resolver.upload('one','target.glb',triangle(rigged=True),metadata()))['asset']
            result=await resolver.tool('one','retarget_animation',{'id':target['id'],'source':asset['id'],'clip':0,'mapping':{'head':'head'}})
            assert len(result['asset']['animations'])==2
        finally:await resolver.close()
    asyncio.run(run())


def test_material_package_keeps_inert_companions_and_reports_unused_maps(tmp_path):
    # Original 1x1 PNG; archive companions are deliberately not parseable authoring files.
    png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:
        for name in ('Surface_Color.png','Surface_Displacement.png'):
            z.writestr(name,png)
        for name in ('sample.usdc','sample.blend','sample.mtlx','sample.tres'):
            z.writestr(name,b'INERT DATA: never invoke an interpreter')
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            asset=(await resolver.upload('one','surface.zip',stream.getvalue(),dict(metadata(),type='material')))['asset']
            assert asset['geometry']['triangles']==12 and len(asset['textures'])==1
            assert any('Displacement' in w for w in asset['report']['warnings'])
            assert resolver.store.read(asset['sourceFiles'][0]['sha256'])==stream.getvalue()
        finally:await resolver.close()
    asyncio.run(run())


def test_independent_catalog_writers_keep_hashes_quotas_and_cas_atomic(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from orbit_server.assets.store import AssetStore
    stores=[AssetStore(tmp_path,quota=8),AssetStore(tmp_path,quota=8)]
    try:
        with ThreadPoolExecutor(max_workers=2) as workers:
            keys=list(workers.map(lambda i:stores[i%2].put(b'1234','source'),range(16)))
        assert len(set(keys))==1
        assert stores[0].db.execute('SELECT count(*) FROM blobs').fetchone()[0]==1
        stores[1].put(b'5678','source')
        with pytest.raises(AssetError,match='voll'):stores[0].put(b'9','source')
        stores[0].place('one',0,None)
        with pytest.raises(AssetError,match='veraltet'):stores[1].place('one',0,None)
        assert stores[0].placements('one')['revision']==1
    finally:
        for store in stores:store.close()


def test_plugins_are_opt_in_configurable_and_disabled_without_loading(tmp_path,monkeypatch):
    import orbit_server.assets.service as service
    from orbit_server.assets.contracts import Capabilities
    calls=[]
    class Plugin:
        id='fixture_plugin';hosts=()
        def __init__(self,transport,config):calls.append(config['settings']['tag'])
        def capabilities(self):return Capabilities(search=True)
        async def search(self,query):return []
    class Entry:
        name='fixture_plugin'
        def load(self):return Plugin
    monkeypatch.setattr(service,'entry_points',lambda **kwargs:[Entry()])
    async def run():
        for enabled in (False,True):
            resolver=Resolver(tmp_path,transport=Offline(),config={'plugins':['fixture_plugin'],'providers':{'fixture_plugin':{'enabled':enabled,'settings':{'tag':'fixture'}}}})
            await resolver.start()
            try:
                assert ('fixture_plugin' in resolver.providers) is enabled
                await resolver.tool('one','search_assets',{'query':'dragon','providers':['fixture_plugin']})
                await resolver.tool('one','search_assets',{'query':''})
                assert not resolver.transport.calls
            finally:await resolver.close()
    asyncio.run(run())
    assert calls==['fixture']


def test_unmeasured_gpu_instances_and_excessive_node_instances_are_rejected(tmp_path):
    def gpu_instances(d):
        d['extensionsUsed']=['EXT_mesh_gpu_instancing']
        d['nodes'][0]['extensions']={'EXT_mesh_gpu_instancing':{'attributes':{'TRANSLATION':0}}}
    def repeated_nodes(d):
        d['nodes']=[{'mesh':0} for _ in range(2049)]
        d['scenes'][0]['nodes']=list(range(2049))
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            for change,message in [(gpu_instances,'Unsupported extension'),(repeated_nodes,'Instantiated geometry budget')]:
                with pytest.raises(AssetError,match=message):
                    await resolver.upload('one','instances.glb',edit_glb(triangle(),change),metadata())
        finally:await resolver.close()
    asyncio.run(run())


def test_oversized_preview_is_blocked_until_texture_optimization(tmp_path):
    import struct
    import zlib
    def chunk(kind,data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    # A valid 8192x1 original RGBA texture: small file, over the display edge budget.
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',8192,1,8,6,0,0,0))
    png+=chunk(b'IDAT',zlib.compress(b'\0'+bytes([120,160,80,255])*8192))+chunk(b'IEND',b'')
    archive=io.BytesIO()
    with zipfile.ZipFile(archive,'w') as z:z.writestr('Surface_Color.png',png)
    async def run():
        resolver=Resolver(tmp_path,transport=Offline());await resolver.start()
        try:
            asset=(await resolver.upload('one','material.zip',archive.getvalue(),dict(metadata(),type='material')))['asset']
            assert asset['textures'][0]['resolution']==[8192,1]
            with pytest.raises(AssetError,match='Renderbudget'):resolver.descriptor('one',asset['id'])
            optimized=await resolver.optimize('one',asset['id'],'quest3-balanced')
            assert resolver.descriptor('one',optimized['id'])['sha256']==optimized['sha256']
            assert optimized['textures'][0]['resolution']==[1024,1]
        finally:await resolver.close()
    asyncio.run(run())
