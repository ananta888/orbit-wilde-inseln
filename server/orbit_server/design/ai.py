"""Bounded design planning. Unconfigured AI uses an explicitly labelled command parser."""
import json
import os
import re
from urllib.parse import urlsplit

import aiohttp
import numpy as np

from .document import DesignError, fields, finite

AI_TOOLS = {"scale", "smooth", "inflate", "deflate", "material", "move", "stretch"}


def context_for(doc, selected):
    parts = []
    for item in doc["regions"]:
        if item["id"] not in selected: continue
        points = np.array(item["positions"]).reshape(-1, 3)
        parts.append({"id": item["id"], "bounds": [points.min(axis=0).tolist(), points.max(axis=0).tolist()],
                      "locked": item["locked"], "protected_fraction": float(np.mean(item["mask"]))})
    return {"asset_id": doc["id"], "base_revision": doc["revision"], "name": doc["name"],
            "selected_parts": parts[:16], "allowed_tools": sorted(AI_TOOLS)}


def validate_plan(value, selected):
    from .schemas import check
    check("ai-edit", value)
    fields(value, {"speech", "operations"}, {"speech", "operations"})
    if not isinstance(value["speech"], str) or len(value["speech"]) > 1000: raise DesignError("Antwort zu lang")
    ops = value["operations"]
    if not isinstance(ops, list) or not 1 <= len(ops) <= 4: raise DesignError("Vorschlagsbudget")
    for op in ops:
        if not isinstance(op, dict) or op.get("tool") not in AI_TOOLS: raise DesignError("KI-Werkzeug nicht erlaubt")
        if not op.get("regions") or not set(op["regions"]) <= set(selected): raise DesignError("KI überschreitet Auswahl")
        finite(op.get("strength", .25), 0, 1, "KI-Stärke")
    return value


def local_plan(doc, selected, instruction):
    if not selected: raise DesignError("Markiere zuerst einen Bereich")
    items = [r for r in doc["regions"] if r["id"] in selected]
    points = np.concatenate([np.asarray(r["positions"]).reshape(-1, 3) for r in items])
    center = points.mean(axis=0).tolist()
    radius = min(5., max(.02, float(np.linalg.norm(points.max(axis=0) - points.min(axis=0)))))
    text = instruction.lower()
    match = re.search(r"(\d{1,2})\s*(?:%|prozent)", text)
    factor = min(.8, int(match[1]) / 100) if match else .15
    op = {"tool": "smooth", "regions": selected, "samples": [center], "radius": radius, "strength": .5}
    if any(word in text for word in ("größer", "breiter", "kräftiger", "larger", "bigger", "länger")):
        op.update(tool="scale", value=1 + factor, strength=1.)
    elif any(word in text for word in ("kleiner", "dünner", "schmaler", "smaller")):
        op.update(tool="scale", value=1 - factor, strength=1.)
    elif any(word in text for word in ("schuppen", "haut", "fell", "horn", "stein", "metall")):
        detail = next((kind for word, kind in (("schuppen", "scales"), ("haut", "skin"), ("fell", "fur"),
                                               ("horn", "horn"), ("stein", "stone"), ("metall", "metal")) if word in text), "skin")
        op = {"tool": "material", "regions": selected, "material": {"detail": detail}}
    elif not any(word in text for word in ("glätt", "smooth", "übergang")):
        raise DesignError("Lokaler Befehlsmodus versteht glätten, größer/kleiner und Material. Freies Design benötigt den KI-Dienst.")
    return {"speech": "Vorbereiteter lokaler Werkzeugvorschlag. Prüfe die Vorschau vor dem Übernehmen.",
            "operations": [op]}


async def plan(session, doc, selected, instruction):
    if not isinstance(instruction, str) or not 1 <= len(instruction) <= 1500: raise DesignError("Beschreibung fehlt oder ist zu lang")
    url = os.getenv("ORBIT_DESIGN_AI_URL", "")
    if not url: return validate_plan(local_plan(doc, selected, instruction), selected), "local-command-parser"
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise DesignError("Ungültige KI-Dienstkonfiguration")
    token = os.getenv("ORBIT_DESIGN_AI_TOKEN", "")
    headers = {"Authorization": "Bearer " + token} if token else {}
    async with session.post(url, json={"schema_version": "1.0", "context": context_for(doc, selected),
                                      "instruction": instruction}, headers=headers,
                            timeout=aiohttp.ClientTimeout(total=45), allow_redirects=False) as response:
        if response.status != 200: raise DesignError("Design-KI ist nicht erreichbar")
        raw = bytearray()
        async for part in response.content.iter_chunked(4096):
            raw.extend(part)
            if len(raw) > 32768: raise DesignError("KI-Antwort überschreitet Budget")
    value = json.loads(raw)
    return validate_plan(value, selected), "configured-design-provider"
