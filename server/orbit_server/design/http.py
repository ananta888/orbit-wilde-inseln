"""Separate bounded designer endpoints; the gameplay protocol remains unchanged."""
import asyncio
import json
import logging
from pathlib import Path
import secrets
import sqlite3
import time

import aiohttp
from aiohttp import web, WSMsgType

from . import ai
from .document import Conflict, DesignError, canonical, digest, fields, identifier, metadata, validate
from .generation import TEMPLATES, generate
from .repository import Repository
from .schemas import check
from .streaming import changes
from .workers import GeometryWorkers
from .validation import analyze
from .preview import blend, blendable

LOG = logging.getLogger(__name__)
KEY = web.AppKey("designer", object)
CONTROL_LIMIT = 64 * 1024


class DesignService:
    def __init__(self, data_path, profile_key, check_origin):
        path = ":memory:" if str(data_path) == ":memory:" else Path(data_path).with_name("creatures.sqlite3")
        self.repository = Repository(path)
        self.profile_key, self.check_origin = profile_key, check_origin
        self.workers = GeometryWorkers()
        self.leases = {}
        self.sockets = set()
        self.session = None

    async def start(self, app):
        self.session = aiohttp.ClientSession()

    async def close(self, app):
        await asyncio.gather(*(s.close(code=1001, message=b"Designer stopped") for s in list(self.sockets)))
        await self.workers.close()
        if self.session: await self.session.close()
        self.repository.close()

    async def catalog(self, request):
        return web.json_response({"protocol": 1, "templates": TEMPLATES,
                                  "assets": await asyncio.to_thread(self.repository.list, request[self.profile_key]),
                                  "capabilities": {"mesh_delta": True, "sdf_master": False, "triangle_sculpt": True,
                                                   "boolean_solids": True, "auto_rig": "semantic-rigid",
                                                   "ai_provider": bool(__import__("os").getenv("ORBIT_DESIGN_AI_URL")),
                                                   "max_vertices": 100000, "max_triangles": 180000}},
                                 headers={"Cache-Control": "no-store"})

    async def body(self, request, limit=24 * 1024 * 1024):
        self.check_origin(request)
        data = bytearray()
        async for chunk in request.content.iter_chunked(65536):
            data.extend(chunk)
            if len(data) > limit: raise web.HTTPRequestEntityTooLarge(max_size=limit, actual_size=len(data))
        return data

    async def ingest(self, request):
        try:
            doc = json.loads(await self.body(request))
            await asyncio.to_thread(check, "edit-document", doc)
            validate(doc)
            # Imports always create a copy, never overwrite another creature by supplied ID.
            doc["id"] = "creature_" + secrets.token_hex(8)
            doc["revision"] = 0
            result = await asyncio.to_thread(self.repository.create, request[self.profile_key], doc)
            return web.json_response({"id": result["id"], "revision": 0})
        except (ValueError, TypeError, KeyError, OverflowError, RecursionError) as error:
            raise web.HTTPBadRequest(text="Ungültiges Kreaturendokument") from error

    async def export(self, request):
        try:
            ident = identifier(request.match_info["ident"])
            doc = await asyncio.to_thread(self.repository.load, request[self.profile_key], ident)
            return web.Response(body=canonical(doc), content_type="application/json",
                                headers={"Cache-Control": "no-store", "Content-Disposition": 'attachment; filename="creature.json"'})
        except DesignError as error: raise web.HTTPNotFound(text=str(error)) from error

    async def analysis(self, request):
        try:
            ident = identifier(request.match_info["ident"])
            doc = await asyncio.to_thread(self.repository.load, request[self.profile_key], ident)
            report = await asyncio.to_thread(analyze, doc)
            return web.json_response({"asset_id": ident, "revision": doc["revision"], **report},
                                     headers={"Cache-Control": "no-store"})
        except DesignError as error: raise web.HTTPNotFound(text=str(error)) from error

    async def send_document(self, socket, owner, after, before=None, command_id=None):
        # One socket writer, ordered begin -> regions -> commit. Client applies atomically.
        packet = {"type": "document", "document": metadata(after), "base_revision": before["revision"] if before else -1,
                  "history": await asyncio.to_thread(self.repository.history_state, owner, after["id"]),
                  "command_id": command_id}
        frames = await asyncio.to_thread(changes, before, after)
        packet["frames"] = len(frames)
        await asyncio.wait_for(socket.send_json(packet), 3)
        for frame in frames: await asyncio.wait_for(socket.send_bytes(frame), 3)
        await asyncio.wait_for(socket.send_json({"type": "committed", "revision": after["revision"], "command_id": command_id}), 3)

    async def websocket(self, request):
        self.check_origin(request)
        if len(self.sockets) >= 4: raise web.HTTPServiceUnavailable(text="Designer-Sitzungslimit erreicht")
        owner = request[self.profile_key]
        socket = web.WebSocketResponse(max_msg_size=CONTROL_LIMIT, heartbeat=15, compress=False)
        await socket.prepare(request); self.sockets.add(socket)
        current, lease, proposal = None, None, None
        received: list[float] = []
        try:
            await socket.send_json({"type": "hello", "protocol": 1, "templates": TEMPLATES,
                                    "assets": await asyncio.to_thread(self.repository.list, owner)})
            async for message in socket:
                if message.type != WSMsgType.TEXT:
                    if message.type == WSMsgType.BINARY: await socket.close(code=1003)
                    continue
                now = time.monotonic(); received = [t for t in received if now - t < 1]; received.append(now)
                if len(received) > 24:
                    await socket.close(code=1008, message=b"Rate limit"); break
                command_id = None
                try:
                    data = json.loads(message.data)
                    check("client-message", data)
                    if not isinstance(data, dict): raise DesignError("Nachrichtenformat")
                    kind = data.get("type")
                    if kind in {"new", "open"}:
                        fields(data, {"type", "id", "template", "parameters"})
                        if kind == "new":
                            doc = await asyncio.to_thread(generate, data.get("template", "dragon"),
                                                          "creature_" + secrets.token_hex(8), data.get("parameters"))
                            doc = await asyncio.to_thread(self.repository.create, owner, doc)
                        else: doc = await asyncio.to_thread(self.repository.load, owner, identifier(data.get("id")))
                        new_lease = (owner, doc["id"])
                        if new_lease in self.leases and self.leases[new_lease] is not socket: raise Conflict("Diese Kreatur wird in einer anderen Sitzung bearbeitet")
                        if lease: self.leases.pop(lease, None)
                        lease = new_lease; self.leases[lease] = socket; current = doc; proposal = None
                        await self.send_document(socket, owner, current)
                    elif kind == "resync":
                        fields(data, {"type"})
                        if current:
                            current = await asyncio.to_thread(self.repository.load, owner, current["id"])
                            await self.send_document(socket, owner, current)
                    elif kind == "proposal":
                        fields(data, {"type", "instruction", "regions", "base_revision"}, {"instruction", "regions", "base_revision"})
                        if current is None or data["base_revision"] != current["revision"]: raise Conflict("Auswahl veraltet")
                        if not isinstance(data["regions"], list) or not 1 <= len(data["regions"]) <= 16: raise DesignError("Auswahlbudget")
                        valid_ids = {r["id"] for r in current["regions"] if not r["locked"]}
                        if not set(data["regions"]) <= valid_ids: raise DesignError("Ungültige oder geschützte KI-Auswahl")
                        result, source = await ai.plan(self.session, current, data["regions"], data["instruction"])
                        candidate = await self.workers.run(current, result["operations"])
                        proposal = {"id": secrets.token_hex(8), "base_revision": current["revision"], "candidate": candidate,
                                    "operations": result["operations"]}
                        await socket.send_json({"type": "proposal", "id": proposal["id"], "speech": result["speech"],
                                                "source": source, "operations": result["operations"],
                                                "blendable": blendable(current, candidate)})
                        frames = await asyncio.to_thread(changes, current, candidate)
                        await socket.send_json({"type": "preview_begin", "document": metadata(candidate), "frames": len(frames)})
                        for frame in frames: await socket.send_bytes(frame)
                        await socket.send_json({"type": "preview_ready", "id": proposal["id"]})
                    elif kind == "reject_proposal":
                        fields(data, {"type"}); proposal = None
                        await socket.send_json({"type": "proposal_rejected"})
                    elif kind in {"command", "undo", "redo", "accept_proposal"}:
                        fields(data, {"type", "command_id", "base_revision", "asset_id", "operation", "proposal_id", "blend"},
                               {"type", "command_id", "base_revision", "asset_id"})
                        command_id = identifier(data["command_id"])
                        if current is None or data["asset_id"] != current["id"]: raise DesignError("Kreatur nicht geöffnet")
                        if self.leases.get(lease) is not socket: raise Conflict("Schreibsitzung verloren")
                        request_hash = digest(data)
                        receipt = await asyncio.to_thread(self.repository.receipt, owner, current["id"], command_id, request_hash)
                        if receipt is not None:
                            await socket.send_json({"type": "ack", "command_id": command_id, "revision": receipt, "duplicate": True})
                            continue
                        if type(data["base_revision"]) is not int or data["base_revision"] != current["revision"]: raise Conflict("Revision geändert; lokalen Strich prüfen")
                        before = current
                        if kind == "command": candidate = await self.workers.run(current, [data.get("operation")])
                        elif kind == "accept_proposal":
                            if not proposal or proposal["id"] != data.get("proposal_id") or proposal["base_revision"] != current["revision"]:
                                raise Conflict("KI-Vorschlag veraltet")
                            candidate = await asyncio.to_thread(blend, current, proposal["candidate"], data.get("blend", 1))
                        else: candidate = current
                        current = await asyncio.to_thread(self.repository.commit, owner, candidate, command_id,
                                                          request_hash, data.get("operation", {}).get("tool", kind),
                                                          history_action=kind if kind in {"undo", "redo"} else None)
                        proposal = None
                        await self.send_document(socket, owner, current, before, command_id)
                    else: raise DesignError("Unbekannte Designnachricht")
                except (Conflict, DesignError) as error:
                    await socket.send_json({"type": "error", "code": "conflict" if isinstance(error, Conflict) else "invalid",
                                            "message": str(error), "command_id": command_id})
                except (ValueError, TypeError, KeyError, OverflowError, RecursionError):
                    await socket.send_json({"type": "error", "code": "invalid", "message": "Ungültige Designnachricht", "command_id": command_id})
                except (sqlite3.Error, OSError, aiohttp.ClientError, TimeoutError):
                    LOG.exception("design_operation_failed")
                    await socket.send_json({"type": "error", "code": "unavailable",
                                            "message": "Auftrag fehlgeschlagen. Gespeicherter Stand bleibt erhalten.", "command_id": command_id})
        except (ConnectionError, TimeoutError, asyncio.CancelledError):
            pass
        finally:
            if lease and self.leases.get(lease) is socket: self.leases.pop(lease, None)
            self.sockets.discard(socket)
        return socket


def register(app, data_path, profile_key, check_origin):
    service = DesignService(data_path, profile_key, check_origin)
    app[KEY] = service
    app.router.add_get("/api/design/catalog", service.catalog)
    app.router.add_get("/api/design/ws", service.websocket)
    app.router.add_post("/api/design/import", service.ingest)
    app.router.add_get("/api/design/assets/{ident}", service.export)
    app.router.add_get("/api/design/assets/{ident}/analysis", service.analysis)
    app.on_startup.append(service.start)
    app.on_shutdown.append(service.close)
