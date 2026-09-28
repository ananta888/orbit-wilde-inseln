"""Small original BSD-3-Clause glTF fixtures; license-policy test metadata is fictional."""
import json
import struct


def edit_glb(data, change):
    """Change only fixture JSON, retaining its original binary buffers."""
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    change(doc)
    content = json.dumps(doc, separators=(',', ':')).encode()
    content += b' ' * (-len(content) % 4)
    tail = data[20+size:]
    return struct.pack('<III', 0x46546c67, 2, 20+len(content)+len(tail)) + struct.pack('<II', len(content), 0x4e4f534a) + content + tail


def triangle(*, rigged=False, morph=False):
    binary = bytearray()
    d = {'asset': {'version': '2.0', 'generator': 'Orbit test fixture'}, 'scene': 0,
         'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'triangle', 'mesh': 0}],
         'buffers': [], 'bufferViews': [], 'accessors': [],
         'meshes': [{'primitives': [{'attributes': {}, 'indices': 1, 'material': 0}]}],
         'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [.2, .7, .3, 1], 'metallicFactor': 0, 'roughnessFactor': .8}}]}
    def accessor(values, kind, count, bounds=None):
        while len(binary) % 4: binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack('<' + 'f' * len(values), *values))
        i = len(d['bufferViews']); d['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(values) * 4})
        value = {'bufferView': i, 'componentType': 5126, 'count': count, 'type': kind}
        if bounds: value.update(min=bounds[0], max=bounds[1])
        d['accessors'].append(value)
        return len(d['accessors']) - 1
    pos = accessor([0,0,0, 1,0,0, 0,1,0], 'VEC3', 3, ([0,0,0],[1,1,0]))
    offset = len(binary); binary.extend(struct.pack('<3H', 0,1,2))
    d['bufferViews'].append({'buffer': 0,'byteOffset': offset,'byteLength': 6})
    d['accessors'].append({'bufferView':1,'componentType':5123,'count':3,'type':'SCALAR'})
    p = d['meshes'][0]['primitives'][0]; p['attributes']['POSITION'] = pos
    p['attributes']['NORMAL'] = accessor([0,0,1]*3,'VEC3',3)
    if morph:
        target=accessor([0,0,.1]*3,'VEC3',3,([0,0,.1],[0,0,.1]));p['targets']=[{'POSITION':target}];d['meshes'][0]['weights']=[0]
    if rigged:
        while len(binary)%4: binary.append(0)
        offset=len(binary);binary.extend(bytes(12));i=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':12})
        d['accessors'].append({'bufferView':i,'componentType':5121,'count':3,'type':'VEC4'});p['attributes']['JOINTS_0']=len(d['accessors'])-1
        p['attributes']['WEIGHTS_0']=accessor([1,0,0,0]*3,'VEC4',3)
        d['nodes'][0]['skin']=0;d['nodes'].append({'name':'head'});d['scenes'][0]['nodes'].append(1)
        d['skins']=[{'joints':[1],'skeleton':1}]
        times=accessor([0,1],'SCALAR',2,([0],[1]));rot=accessor([0,0,0,1, 0,0,.70710677,.70710677],'VEC4',2)
        d['animations']=[{'name':'flight','samplers':[{'input':times,'output':rot,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':1,'path':'rotation'}}]}]
    while len(binary)%4: binary.append(0)
    d['buffers']=[{'byteLength':len(binary)}]
    content=json.dumps(d,separators=(',',':')).encode();content += b' '*((-len(content))%4)
    return struct.pack('<III',0x46546c67,2,28+len(content)+len(binary))+struct.pack('<II',len(content),0x4e4f534a)+content+struct.pack('<II',len(binary),0x004e4942)+binary
