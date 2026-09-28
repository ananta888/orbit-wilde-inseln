"""Same-origin transport; all ingestion uses the resolver application service."""
from __future__ import annotations
import asyncio
import json
from pathlib import Path
import tempfile

from aiohttp import web, ClientError

from .contracts import AssetError, MAX_SOURCE, SCHEMAS, canonical
from .service import Resolver

KEY = web.AppKey("asset_resolver", Resolver)


def register(app, data_path, profile_key, check_origin, *, resolver=None):
    temporary = tempfile.TemporaryDirectory(prefix="orbit-assets-") if str(data_path) == ":memory:" else None
    root = Path(temporary.name) if temporary else Path(data_path).parent / "assets"
    service = resolver or Resolver(root)
    app[KEY] = service

    async def startup(app): await service.start()
    async def cleanup(app):
        await service.close()
        if temporary: temporary.cleanup()

    async def body(request, limit=65536):
        check_origin(request)
        data = bytearray()
        async for chunk in request.content.iter_chunked(65536):
            data.extend(chunk)
            if len(data) > limit: raise AssetError("Anfragebudget überschritten", "budget")
        return json.loads(data)

    def guarded(handler):
        async def wrapped(request):
            try: return await handler(request)
            except (AssetError, ValueError, KeyError, TypeError, OSError, TimeoutError, ClientError) as error:
                code = getattr(error, "code", "invalid_request")
                status = {"not_found": 404, "conflict": 409, "busy": 429, "budget": 413, "license": 403,
                          "provider_unavailable": 502, "timeout": 504}.get(code, 400)
                return web.json_response({"error": {"code": code, "message": str(error)[:2000]}}, status=status)
        return wrapped

    async def capabilities(request):
        return web.json_response(service.capabilities(), headers={"Cache-Control": "no-store"})

    async def schemas(request):
        return web.Response(body=(SCHEMAS / "tools.schema.json").read_bytes(), content_type="application/json")

    async def tool(request):
        name, arguments = request.match_info["tool"], await body(request)
        result = await service.tool(request[profile_key], name, arguments)
        return web.json_response(result, headers={"Cache-Control": "no-store"})

    async def upload(request):
        check_origin(request)
        if service.active >= 8: raise AssetError("Resolver ausgelastet", "busy")
        service.active += 1
        try:
            reader = await request.multipart()
            metadata, filename, data, profile = None, None, bytearray(), None
            seen = set()
            while part := await reader.next():
                if part.name in seen or part.name not in {"metadata", "file", "profile"}: raise AssetError("Unerwarteter Uploadteil")
                seen.add(part.name)
                if part.name == "file":
                    filename = part.filename
                    while chunk := await part.read_chunk(65536):
                        data.extend(chunk)
                        if len(data) > MAX_SOURCE: raise AssetError("Uploadbudget überschritten", "budget")
                else:
                    buffer = bytearray()
                    while chunk := await part.read_chunk(8192):
                        buffer.extend(chunk)
                        if len(buffer) > 16384: raise AssetError("Metadatenbudget überschritten", "budget")
                    if part.name == "metadata": metadata = json.loads(buffer)
                    else: profile = buffer.decode()
            if not filename or not metadata or not data: raise AssetError("Datei und Lizenzmetadaten erforderlich")
            from .profiles import PROFILES
            if profile and profile not in PROFILES: raise AssetError("Unbekanntes Optimierungsprofil")
            result = await service.upload(request[profile_key], filename, bytes(data), metadata, profile=profile)
            return web.json_response(result, status=201 if result["decision"]["allowed"] else 202)
        finally: service.active -= 1

    async def blob(request):
        descriptor = service.descriptor(request[profile_key], request.match_info["ident"])
        if descriptor["sha256"] != request.match_info["hash"]: raise AssetError("Falsche Assetrevision", "not_found")
        data = await asyncio.to_thread(service.store.read, descriptor["sha256"])
        return web.Response(body=data, content_type="model/gltf-binary",
                            headers={"Cache-Control": "private, max-age=3600", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
                                     "Content-Disposition": 'attachment; filename="asset.glb"'})

    async def placements(request):
        result = service.store.placements(request[profile_key])
        # Policy changes never leave newly disallowed assets in published scenes.
        items, rejected = [], []
        for item in result["items"]:
            try:
                service.build_records(request[profile_key], [item["asset"]["asset_id"]]); items.append(item)
            except AssetError: rejected.append(item["id"])
        return web.json_response({**result, "items": items, "rejected": rejected}, headers={"Cache-Control": "no-store"})

    async def build(request):
        arguments = await body(request)
        if set(arguments) != {"ids"}: raise AssetError("Build benötigt eine Liste exakter Asset-IDs")
        result = await service.tool(request[profile_key], "export_credits", arguments)
        import io
        import zipfile
        stream = io.BytesIO()
        records = service.build_records(request[profile_key], arguments["ids"])
        records.sort(key=lambda record: record["id"])
        size = 0
        with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as archive:
            def write(name, data):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
            write("ASSET-CREDITS.md", result["text"])
            write("manifest.json", canonical({"schemaVersion": 1, "assets": records}))
            seen = set()
            for value in records:
                if not value["sha256"] or value["sha256"] in seen: continue
                seen.add(value["sha256"])
                data = await asyncio.to_thread(service.store.read, value["sha256"]); size += len(data)
                if size > 256 * 1024**2: raise AssetError("Buildbudget überschritten", "budget")
                write("assets/" + value["sha256"] + ".glb", data)
        return web.Response(body=stream.getvalue(), content_type="application/zip",
                            headers={"Content-Disposition": 'attachment; filename="orbit-assets.zip"'})

    app.router.add_get("/api/assets/capabilities", guarded(capabilities))
    app.router.add_get("/api/assets/tools", guarded(schemas))
    app.router.add_post("/api/assets/tools/{tool}", guarded(tool))
    app.router.add_post("/api/assets/upload", guarded(upload))
    app.router.add_post("/api/assets/build", guarded(build))
    app.router.add_get("/api/assets/placements", guarded(placements))
    app.router.add_get("/api/assets/blob/{ident}/{hash}", guarded(blob))
    app.on_startup.append(startup); app.on_cleanup.append(cleanup)
    return service
