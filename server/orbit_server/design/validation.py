"""Diagnostics describe geometry truthfully; open membranes are legitimate surfaces."""
import numpy as np
import trimesh

from .document import validate
from .rigging import validate_rig


def analyze(doc):
    validate(doc); validate_rig(doc)
    issues = []
    vertices = triangles = 0
    for item in doc["regions"]:
        points = np.asarray(item["positions"]).reshape(-1, 3)
        faces = np.asarray(item["indices"]).reshape(-1, 3)
        vertices += len(points); triangles += len(faces)
        mesh = trimesh.Trimesh(points, faces, process=False)
        def report(code, severity, message, count=None):
            issues.append({"region": item["id"], "code": code, "severity": severity, "message": message, "count": count})
        area = np.linalg.norm(np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]]), axis=1)
        degenerate = int(np.sum(area < 1e-10))
        if degenerate: report("degenerate_triangles", "warning", "Dreiecke ohne ausreichende Fläche", degenerate)
        edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
        _, count = np.unique(edges, axis=0, return_counts=True)
        if np.any(count > 2): report("non_manifold", "error", "Kante gehört zu mehr als zwei Flächen", int(np.sum(count > 2)))
        if np.any(count == 1):
            report("open_boundary", "warning" if item["solid"] else "info",
                   "Offene Kanten im Volumen" if item["solid"] else "Offene Membran, keine Volumenoperation", int(np.sum(count == 1)))
        if not mesh.is_winding_consistent: report("winding", "warning", "Widersprüchliche Flächenorientierung")
        if mesh.is_watertight and mesh.volume < 0: report("flipped_normals", "warning", "Geschlossenes Volumen zeigt nach innen")
    if triangles > 60000: issues.append({"region": None, "code": "preview_budget", "severity": "warning",
                                       "message": "Über dem vorläufigen mobilen Vorschauprofil", "count": triangles})
    if not doc["rig"]["bones"]: issues.append({"region": None, "code": "no_rig", "severity": "info", "message": "Statisches Modell ohne Rig", "count": 0})
    return {"vertices": vertices, "triangles": triangles, "regions": len(doc["regions"]),
            "issues": issues, "geometry_valid": not any(i["severity"] == "error" for i in issues),
            "runtime_ready": False}
