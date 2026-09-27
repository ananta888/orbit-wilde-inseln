"""Controlled, inspectable skeleton proposals and explicit mount/collider metadata."""
import math

import numpy as np

from .document import DesignError, finite, floats, identifier, vec


def propose(doc):
    bones = [{"id": "root", "parent": None, "position": [0., 0., 0.], "rotation": [0., 0., 0.]}]
    weights = {}
    for item in doc["regions"]:
        center = np.asarray(item["positions"]).reshape(-1, 3).mean(axis=0)
        index = len(bones)
        bones.append({"id": item["id"], "parent": "root", "position": floats(center), "rotation": [0., 0., 0.]})
        # Rigid semantic weights are an honest initial proposal, editable in Pose.
        # Organic shoulder blending requires the later weight-painting milestone.
        weights[item["id"]] = {"joints": [index, 0, 0, 0] * (len(item["positions"]) // 3),
                               "weights": [1., 0., 0., 0.] * (len(item["positions"]) // 3)}
    return {"bones": bones, "weights": weights}


def validate_rig(doc):
    rig = doc["rig"]
    if not isinstance(rig, dict) or set(rig) != {"bones", "weights"}: raise DesignError("Rigformat")
    bones = rig["bones"]
    if not isinstance(bones, list) or len(bones) > 128: raise DesignError("Knochenbudget")
    if not isinstance(rig["weights"], dict) or set(rig["weights"]) - {r["id"] for r in doc["regions"]}:
        raise DesignError("Gewichte für unbekannte Region")
    seen = set()
    for bone in bones:
        if set(bone) != {"id", "parent", "position", "rotation"}: raise DesignError("Knochenformat")
        ident = identifier(bone["id"])
        if ident in seen or (bone["parent"] is not None and bone["parent"] not in seen): raise DesignError("Knochenhierarchie")
        vec(bone["position"]); vec(bone["rotation"], math.pi * 2); seen.add(ident)
    for item in doc["regions"]:
        weights = rig["weights"].get(item["id"])
        if not bones:
            if weights: raise DesignError("Gewichte ohne Skelett")
            continue
        if not weights or set(weights) != {"joints", "weights"}: raise DesignError("Fehlende Gewichte")
        count = len(item["positions"]) // 3
        if len(weights["weights"]) != count * 4 or len(weights["joints"]) != count * 4: raise DesignError("Gewichtlänge")
        if any(type(i) is not int or not 0 <= i < len(bones) for i in weights["joints"]): raise DesignError("Knochenindex")
        array = np.array(weights["weights"]).reshape(-1, 4)
        if not np.isfinite(array).all() or (array < 0).any() or not np.allclose(array.sum(axis=1), 1, atol=1e-5):
            raise DesignError("Ungültige Skin-Gewichte")


def edit_rig(doc, op):
    tool = op["tool"]
    if tool == "rig": doc["rig"] = propose(doc); doc["clips"] = []
    elif tool == "pose":
        bone = next((b for b in doc["rig"]["bones"] if b["id"] == op.get("bone")), None)
        if not bone: raise DesignError("Knochen nicht gefunden")
        bone["rotation"] = floats(vec(op.get("rotation"), math.pi))
    elif tool == "mount":
        identifier(op.get("id", "rider_seat"))
        point = {"id": op.get("id", "rider_seat"), "position": floats(vec(op.get("position"))),
                 "rotation": floats(vec(op.get("rotation", [0, 0, 0]), math.pi)),
                 "safe_radius": finite(op.get("radius", .3), .1, 2, "Kamerafreiraum")}
        doc["mount_points"] = [p for p in doc["mount_points"] if p["id"] != point["id"]] + [point]
    elif tool == "collider":
        kind = op.get("kind", "capsule")
        if kind not in {"sphere", "capsule", "box"}: raise DesignError("Colliderart noch nicht unterstützt")
        item = {"id": identifier(op.get("id")), "kind": kind, "position": floats(vec(op.get("position"))),
                "size": floats(vec(op.get("size", [.5, 1, .5]), 20))}
        if min(item["size"]) <= 0: raise DesignError("Collidergröße")
        doc["colliders"] = [c for c in doc["colliders"] if c["id"] != item["id"]] + [item]
    elif tool == "clip":
        if not doc["rig"]["bones"]: raise DesignError("Zuerst Rig erzeugen")
        ident = identifier(op.get("id", "idle"))
        duration = finite(op.get("duration", 2), .1, 60, "Clipdauer")
        keys = op.get("keys", [])
        if not isinstance(keys, list) or not 1 <= len(keys) <= 512: raise DesignError("Keyframebudget")
        names = {b["id"] for b in doc["rig"]["bones"]}
        for key in keys:
            if set(key) != {"bone", "time", "rotation"} or key["bone"] not in names: raise DesignError("Keyframe")
            finite(key["time"], 0, duration, "Keyframezeit"); vec(key["rotation"], math.pi)
        item = {"id": ident, "duration": duration, "loop": bool(op.get("loop", True)), "keys": keys}
        doc["clips"] = [c for c in doc["clips"] if c["id"] != ident] + [item]
    validate_rig(doc)
