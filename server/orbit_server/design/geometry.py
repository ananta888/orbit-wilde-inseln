"""Deterministic triangle editing and explicit solid operations using Manifold."""
import copy
import math
from typing import Any

import manifold3d
import numpy as np

from .document import DesignError, fields, finite, floats, identifier, normals, validate, vec
from .generation import primitive

SCULPT = {"push", "pull", "grab", "inflate", "deflate", "smooth", "flatten", "pinch",
          "crease", "clay", "stretch", "bend", "twist", "scale", "move"}
PAINT = {"brush", "airbrush", "spray", "fill", "gradient", "eraser", "smudge", "stamp"}
OPERATIONS = SCULPT | {"paint", "mask", "material", "lock", "add", "delete", "union",
                      "subtract", "cut", "refine", "simplify", "rename", "rig", "pose",
                      "mount", "collider", "clip"}
ALLOWED = {"tool", "regions", "samples", "radius", "strength", "normal", "delta", "color",
           "channel", "paint_tool", "symmetry", "radial", "axis", "value", "material",
           "kind", "position", "size", "points", "target", "name", "rotation", "bone",
           "time", "duration", "loop", "keys", "id", "angle", "tolerance"}


def smooth_average(points: np.ndarray, faces: np.ndarray) -> np.ndarray:
    result, count = np.zeros_like(points), np.zeros(len(points))
    for a, b in ((0, 1), (1, 2), (2, 0), (1, 0), (2, 1), (0, 2)):
        np.add.at(result, faces[:, a], points[faces[:, b]])
        np.add.at(count, faces[:, a], 1)
    return result / np.maximum(count[:, None], 1)


def symmetry_field(points, center, radius, symmetry, radial, axis):
    transforms = [np.eye(3)]
    for i, name in enumerate("xyz"):
        if name in symmetry:
            mirror = np.diag([-1 if j == i else 1 for j in range(3)])
            transforms += [mirror @ matrix for matrix in transforms.copy()]
    if radial > 1:
        i, j = [k for k in range(3) if k != axis]
        original = transforms.copy()
        for n in range(1, radial):
            angle = math.tau * n / radial
            rotate = np.eye(3)
            rotate[i, i] = rotate[j, j] = math.cos(angle)
            rotate[i, j], rotate[j, i] = -math.sin(angle), math.sin(angle)
            transforms += [rotate @ matrix for matrix in original]
    weights = np.zeros(len(points))
    chosen = np.tile(np.eye(3), (len(points), 1, 1))
    centers = np.tile(center, (len(points), 1))
    for matrix in transforms:
        c = matrix @ center
        d = np.linalg.norm(points - c, axis=1) / radius
        influence = np.clip(1 - d * d, 0, 1)**2
        take = influence > weights
        chosen[take], centers[take] = matrix, c
        weights = np.maximum(weights, influence)
    return weights, chosen, centers


def brush_weights(points, center, radius, symmetry, radial, axis):
    return symmetry_field(points, center, radius, symmetry, radial, axis)[0]


def to_manifold(item):
    if not item["solid"]: raise DesignError("Volumenoperation benötigt eine geschlossene Form")
    if item["locked"] or any(item["mask"]): raise DesignError("Volumenoperation an geschützter Form nicht erlaubt")
    data = np.column_stack([np.array(item[k]).reshape(-1, width) for k, width in
                            (("positions", 3), ("colors", 3), ("surface", 4))]).astype(np.float32)
    mesh = manifold3d.Mesh(vert_properties=data, tri_verts=np.asarray(item["indices"], dtype=np.uint32).reshape(-1, 3))
    result = manifold3d.Manifold(mesh)
    if result.is_empty(): raise DesignError("Form ist kein gültiges geschlossenes Volumen")
    return result


def from_manifold(result, original):
    if result.is_empty(): raise DesignError("Operation würde die gesamte Form entfernen")
    mesh = result.to_mesh()
    item = copy.deepcopy(original)
    data = np.asarray(mesh.vert_properties)
    item["positions"], item["indices"] = floats(data[:, :3]), np.asarray(mesh.tri_verts).ravel().tolist()
    item["normals"] = floats(normals(data[:, :3], np.asarray(mesh.tri_verts)))
    item["colors"] = floats(np.clip(data[:, 3:6], 0, 1))
    item["surface"] = floats(np.clip(data[:, 6:10], 0, 1))
    item["mask"] = [0.] * len(data)
    item["topology_revision"] += 1
    return item


def apply(document: dict[str, Any], operation: dict[str, Any]) -> dict[str, Any]:
    from .schemas import check
    check("edit-command", operation)
    fields(operation, ALLOWED, {"tool"})
    tool = operation["tool"]
    if tool not in OPERATIONS: raise DesignError("Unbekanntes Werkzeug")
    doc = copy.deepcopy(document)
    by_id = {r["id"]: r for r in doc["regions"]}
    targets = operation.get("regions", [])
    if not isinstance(targets, list) or len(targets) > 96 or len(set(targets)) != len(targets) or any(t not in by_id for t in targets):
        raise DesignError("Ungültige Auswahl")
    selected = [by_id[t] for t in targets]
    if tool not in {"add", "rename", "rig", "pose", "mount", "collider", "clip"} and not selected:
        raise DesignError("Zuerst einen Bereich auswählen")
    if any(r["locked"] for r in selected) and tool != "lock": raise DesignError("Bereich ist gesperrt")
    strength = finite(operation.get("strength", .25), 0, 1, "Stärke")
    if tool in SCULPT | {"paint", "mask"}:
        radius = finite(operation.get("radius", .2), .005, 5, "Radius")
        samples = operation.get("samples")
        if not isinstance(samples, list) or not 1 <= len(samples) <= 64: raise DesignError("Begrenzte Brushpunkte erforderlich")
        centers = [vec(sample) for sample in samples]
        normal = vec(operation.get("normal", [0, 1, 0]), 1)
        normal /= max(np.linalg.norm(normal), 1e-9)
        delta = vec(operation.get("delta", [0, 0, 0]), 2)
        symmetry = operation.get("symmetry", "")
        if symmetry not in {"", "x", "y", "z", "xy", "xz", "yz", "xyz"}: raise DesignError("Symmetrie")
        radial = operation.get("radial", 1); axis = operation.get("axis", 1)
        if type(radial) is not int or not 1 <= radial <= 12 or axis not in {0, 1, 2}: raise DesignError("Radialsymmetrie")
        for item in selected:
            points = np.asarray(item["positions"], dtype=float).reshape(-1, 3)
            before = points.copy()
            faces = np.asarray(item["indices"]).reshape(-1, 3)
            mask = np.asarray(item["mask"])
            color = np.asarray(item["colors"]).reshape(-1, 3)
            surface = np.asarray(item["surface"]).reshape(-1, 4)
            base_normals = np.asarray(item["normals"]).reshape(-1, 3)
            for center in centers:
                weight, transforms, brush_centers = symmetry_field(before, center, radius, symmetry, radial, axis)
                if tool == "mask":
                    value = finite(operation.get("value", 1), 0, 1, "Maske")
                    mask = np.maximum(mask, weight * value) if value else mask * (1 - weight)
                    continue
                weight *= 1 - mask
                w = weight[:, None] * strength / len(centers)
                direction = points - brush_centers
                brush_normals = np.einsum('nij,j->ni', transforms, normal)
                if tool in {"push", "pull", "inflate", "deflate", "clay"}:
                    sign = -1 if tool in {"push", "deflate"} else 1
                    points += base_normals * w * radius * .35 * sign
                elif tool in {"grab", "move", "stretch"}:
                    points += np.einsum('nij,j->ni', transforms, delta) * w
                elif tool == "scale":
                    value = finite(operation.get("value", 1.15), .25, 3, "Größe")
                    points += direction * (value - 1) * w
                elif tool == "smooth":
                    points += (smooth_average(points, faces) - points) * w
                elif tool == "flatten":
                    points -= np.sum(direction * brush_normals, axis=1)[:, None] * brush_normals * w
                elif tool in {"pinch", "crease"}:
                    tangent = direction - np.sum(direction * brush_normals, axis=1)[:, None] * brush_normals
                    points -= tangent * w * .5
                    if tool == "crease": points -= brush_normals * w * radius * .2
                elif tool in {"bend", "twist"}:
                    angle = finite(operation.get("angle", .5), -math.pi, math.pi, "Winkel")
                    local = np.einsum('nji,nj->ni', transforms, direction)
                    a = angle * w[:, 0] * (local[:, axis] / radius if tool == "twist" else 1)
                    i, j = [k for k in range(3) if k != axis]
                    rotated = local.copy()
                    rotated[:, i] = local[:, i] * np.cos(a) - local[:, j] * np.sin(a)
                    rotated[:, j] = local[:, i] * np.sin(a) + local[:, j] * np.cos(a)
                    points += np.einsum('nij,nj->ni', transforms, rotated - local)
                elif tool == "paint":
                    mode = operation.get("paint_tool", "brush")
                    if mode not in PAINT: raise DesignError("Unbekannter Pinsel")
                    channel = operation.get("channel", "color")
                    if channel not in {"color", "roughness", "metallic", "emission", "opacity"}: raise DesignError("Malkanal")
                    target = np.clip(vec(operation.get("color", [.1, .45, .2]), 1), 0, 1)
                    if mode == "fill": w = (1 - mask)[:, None] * strength
                    if mode == "gradient": w *= np.clip(.5 + direction[:, 1:2] / (2 * radius), 0, 1)
                    if mode in {"spray", "stamp"}:
                        noise = np.sin(before @ np.array([127.1, 311.7, 74.7]) * (30 if mode == "spray" else 12))
                        w *= (noise > .3)[:, None] if mode == "spray" else (.5 + .5 * noise[:, None])**4
                    if mode == "airbrush": w *= .25
                    if channel == "color":
                        if mode == "smudge": color += (smooth_average(color, faces) - color) * w
                        else: color += ((np.array([.12, .38, .27]) if mode == "eraser" else target) - color) * w
                    else:
                        idx = {"roughness": 0, "metallic": 1, "emission": 2, "opacity": 3}[channel]
                        value = finite(operation.get("value", .5), 0, 1, "Materialkanal")
                        surface[:, idx] += (value - surface[:, idx]) * w[:, 0]
            item["positions"], item["mask"] = floats(points), floats(mask)
            item["colors"], item["surface"] = floats(color), floats(surface)
            if tool in SCULPT: item["normals"] = floats(normals(np.asarray(item["positions"]), faces))
    elif tool == "material":
        material = operation.get("material", {})
        for item in selected:
            if any(item["mask"]): raise DesignError("Materialwechsel würde geschützte Oberfläche verändern; zuerst Maske prüfen")
            fields(material, set(item["material"]))
            item["material"].update(copy.deepcopy(material))
            for name, index in (("roughness", 0), ("metallic", 1), ("opacity", 3)):
                if name in material:
                    surface = np.asarray(item["surface"]).reshape(-1, 4)
                    surface[:, index] = material[name]
                    item["surface"] = floats(surface)
    elif tool == "lock":
        if type(operation.get("value")) is not bool: raise DesignError("Sperre benötigt Ja/Nein")
        for item in selected: item["locked"] = operation["value"]
    elif tool == "add":
        ident = identifier(operation.get("id"))
        if ident in by_id: raise DesignError("Teil existiert bereits")
        item = primitive(operation.get("kind", "sphere"), operation.get("position", [0, 1, 0]),
                         operation.get("size", [.2, .2, .2]), ident, points=operation.get("points"))
        doc["regions"].append(item)
    elif tool == "delete":
        if any(any(r["mask"]) for r in selected): raise DesignError("Maskierte Teile können nicht gelöscht werden")
        doc["regions"] = [r for r in doc["regions"] if r["id"] not in targets]
    elif tool in {"union", "subtract", "cut", "refine", "simplify"}:
        if tool in {"union", "subtract"} and len(selected) != 2: raise DesignError("Genau zwei geschlossene Teile auswählen")
        if tool not in {"union", "subtract"} and len(selected) != 1: raise DesignError("Genau ein Teil auswählen")
        item = selected[0]; result = to_manifold(item)
        if tool == "union": result = result + to_manifold(selected[1])
        if tool == "subtract": result = result - to_manifold(selected[1])
        if tool == "cut":
            n = vec(operation.get("normal", [0, 1, 0]), 1)
            if np.linalg.norm(n) < .5: raise DesignError("Schnittrichtung")
            result = result.trim_by_plane(n, float(np.dot(vec(operation.get("position", [0, 1, 0])), n)))
        if tool == "refine":
            if len(item["indices"]) * 4 > 540_000: raise DesignError("Verfeinerungsbudget")
            result = result.refine(2)
        if tool == "simplify": result = result.simplify(finite(operation.get("tolerance", .01), .0001, .1, "Toleranz"))
        replacement = from_manifold(result, item)
        doc["regions"] = [replacement if r["id"] == item["id"] else r for r in doc["regions"]
                          if len(selected) == 1 or r["id"] != selected[1]["id"]]
    elif tool == "rename":
        if not isinstance(operation.get("name"), str): raise DesignError("Name erforderlich")
        doc["name"] = operation["name"][:100]
    else:
        from .rigging import edit_rig
        edit_rig(doc, operation)
    if tool in {"add", "delete", "union", "subtract", "cut", "refine", "simplify"}:
        # Stable-vertex sculpt preserves valid weights. Topology changes require a new rig.
        doc["rig"] = {"bones": [], "weights": {}}
        doc["clips"] = []
    validate(doc)
    return doc
