from urllib.parse import urlencode

from ..contracts import AssetError, Capabilities
from ..search import matches


class LinkProvider:
    hosts: tuple[str, ...] = ()
    LINKS = {"quaternius": "https://quaternius.com/packs.html", "kenney": "https://kenney.nl/assets",
             "opengameart": "https://opengameart.org/art-search-advanced"}

    def __init__(self, ident: str): self.id = ident
    def capabilities(self) -> Capabilities: return Capabilities(deep_link=True)
    def link(self, query: dict) -> str:
        base = self.LINKS[self.id]
        field = "keys" if self.id == "opengameart" else "search" if self.id == "kenney" else None
        return base + ("?" + urlencode({field: query["text"]}) if field else "")
    async def search(self, query: dict) -> list[dict]: return []
    async def get_metadata(self, asset_id: str) -> dict:
        raise AssetError("Diese Quelle unterstützt Quelllinks und manuellen Import", "manual_import")
    async def get_license(self, asset_id: str) -> dict: return await self.get_metadata(asset_id)
    async def download(self, asset_id: str):
        raise AssetError("Datei auf der Quellseite laden und mit Lizenznachweis importieren", "manual_import")


class LocalProvider:
    id = "local"
    hosts: tuple[str, ...] = ()
    def __init__(self, store, owner: str, policy): self.store, self.owner, self.policy = store, owner, policy
    def capabilities(self) -> Capabilities:
        return Capabilities(search=True, metadata=True, download=True, asset_types=("model", "material", "creature", "animation"))
    async def search(self, query: dict) -> list[dict]:
        return [r for r in self.store.list(self.owner) if matches(r, query, self.policy, terms=True)]
    async def get_metadata(self, asset_id: str) -> dict: return self.store.get(self.owner, asset_id)
    async def get_license(self, asset_id: str) -> dict: return (await self.get_metadata(asset_id))["license"]
    async def download(self, asset_id: str):
        raise AssetError("Lokale Daten über die hashgebundene Assetreferenz lesen", "local_asset")
