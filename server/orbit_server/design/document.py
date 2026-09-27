"""Canonical metre-space documents. Untrusted buffers are checked before native work."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from typing import Any

import numpy as np

VERSION = "1.0"
MAX_VERTICES = 100_000
MAX_TRIANGLES = 180_000
MAX_REGIONS = 96
MAX_BYTES = 24 * 1024 * 1024
ID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
ARRAYS = {"positions": 3, "normals": 3, "colors": 3, "mask": 1, "surface": 4}
MATERIAL = {"roughness": .65, "metallic": 0., "emissive": [0., 0., 0.], "opacity": 1.,
            "detail": "none", "detail_scale": 12.}
DETAILS = {"none", "skin", "scales", "fur", "feather", "horn", "bone", "metal", "stone", "crystal", "slime"}


class DesignError(ValueError):
    """Expected domain rejection; safe to report without traceback or input echoes."""


class Conflict(DesignError):
    pass


def canonical(value: Any) -> bytes:
    return json.dumps(value, allow_nan=False, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def finite(value: Any, low: float, high: float, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise DesignError(f"Ungültiger Wert: {label}")
    return float(value)


def vec(value: Any, limit: float = 100.) -> np.ndarray:
    if not isinstance(value, list) or len(value) != 3: raise DesignError("Drei Koordinaten erforderlich")
    return np.asarray([finite(x, -limit, limit, "Koordinate") for x in value], dtype=np.float64)


def fields(value: Any, allowed: set[str], required: set[str] | None = None) -> None:
    if not isinstance(value, dict) or set(value) - allowed or (required or set()) - set(value):
        raise DesignError("Unbekannte oder fehlende Felder")


def identifier(value: Any) -> str:
    if not isinstance(value, str) or not ID.fullmatch(value): raise DesignError("Ungültige ID")
    return value


def normals(positions: np.ndarray, indices: np.ndarray) -> np.ndarray:
    points = positions.reshape(-1, 3)
    faces = indices.reshape(-1, 3)
    result = np.zeros_like(points, dtype=np.float64)
    tri = points[faces]
    cross = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    for i in range(3): np.add.at(result, faces[:, i], cross)
    lengths = np.linalg.norm(result, axis=1)
    result /= np.maximum(lengths[:, None], 1e-12)
    return result.astype(np.float32)


def floats(value: np.ndarray) -> list[float]:
    return np.asarray(value, dtype=np.float32).ravel().tolist()


def region(ident: str, vertices: Any, faces: Any, color=(.12, .38, .27), *, solid=True) -> dict[str, Any]:
    points = np.asarray(vertices, dtype=np.float32).reshape(-1, 3)
    indices = np.asarray(faces, dtype=np.uint32).reshape(-1, 3)
    return {"id": identifier(ident), "part": ident, "topology_revision": 0, "solid": solid,
            "positions": floats(points), "indices": indices.ravel().tolist(),
            "normals": floats(normals(points, indices)),
            "colors": floats(np.tile(color, (len(points), 1))), "mask": [0.] * len(points),
            "surface": floats(np.tile([.65, 0., 0., 1.], (len(points), 1))),
            "material": copy.deepcopy(MATERIAL), "locked": False}


def new_document(ident: str, name: str, regions: list[dict[str, Any]]) -> dict[str, Any]:
    result = {"schema_version": VERSION, "id": identifier(ident), "name": name[:100], "revision": 0,
              "units": "meters", "regions": regions, "rig": {"bones": [], "weights": {}},
              "clips": [], "mount_points": [], "colliders": [], "layers": [],
              "provenance": {"source": "Orbit procedural", "license": "BSD-3-Clause"},
              "behaviour_profile": "friendly_dragon"}
    validate(result)
    return result


def validate(doc: dict[str, Any]) -> None:
    fields(doc, {"schema_version", "id", "name", "revision", "units", "regions", "rig", "clips",
                 "mount_points", "colliders", "layers", "provenance", "behaviour_profile"},
           {"schema_version", "id", "name", "revision", "units", "regions", "rig", "clips",
            "mount_points", "colliders", "layers", "provenance", "behaviour_profile"})
    if doc["schema_version"] != VERSION or doc["units"] != "meters": raise DesignError("Unbekanntes Dokumentformat")
    identifier(doc["id"])
    if not isinstance(doc["name"], str) or not 1 <= len(doc["name"]) <= 100: raise DesignError("Ungültiger Name")
    if type(doc["revision"]) is not int or not 0 <= doc["revision"] < 2**31: raise DesignError("Ungültige Revision")
    if not isinstance(doc["regions"], list) or not 1 <= len(doc["regions"]) <= MAX_REGIONS: raise DesignError("Regionsbudget")
    seen, vertices, triangles = set(), 0, 0
    for item in doc["regions"]:
        fields(item, set(ARRAYS) | {"id", "part", "indices", "topology_revision", "solid", "material", "locked"},
               set(ARRAYS) | {"id", "part", "indices", "topology_revision", "solid", "material", "locked"})
        ident = identifier(item["id"]); identifier(item["part"])
        if ident in seen: raise DesignError("Doppelte Region")
        seen.add(ident)
        if type(item["topology_revision"]) is not int or item["topology_revision"] < 0: raise DesignError("Topologieversion")
        if type(item["solid"]) is not bool or type(item["locked"]) is not bool: raise DesignError("Regionsflags")
        count = len(item["positions"]) // 3
        if not 3 <= count <= MAX_VERTICES: raise DesignError("Vertexbudget")
        vertices += count
        for name, width in ARRAYS.items():
            values = item[name]
            if not isinstance(values, list) or len(values) != count * width: raise DesignError("Attributlänge")
            array = np.asarray(values, dtype=np.float64)
            if not np.isfinite(array).all(): raise DesignError("Nichtendliche Geometrie")
            limit = 100 if name == "positions" else 1.001
            if np.max(np.abs(array)) > limit or (name in {"mask", "colors", "surface"} and np.min(array) < 0):
                raise DesignError("Attribut außerhalb der Grenzen")
        indices = item["indices"]
        if not isinstance(indices, list) or len(indices) % 3 or not 3 <= len(indices) <= MAX_TRIANGLES * 3:
            raise DesignError("Indexbudget")
        if any(type(x) is not int or not 0 <= x < count for x in indices): raise DesignError("Ungültiger Index")
        triangles += len(indices) // 3
        material = item["material"]
        fields(material, set(MATERIAL), set(MATERIAL))
        for key in ("roughness", "metallic", "opacity"): finite(material[key], 0, 1, key)
        emissive = vec(material["emissive"], 1)
        if np.min(emissive) < 0: raise DesignError("Emission")
        finite(material["detail_scale"], 1, 100, "Detailgröße")
        if material["detail"] not in DETAILS: raise DesignError("Oberflächendetail")
    if vertices > MAX_VERTICES or triangles > MAX_TRIANGLES: raise DesignError("Dokument überschreitet Geometriebudget")
    for key, maximum in (("clips", 32), ("mount_points", 16), ("colliders", 96), ("layers", 32)):
        if not isinstance(doc[key], list) or len(doc[key]) > maximum: raise DesignError(f"Budget: {key}")
        ids = [identifier(item.get("id")) if isinstance(item, dict) else None for item in doc[key]]
        if None in ids or len(set(ids)) != len(ids): raise DesignError(f"Doppelte oder fehlende ID: {key}")
    from .rigging import validate_rig
    validate_rig(doc)
    identifier(doc["behaviour_profile"])
    if not isinstance(doc["provenance"], dict) or len(canonical(doc["provenance"])) > 8192: raise DesignError("Provenienzbudget")
    for point in doc["mount_points"]:
        fields(point, {"id", "position", "rotation", "safe_radius"}, {"id", "position", "rotation", "safe_radius"})
        identifier(point["id"]); vec(point["position"]); vec(point["rotation"], math.pi)
        finite(point["safe_radius"], .1, 2, "Kamerafreiraum")
    for collider in doc["colliders"]:
        fields(collider, {"id", "position", "size", "kind"}, {"id", "position", "size", "kind"})
        identifier(collider["id"]); vec(collider["position"])
        if collider["kind"] not in {"sphere", "capsule", "box"} or np.min(vec(collider["size"], 20)) <= 0:
            raise DesignError("Colliderformat")
    bone_ids = {b["id"]: b for b in doc["rig"]["bones"]}
    for clip in doc["clips"]:
        fields(clip, {"id", "duration", "loop", "keys"}, {"id", "duration", "loop", "keys"})
        identifier(clip["id"]); finite(clip["duration"], .1, 60, "Clipdauer")
        if type(clip["loop"]) is not bool or not isinstance(clip["keys"], list) or not 1 <= len(clip["keys"]) <= 512:
            raise DesignError("Clipbudget")
        key_ids = set()
        for key in clip["keys"]:
            fields(key, {"bone", "time", "rotation"}, {"bone", "time", "rotation"})
            if key["bone"] not in bone_ids: raise DesignError("Clip referenziert fehlenden Knochen")
            finite(key["time"], 0, clip["duration"], "Keyframezeit"); vec(key["rotation"], math.pi)
            key_id = (key["bone"], key["time"])
            if key_id in key_ids: raise DesignError("Doppelter Keyframe für Gelenk und Zeitpunkt")
            key_ids.add(key_id)
            limits = bone_ids[key["bone"]].get("limits")
            if limits and (np.any(np.asarray(key["rotation"]) < limits["min"]) or
                           np.any(np.asarray(key["rotation"]) > limits["max"])):
                raise DesignError("Animation überschreitet Gelenkgrenzen")
    from .layers import validate_layers
    validate_layers(doc)
    if len(canonical(doc)) > MAX_BYTES: raise DesignError("Dokument zu groß")


def metadata(doc: dict[str, Any]) -> dict[str, Any]:
    result = {k: copy.deepcopy(v) for k, v in doc.items() if k != "regions"}
    result["regions"] = [{k: copy.deepcopy(v) for k, v in r.items() if k not in {*ARRAYS, "indices"}}
                         | {"vertex_count": len(r["positions"]) // 3, "index_count": len(r["indices"])}
                         for r in doc["regions"]]
    return result
