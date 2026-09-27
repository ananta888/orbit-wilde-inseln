"""Comparable Mesh/SDF/Hybrid probe. Numbers are host measurements, not Quest claims."""
import json
import math
import platform
import time
from pathlib import Path

import manifold3d as m
import numpy as np


def measure(name, fn):
    start = time.perf_counter(); mesh = fn()
    data = mesh.to_mesh()
    elapsed = (time.perf_counter() - start) * 1000
    return {"method": name, "elapsed_ms": round(elapsed, 3), "vertices": len(data.vert_properties),
            "triangles": len(data.tri_verts), "volume": mesh.volume(),
            "render_buffer_bytes": data.vert_properties.nbytes + data.tri_verts.nbytes}


def main():
    # Same sphere with a tapered horn: union expressed as triangles and as an SDF.
    ball = m.Manifold.sphere(.5, 48)
    horn = m.Manifold.cylinder(.8, .2, .02, 32).translate((0, 0, .35))
    def field(x, y, z):
        sphere = .5 - math.sqrt(x*x + y*y + z*z)
        t = min(1., max(0., (z - .35) / .8))
        cone = min(.2 * (1-t) + .02*t - math.hypot(x, y), z - .35, 1.15-z)
        return max(sphere, cone)
    baseline = ball + horn
    results = [measure("dynamic_triangle_mesh_boolean", lambda: ball + horn),
               measure("voxel_sdf_extract_0.04m", lambda: m.Manifold.level_set(field, (-.6, -.6, -.6, .6, .6, 1.25), .04)),
               measure("hybrid_sdf_to_mesh_then_simplify_0.005m", lambda: m.Manifold.level_set(
                   field, (-.6, -.6, -.6, .6, .6, 1.25), .04).simplify(.005))]
    for result in results: result["relative_volume_error"] = abs(result["volume"] / baseline.volume() - 1)
    report = {"host": platform.platform(), "python": platform.python_version(), "numpy": np.__version__,
              "scenario": "0.5m sphere + 0.8m tapered horn", "results": results,
              "limits": ["Synthetic solid only, not physical Quest performance", "No UV/skin benchmark yet",
                         "Thin open membranes cannot be represented faithfully by the solid-only SDF probe"]}
    target = Path(".local/design-geometry-benchmark.json"); target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__": main()
