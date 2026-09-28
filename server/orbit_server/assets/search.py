"""Deterministic language hints, strict known-metadata filters, stable deduplication."""
from __future__ import annotations
import re

from .licenses import LicensePolicy

WORDS = {"drache": "dragon", "drachen": "dragon", "brunnen": "well", "mittelalterlichen": "medieval",
         "mittelalterlich": "medieval", "mittelalterlicher": "medieval", "alten": "old", "alter": "old",
         "fliegend": "flying", "fliegender": "flying", "wald": "forest", "felsen": "rocks"}
STOP = {"ich", "brauche", "einen", "eine", "ein", "bitte", "suche", "find", "need", "a", "an", "the"}


def parse_query(value: dict) -> dict:
    query = dict(value)
    words = re.findall(r"[\w-]+", query.get("query", "").lower())
    for flag, triggers in {"rigged": {"rigged", "geriggt"}, "animated": {"animated", "animiert"},
                           "low_poly": {"low-poly", "lowpoly"}}.items():
        if set(words) & triggers: query.setdefault(flag, True)
        words = [w for w in words if w not in triggers]
    if "cc0" in words: query.setdefault("licenses", ["CC0", "Public Domain"])
    if "cc-by" in words: query.setdefault("licenses", ["CC-BY"])
    words = [WORDS.get(w, w) for w in words if w not in STOP | {"cc0", "cc-by", "quest", "3"}]
    query["terms"] = words
    query["text"] = " ".join(words)
    return query


def matches(record: dict, query: dict, policy: LicensePolicy, *, terms: bool = False) -> bool:
    if not policy.decision(record["license"])["allowed"]: return False
    if "licenses" in query and record["license"]["license"] not in query["licenses"]: return False
    if query.get("types") and record["type"] not in query["types"]: return False
    if terms:
        text = (record["name"] + " " + " ".join(record.get("tags", []))).lower()
        if not all(word in text for word in query.get("terms", [])): return False
    geometry = record.get("geometry") or {}
    for field, actual in [("max_triangles", geometry.get("triangles")), ("max_bytes", record.get("size")),
                          ("max_texture_resolution", max([max(t.get("resolution") or [0]) for t in record.get("textures") or []], default=None))]:
        if field in query and (actual is None or actual > query[field]): return False
    if query.get("rigged") and not (record.get("skeleton") or {}).get("present"): return False
    animation_count = len(record["animations"]) if record.get("animations") is not None else record.get("advertised", {}).get("animationCount") or 0
    if query.get("animated") and not animation_count: return False
    if "min_animations" in query and animation_count < query["min_animations"]: return False
    if query.get("gltf") and not set(record["formats"]) & {"glb", "gltf"}: return False
    if query.get("pbr") and record.get("pbr") is not True: return False
    if query.get("low_poly") and (geometry.get("triangles") is None or geometry["triangles"] > 20000): return False
    if query.get("quest_compatible") and not record.get("performance", {}).get("quest3-balanced", {}).get("withinBudget"): return False
    return True


def deduplicate(records: list[dict]) -> list[dict]:
    unique: dict[str, dict] = {}
    for record in records:
        key = record.get("sha256") or record["sourceUrl"] or record["id"]
        if key in unique:
            unique[key].setdefault("alternatives", []).append({"id": record["id"], "license": record["license"]})
        else: unique[key] = {**record, "alternatives": []}
    return sorted(unique.values(), key=lambda r: (r["license"]["license"] not in {"CC0", "Public Domain"}, not r["verified"]))
