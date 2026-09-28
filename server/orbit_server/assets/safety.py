"""Untrusted archive/URL boundaries; no arbitrary network targets or executable files."""
from __future__ import annotations

import asyncio
import ipaddress
import json
from pathlib import Path, PurePosixPath
import socket
import stat
from urllib.parse import urlsplit, unquote
import zipfile

import aiohttp
from aiohttp.abc import AbstractResolver

from .contracts import AssetError, MAX_SOURCE, MAX_EXPANDED

EXTENSIONS = {".glb", ".gltf", ".bin", ".obj", ".mtl", ".stl", ".fbx", ".blend",
              ".png", ".jpg", ".jpeg", ".webp", ".txt", ".md", ".json",
              # Provider material packages contain these companions. They are retained
              # as inert source data, never opened by a USD/Godot/Blender interpreter.
              ".usdc", ".usda", ".usd", ".mtlx", ".tres"}


def safe_name(value: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 240:
        raise AssetError("Ungültiger Dateiname", "path")
    decoded = unquote(value)
    path = PurePosixPath(decoded)
    if (decoded != value or "\\" in value or ":" in value or "\x00" in value or path.is_absolute()
            or any(p in {"", ".", ".."} for p in value.split("/"))
            or any(ord(c) < 32 for c in value)):
        raise AssetError("Unsicherer Paketpfad", "path")
    if path.suffix.lower() not in EXTENSIONS:
        raise AssetError("Dateityp im Assetpaket nicht erlaubt: " + path.suffix, "file_type")
    return value


def unpack(source: Path, destination: Path) -> list[str]:
    """Read ZIP members explicitly; never use extractall or trust declared sizes alone."""
    seen: set[str] = set()
    total = 0
    with zipfile.ZipFile(source) as archive:
        infos = archive.infolist()
        if len(infos) > 512: raise AssetError("Zu viele Archivdateien", "budget")
        for info in infos:
            if info.is_dir():
                # Validate directory names as well; do not materialize them yet.
                safe_name(info.filename.rstrip("/") + "/directory.txt")
                continue
            name = safe_name(info.filename)
            mode = info.external_attr >> 16
            if mode and stat.S_IFMT(mode) not in {0, stat.S_IFREG}:
                raise AssetError("Links/Spezialdateien sind nicht erlaubt", "path")
            if name.casefold() in seen or info.flag_bits & 1:
                raise AssetError("Doppelte oder verschlüsselte Archivdatei", "archive")
            seen.add(name.casefold())
            if info.file_size > MAX_SOURCE or info.file_size > max(info.compress_size, 1) * 200:
                raise AssetError("Archiv überschreitet Entpackbudget", "budget")
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as incoming, target.open("xb") as outgoing:
                while chunk := incoming.read(65536):
                    total += len(chunk)
                    if total > MAX_EXPANDED: raise AssetError("Entpackbudget überschritten", "budget")
                    outgoing.write(chunk)
    return sorted(str(p.relative_to(destination)) for p in destination.rglob("*") if p.is_file())


def validate_url(url: str, hosts: tuple[str, ...]) -> str:
    if len(url) > 4096: raise AssetError("URL zu lang", "url")
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if (parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment
            or parsed.port not in {None, 443} or not host or host not in hosts):
        raise AssetError("Downloadziel nicht vom Provider freigegeben", "url")
    try: address = ipaddress.ip_address(host)
    except ValueError: address = None
    if address is not None and not address.is_global: raise AssetError("Lokales Netzwerkziel gesperrt", "url")
    return url


class PublicResolver(AbstractResolver):
    """Check and return the exact DNS addresses used by the connector (no rebinding gap)."""
    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_INET) -> list:
        addresses = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM, family=family)
        results = []
        for af, _, proto, _, address in addresses:
            if not ipaddress.ip_address(address[0]).is_global:
                raise AssetError("Private/reservierte Provideradresse gesperrt", "url")
            results.append({"hostname": host, "host": address[0], "port": port, "family": af,
                            "proto": proto, "flags": socket.AI_NUMERICHOST})
        if not results: raise AssetError("Provideradresse nicht auflösbar", "network")
        return results

    async def close(self) -> None: pass


class Transport:
    def __init__(self) -> None:
        self.session: aiohttp.ClientSession | None = None
        self.slots = asyncio.Semaphore(4)

    async def start(self) -> None:
        self.session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(resolver=PublicResolver(), limit=4, ttl_dns_cache=60),
            timeout=aiohttp.ClientTimeout(total=45, connect=10, sock_read=15),
            headers={"User-Agent": "Orbit-Wilde-Inseln/0.1 (+https://github.com/ananta888/orbit-wilde-inseln)", "Accept-Encoding": "identity"},
            trust_env=False, auto_decompress=False)

    async def close(self) -> None:
        if self.session: await self.session.close()

    async def fetch(self, url: str, hosts: tuple[str, ...], *, limit: int = MAX_SOURCE,
                    headers: dict | None = None) -> bytes:
        if not self.session: raise AssetError("Netzwerkdienst nicht gestartet", "network")
        original_host = urlsplit(url).hostname
        async with self.slots:
            for _ in range(4):
                validate_url(url, hosts)
                # A token never follows a redirect to another host.
                auth = headers if urlsplit(url).hostname == original_host else None
                async with self.session.get(url, headers=auth, allow_redirects=False) as response:
                    if response.status in {301, 302, 303, 307, 308}:
                        from urllib.parse import urljoin
                        url = urljoin(url, response.headers.get("Location", ""))
                        continue
                    if response.status != 200:
                        raise AssetError(f"Provider antwortet mit HTTP {response.status}", "provider_unavailable")
                    if response.headers.get("Content-Encoding", "identity") != "identity":
                        raise AssetError("Unerwartete HTTP-Kompression", "network")
                    if response.content_length is not None and response.content_length > limit:
                        raise AssetError("Downloadbudget überschritten", "budget")
                    data = bytearray()
                    async for chunk in response.content.iter_chunked(65536):
                        data.extend(chunk)
                        if len(data) > limit: raise AssetError("Downloadbudget überschritten", "budget")
                    return bytes(data)
        raise AssetError("Zu viele Weiterleitungen", "network")

    async def json(self, url: str, hosts: tuple[str, ...], *, headers: dict | None = None) -> dict | list:
        try: return json.loads(await self.fetch(url, hosts, limit=12 * 1024 * 1024, headers=headers))
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise AssetError("Provider liefert kein gültiges JSON", "provider_format") from error
