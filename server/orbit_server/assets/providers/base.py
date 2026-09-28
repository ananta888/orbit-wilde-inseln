from __future__ import annotations
import re
import time
import json
from typing import Any

from ..contracts import AssetError, Capabilities, DownloadPlan


def identifier(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", value):
        raise AssetError("Ungültige Provider-ID")
    return value


class RemoteProvider:
    id: str
    hosts: tuple[str, ...] = ()

    def __init__(self, transport, config: dict | None = None):
        self.transport, self.config = transport, config or {}
        self.cache: dict[str, tuple[float, Any, int]] = {}

    async def json(self, url: str, *, headers: dict | None = None) -> Any:
        previous = self.cache.get(url)
        if previous and time.monotonic() - previous[0] < 600: return previous[1]
        data = await self.transport.json(url, self.hosts, headers=headers)
        size = len(json.dumps(data).encode())
        if size > 32 * 1024**2: return data
        self.cache.pop(url, None)
        while self.cache and (len(self.cache) >= 128 or sum(v[2] for v in self.cache.values()) + size > 32 * 1024**2):
            self.cache.pop(next(iter(self.cache)))
        self.cache[url] = (time.monotonic(), data, size)
        return data

    async def get_license(self, asset_id: str) -> dict:
        return (await self.get_metadata(asset_id))["license"]

    async def get_metadata(self, asset_id: str) -> dict:
        raise NotImplementedError

    def capabilities(self) -> Capabilities: raise NotImplementedError
    async def search(self, query: dict) -> list[dict]: raise NotImplementedError
    async def download(self, asset_id: str) -> DownloadPlan: raise NotImplementedError
