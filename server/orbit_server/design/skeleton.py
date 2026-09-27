"""Procedural hierarchical skinning and bounded joint solving in canonical metres."""
from __future__ import annotations

import math
from typing import Any
import numpy as np

from .document import DesignError, floats, vec


def weighted_rig(doc):
    regions = doc["regions"]
    centers = {r["id"]: np.asarray(r["positions"]).reshape(-1, 3).mean(axis=0) for r in regions}
    torso = next((r["id"] for r in regions if r["part"] in {"torso", "body"}), regions[0]["id"])
    def order(r):
        if r["id"] == torso: return 0
        if r["part"] == "neck": return 1
        if r["part"] == "head": return 2
        if r["part"].startswith("tail"): return 3
        return 4
    regions = sorted(regions, key=order)
    occupied = {r["id"] for r in regions}
    def unique(base):
        stem = candidate = base[:52]
        number = 0
        while candidate in occupied:
            number += 1; candidate = f"{stem}_{number}"
        occupied.add(candidate)
        return candidate
    root = unique("root")
    bones = [{"id": root, "parent": None, "position": [0., 0., 0.], "rotation": [0., 0., 0.]}]
    indices, positions, weights = {root: 0}, {root: np.zeros(3)}, {}
    semantic: dict[str, str] = {}
    tail_parent = None
    for number, r in enumerate(regions):
        name, part = r["id"], r["part"]
        points = np.asarray(r["positions"]).reshape(-1, 3)
        center = centers[name]
        parent = semantic.get("torso", root)
        if name == torso: parent = root
        elif part == "head": parent = semantic.get("neck", parent)
        elif any(s in part for s in ("eye", "pupil", "jaw", "horn", "tooth")):
            parent = semantic.get("head", parent)
        elif part.startswith("tail") and tail_parent: parent = tail_parent
        axis = 0 if "wing" in part or "arm" in part else 2 if part.startswith("tail") else 1
        flexible = any(s in part for s in ("wing", "tail", "neck", "leg", "arm", "tentacle"))
        # Reserve one bone for every remaining region before allocating a bend joint.
        flexible = flexible and len(bones) + len(regions) - number + 1 <= 128
        pivot, tip = center.copy(), center.copy()
        if flexible:
            lower, upper = points[:, axis].min(), points[:, axis].max()
            nearest_lower = abs(lower - positions[parent][axis]) <= abs(upper - positions[parent][axis])
            pivot[axis], tip[axis] = (lower, upper) if nearest_lower else (upper, lower)
            flexible = abs(tip[axis] - pivot[axis]) > 1e-5
        indices[name] = len(bones); positions[name] = pivot
        bones.append({"id": name, "parent": parent, "position": floats(pivot - positions[parent]), "rotation": [0., 0., 0.]})
        semantic.setdefault(part, name)
        if name == torso: semantic["torso"] = name
        joints = np.zeros((len(points), 4), dtype=np.int32)
        influence = np.zeros((len(points), 4), dtype=float)
        joints[:, 0], influence[:, 0] = indices[name], 1.
        if flexible:
            end = unique(name + "_tip")
            indices[end] = len(bones); positions[end] = tip
            bones.append({"id": end, "parent": name, "position": floats(tip - pivot), "rotation": [0., 0., 0.]})
            t = np.clip((points[:, axis] - pivot[axis]) / (tip[axis] - pivot[axis]), 0, 1)
            t = t * t * (3 - 2 * t)
            joints[:, 1], influence[:, 1], influence[:, 0] = indices[end], t, 1 - t
            # Blending the attachment keeps skin continuous with the parent body.
            attachment = .2 * (1 - t)**4
            influence[:, :2] *= (1 - attachment[:, None])
            joints[:, 2], influence[:, 2] = indices[parent], attachment
            if part.startswith("tail"): tail_parent = end
        weights[name] = {"joints": joints.ravel().tolist(), "weights": floats(influence)}
    return {"bones": bones, "weights": weights}


def rotation_matrix(rotation):
    x, y, z = rotation
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    return np.array([[cy*cz, -cy*sz, sy], [sx*sy*cz+cx*sz, -sx*sy*sz+cx*cz, -sx*cy],
                     [-cx*sy*cz+sx*sz, cx*sy*sz+sx*cz, cx*cy]])


def world_joints(bones):
    positions, rotations = {}, {}
    for bone in bones:
        parent = bone["parent"]
        rotation = rotation_matrix(bone["rotation"])
        if parent is None:
            positions[bone["id"]], rotations[bone["id"]] = np.array(bone["position"]), rotation
        else:
            positions[bone["id"]] = positions[parent] + rotations[parent] @ bone["position"]
            rotations[bone["id"]] = rotations[parent] @ rotation
    return positions


def solve_ik(doc, name, target):
    """Coordinate descent, at most four joints and bounded iterations; no external solver."""
    bones = doc["rig"]["bones"]
    by_id = {b["id"]: b for b in bones}
    if name not in by_id: raise DesignError("IK-Gelenk nicht gefunden")
    target = vec(target)
    chain: list[dict[str, Any]] = []
    current = by_id[name]["parent"]
    while current is not None and len(chain) < 4:
        bone = by_id[current]
        if bone["parent"] is None: break
        chain.append(bone); current = bone["parent"]
    if not chain: raise DesignError("Für IK wird eine Gelenkkette benötigt")
    def cost(): return float(np.sum((world_joints(bones)[name] - target)**2))
    before = best = cost()
    for step in (.35, .18, .08, .03):
        for _ in range(4):
            for bone in chain:
                limits = bone.get("limits", {"min": [-math.pi]*3, "max": [math.pi]*3})
                for axis in range(3):
                    original = chosen = bone["rotation"][axis]
                    for sign in (-1, 1):
                        value = float(np.clip(original + sign*step, limits["min"][axis], limits["max"][axis]))
                        bone["rotation"][axis] = value
                        distance = cost()
                        if distance < best: chosen, best = value, distance
                    bone["rotation"][axis] = chosen
    return {"before": math.sqrt(before), "after": math.sqrt(best), "reached": best < .01**2}


def paint_weights(doc, operation):
    bone_ids = [b["id"] for b in doc["rig"]["bones"]]
    if operation.get("bone") not in bone_ids: raise DesignError("Zielgelenk fehlt")
    bone = bone_ids.index(operation["bone"])
    radius, strength = operation.get("radius", .2), operation.get("strength", .5)
    centers = [vec(p) for p in operation.get("samples", [])]
    if not centers: raise DesignError("Gewichtsmalerei benötigt Berührungspunkte")
    for region in doc["regions"]:
        if region["id"] not in operation.get("regions", []): continue
        if region["locked"]: raise DesignError("Bereich ist gesperrt")
        points = np.asarray(region["positions"]).reshape(-1, 3)
        amount = np.maximum.reduce([np.maximum(0, 1 - np.sum((points-c)**2, axis=1) / radius**2)**2 for c in centers])
        amount *= strength * (1 - np.asarray(region["mask"]))
        item = doc["rig"]["weights"][region["id"]]
        indices = np.array(item["joints"]).reshape(-1, 4)
        weights = np.array(item["weights"]).reshape(-1, 4)
        for vertex in np.flatnonzero(amount > 0):
            ids, values = indices[vertex], weights[vertex] * (1 - amount[vertex])
            match = np.flatnonzero(ids == bone)
            slot = int(match[0]) if len(match) else int(values.argmin())
            ids[slot] = bone; values[slot] += amount[vertex]
            weights[vertex] = values / values.sum()
        item["joints"], item["weights"] = indices.ravel().tolist(), floats(weights)
