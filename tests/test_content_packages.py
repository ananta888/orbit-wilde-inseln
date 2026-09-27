import copy
import json
import shutil

import pytest
from jsonschema import Draft202012Validator

from orbit_server.missions.cli import build
from orbit_server.missions.packages import Catalog, ContentError, load_package
from orbit_server.missions.runtime import MissionRuntime
from orbit_server.missions.schema import read_json
from orbit_server.paths import ROOT


@pytest.fixture
def content(tmp_path):
    shutil.copytree(ROOT / "content", tmp_path / "content")
    return tmp_path / "content"


def catalog(root):
    result = Catalog(root / "missions", read_json(root / "assets/catalog.json"))
    result.apply(result.prepare())
    return result


def edit(root, section, fn, ident="physics_001_projectile"):
    path = root / "missions" / ident / f"{section}.json"
    data = read_json(path); fn(data); path.write_text(json.dumps(data))


def test_all_schemas_and_three_packages_are_valid_and_build_reproducibly(content, tmp_path):
    for path in (ROOT / "shared/schemas/v1").glob("*.json"): Draft202012Validator.check_schema(read_json(path))
    packages = catalog(content).packages
    assert len(packages) == 3
    for package in packages.values():
        first = build(package, tmp_path / "one").read_bytes()
        second = build(package, tmp_path / "two").read_bytes()
        assert first == second
        assert package.size_bytes < 1024 * 1024


@pytest.mark.parametrize("section,mutate", [
    ("manifest", lambda d: d.update(schema_version="2.0.0")),
    ("manifest", lambda d: d["files"].update(world="../../secret.json")),
    ("manifest", lambda d: d["capabilities"].append("unsupported.v1")),
    ("manifest", lambda d: d["assets"].append("core.missing")),
    ("manifest", lambda d: d["capabilities"].remove("bow.v1")),
    ("mission", lambda d: d.update(id="wrong")),
    ("world", lambda d: d["objects"].append(copy.deepcopy(d["objects"][0]))),
    ("world", lambda d: d["objects"][0].update(code="alert('unsafe')")),
    ("objectives", lambda d: d["objectives"][0].update(target="missing")),
    ("objectives", lambda d: d["objectives"][0].update(event="exec")),
    ("objectives", lambda d: d["objectives"][0].update(learning_goals=["missing"])),
    ("dialogue", lambda d: d["hints"][0].update(level=2)),
    ("mission", lambda d: d["stages"][0].update(objectives=["missing"])),
])
def test_invalid_schema_semantics_and_code_fields_are_rejected(content, section, mutate):
    edit(content, section, mutate)
    with pytest.raises(ContentError): catalog(content)


def test_symlinks_extra_files_size_and_duplicate_json_keys_are_rejected(content):
    path = content / "missions/physics_001_projectile"
    assets = read_json(content / "assets/catalog.json")
    extra = path / "run.py"; extra.write_text("print('unsafe')")
    with pytest.raises(ContentError): load_package(path, assets)
    extra.unlink()
    original = (path / "world.json").read_bytes()
    (path / "world.json").unlink(); (path / "world.json").symlink_to(content / "core/world.json")
    with pytest.raises(ContentError): load_package(path, assets)
    (path / "world.json").unlink(); (path / "world.json").write_bytes(b" " * (1024 * 1024 + 1))
    with pytest.raises(ContentError): load_package(path, assets)
    (path / "world.json").write_bytes(original)
    (path / "manifest.json").write_text('{"id":"a","id":"b"}')
    with pytest.raises(ContentError, match="Duplicate JSON key"): load_package(path, assets)


def test_dependencies_must_match_versions_and_be_acyclic(content):
    edit(content, "manifest", lambda d: d.update(dependencies=[{"id": "language_001_bridge", "version": "9.0.0"}]))
    with pytest.raises(ContentError, match="dependency"): catalog(content)
    edit(content, "manifest", lambda d: d.update(dependencies=[{"id": "language_001_bridge", "version": "1.0.0"}]))
    edit(content, "manifest", lambda d: d.update(dependencies=[{"id": "physics_001_projectile", "version": "1.0.0"}]), "language_001_bridge")
    with pytest.raises(ContentError, match="cycle"): catalog(content)


def test_atomic_reload_retains_last_good_and_pins_running_mission(content):
    current = catalog(content)
    old = current.packages["physics_001_projectile"]
    running = MissionRuntime(old)
    edit(content, "manifest", lambda d: d.update(title="New title"))
    assert not current.reload()
    assert "new package version" in current.error
    assert current.packages[old.ident] is old
    edit(content, "manifest", lambda d: d.update(version="1.1.0"))
    assert current.reload()
    assert current.packages[old.ident].version == "1.1.0"
    assert running.package.version == "1.0.0"
    # Copies returned to callers cannot mutate an installed package.
    mutable = old.data(); mutable["manifest"]["title"] = "altered"
    assert old.data()["manifest"]["title"] != "altered"
    state = running.dump()
    with pytest.raises(ValueError): MissionRuntime(current.packages[old.ident]).restore(state)


def test_duplicate_package_ids_are_rejected(content):
    shutil.copytree(content / "missions/physics_001_projectile", content / "missions/copy")
    with pytest.raises(ContentError, match="Duplicate package ID"): catalog(content)


def test_assets_cannot_introduce_scripts_or_mismatched_generators(content):
    assets = read_json(content / "assets/catalog.json")
    assets["core.target"]["url"] = "https://untrusted.example/model.js"
    with pytest.raises(ContentError): Catalog(content / "missions", assets)
    edit(content, "world", lambda d: d["objects"][1].update(asset="core.oracle"))
    with pytest.raises(ContentError, match="generator"): catalog(content)


def test_prerequisite_cycles_and_nonportable_inventory_are_rejected(content):
    edit(content, "manifest", lambda d: d.update(prerequisites=["physics_001_projectile"]))
    with pytest.raises(ContentError, match="cycle"): catalog(content)
    edit(content, "manifest", lambda d: d.update(prerequisites=[]))
    edit(content, "objectives", lambda d: d["objectives"][0].update(requires_items=["wind"]))
    with pytest.raises(ContentError, match="collectible"): catalog(content)
