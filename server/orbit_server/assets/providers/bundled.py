"""Read only the fixed, hash-verified inventory already shipped with Orbit."""
import json

from ..contracts import AssetError, Capabilities, DownloadFile, DownloadPlan, ROOT, result, sha256
from ..licenses import license_record


class BundledProvider:
    id = "bundled"
    hosts: tuple[str, ...] = ()

    def __init__(self):
        self.inventory = {r["id"].replace(".", "_"): r for r in json.loads((ROOT / "content/assets/third-party.json").read_text())["assets"]}

    def capabilities(self) -> Capabilities:
        return Capabilities(search=True, metadata=True, download=True, asset_types=("creature",))

    async def get_metadata(self, asset_id: str) -> dict:
        if asset_id not in self.inventory: raise AssetError("Gebündeltes Asset nicht gefunden", "not_found")
        source = self.inventory[asset_id]
        kind = "CC0" if source["license"] == "CC0-1.0" else "Unknown"
        license = license_record(kind, ", ".join(source["authors"]), self.id, asset_id, source["source"])
        license["modifications"] = [source["changes"]]
        return result(self.id, asset_id, "Arin · Cethiels Drache", source["source"], license,
                      kind="creature", tags=["arin", "dragon", "drache"], formats=["glb"],
                      geometry={"triangles": source["triangles"]}, skeleton={"present": True, "bones": source["bones"]},
                      advertised={"animationCount": len(source["animations"]), "sourceArchiveSha256": source["sourceArchiveSha256"]})

    async def search(self, query: dict) -> list[dict]:
        values = [await self.get_metadata(ident) for ident in self.inventory]
        return [v for v in values if all(t in (v["name"] + " " + " ".join(v["tags"])).lower() for t in query["terms"])]

    async def get_license(self, asset_id: str) -> dict: return (await self.get_metadata(asset_id))["license"]

    async def download(self, asset_id: str) -> DownloadPlan:
        await self.get_metadata(asset_id)
        source = self.inventory[asset_id]
        path = (ROOT / source["path"]).resolve()
        if not path.is_relative_to(ROOT / "client/webxr/assets"): raise AssetError("Ungültiger Inventarpfad")
        data = path.read_bytes()
        if sha256(data) != source["sha256"]: raise AssetError("Gebündeltes Asset verändert", "integrity")
        return DownloadPlan((DownloadFile("model.glb", "", len(data), data),), "model.glb")
