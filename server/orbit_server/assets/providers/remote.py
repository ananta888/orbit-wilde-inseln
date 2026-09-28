"""Official APIs only. Download plans are re-resolved, never accepted from a client."""
from __future__ import annotations
import asyncio
from urllib.parse import urlencode, urlsplit

from .base import RemoteProvider, identifier
from ..contracts import AssetError, Capabilities, DownloadFile, DownloadPlan, result
from ..licenses import license_record


class PolyHaven(RemoteProvider):
    id = "polyhaven"
    hosts = ("api.polyhaven.com", "dl.polyhaven.org", "cdn.polyhaven.com")

    def capabilities(self) -> Capabilities:
        return Capabilities(search=True, metadata=True, download=True, asset_types=("model", "material"))

    async def search(self, query: dict) -> list[dict]:
        kind = "textures" if query.get("types") == ["material"] else "models"
        if not query["text"]: return []
        data = await self.json("https://api.polyhaven.com/search?" + urlencode({"q": query["text"], "t": kind}))
        hits = data.get("results", [])[:min(query.get("limit", 12), 20)]
        return await asyncio.gather(*(self.get_metadata(identifier(h["slug"])) for h in hits))

    async def get_metadata(self, asset_id: str) -> dict:
        ident = identifier(asset_id)
        d = await self.json("https://api.polyhaven.com/info/" + ident)
        url = "https://polyhaven.com/a/" + ident
        return result(self.id, ident, d["name"], url,
                      license_record("CC0", ", ".join(d.get("authors", {})), self.id, ident, url,
                                     evidence="https://polyhaven.com/license"),
                      kind="material" if d["type"] == 1 else "model", tags=d.get("tags", []),
                      formats=["gltf"] if d["type"] == 2 else ["jpg", "png"], pbr=True,
                      advertised={"polycount": d.get("polycount"), "maxResolution": d.get("max_resolution")})

    async def download(self, asset_id: str) -> DownloadPlan:
        ident = identifier(asset_id)
        data = await self.json("https://api.polyhaven.com/files/" + ident)
        gltf = data.get("gltf", {})
        resolution = next((r for r in ("2k", "1k", "4k") if r in gltf), None)
        if resolution:
            file = gltf[resolution]["gltf"]
            entry = ident + ".gltf"
            files = [DownloadFile(entry, file["url"], file["size"])]
            files.extend(DownloadFile(name, value["url"], value["size"]) for name, value in file.get("include", {}).items())
            return DownloadPlan(tuple(files), entry)
        maps = []
        for label, candidates in {"color": ("Diffuse", "diff"), "normal": ("nor_gl",), "roughness": ("Rough", "rough")}.items():
            for key in candidates:
                file = data.get(key, {}).get("1k", {}).get("jpg")
                if file:
                    maps.append(DownloadFile(label + ".jpg", file["url"], file["size"])); break
        if not maps: raise AssetError("Kein unterstütztes glTF-/Materialpaket vorhanden", "unsupported")
        return DownloadPlan(tuple(maps), "material.json", "material")


class AmbientCG(RemoteProvider):
    id = "ambientcg"
    hosts = ("ambientcg.com", "download.ambientcg.com", "acg-download.struffelproductions.com")

    def capabilities(self) -> Capabilities:
        return Capabilities(search=True, metadata=True, download=True, asset_types=("material",))

    async def search(self, query: dict) -> list[dict]:
        data = await self.json("https://ambientcg.com/api/v2/full_json?" + urlencode(
            {"q": query["text"], "type": "Material", "limit": min(query.get("limit", 12), 20)}))
        return [self.normalize(d) for d in data["foundAssets"]]

    def normalize(self, d: dict) -> dict:
        ident = identifier(d["assetId"]); url = "https://ambientcg.com/a/" + ident
        return result(self.id, ident, d.get("displayName", ident), url,
                      license_record("CC0", "Lennart Demes / ambientCG", self.id, ident, url,
                                     evidence="https://docs.ambientcg.com/license/"),
                      kind="material", tags=d.get("tags", []), formats=["jpg", "png"], pbr=True)

    async def details(self, ident: str) -> dict:
        data = await self.json("https://ambientcg.com/api/v2/full_json?" + urlencode(
            {"id": identifier(ident), "include": "downloadData", "limit": 1}))
        matches = [d for d in data["foundAssets"] if d["assetId"] == ident]
        if not matches: raise AssetError("ambientCG-Asset nicht gefunden", "not_found")
        return matches[0]

    async def get_metadata(self, asset_id: str) -> dict:
        return self.normalize(await self.details(asset_id))

    async def download(self, asset_id: str) -> DownloadPlan:
        d = await self.details(asset_id)
        downloads = d["downloadFolders"]["default"]["downloadFiletypeCategories"]["zip"]["downloads"]
        file = next((f for f in downloads if f["attribute"] == "1K-JPG"), None)
        if not file: raise AssetError("Kein unterstütztes 1K-JPG-Materialpaket", "unsupported")
        return DownloadPlan((DownloadFile("material.zip", file["downloadLink"], file["size"]),), "material.json", "material")


class Sketchfab(RemoteProvider):
    id = "sketchfab"
    hosts = ("api.sketchfab.com", "media.sketchfab.com", "download.sketchfab.com", "media.sketchfab.com")

    def capabilities(self) -> Capabilities:
        return Capabilities(search=True, metadata=True, download=bool(self.config.get("token")),
                            deep_link=True, authentication=True, asset_types=("model", "creature", "animation"))

    async def search(self, query: dict) -> list[dict]:
        d = await self.json("https://api.sketchfab.com/v3/search?" + urlencode(
            {"type": "models", "q": query["text"], "downloadable": "true", "count": min(query.get("limit", 12), 20)}))
        return await asyncio.gather(*(self.normalize(item) for item in d["results"]))

    async def normalize(self, d: dict) -> dict:
        ident = identifier(d["uid"]); url = d["viewerUrl"]
        license_data = d.get("license") or {}
        # Search responses may only carry a UID. Resolve the official license record.
        if license_data.get("uid"):
            license_data = await self.json("https://api.sketchfab.com/v3/licenses/" + identifier(license_data["uid"]))
        slug = license_data.get("slug", "")
        kind = "CC0" if slug in {"cc0", "public-domain"} else "CC-" + slug.upper() if slug.startswith("by") else "Unknown"
        license = license_record(kind, d.get("user", {}).get("displayName", ""), self.id, ident, url)
        exact_url = license_data.get("url", "")
        if exact_url:
            license["licenseUrl"] = exact_url
            license["version"] = urlsplit(exact_url).path.rstrip("/").split("/")[-1]
        elif kind != "Unknown":
            license["license"] = "Unknown"  # Do not invent a license version.
        return result(self.id, ident, d["name"], url, license, tags=[t["name"] for t in d.get("tags", [])],
                      formats=list(d.get("archives", {})), advertised={"triangles": d.get("faceCount"),
                      "animationCount": d.get("animationCount")})

    async def get_metadata(self, asset_id: str) -> dict:
        return await self.normalize(await self.json("https://api.sketchfab.com/v3/models/" + identifier(asset_id)))

    async def download(self, asset_id: str) -> DownloadPlan:
        if not self.capabilities().download: raise AssetError("Sketchfab-Download benötigt einen Betreiber-Token", "authentication")
        d = await self.transport.json("https://api.sketchfab.com/v3/models/" + identifier(asset_id) + "/download",
                                      self.hosts, headers={"Authorization": "Token " + self.config["token"]})
        file = d.get("glb") or d.get("gltf")
        if not file: raise AssetError("Sketchfab bietet keinen glTF-Download", "unsupported")
        name = "model.glb" if d.get("glb") else "model.zip"
        return DownloadPlan((DownloadFile(name, file["url"], file.get("size")),), name)
