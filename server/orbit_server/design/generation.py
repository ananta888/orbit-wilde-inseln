"""Small original, deterministic creature templates; not text-to-3D model output."""
import math
from typing import Any

import numpy as np
import trimesh

from .document import DesignError, finite, floats, new_document, normals, region, vec

TEMPLATES = ("dragon", "quadruped", "humanoid", "bird", "serpent", "insectoid", "fish", "creature_generic")
PRIMITIVES = ("sphere", "ellipsoid", "cylinder", "cone", "capsule", "box", "tube")
PARTS = ("horn", "tooth", "ear", "finger", "claw", "tail", "wing", "scale", "eye", "tentacle", "armor")


def tube_mesh(path, radii):
    if np.any(np.linalg.norm(np.diff(path, axis=0), axis=1) < 1e-5): raise DesignError("Kurvenpunkte liegen zu dicht beieinander")
    vertices, faces, previous_axis = [], [], None
    for i, point in enumerate(path):
        tangent = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        length = np.linalg.norm(tangent)
        if length < 1e-8: raise DesignError("Kurve kehrt ohne Übergang um")
        tangent /= length
        axis = None if previous_axis is None else previous_axis - tangent * np.dot(tangent, previous_axis)
        if axis is None or np.linalg.norm(axis) < 1e-6:
            axis = np.cross(tangent, [0, 1, 0] if abs(tangent[1]) < .9 else [1, 0, 0])
        axis /= np.linalg.norm(axis); previous_axis = axis
        other = np.cross(tangent, axis)
        for j in range(16):
            angle = j * math.tau / 16
            vertices.append(point + radii[i] * (math.cos(angle) * axis + math.sin(angle) * other))
            if i:
                a, b = (i - 1) * 16 + j, (i - 1) * 16 + (j + 1) % 16
                faces.extend([[a, b, i * 16 + j], [b, i * 16 + (j + 1) % 16, i * 16 + j]])
    start, end = len(vertices), len(vertices) + 1
    vertices.extend([path[0], path[-1]])
    last = (len(path) - 1) * 16
    for j in range(16):
        faces.extend([[start, (j + 1) % 16, j], [end, last + j, last + (j + 1) % 16]])
    return np.asarray(vertices), np.asarray(faces)


def primitive(kind: str, position: list, size: list, ident: str, color=(.12, .38, .27),
              points: list | None = None) -> dict[str, Any]:
    if kind not in PRIMITIVES + PARTS: raise DesignError("Unbekannte Grundform")
    center, scale = vec(position), vec(size, 10)
    if np.min(scale) < .005: raise DesignError("Form zu klein")
    if kind == 'tube' and not points: raise DesignError('Eine Rohrkurve benötigt mindestens zwei Punkte')
    if kind in {'tentacle', 'tail'} and not points:
        t = np.linspace(0, 1, 16)
        path = np.column_stack([np.sin(t * math.pi) * scale[2], t * 2 * scale[1], t**2 * scale[2]])
        vertices, faces = tube_mesh(path, scale[0] * (.1 + .9 * (1 - t)))
        return region(ident, vertices + center, faces, color)
    if kind == "wing":
        vertices, faces = [], []
        for u in range(17):
            for v in range(9):
                vertices.append([u / 16 * 2, .15 * math.sin(u / 16 * math.pi), (v / 8 - .5) * 2 * (1 - .8 * u / 16)])
                if u and v:
                    a = (u - 1) * 9 + v - 1
                    faces.extend([[a, a + 9, a + 1], [a + 1, a + 9, a + 10]])
        return region(ident, np.asarray(vertices) * scale + center, np.asarray(faces)[:, ::-1], color, solid=False)
    if kind in {"horn", "tooth", "claw"}:
        t = np.linspace(0, 1, 18)
        path = np.column_stack([np.zeros_like(t), t * 2 - 1, (1.0 if kind == "horn" else .5) * t**2])
        vertices, faces = tube_mesh(path, .025 + .975 * (1 - t)**1.3)
        return region(ident, vertices * scale + center, faces, color)
    if kind == "cone":
        mesh = trimesh.creation.cone(radius=1, height=2, sections=20)
        mesh.vertices -= [0, 0, 1]
        mesh.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    elif kind in {"box", "armor", "scale"}:
        mesh = trimesh.creation.box(extents=[2, 2, 2])
        mesh = mesh.subdivide().subdivide()
    elif kind == "cylinder":
        mesh = trimesh.creation.cylinder(radius=1, height=2, sections=24)
        mesh.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
        mesh = mesh.subdivide()
    elif kind in {"tube", "tentacle", "tail"} and points:
        if not 2 <= len(points) <= 48: raise DesignError("Kurve benötigt 2–48 Punkte")
        path = np.array([vec(p) for p in points])
        vertices, faces = tube_mesh(path, np.full(len(path), scale[0]))
        return region(ident, vertices + center, faces, color)
    else:
        mesh = trimesh.creation.icosphere(subdivisions=3)
        if kind in {"capsule", "finger"}: mesh.vertices[:, 1] += np.sign(mesh.vertices[:, 1]) * .5
    mesh.vertices = np.asarray(mesh.vertices) * scale + center
    return region(ident, mesh.vertices, mesh.faces, color)


def generate(template: str, asset_id: str, parameters: dict | None = None) -> dict[str, Any]:
    if template not in TEMPLATES: raise DesignError("Unbekannte Kreaturenvorlage")
    params = {"body_length": 1.3, "neck_length": .8, "wing_span": 2.1, "tail_length": 1.5, "horn_count": 2}
    for key, value in (parameters or {}).items():
        if key not in params: raise DesignError("Unbekannter Vorlagenparameter")
        params[key] = finite(value, 0 if key == "horn_count" else .2, 4, key)
    if int(params["horn_count"]) != params["horn_count"]: raise DesignError("Ganzzahlige Hornanzahl")
    regions = []
    def add(ident, kind, pos, size, color=(.12, .38, .27)):
        regions.append(primitive(kind, pos, size, ident, color))
    body = params["body_length"]
    add("torso", "ellipsoid", [0, 1, 0], [.48, .5, body])
    neck = params["neck_length"]
    if template in {"dragon", "bird", "humanoid", "quadruped"}:
        add("neck", "ellipsoid", [0, 1.45, -body * .8], [.22, neck * .48, .27])
    head_y = 1.6 + neck * .25
    add("head", "ellipsoid", [0, head_y, -body * .95], [.37, .33, .48])
    add("jaw", "ellipsoid", [0, head_y - .16, -body * .95 - .24], [.27, .13, .38], [.26, .48, .30])
    for sign, side in ((-1, "left"), (1, "right")):
        add(side + "_eye", "ellipsoid", [sign * .32, head_y + .04, -body * .95 - .2],
            [.095, .095, .12], [.85, .54, .08])
        add(side + "_pupil", "ellipsoid", [sign * .38, head_y + .045, -body * .95 - .23],
            [.025, .066, .07], [.006, .012, .009])
    if template not in {"fish", "serpent"}:
        pairs = 3 if template == "insectoid" else 1 if template in {"bird", "humanoid"} else 2
        for i in range(pairs):
            for sign, side in ((-1, "left"), (1, "right")):
                add(side + "_leg_" + ("front" if i == 0 else "back" if i == 1 else "middle"),
                    "capsule", [sign * .43, .4, -.55 + i * .95], [.15, .27, .18])
    tail_length = params["tail_length"]
    for i in range(5):
        add("tail_" + str(i), "ellipsoid", [0, .9 - i * .1, body * .8 + i * tail_length * .3],
            [.23 * (1 - i * .16), .18 * (1 - i * .16), tail_length * .25])
    if template in {"dragon", "bird", "insectoid"}:
        span = params["wing_span"]
        for sign, side in ((-1, "left"), (1, "right")):
            # A thin editable surface is deliberately not labelled a watertight solid.
            vertices, faces = [], []
            for u in range(17):
                for v in range(9):
                    x = .3 + span * u / 16
                    vertices.append([sign * x, 1.35 + .35 * math.sin(u / 16 * math.pi),
                                     -.55 + (v / 8) * 1.4 * (1 - .65 * u / 16)])
                    if u and v:
                        a = (u - 1) * 9 + v - 1
                        faces.extend([[a, a + 9, a + 1], [a + 1, a + 9, a + 10]])
            if sign > 0: faces = [face[::-1] for face in faces]
            regions.append(region(side + "_wing", vertices, faces, [.20, .42, .25], solid=False))
    if template == "dragon":
        for i in range(int(params["horn_count"])):
            add(("left" if i % 2 == 0 else "right") + "_horn_" + str(i // 2), "horn", [(-1 if i % 2 == 0 else 1) * (.23 + .1 * (i // 2)), head_y + .4, -body * .95 + .18],
                [.085, .3, .08], [.72, .57, .32])
    if template == "humanoid":
        for sign, side in ((-1, "left"), (1, "right")):
            add(side + "_arm", "capsule", [sign * .66, 1.15, -.15], [.14, .35, .16])
    if template == "fish":
        add("dorsal_fin", "wing", [0, 1.3, -.2], [.08, .8, .6], [.28, .55, .4])
        for sign, side in ((-1, "left"), (1, "right")):
            add(side + "_fin", "wing", [.4, .8, 0], [.3, .15, .4])
            if sign < 0:
                points = np.asarray(regions[-1]["positions"]).reshape(-1, 3); points[:, 0] *= -1
                mirrored_faces = np.asarray(regions[-1]["indices"]).reshape(-1, 3)[:, ::-1]
                regions[-1]["positions"], regions[-1]["indices"] = floats(points), mirrored_faces.ravel().tolist()
    if template in {"fish", "serpent"}:
        for item in regions:
            points = np.asarray(item["positions"]).reshape(-1, 3)
            points[:, 1] *= .65
            item["positions"] = points.astype(np.float32).ravel().tolist()
            item["normals"] = floats(normals(np.asarray(item["positions"]), np.asarray(item["indices"])))
    doc = new_document(asset_id, "Arin" if template == "dragon" else template.replace("_", " ").title(), regions)
    doc["provenance"] = {"source": "Orbit template", "template": template, "parameters": params, "license": "BSD-3-Clause"}
    return doc
