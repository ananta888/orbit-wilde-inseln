"""Blend only candidates with a stable correspondence; never guess topology mappings."""
import copy

import numpy as np

from .document import DesignError, finite, floats, normals, validate


def blendable(before, after):
    for field in ("rig", "clips", "layers", "mount_points", "colliders", "behaviour_profile"):
        if before[field] != after[field]: return False
    if [r["id"] for r in before["regions"]] != [r["id"] for r in after["regions"]]: return False
    for a, b in zip(before["regions"], after["regions"]):
        for field in ("indices", "topology_revision", "mask", "material", "solid", "locked", "part"):
            if a[field] != b[field]: return False
        if len(a["positions"]) != len(b["positions"]): return False
    return True


def blend(before, after, amount):
    amount = finite(amount, 0, 1, "Vorschlagsanteil")
    if amount == 0: return copy.deepcopy(before)
    if amount == 1: return copy.deepcopy(after)
    if not blendable(before, after): raise DesignError("Dieser Vorschlag kann nur vollständig übernommen oder verworfen werden")
    result = copy.deepcopy(after)
    for original, proposed, target in zip(before["regions"], after["regions"], result["regions"]):
        if original == proposed: continue
        for name in ("positions", "colors", "surface"):
            a, b = np.asarray(original[name]), np.asarray(proposed[name])
            target[name] = floats(a + (b - a) * amount)
        if original['positions'] != proposed['positions']:
            target["normals"] = floats(normals(np.asarray(target["positions"]), np.asarray(target["indices"])))
    validate(result)
    return result
