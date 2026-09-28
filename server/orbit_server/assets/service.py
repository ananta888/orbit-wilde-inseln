"""Resolver application service shared by HTTP, tools and the designer bridge."""
from __future__ import annotations
import asyncio
import copy
from dataclasses import asdict
from datetime import datetime, timezone
from importlib.metadata import entry_points
import json
import logging
import os
from pathlib import Path
import secrets
from typing import Any
from aiohttp import ClientError

from .contracts import AssetError, AssetProvider, ROOT, MAX_SOURCE, MAX_EXPANDED, canonical, check, sha256
from .licenses import LicensePolicy, credits
from .pipeline import Pipeline
from .providers import PolyHaven, AmbientCG, Sketchfab, LinkProvider, LocalProvider
from .providers.bundled import BundledProvider
from .search import parse_query, matches, deduplicate
from .safety import Transport, safe_name
from .store import AssetStore

LOG = logging.getLogger(__name__)


def now() -> str: return datetime.now(timezone.utc).isoformat()


def record_id(value: dict) -> str: return "asset_" + sha256(canonical(value))[:32]


def record(metadata: dict, files: list[dict], entry: str, kind: str) -> dict:
    license = copy.deepcopy(metadata["license"])
    license["downloadDate"] = now()
    return {"schemaVersion": 1, "id": record_id({"license": metadata["license"], "files": files, "entry": entry}),
            "name": metadata["name"], "type": metadata["type"], "provider": license["source"],
            "sourceAssetId": license["sourceAssetId"], "sourceUrl": license["sourceUrl"], "license": license,
            "sourceLicenses": [],
            "tags": metadata.get("tags", []), "formats": [Path(entry).suffix.lstrip(".")],
            "geometry": None, "skeleton": None, "animations": None, "textures": None,
            "materials": [], "bounds": None, "performance": {}, "pbr": None,
            "size": sum(f["bytes"] for f in files), "verified": False, "sha256": None,
            "sourceFiles": files, "entry": entry, "kind": kind, "status": "downloaded", "profile": None,
            "report": None, "provenance": [{"operation": "acquire", "input": [], "output": None,
                "parameters": {"sourceFiles": files}, "tool": "orbit-assets/1", "date": now()}],
            "dependencies": [], "lod": [], "advertised": metadata.get("advertised", {})}


class Resolver:
    def __init__(self, root: Path, *, config: dict | None = None, transport=None):
        root = root.resolve()
        if config is None:
            path = os.environ.get("ORBIT_ASSET_CONFIG")
            config = json.loads(Path(path).read_text()) if path else {}
        check("config", config)
        self.config = config
        self.local_enabled = config.get("providers", {}).get("local", {"enabled": True})["enabled"]
        self.policy = LicensePolicy(config.get("commercial", True), tuple(config.get("allowed_licenses", ["CC0", "Public Domain", "CC-BY"])),
                                    tuple(config.get("custom_evidence", [])))
        self.store = AssetStore(root, quota=config.get("quota_bytes", 2 * 1024**3))
        self.pipeline = Pipeline(root / "work")
        self.fingerprint = sha256((ROOT / "package-lock.json").read_bytes() + (ROOT / "tools/assets/resolver-worker.mjs").read_bytes())
        self.transport = transport or Transport()
        self.providers: dict[str, AssetProvider] = {}
        if config.get("providers", {}).get("bundled", {"enabled": True})["enabled"]:
            self.providers["bundled"] = BundledProvider()
        constructors = {"polyhaven": PolyHaven, "ambientcg": AmbientCG, "sketchfab": Sketchfab}
        for ident, factory in constructors.items():
            options = dict(config.get("providers", {}).get(ident, {"enabled": True}))
            if not options["enabled"]: continue
            if ident == "sketchfab": options["token"] = os.environ.get(options.get("token_env", "ORBIT_SKETCHFAB_TOKEN"), "")
            self.providers[ident] = factory(self.transport, options)
        for ident in LinkProvider.LINKS:
            if config.get("providers", {}).get(ident, {"enabled": True})["enabled"]:
                self.providers[ident] = LinkProvider(ident)
        available = {e.name: e for e in entry_points(group="orbit.asset_providers")}
        for name in config.get("plugins", []):
            if not config.get("providers", {}).get(name, {}).get("enabled", True): continue
            if name not in available: raise AssetError("Installiertes Provider-Plugin fehlt: " + name)
            plugin = available[name].load()(self.transport, config.get("providers", {}).get(name, {}))
            if plugin.id in self.providers or plugin.id == "local": raise AssetError("Doppelte Provider-ID")
            self.providers[plugin.id] = plugin
        self.active = 0

    async def start(self) -> None: await self.transport.start()
    async def close(self) -> None:
        await self.pipeline.close(); await self.transport.close(); self.store.close()

    def capabilities(self) -> dict:
        return {"schemaVersion": 1, "providers": {**({"local": asdict(LocalProvider(self.store, "", self.policy).capabilities())} if self.local_enabled else {}),
                **{name: asdict(provider.capabilities()) for name, provider in self.providers.items()}},
                "pipeline": self.pipeline.capabilities(), "policy": asdict(self.policy)}

    def enforce(self, record: dict) -> None:
        for license in [record["license"], *record.get("sourceLicenses", [])]:
            check("license", license)
            decision = self.policy.decision(license)
            if not decision["allowed"]: raise AssetError("; ".join(decision["reasons"]), "license")

    async def search(self, owner: str, arguments: dict) -> dict:
        check("search", arguments)
        query = parse_query(arguments)
        providers: dict[str, AssetProvider] = {**({"local": LocalProvider(self.store, owner, self.policy)} if self.local_enabled else {}), **self.providers}
        selected = query.get("providers", list(providers))
        if not query["text"]: selected = [name for name in selected if name in {"local", "bundled"}]
        errors, links, found = [], [], []

        async def one(name):
            provider = providers.get(name)
            if not provider: return {"error": {"provider": name, "code": "disabled", "message": "Provider deaktiviert oder unbekannt"}}
            if isinstance(provider, LinkProvider): return {"link": {"provider": name, "url": provider.link(query), "workflow": "manual-import"}}
            try:
                records = await asyncio.wait_for(provider.search(query), 30)
                return {"records": [r for r in records if matches(r, query, self.policy)]}
            except (AssetError, TimeoutError, OSError, ValueError, KeyError, TypeError, ClientError) as error:
                LOG.warning("asset_provider_failed provider=%s error=%s", name, type(error).__name__)
                return {"error": {"provider": name, "code": getattr(error, "code", "provider_unavailable"), "message": "Quelle momentan nicht verfügbar; lokale Bibliothek bleibt nutzbar"}}

        for response in await asyncio.gather(*(one(p) for p in selected)):
            if "records" in response: found.extend(response["records"])
            if "error" in response: errors.append(response["error"])
            if "link" in response: links.append(response["link"])
        return {"results": deduplicate(found)[:query.get("limit", 20)], "links": links, "errors": errors,
                "query": query, "attribution": "Remote catalogs: Poly Haven · ambientCG · Sketchfab"}

    def provider(self, ident: str):
        name, separator, source = ident.partition(":")
        if not separator or name not in self.providers: raise AssetError("Providerreferenz ungültig", "not_found")
        return self.providers[name], source

    async def download(self, owner: str, ident: str, *, refresh: bool = False) -> dict:
        if ident.startswith("asset_"): return self.store.get(owner, ident)
        provider, source = self.provider(ident)
        metadata = await provider.get_metadata(source)
        self.enforce(metadata)
        for previous in sorted(self.store.list(owner), key=lambda r: r["license"]["downloadDate"] or "", reverse=True):
            if not refresh and previous["provider"] == provider.id and previous["sourceAssetId"] == source and previous["status"] == "downloaded":
                self.enforce(previous)
                return previous
        plan = await provider.download(source)
        if len(plan.files) > 128: raise AssetError("Providerpaket zu groß", "budget")
        files, total = [], 0
        for item in plan.files:
            name = item.name
            if name.endswith(".zip"): safe_name(name[:-4] + ".glb")
            else: safe_name(name)
            if item.size is not None and (item.size < 0 or total + item.size > MAX_EXPANDED or item.size > MAX_SOURCE):
                raise AssetError("Providerpaket überschreitet Downloadbudget", "budget")
            data = item.data if item.data is not None else await self.transport.fetch(item.url, provider.hosts, headers=plan.headers, limit=min(MAX_SOURCE, MAX_EXPANDED - total))
            if len(data) > MAX_SOURCE or total + len(data) > MAX_EXPANDED: raise AssetError("Quelldatenbudget", "budget")
            total += len(data)
            if item.size is not None and len(data) != item.size: raise AssetError("Unvollständiger Providerdownload", "integrity")
            key = await asyncio.to_thread(self.store.put, data, "source")
            files.append({"name": name, "sha256": key, "bytes": len(data)})
        return self.store.save(owner, record(metadata, files, plan.entry, plan.kind))

    async def upload(self, owner: str, filename: str, data: bytes, metadata: dict, *, profile: str | None = None) -> dict:
        check("metadata", metadata)
        if len(data) > MAX_SOURCE: raise AssetError("Uploadbudget überschritten", "budget")
        if filename.lower().endswith(".zip"): safe_name(filename[:-4] + ".glb")
        else: safe_name(filename)
        key = await asyncio.to_thread(self.store.put, data, "source")
        value = record(metadata, [{"name": filename, "sha256": key, "bytes": len(data)}], filename,
                       "material" if metadata["type"] == "material" else "model")
        decision = self.policy.decision(value["license"])
        if not decision["allowed"]:
            value["status"] = "quarantine"
            self.store.save(owner, value, quarantine=True)
            return {"asset": value, "decision": decision}
        self.store.save(owner, value)
        return {"asset": await self.import_asset(owner, value["id"], profile=profile), "decision": decision}

    async def derived(self, owner: str, base: dict, operation: str, parameters: dict, *, files: dict,
                      entry: str, profile: str | None = None, normalize: dict | None = None,
                      retarget: dict | None = None, dependencies: list[str] | None = None) -> dict:
        self.enforce(base)
        ident = record_id({"source": base["id"], "operation": operation, "parameters": parameters,
                           "pipeline": self.fingerprint, "dependencies": dependencies or []})
        try: return self.store.get(owner, ident)
        except AssetError as error:
            if error.code != "not_found": raise
        next_license = copy.deepcopy(base["license"])
        next_license["modifications"].append(operation + ": " + json.dumps(parameters, ensure_ascii=False, sort_keys=True)[:400])
        inherited = [r["license"] for r in self.build_records(owner, dependencies or [])]
        data, report = await self.pipeline.run(files, entry, kind="model" if entry.endswith(".glb") else base["kind"],
                                              profile=profile, normalize=normalize, retarget=retarget,
                                              license=next_license, source_licenses=inherited)
        self.enforce({"license": next_license, "sourceLicenses": report["sourceLicenses"]})
        key = await asyncio.to_thread(self.store.put, data, "optimized" if profile else "canonical")
        value = copy.deepcopy(base)
        value.update(id=ident, sha256=key, status="ready", verified=True, formats=["glb"], size=len(data), profile=profile,
                     report=report, dependencies=list(dict.fromkeys([base["id"], *(dependencies or [])])), lod=[])
        for field in ["geometry", "skeleton", "animations", "textures", "materials", "bounds", "performance", "pbr"]:
            value[field] = report[field]
        value["license"] = next_license
        value["sourceLicenses"] = report["sourceLicenses"]
        value["provenance"].append({"operation": operation, "input": [sha256(b) for b in files.values()], "output": key,
                                    "parameters": parameters, "tool": "orbit-assets/1; gltf-transform/4.5.0; meshoptimizer/1.3.0; pipeline/" + self.fingerprint, "date": now()})
        LOG.info("asset_derived operation=%s asset=%s sha256=%s triangles=%s", operation, ident, key, report["geometry"]["triangles"])
        return self.store.save(owner, value)

    async def import_asset(self, owner: str, ident: str, *, profile: str | None = None, normalize: dict | None = None, entry: str | None = None) -> dict:
        base = await self.download(owner, ident)
        self.enforce(base)
        if base["status"] == "ready" and normalize is None:
            return await self.optimize(owner, base["id"], profile) if profile and base["profile"] != profile else base
        files = {f["name"]: await asyncio.to_thread(self.store.read, f["sha256"]) for f in base["sourceFiles"]}
        options = normalize or {"scale": 1, "up": "Y"}
        check("normalize", options)
        value = await self.derived(owner, base, "normalize", {"normalize": options, "entry": entry or base["entry"]},
                                   files=files, entry=entry or base["entry"], normalize=options)
        return await self.optimize(owner, value["id"], profile) if profile else value

    async def optimize(self, owner: str, ident: str, profile: str, *, lod: bool = False) -> dict:
        base = self.store.get(owner, ident)
        if not base["verified"]: raise AssetError("Zuerst importieren und prüfen", "not_ready")
        value = await self.derived(owner, base, "optimize", {"profile": profile},
                                   files={"input.glb": self.store.read(base["sha256"])}, entry="input.glb", profile=profile)
        if not lod: return value
        # LOD collection itself is immutable; individual optimized records remain reusable.
        variants = []
        for target in ["quest3-high", "quest3-balanced", "quest3-performance"]:
            item = await self.optimize(owner, ident, target)
            variants.append({"id": item["id"], "sha256": item["sha256"], "profile": target})
        collection = copy.deepcopy(value)
        collection["id"] = record_id({"base": value["id"], "lod": variants})
        collection["lod"] = variants
        collection["dependencies"] = list(dict.fromkeys([value["id"], *[v["id"] for v in variants]]))
        return self.store.save(owner, collection)

    def descriptor(self, owner: str, ident: str) -> dict:
        value = self.store.get(owner, ident); self.enforce(value)
        if not value["verified"]: raise AssetError("Asset noch nicht geprüft", "not_ready")
        if not value["geometry"]["meshes"]: raise AssetError("Animationsbibliothek ohne Vorschaugeometrie; zuerst einem kompatiblen Modell zuordnen", "animation_library")
        if not value["performance"]["desktop-high"]["withinBudget"]:
            raise AssetError("Vorschau überschreitet das maximale Renderbudget; zuerst eine optimierte Variante erstellen", "budget")
        return {"asset_id": value["id"], "revision": 1, "sha256": value["sha256"], "name": value["name"],
                "url": "/api/assets/blob/" + value["id"] + "/" + value["sha256"], "report": value["report"]}

    def build_records(self, owner: str, ids: list[str]) -> list[dict]:
        records: dict[str, dict[str, Any]] = {}
        def visit(ident):
            if ident in records: return
            if len(records) >= 200: raise AssetError("Buildabhängigkeitsbudget", "budget")
            value = self.store.get(owner, ident); self.enforce(value); records[ident] = value
            for parent in value["dependencies"]: visit(parent)
        for ident in ids: visit(ident)
        return list(records.values())

    async def tool(self, owner: str, name: str, arguments: dict) -> dict:
        check("tools", {"tool": name, "arguments": arguments})
        if self.active >= 8: raise AssetError("Resolver ausgelastet", "busy")
        self.active += 1
        try:
            ident = arguments.get("id", "")
            if name == "search_assets": return await self.search(owner, arguments)
            if name == "download_asset": return {"asset": await self.download(owner, ident, refresh=arguments.get("refresh", False))}
            if name == "import_asset": return {"asset": await self.import_asset(owner, ident, **{k: v for k, v in arguments.items() if k != "id"})}
            if name == "optimize_asset": return {"asset": await self.optimize(owner, ident, arguments["profile"], lod=arguments.get("lod", False))}
            if name == "preview_asset": return self.descriptor(owner, ident)
            if name == "find_animations":
                query = parse_query({"query": arguments["query"]})
                resources: dict[str, dict[str, Any]] = {}
                for asset in self.store.list(owner) if self.local_enabled else []:
                    if not asset["verified"]: continue
                    try: self.enforce(asset)
                    except AssetError: continue
                    for clip in asset["animations"]:
                        text = " ".join([asset["name"], *asset["tags"], clip["name"], *clip["tags"]]).lower()
                        if not all(term in text for term in query["terms"]): continue
                        resources.setdefault(clip["id"], {"id": clip["id"], "asset_id": asset["id"], "sha256": asset["sha256"],
                            "clip": clip, "skeleton": asset["skeleton"], "rig_family": "unclassified",
                            "requested_family": arguments.get("rig_family"), "compatibility": "mapping-required"})
                        if len(resources) >= 50: return {"animations": list(resources.values()), "truncated": True}
                return {"animations": list(resources.values()), "truncated": False}
            if name == "export_credits":
                records = self.build_records(owner, arguments["ids"])
                return {"filename": "ASSET-CREDITS.md", "text": credits(records, self.policy), "assets": [r["id"] for r in records]}
            if name == "remove_placement": return self.store.place(owner, arguments["revision"], None, arguments["placement_id"])
            if name == "place_asset":
                item = self.descriptor(owner, ident)
                if not item["report"]["performance"]["quest3-balanced"]["withinBudget"]:
                    raise AssetError("Asset überschreitet das Quest-Budget; zuerst optimieren", "budget")
                reports = [p["asset"]["report"] for p in self.store.placements(owner)["items"]] + [item["report"]]
                if (sum(r["geometry"].get("renderTriangles", r["geometry"]["triangles"]) for r in reports) > 180000
                        or sum(r["drawCalls"] for r in reports) > 64
                        or sum(r["memory"]["textureBytes"] for r in reports) > 128 * 1024**2):
                    raise AssetError("Gesamtbudget der zusätzlichen Weltobjekte erreicht", "budget")
                return self.store.place(owner, arguments["revision"], {"id": "placement_" + secrets.token_hex(8), "asset": item,
                                        **{key: arguments[key] for key in ("position", "rotation", "scale")}})
            if name == "retarget_animation":
                target, source = self.store.get(owner, ident), self.store.get(owner, arguments["source"])
                self.enforce(source)
                if not target["verified"] or not source["verified"]: raise AssetError("Beide Assets zuerst importieren")
                files = {"input.glb": self.store.read(target["sha256"]), "animation.glb": self.store.read(source["sha256"])}
                value = await self.derived(owner, target, "retarget", arguments, files=files, entry="input.glb",
                    retarget={"source": "animation.glb", "clip": arguments["clip"], "mapping": arguments["mapping"]}, dependencies=[source["id"]])
                return {"asset": value}
            value = self.store.get(owner, ident) if ident.startswith("asset_") else await self.provider(ident)[0].get_metadata(self.provider(ident)[1])
            if name == "get_license": return {"license": value["license"], "decision": self.policy.decision(value["license"])}
            if name == "get_provenance": return {"provenance": value.get("provenance", []), "license": value["license"],
                "sourceLicenses": value.get("sourceLicenses", []), "dependencies": value.get("dependencies", [])}
            if name == "inspect_asset": return {"asset": value}
            raise AssetError("Tool benötigt die Werkstattintegration", "unsupported")
        finally: self.active -= 1
