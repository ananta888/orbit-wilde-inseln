"""Replaceable meshoptimizer adapter, executed only inside bounded geometry workers."""
import json
import os
from pathlib import Path
import shutil
import subprocess

from orbit_server.paths import ROOT
from .document import DesignError, canonical, finite, validate


def optimize(document, *, ratio=.5, tolerance=.008):
    ratio = finite(ratio, .1, 1, "Detailanteil")
    tolerance = finite(tolerance, .0001, .05, "Formabweichung")
    if document["layers"]: raise DesignError("Vor einer Topologieänderung Ebenen zusammenfassen")
    node = os.environ.get("ORBIT_NODE") or shutil.which("node")
    if not node or not Path(node).is_file(): raise DesignError("Optimierung benötigt Node.js und npm ci auf dem Laptop")
    request = canonical({"document": document, "ratio": ratio, "error": tolerance})
    try:
        result = subprocess.run([node, str(ROOT / "tools/geometry/optimize.mjs")], input=request,
                                capture_output=True, timeout=10, cwd=ROOT, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise DesignError("Optimierung abgebrochen; Original bleibt erhalten") from error
    if result.returncode or len(result.stdout) > 28 * 1024 * 1024:
        raise DesignError("Meshoptimierung fehlgeschlagen; npm ci und Geometrie prüfen")
    response = json.loads(result.stdout)
    candidate = response["document"]
    validate(candidate)
    if candidate["id"] != document["id"] or candidate["revision"] != document["revision"]:
        raise DesignError("Optimierer lieferte falsche Revision")
    return candidate, response["report"]
