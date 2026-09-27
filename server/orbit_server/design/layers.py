"""Sparse additive sculpt/paint layers, bound to explicit topology revisions."""
import copy
import numpy as np

from .document import DesignError, fields, finite, floats, identifier, normals

CHANNELS = {"positions": 3, "colors": 3, "surface": 4}


def validate_layers(doc):
    regions = {r["id"]: r for r in doc["regions"]}
    seen = set()
    for layer in doc["layers"]:
        fields(layer, {"id", "name", "kind", "visible", "locked", "strength", "source", "regions"},
               {"id", "name", "kind", "visible", "locked", "strength", "source", "regions"})
        ident = identifier(layer["id"])
        if ident in seen: raise DesignError("Doppelte Ebene")
        seen.add(ident)
        if layer["kind"] not in {"sculpt", "paint", "detail"} or layer["source"] not in {"manual", "ai"}:
            raise DesignError("Unbekannte Ebenenart")
        if not isinstance(layer["name"], str) or not 1 <= len(layer["name"]) <= 80: raise DesignError("Ebenenname")
        if type(layer["visible"]) is not bool or type(layer["locked"]) is not bool: raise DesignError("Ebenenflags")
        finite(layer["strength"], 0, 1, "Ebenenstärke")
        if not isinstance(layer["regions"], dict) or not set(layer["regions"]) <= set(regions): raise DesignError("Ebenenreferenz")
        for ident, data in layer["regions"].items():
            fields(data, {"topology_revision", "vertex_ids", *CHANNELS}, {"topology_revision", "vertex_ids"})
            if data["topology_revision"] != regions[ident]["topology_revision"]: raise DesignError("Ebene hat veraltete Topologie")
            ids = data["vertex_ids"]
            if not isinstance(ids, list) or len(ids) > 100000 or any(type(i) is not int or i < 0 or i >= len(regions[ident]["mask"]) for i in ids):
                raise DesignError("Ebenenvertexbudget")
            if ids != sorted(set(ids)): raise DesignError("Ebenenindices müssen eindeutig sortiert sein")
            for channel, width in CHANNELS.items():
                if channel not in data: continue
                values = np.asarray(data[channel])
                if values.shape != (len(ids)*width,) or not np.isfinite(values).all() or np.max(np.abs(values), initial=0) > 200:
                    raise DesignError("Ungültige Ebenenwerte")


def capture(before, after, operation):
    ident = operation.get("layer")
    if not ident: return
    layer = next((item for item in after["layers"] if item["id"] == ident), None)
    if not layer or layer["locked"] or not layer["visible"] or layer["strength"] != 1:
        raise DesignError("Zum Bearbeiten eine sichtbare, entsperrte Ebene mit 100 % Stärke wählen")
    allowed = {"paint"} if layer["kind"] == "paint" else {"push", "pull", "grab", "inflate", "deflate", "smooth", "flatten", "pinch", "crease", "clay", "stretch", "bend", "twist", "scale", "move"}
    if operation["tool"] not in allowed: raise DesignError("Dieses Werkzeug passt nicht zur aktiven Ebene")
    for original, result in zip(before["regions"], after["regions"]):
        if original["id"] != result["id"] or original["indices"] != result["indices"]: raise DesignError("Topologieänderung zuerst explizit backen")
        count = len(original["mask"])
        difference = {k: np.asarray(result[k]).reshape(-1, w)-np.asarray(original[k]).reshape(-1, w) for k, w in CHANNELS.items()}
        old = layer["regions"].get(original["id"])
        if old:
            for k, w in CHANNELS.items():
                if k in old: difference[k][old["vertex_ids"]] += np.asarray(old[k]).reshape(-1, w)
        ids = np.flatnonzero(np.logical_or.reduce([np.any(d != 0, axis=1) for d in difference.values()]))
        if not len(ids): continue
        if len(ids) > count: raise DesignError("Ebenenbudget")
        layer["regions"][original["id"]] = {"topology_revision": original["topology_revision"], "vertex_ids": ids.tolist(),
                                               **{k: floats(v[ids]) for k, v in difference.items()}}


def edit(doc, operation):
    tool = operation["tool"]
    if tool == "layer_add":
        ident = identifier(operation.get("id"))
        if any(item["id"] == ident for item in doc["layers"]): raise DesignError("Ebene existiert bereits")
        doc["layers"].append({"id": ident, "name": operation.get("name", "Ebene"), "kind": operation.get("kind", "sculpt"),
                              "visible": True, "locked": False, "strength": 1., "source": "manual", "regions": {}})
        return
    if tool == "layer_bake":
        if any(item["locked"] for item in doc["layers"]): raise DesignError("Gesperrte Ebenen zuerst freigeben")
        doc["layers"] = []; return
    layer = next((item for item in doc["layers"] if item["id"] == operation.get("id")), None)
    if layer is None: raise DesignError("Ebene nicht gefunden")
    if tool == "layer_lock":
        if type(operation.get("value")) is not bool: raise DesignError("Ebenensperre benötigt Ja/Nein")
        layer["locked"] = operation["value"]; return
    if layer["locked"]: raise DesignError("Ebene ist gesperrt")
    old = copy.deepcopy(layer)
    if tool == "layer_visibility":
        if type(operation.get("value")) is not bool: raise DesignError("Sichtbarkeit benötigt Ja/Nein")
        layer["visible"] = operation["value"]
    elif tool == "layer_strength": layer["strength"] = finite(operation.get("value"), 0, 1, "Ebenenstärke")
    elif tool == "layer_delete": layer["visible"] = False
    elif tool == "layer_order":
        target = operation.get("value")
        if type(target) is not int or not 0 <= target < len(doc["layers"]): raise DesignError("Ebenenreihenfolge")
        doc["layers"].remove(layer); doc["layers"].insert(target, layer); return
    else: raise DesignError("Unbekannter Ebenenbefehl")
    amount = (layer["strength"] if layer["visible"] else 0) - (old["strength"] if old["visible"] else 0)
    by_id = {r["id"]: r for r in doc["regions"]}
    for ident, delta in layer["regions"].items():
        region = by_id[ident]; ids = delta["vertex_ids"]
        if amount and (region["locked"] or any(region["mask"][i] for i in ids)):
            raise DesignError("Ebenenänderung würde geschützte Vertices verändern")
        for channel, width in CHANNELS.items():
            if channel not in delta: continue
            values = np.asarray(region[channel]).reshape(-1, width)
            values[ids] += np.asarray(delta[channel]).reshape(-1, width) * amount
            # Reject out-of-range composition instead of losing hidden layer information.
            if channel != "positions" and (values.min() < -1e-6 or values.max() > 1+1e-6):
                raise DesignError("Ebenenkombination überschreitet den Farb-/Materialbereich")
            region[channel] = floats(values if channel == "positions" else np.clip(values, 0, 1))
        region["normals"] = floats(normals(np.asarray(region["positions"]), np.asarray(region["indices"])))
    if tool == "layer_delete": doc["layers"].remove(layer)
