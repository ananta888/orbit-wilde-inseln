"""Immutable, profile-owned gameplay assets. Editor revisions remain independent."""
from __future__ import annotations

import copy
import json
import re
from typing import Any

import numpy as np

from .document import Conflict, DesignError, canonical, digest, fields, validate
from .validation import analyze

HASH = re.compile(r"^[a-f0-9]{64}$")
PROFILES = {"friendly_dragon": {"locomotion": "dragon", "mountable": True},
            "static_creature": {"locomotion": "stationary", "mountable": False}}


def build_artifact(document: dict[str, Any]) -> dict[str, Any]:
    """Publish a validated snapshot, never mutable editor buffers or executable behavior."""
    validate(document)
    behavior = PROFILES.get(document["behaviour_profile"])
    if behavior is None:
        raise DesignError("Dieses Kreaturenverhalten ist im Spiel nicht registriert")
    report = analyze(document)
    if not report["geometry_valid"]:
        raise DesignError("Modellprüfung fehlgeschlagen; Geometrie zuerst reparieren")
    if report["triangles"] > 60000:
        raise DesignError("Spielmodell überschreitet 60.000 Dreiecke; zuerst optimieren")
    if behavior["mountable"]:
        if not document["rig"]["bones"] or not document["colliders"]:
            raise DesignError("Für den Flug zuerst Rig und Kollisionskörper vorbereiten")
        seats = [p for p in document["mount_points"] if p["id"] == "rider_seat"]
        if len(seats) != 1:
            raise DesignError("Ein eindeutiger Reitersitz ist erforderlich")
        if max(abs(v) for v in seats[0]["position"]) > 20:
            raise DesignError("Sitz außerhalb des unterstützten Flugprofils")
    doc = copy.deepcopy(document)
    doc["layers"] = []  # Runtime contains the visible evaluated surface; the master keeps its layers.
    for region in doc["regions"]:
        # A protected brush mask is editor state, never a purple gameplay material.
        region["mask"] = [0.] * len(region["mask"])
        region["locked"] = False
    source_hash = digest(document)
    artifact = {"schema_version": "1.0", "asset_id": doc["id"], "revision": doc["revision"],
                "source_hash": source_hash, "behavior": behavior, "document": doc,
                "report": {"triangles": report["triangles"], "vertices": report["vertices"]}}
    from .schemas import check
    check("runtime-creature", artifact)
    return artifact


def prepare_mount(document: dict[str, Any]) -> None:
    """Explicit undoable preparation; existing user-defined seats/colliders are retained."""
    from .rigging import propose
    if document["behaviour_profile"] != "friendly_dragon":
        raise DesignError("Diese Kreatur ist kein registriertes Reittier")
    if not document["rig"]["bones"]:
        document["rig"] = propose(document)
    torso = next((r for r in document["regions"] if r["part"] == "torso"), document["regions"][0])
    points = np.asarray(torso["positions"]).reshape(-1, 3)
    lower, upper = points.min(axis=0), points.max(axis=0)
    center, size = (lower + upper) * .5, np.maximum(upper - lower, .1)
    if not any(p["id"] == "rider_seat" for p in document["mount_points"]):
        document["mount_points"].append({"id": "rider_seat", "position": [float(center[0]), float(upper[1] + .15), float(center[2])],
                                         "rotation": [0., 0., 0.], "safe_radius": .35})
    if not document["colliders"]:
        document["colliders"].append({"id": "body", "kind": "box", "position": center.tolist(), "size": size.tolist()})


class PublicationStore:
    def __init__(self, repository):
        self.repository = repository
        with repository.lock:
            repository.db.executescript("""
                CREATE TABLE IF NOT EXISTS runtime_creatures(
                  owner TEXT NOT NULL, hash TEXT NOT NULL, body BLOB NOT NULL,
                  PRIMARY KEY(owner,hash));
                CREATE TABLE IF NOT EXISTS runtime_mounts(
                  owner TEXT PRIMARY KEY, hash TEXT, history TEXT NOT NULL);
            """)

    def publish(self, owner: str, ident: str, revision: int, *, activate: bool = False) -> dict:
        repo = self.repository
        with repo.lock:
            doc = repo.load(owner, ident)
            if type(revision) is not int or doc["revision"] != revision:
                raise Conflict("Kreatur wurde verändert; vor Übernahme erneut prüfen")
            artifact = build_artifact(doc)
            body = canonical(artifact)
            key = digest(artifact)
            repo.db.execute("BEGIN IMMEDIATE")
            try:
                count, size = repo.db.execute("SELECT count(*),COALESCE(sum(length(body)),0) FROM runtime_creatures WHERE owner=?", (owner,)).fetchone()
                exists = repo.db.execute("SELECT 1 FROM runtime_creatures WHERE owner=? AND hash=?", (owner, key)).fetchone()
                if not exists and (count >= 64 or size + len(body) > 128 * 1024 * 1024):
                    raise DesignError("Spielmodellarchiv voll; vorhandene Version weiterverwenden")
                repo.db.execute("INSERT OR IGNORE INTO runtime_creatures VALUES(?,?,?)", (owner, key, body))
                if activate:
                    self._select(owner, key)
                repo.db.execute("COMMIT")
            except BaseException:
                repo.db.execute("ROLLBACK")
                raise
            return self.descriptor(key, artifact)

    @staticmethod
    def descriptor(key: str, artifact: dict) -> dict:
        return {"hash": key, "asset_id": artifact["asset_id"], "revision": artifact["revision"],
                "name": artifact["document"]["name"], "url": "/api/creatures/" + key,
                "behavior": artifact["behavior"], "report": artifact["report"]}

    def load(self, owner: str, key: str) -> dict:
        if not HASH.fullmatch(key): raise DesignError("Ungültige Spielmodell-ID")
        with self.repository.lock:
            row = self.repository.db.execute("SELECT body FROM runtime_creatures WHERE owner=? AND hash=?", (owner, key)).fetchone()
            if not row: raise DesignError("Spielmodell nicht gefunden")
            artifact = json.loads(row[0])
            if digest(artifact) != key: raise DesignError("Spielmodell ist beschädigt")
            return artifact

    def active(self, owner: str) -> dict | None:
        with self.repository.lock:
            row = self.repository.db.execute("SELECT hash FROM runtime_mounts WHERE owner=?", (owner,)).fetchone()
            return self.descriptor(row[0], self.load(owner, row[0])) if row and row[0] else None

    def _select(self, owner: str, key: str | None) -> None:
        if key is not None:
            artifact = self.load(owner, key)
            if not artifact["behavior"]["mountable"]: raise DesignError("Dieses Modell ist kein Reittier")
        row = self.repository.db.execute("SELECT hash,history FROM runtime_mounts WHERE owner=?", (owner,)).fetchone()
        history = json.loads(row[1]) if row else []
        if row and row[0] != key: history = (history + [row[0]])[-20:]
        self.repository.db.execute("INSERT OR REPLACE INTO runtime_mounts VALUES(?,?,?)", (owner, key, json.dumps(history)))

    def select(self, owner: str, key: str | None) -> dict | None:
        with self.repository.lock:
            self._select(owner, key)
            return self.active(owner)


def register(app, designer, profile_key, check_origin):
    """Routes do transport only; the store owns validation and atomic publication."""
    import asyncio
    from aiohttp import web
    store = PublicationStore(designer.repository)

    async def publish(request):
        try:
            data = json.loads(await designer.body(request, limit=4096))
            fields(data, {"asset_id", "revision", "activate"}, {"asset_id", "revision", "activate"})
            if type(data["activate"]) is not bool: raise DesignError("Übernahme benötigt Ja/Nein")
            from .document import identifier
            result = await asyncio.to_thread(store.publish, request[profile_key], identifier(data["asset_id"]),
                                             data["revision"], activate=data["activate"])
            return web.json_response(result)
        except Conflict as error: raise web.HTTPConflict(text=str(error)) from error
        except (ValueError, TypeError, KeyError) as error: raise web.HTTPBadRequest(text=str(error)) from error

    async def active(request):
        return web.json_response({"asset": await asyncio.to_thread(store.active, request[profile_key])},
                                 headers={"Cache-Control": "no-store"})

    async def select(request):
        try:
            data = json.loads(await designer.body(request, limit=4096))
            fields(data, {"hash"}, {"hash"})
            if data["hash"] is not None and not isinstance(data["hash"], str): raise DesignError("Ungültige ID")
            result = await asyncio.to_thread(store.select, request[profile_key], data["hash"])
            return web.json_response({"asset": result})
        except (ValueError, TypeError, KeyError) as error: raise web.HTTPBadRequest(text=str(error)) from error

    async def asset(request):
        try:
            result = await asyncio.to_thread(store.load, request[profile_key], request.match_info["hash"])
        except DesignError as error: raise web.HTTPNotFound(text=str(error)) from error
        response = web.Response(body=canonical(result), content_type="application/json", headers={"Cache-Control": "private, max-age=3600", "Vary": "Cookie"})
        response.enable_compression()
        return response

    app.router.add_post("/api/design/publish", publish)
    app.router.add_get("/api/creatures/active", active)
    app.router.add_post("/api/creatures/active", select)
    app.router.add_get("/api/creatures/{hash}", asset)
    return store
