"""Bounded data contracts. Schemas never resolve remote references."""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import json
from pathlib import Path
from typing import Any, Protocol

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]
MAX_SOURCE = 128 * 1024 * 1024
MAX_EXPANDED = 256 * 1024 * 1024
MAX_CANONICAL = 64 * 1024 * 1024
SCHEMAS = ROOT / "shared/schemas/assets/v1"


class AssetError(ValueError):
    def __init__(self, message: str, code: str = "invalid_asset"):
        super().__init__(message)
        self.code = code


def canonical(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def check(name: str, value: Any) -> None:
    schema = json.loads((SCHEMAS / (name + ".schema.json")).read_text())
    # The schemas are self-contained. No network or content-supplied references.
    errors = sorted(Draft202012Validator(schema).iter_errors(value), key=lambda e: str(e.path))
    if errors:
        error = errors[0]
        raise AssetError(f"{name}: {'.'.join(map(str, error.path))}: {error.message[:300]}", "schema")
    try: canonical(value)  # Also rejects NaN/Infinity accepted by Python's JSON reader.
    except (ValueError, TypeError, RecursionError) as error:
        raise AssetError("Nicht darstellbarer JSON-Wert", "schema") from error


@dataclass(frozen=True)
class Capabilities:
    search: bool = False
    metadata: bool = False
    download: bool = False
    deep_link: bool = False
    authentication: bool = False
    asset_types: tuple[str, ...] = ("model",)


@dataclass(frozen=True)
class DownloadFile:
    name: str
    url: str
    size: int | None = None
    data: bytes | None = field(default=None, repr=False)


@dataclass(frozen=True)
class DownloadPlan:
    files: tuple[DownloadFile, ...]
    entry: str
    kind: str = "model"
    headers: dict[str, str] = field(default_factory=dict, repr=False)


class AssetProvider(Protocol):
    id: str
    hosts: tuple[str, ...]
    def capabilities(self) -> Capabilities: ...
    async def search(self, query: dict[str, Any]) -> list[dict[str, Any]]: ...
    async def get_metadata(self, asset_id: str) -> dict[str, Any]: ...
    async def get_license(self, asset_id: str) -> dict[str, Any]: ...
    async def download(self, asset_id: str) -> DownloadPlan: ...


def result(provider: str, ident: str, name: str, source_url: str, license: dict,
           *, kind: str = "model", tags: list[str] | None = None, **details: Any) -> dict:
    return {"id": f"{provider}:{ident}", "sourceAssetId": ident, "provider": provider,
            "name": name[:200], "type": kind, "sourceUrl": source_url,
            "license": license, "tags": (tags or [])[:100], "formats": [],
            "geometry": None, "skeleton": None, "animations": None, "textures": None,
            "pbr": None, "size": None, "verified": False, **details}
