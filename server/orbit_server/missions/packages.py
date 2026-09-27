"""Validated immutable packages and atomic catalog replacement."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping

from orbit_server.missions.schema import ContentError, read_json, validate

CAPABILITIES = frozenset({"bow.v1", "wind.v1", "interaction.v1", "dialogue.v1", "inventory.v1", "branching.v1"})
SECTIONS = ("manifest", "mission", "world", "objectives", "learning", "dialogue", "encounters")
MAX_PACKAGE_BYTES = 1024 * 1024


@dataclass(frozen=True)
class Package:
    ident: str
    version: str
    digest: str
    size_bytes: int
    payload: bytes

    def data(self) -> dict[str, Any]:
        return json.loads(self.payload)


def index(items: list[dict[str, Any]], name: str) -> dict[str, dict[str, Any]]:
    result = {item["id"]: item for item in items}
    if len(result) != len(items):
        raise ContentError(f"Duplicate {name} ID")
    return result


def require_refs(values: list[str], available: Mapping | set, name: str) -> None:
    missing = set(values) - set(available)
    if missing:
        raise ContentError(f"Unknown {name}: {sorted(missing)}")


def load_package(path: Path, assets: Mapping[str, Any], capabilities=CAPABILITIES) -> Package:
    if path.is_symlink() or not path.is_dir():
        raise ContentError("Package must be a real directory")
    expected = {f"{section}.json" for section in SECTIONS}
    actual = {entry.name for entry in path.iterdir()}
    if actual != expected:
        raise ContentError(f"Package file set differs: {sorted(actual ^ expected)}")
    size = 0
    data: dict[str, Any] = {}
    for section in SECTIONS:
        file = path / f"{section}.json"
        if file.is_symlink() or not file.is_file():
            raise ContentError("Symlinks and non-regular package files are forbidden")
        size += file.stat().st_size
        if size > MAX_PACKAGE_BYTES:
            raise ContentError("Package exceeds 1 MiB")
        data[section] = read_json(file)
        validate(section, data[section])
    manifest = data["manifest"]
    if data["mission"]["id"] != manifest["id"]:
        raise ContentError("Mission ID must match manifest")
    require_refs(manifest["capabilities"], capabilities, "capability")
    require_refs(manifest["assets"], assets, "asset")
    duration = manifest["duration_minutes"]
    if not duration["min"] <= duration["target"] <= duration["max"]:
        raise ContentError("Duration must satisfy min <= target <= max")
    objects = index(data["world"]["objects"], "object")
    objectives = index(data["objectives"]["objectives"], "objective")
    goals = index(data["learning"]["goals"], "learning goal")
    lines = index(data["dialogue"]["lines"], "dialogue")
    stages = index(data["mission"]["stages"], "stage")
    index(data["mission"]["solutions"], "solution")
    index(data["encounters"]["npcs"], "NPC")
    index(data["encounters"]["events"], "encounter event")
    if {hint["level"] for hint in data["dialogue"]["hints"]} != {1, 2, 3, 4}:
        raise ContentError("Exactly one hint at each level is required")
    used: list[str] = []
    for stage in stages.values():
        require_refs(stage["objectives"], objectives, "objective")
        require_refs([stage["narration"]], lines, "dialogue")
        used.extend(stage["objectives"])
    if len(used) != len(set(used)) or set(used) != set(objectives):
        raise ContentError("Each objective must belong to exactly one stage")
    for item in objects.values():
        require_refs([item["asset"]], set(manifest["assets"]), "declared asset")
        expected_generator = {"moving_target": "target", "wind_marker": "marker"}.get(item["kind"], item["kind"])
        if assets[item["asset"]]["generator"] != expected_generator:
            raise ContentError("Object kind and asset generator must agree")
        if item["kind"] == "moving_target" and "motion" not in item:
            raise ContentError("Moving targets require motion")
        if item["kind"] != "moving_target" and "motion" in item:
            raise ContentError("Only moving targets accept motion")
        if "collect" in item["verbs"] and item["kind"] not in {"plank", "bait"}:
            raise ContentError("Only portable objects can be collected")
    for item in objectives.values():
        require_refs([item["target"]], objects, "target")
        require_refs(item["learning_goals"], goals, "learning goal")
        require_refs(item["requires_items"] + item["consumes_items"], objects, "inventory item")
        if not set(item["consumes_items"]) <= set(item["requires_items"]):
            raise ContentError("Consumed items must also be required")
        if item["event"] == "collect" and item["count"] != 1:
            raise ContentError("Portable items are collected once")
        if any("collect" not in objects[key]["verbs"] for key in item["requires_items"]):
            raise ContentError("Required inventory must be collectible")
        if item["event"] not in objects[item["target"]]["verbs"]:
            raise ContentError("Objective event is not supported by target")
        if item["event"] == "hit" and objects[item["target"]]["kind"] not in {"target", "moving_target"}:
            raise ContentError("Only targets can satisfy hit objectives")
    for item in data["mission"]["solutions"]:
        require_refs(item["objectives"], objectives, "solution objective")
    for item in data["encounters"]["npcs"]:
        require_refs([item["object"]], objects, "NPC object")
    for item in data["encounters"]["events"]:
        require_refs([item["on_objective"]], objectives, "event objective")
        require_refs([item["target"]], objects, "event target")
    required = {"interaction.v1", "dialogue.v1"}
    if any(item["event"] == "hit" for item in objectives.values()): required.add("bow.v1")
    if any(data["world"]["wind"]): required.add("wind.v1")
    if any(item["requires_items"] or item["event"] == "collect" for item in objectives.values()): required.add("inventory.v1")
    if any(stage["completion"] == "any" for stage in stages.values()): required.add("branching.v1")
    if not required <= set(manifest["capabilities"]):
        raise ContentError(f"Missing capability declarations: {sorted(required - set(manifest['capabilities']))}")
    payload = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    return Package(manifest["id"], manifest["version"], hashlib.sha256(payload).hexdigest(), size, payload)


class Catalog:
    def __init__(self, root: Path, assets: Mapping[str, Any]):
        validate("assets", dict(assets))
        self.root, self.assets = root, assets
        self.packages: Mapping[str, Package] = MappingProxyType({})
        self.revision = 0
        self.error: str | None = None

    def prepare(self) -> Mapping[str, Package]:
        entries = sorted(self.root.iterdir())
        if len(entries) > 128: raise ContentError("At most 128 packages per catalog")
        result: dict[str, Package] = {}
        for path in entries:
            package = load_package(path, self.assets)
            if package.ident in result: raise ContentError("Duplicate package ID")
            old = self.packages.get(package.ident)
            if old and old.version == package.version and old.digest != package.digest:
                raise ContentError(f"{package.ident}: modified content requires a new package version")
            result[package.ident] = package
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(ident: str) -> None:
            if ident in visiting: raise ContentError("Dependency cycle")
            if ident in visited: return
            visiting.add(ident)
            data = result[ident].data()
            dependencies = data["manifest"]["dependencies"]
            if len({dep["id"] for dep in dependencies}) != len(dependencies):
                raise ContentError("Duplicate dependency")
            for dep in dependencies:
                if dep["id"] not in result or result[dep["id"]].version != dep["version"]:
                    raise ContentError(f"Missing exact dependency {dep['id']}@{dep['version']}")
                visit(dep["id"])
            require_refs(data["manifest"]["prerequisites"] + data["mission"]["next_missions"], result, "mission")
            for prerequisite in data["manifest"]["prerequisites"]:
                visit(prerequisite)
            visiting.remove(ident); visited.add(ident)

        for ident in result: visit(ident)
        return MappingProxyType(result)

    def apply(self, prepared: Mapping[str, Package]) -> bool:
        self.error = None
        if self.packages == prepared: return False
        self.packages = prepared
        self.revision += 1
        return True

    def reload(self) -> bool:
        try:
            return self.apply(self.prepare())
        except (ValueError, OSError) as exc:
            self.error = str(exc)
            return False
