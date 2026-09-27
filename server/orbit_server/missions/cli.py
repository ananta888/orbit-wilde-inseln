"""Validate source packages and produce reproducible archives; no archive execution."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

from orbit_server.missions.packages import Catalog, Package, SECTIONS
from orbit_server.missions.schema import read_json
from orbit_server.paths import ROOT


def build(package: Package, destination: Path) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    path = destination / f"{package.ident}-{package.version}.orbit.zip"
    data = package.data()
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for section in sorted(SECTIONS):
            info = zipfile.ZipInfo(f"{section}.json", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, json.dumps(data[section], sort_keys=True, ensure_ascii=False, indent=2) + "\n")
    report = {"id": package.ident, "version": package.version, "content_sha256": package.digest,
              "archive_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "source_bytes": package.size_bytes,
              "archive_bytes": path.stat().st_size, "shared_assets": data["manifest"]["assets"]}
    path.with_suffix(path.suffix + ".json").write_text(json.dumps(report, indent=2) + "\n")
    return path


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Validate declarative Orbit packages")
    parser.add_argument("command", choices=["validate", "build"], nargs="?", default="validate")
    parser.add_argument("--content", type=Path, default=ROOT / "content")
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "packages")
    args = parser.parse_args(argv)
    try:
        catalog = Catalog(args.content / "missions", read_json(args.content / "assets" / "catalog.json"))
        catalog.apply(catalog.prepare())
        for package in catalog.packages.values():
            print(f"{package.ident}@{package.version}: {package.size_bytes} bytes, sha256={package.digest}")
            if args.command == "build": print(build(package, args.output))
    except (ValueError, OSError) as exc:
        parser.exit(1, f"Content invalid: {exc}\n")
    return 0


if __name__ == "__main__": raise SystemExit(main())
