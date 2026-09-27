"""aiohttp composition root; domain state is per browser profile, never process-global."""
import asyncio
import contextlib
import copy
import json
import logging
import mimetypes
from pathlib import Path
import re
import secrets
import sqlite3
import time

from aiohttp import ClientError, web, WSMsgType
from orbit_server.ai.contracts import AnantaOracle
from orbit_server.ai.dragon import DragonBridge, DragonConversation
from orbit_server.missions.packages import Catalog
from orbit_server.missions.schema import read_json, validate
from orbit_server.networking.session import GameSession
from orbit_server.paths import ROOT
from orbit_server.persistence.store import SQLiteStore
from orbit_server.physics.ballistics import STEP
from orbit_server.physics.flight import CONFIG as FLIGHT
from orbit_server.world.environment import DEFAULT_PATH, LiveWorld
from orbit_server.world.terrain import SIZE

LOG = logging.getLogger(__name__)
PUBLIC = ROOT / "client" / "webxr"
SERVICE = web.AppKey("service", object)
PROFILE = web.RequestKey("profile", str)


def same_origin(request: web.Request) -> None:
    if request.headers.get("Origin") != f"{request.scheme}://{request.host}":
        raise web.HTTPForbidden(text="Diese Verbindung muss von der Spielseite stammen.")


@web.middleware
async def browser_profile(request, handler):
    profile = request.cookies.get("orbit_profile", "")
    fresh = re.fullmatch(r"[a-f0-9]{32}", profile) is None
    request[PROFILE] = secrets.token_hex(16) if fresh else profile
    response = await handler(request)
    if fresh and not response.prepared:
        response.set_cookie("orbit_profile", request[PROFILE], httponly=True, samesite="Strict",
                            secure=request.secure, max_age=365 * 24 * 3600)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


class Service:
    def __init__(self, urls, world_path, content_root, data_path, bridge):
        self.urls = list(urls)
        self.clients: set[web.WebSocketResponse] = set()
        self.profiles: set[str] = set()
        self.environment = LiveWorld(world_path)
        self.catalog = Catalog(content_root / "missions", read_json(content_root / "assets" / "catalog.json"))
        if not self.catalog.reload(): raise ValueError(self.catalog.error or "Empty content catalog")
        self.store = SQLiteStore(data_path)
        self.dragon = bridge or DragonBridge()
        self.watcher: asyncio.Task | None = None
        self.oracle = AnantaOracle()
        self.asr_slots = asyncio.Semaphore(2)

    async def startup(self, app):
        await self.dragon.start()
        self.watcher = asyncio.create_task(self.watch(), name="orbit-content-watch")

    async def watch(self):
        while True:
            try:
                prepared = await asyncio.to_thread(self.environment.prepare)
                self.environment.apply(prepared)
            except (OSError, ValueError, TypeError) as error:
                self.environment.reject(error)
            try:
                packages = await asyncio.to_thread(self.catalog.prepare)
                if self.catalog.apply(packages): LOG.info("content_catalog_activated", extra={"revision": self.catalog.revision})
            except (OSError, ValueError) as error:
                self.catalog.error = str(error)
            await asyncio.sleep(1)

    async def websocket(self, request):
        same_origin(request)
        profile = request[PROFILE]
        if len(self.clients) >= 4: raise web.HTTPServiceUnavailable(text="Maximal vier Sitzungen")
        if profile in self.profiles: raise web.HTTPConflict(text="Dieses Spielerprofil ist bereits geöffnet")
        self.profiles.add(profile)
        socket = web.WebSocketResponse(heartbeat=10, max_msg_size=2048, compress=False)
        ticker = None
        saver = None
        stop_saving = asyncio.Event()
        game = None
        chat = None
        try:
            try:
                save = await asyncio.to_thread(self.store.load, profile)
            except (ValueError, OSError, sqlite3.Error) as error:
                LOG.error("save_load_failed: %s", type(error).__name__)
                raise web.HTTPServiceUnavailable(text="Lokaler Spielstand kann nicht geladen werden; vorhandene Datei bleibt erhalten.") from error
            game = GameSession(self.environment, self.catalog, save)
            game.world.configure(self.environment.config["rules"])
            await socket.prepare(request)
            self.clients.add(socket)
            chat = DragonConversation(self.dragon, socket, game.world)
            await socket.send_json({"type": "hello", "simulation": "Framework / Python", "physicsHz": 60,
                                    "snapshotHz": 30, "protocol": 4, "features": sorted(self.catalog.packages)})
            ticker = asyncio.create_task(self.stream(socket, game), name="orbit-session")
            saver = asyncio.create_task(self.save_loop(game, profile, stop_saving), name="orbit-autosave")
            received: list[float] = []
            async for message in socket:
                if message.type != WSMsgType.TEXT: continue
                now = time.monotonic()
                received = [stamp for stamp in received if now - stamp < 1]
                received.append(now)
                if len(received) > 60:
                    await socket.close(code=1008, message=b"Too many messages"); break
                try:
                    data = json.loads(message.data)
                    validate("client-message", data)
                    await self.dispatch(socket, game, chat, data, now)
                except (ValueError, TypeError, OverflowError, RecursionError) as error:
                    await socket.send_json({"type": "error", "message": str(error)[:280]})
        finally:
            if chat:
                task = chat.task
                chat.reset()
                if task: await asyncio.gather(task, return_exceptions=True)
            if ticker:
                ticker.cancel()
                with contextlib.suppress(asyncio.CancelledError, ConnectionError): await ticker
            stop_saving.set()
            if saver: await saver
            if game:
                game.checkpoint()
                try:
                    await asyncio.to_thread(self.store.save, profile, copy.deepcopy(game.save))
                except (ValueError, OSError, sqlite3.Error) as error:
                    LOG.error("final_save_failed: %s", type(error).__name__)
            self.clients.discard(socket)
            self.profiles.discard(profile)
        return socket

    async def dispatch(self, socket, game, chat, data, now):
        world, kind = game.world, data["type"]
        if kind == "loose": await socket.send_json(world.loose(data, now))
        elif kind == "move": world.move(data, now)
        elif kind == "enter": game.enter(data["mode"]); chat.reset()
        elif kind == "dragon": await chat.ask(data["message"])
        elif kind in {"start", "restart"}: world.start(now)
        elif kind == "pause": world.pause(now); chat.reset()
        elif kind == "resume": world.resume(now)
        elif kind == "ping": await socket.send_json({"type": "pong", "echo": data["time"]})
        elif kind == "mission_start": game.start_mission(data["id"])
        elif kind == "mission_leave": game.leave_mission()
        elif kind == "settings": game.settings(data)
        elif kind == "interact": game.interact(data["target"], data["verb"], data.get("text", ""), now)
        elif kind == "hint":
            if not game.mission: raise ValueError("Wähle zunächst eine Episode")
            answer = self.oracle.advise(game.mission, data["level"], data.get("full_help", False)).validated()
            game.checkpoint()
            await socket.send_json({"type": "oracle", **answer})

    async def save_loop(self, game, profile, stop):
        while not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=5)
            except TimeoutError:
                game.checkpoint()
                snapshot = copy.deepcopy(game.save)
                game.dirty = False
                try:
                    await asyncio.to_thread(self.store.save, profile, snapshot)
                except (OSError, ValueError, sqlite3.Error) as error:
                    LOG.error("autosave_failed: %s", type(error).__name__)
                    game.notice = "Spielstand konnte noch nicht gespeichert werden. Der nächste Versuch folgt automatisch."

    async def stream(self, socket, game):
        world = game.world
        deadline = previous = time.monotonic()
        accumulator = 0.0
        known_chunks: dict[str, str] = {}
        revision, scope, serial, frames = -1, None, 0, 0
        while not socket.closed:
            now = time.monotonic()
            accumulator += min(now - previous, .2)
            previous = now
            events = []
            while accumulator >= STEP:
                events.extend(game.step()); accumulator -= STEP
            try:
                current_scope = ("orbit",) if world.player[1] > FLIGHT["streamCutoff"] else (int(world.player[0] // SIZE), int(world.player[2] // SIZE))
                if revision != self.environment.revision or current_scope != scope:
                    packet = self.environment.packet(known_chunks, world.player, include_planet=revision != self.environment.revision)
                    world.configure(packet["rules"])
                    if revision != self.environment.revision: game.configure_targets()
                    revision, scope = self.environment.revision, current_scope
                    serial += 1
                    packet["worldRevision"], packet["revision"] = revision, serial
                    await asyncio.wait_for(socket.send_json(packet), timeout=1)
                    if packet["full"]: known_chunks.clear()
                    for key in packet["remove"]: known_chunks.pop(key, None)
                    known_chunks.update((chunk["id"], chunk["version"]) for chunk in packet["upsert"])
                await asyncio.wait_for(socket.send_json(world.snapshot(now)), timeout=1)
                if frames % 3 == 0: await asyncio.wait_for(socket.send_json(game.snapshot()), timeout=1)
                for event in events: await asyncio.wait_for(socket.send_json(event), timeout=1)
                frames += 1
            except (TimeoutError, ConnectionError):
                await socket.close(); return
            deadline += 1 / 30
            if deadline < now - .1: deadline = now
            await asyncio.sleep(max(0, deadline - time.monotonic()))

    async def health(self, request):
        return web.json_response({"app": "orbit-wilde-inseln", "protocol": 4, "clients": len(self.clients),
                                  "physics": "laptop", "physicsHz": 60, "snapshotHz": 30,
                                  "worldRevision": self.environment.revision, "areas": self.environment.area_count,
                                  "worldError": self.environment.error, "contentRevision": self.catalog.revision,
                                  "contentError": self.catalog.error, "missions": len(self.catalog.packages)})

    async def connection(self, request): return web.json_response({"urls": self.urls})

    async def transcribe(self, request):
        same_origin(request)
        if request.content_length is None or request.content_length > 2 * 1024 * 1024:
            raise web.HTTPRequestEntityTooLarge(max_size=2 * 1024 * 1024, actual_size=request.content_length or 0)
        if self.asr_slots.locked(): raise web.HTTPTooManyRequests(text="Spracherkennung ausgelastet")
        try:
            async with self.asr_slots:
                result = await self.dragon.transcribe(await request.read(), request.headers.get("Content-Type", "audio/webm"))
            return web.json_response(result, headers={"Cache-Control": "no-store"})
        except (OSError, RuntimeError, ValueError, ClientError, TimeoutError):
            return web.json_response({"error": "Spracherkennung nicht erreichbar. Texteingabe bleibt verfügbar."}, status=503)

    async def audio(self, request):
        item = self.dragon.audio.get(request.match_info["ident"])
        if not item or time.monotonic() - item[0] > 120: raise web.HTTPNotFound()
        return web.Response(body=item[1], content_type="audio/wav", headers={"Cache-Control": "no-store"})

    async def flight_config(self, request):
        return web.json_response(FLIGHT)

    async def static(self, request):
        name = request.match_info["path"] or "index.html"
        path = (PUBLIC / name).resolve()
        if not path.is_relative_to(PUBLIC.resolve()) or not path.is_file() or any(part.startswith(".") for part in Path(name).parts):
            raise web.HTTPNotFound()
        mime = "text/javascript" if path.suffix == ".js" else mimetypes.guess_type(path.name)[0]
        return web.FileResponse(path, headers={"Content-Type": mime or "application/octet-stream", "Cache-Control": "no-cache",
                                              "Permissions-Policy": "xr-spatial-tracking=(self), microphone=(self)"})

    async def shutdown(self, app):
        if self.watcher:
            self.watcher.cancel()
            with contextlib.suppress(asyncio.CancelledError): await self.watcher
        await asyncio.gather(*(client.close(code=1001, message=b"Server stopped") for client in list(self.clients)))
        await self.dragon.close()

    async def cleanup(self, app): self.store.close()


def make_app(urls=(), world_path=DEFAULT_PATH, *, content_root=ROOT / "content", data_path=":memory:", bridge=None):
    service = Service(urls, world_path, content_root, data_path, bridge)
    app = web.Application(client_max_size=2 * 1024 * 1024, middlewares=[browser_profile])
    app[SERVICE] = service
    app.router.add_get("/ws", service.websocket)
    app.router.add_get("/health", service.health)
    app.router.add_get("/connection.json", service.connection)
    app.router.add_get("/flight-config.json", service.flight_config)
    app.router.add_post("/api/dragon/transcribe", service.transcribe)
    app.router.add_get("/api/dragon/audio/{ident}", service.audio)
    # Optional isolated editor. Gameplay still starts without native geometry packages.
    from importlib.util import find_spec
    if all(find_spec(name) is not None for name in ("numpy", "trimesh", "manifold3d")):
        from orbit_server.design.http import register
        register(app, data_path, PROFILE, same_origin)
    app.router.add_get("/{path:.*}", service.static)
    app.on_startup.append(service.startup)
    app.on_shutdown.append(service.shutdown)
    app.on_cleanup.append(service.cleanup)
    return app
