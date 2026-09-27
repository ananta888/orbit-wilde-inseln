"""ODG1 frames: bounded JSON header, then little-endian checked typed buffers."""
import hashlib
import json
import struct

import numpy as np

from .document import ARRAYS, DesignError, canonical

MAGIC = b"ODG1"
MAX_FRAME = 8 * 1024 * 1024


def frame(document, item, previous=None, base_revision=-1):
    replace = (previous is None or item["topology_revision"] != previous["topology_revision"]
               or item["indices"] != previous["indices"])
    buffers = {}
    if replace:
        for name in ARRAYS: buffers[name] = np.asarray(item[name], dtype="<f4")
        buffers["indices"] = np.asarray(item["indices"], dtype="<u4")
    else:
        count = len(item["positions"]) // 3
        changed = np.zeros(count, dtype=bool)
        for name, width in ARRAYS.items():
            changed |= np.any(np.asarray(item[name]).reshape(-1, width) !=
                              np.asarray(previous[name]).reshape(-1, width), axis=1)
        ids = np.flatnonzero(changed)
        if not len(ids): return None
        buffers["vertex_ids"] = ids.astype("<u4")
        for name, width in ARRAYS.items():
            buffers[name] = np.asarray(item[name], dtype="<f4").reshape(-1, width)[ids].ravel()
    header = {"protocol": 1, "asset_id": document["id"], "region_id": item["id"],
              "base_revision": base_revision, "revision": document["revision"],
              "topology_revision": item["topology_revision"], "mode": "replace" if replace else "patch",
              "buffers": {}}
    payload = bytearray()
    for name, array in buffers.items():
        raw = array.tobytes()
        header["buffers"][name] = {"offset": len(payload), "bytes": len(raw), "count": len(array),
                                    "dtype": "u32" if array.dtype.kind == "u" else "f32",
                                    "sha256": hashlib.sha256(raw).hexdigest()}
        payload.extend(raw)
    head = canonical(header)
    result = MAGIC + struct.pack("<I", len(head)) + head + payload
    if len(result) > MAX_FRAME: raise DesignError("Regionsframe zu groß")
    return result


def decode(data):
    """Reference decoder, also used by fault and cross-language fixture tests."""
    if len(data) < 8 or len(data) > MAX_FRAME or data[:4] != MAGIC: raise DesignError("Geometrieheader")
    size = struct.unpack_from("<I", data, 4)[0]
    if not 1 <= size <= 16384 or 8 + size > len(data): raise DesignError("Headerlänge")
    header = json.loads(data[8:8 + size])
    if header.get("protocol") != 1: raise DesignError("Geometrieversion")
    payload = data[8 + size:]; result = {}; end = 0
    for name, item in sorted(header["buffers"].items(), key=lambda entry: entry[1]["offset"]):
        if name not in {*ARRAYS, "indices", "vertex_ids"}: raise DesignError("Attribut")
        offset, length, count = item["offset"], item["bytes"], item["count"]
        if any(type(x) is not int or x < 0 for x in (offset, length, count)) or offset != end or length != count * 4 or offset + length > len(payload):
            raise DesignError("Bufferlänge")
        raw = payload[offset:offset + length]
        if hashlib.sha256(raw).hexdigest() != item["sha256"]: raise DesignError("Bufferprüfsumme")
        dtype = "<u4" if name in {"indices", "vertex_ids"} else "<f4"
        if item["dtype"] != ("u32" if dtype == "<u4" else "f32"): raise DesignError("Buffertyp")
        result[name] = np.frombuffer(raw, dtype=dtype).copy()
        if not np.isfinite(result[name]).all(): raise DesignError("Nichtendlicher Buffer")
        end += length
    if end != len(payload): raise DesignError("Zusätzliche oder fehlende Bytes")
    return header, result


def changes(before, after):
    old = {r["id"]: r for r in before["regions"]} if before else {}
    return [value for item in after["regions"] if
            (value := frame(after, item, old.get(item["id"]), before["revision"] if before else -1)) is not None]
