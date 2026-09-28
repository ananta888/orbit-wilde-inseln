"""Killable offline import workers; no commands or programs supplied by content."""
from __future__ import annotations
import asyncio
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import zipfile
from typing import Any

from .contracts import AssetError, MAX_CANONICAL, MAX_EXPANDED, ROOT, canonical
from .profiles import PROFILES, performance
from .safety import safe_name, unpack


class Pipeline:
    def __init__(self, work: Path, *, timeout: float = 90):
        self.work, self.timeout = work, timeout
        self.jobs: set[asyncio.Task] = set()
        self.closed = False
        configured = os.environ.get("ORBIT_NODE") or shutil.which("node")
        self.node = str(Path(configured).resolve()) if configured and Path(configured).is_file() else None
        self.sandbox = shutil.which("bwrap") if sys.platform == "linux" else None

    def capabilities(self) -> dict:
        available = bool(self.node and (ROOT / "node_modules/@gltf-transform/core").is_dir())
        return {"available": available, "formats": ["glb", "gltf", "obj", "stl", "zip"] if available else [],
                "fbx": False, "blend": False, "retargeting": "explicit-compatible-rotation-map",
                "optimization": "protected-rig-morph-topology", "profiles": PROFILES,
                "isolation": "linux-namespaces-and-node-permissions" if self.sandbox else "node-permissions",
                "networkIsolation": bool(self.sandbox)}

    async def close(self) -> None:
        self.closed = True
        for task in tuple(self.jobs): task.cancel()
        await asyncio.gather(*tuple(self.jobs), return_exceptions=True)

    async def run(self, files: dict[str, bytes], entry: str, *, kind: str = "model", profile: str | None = None,
                  normalize: dict | None = None, retarget: dict | None = None, license: dict | None = None,
                  source_licenses: list[dict] | None = None) -> tuple[bytes, dict]:
        if not self.capabilities()["available"]: raise AssetError("Node 22+ und npm ci für Assetimporte erforderlich", "unavailable")
        if self.closed or len(self.jobs) >= 2: raise AssetError("Assetprozessor ausgelastet", "busy")
        task = asyncio.current_task()
        assert task is not None
        self.jobs.add(task)
        try:
            with tempfile.TemporaryDirectory(prefix="import-", dir=self.work) as directory:
                folder = Path(directory)
                await asyncio.to_thread(self.prepare, folder, files)
                if not entry.lower().endswith(".zip"): safe_name(entry)
                if kind == "model" and (entry.lower().endswith(".zip") or not (folder / entry).is_file()):
                    candidates = [p for p in folder.rglob("*") if p.suffix.lower() in {".glb", ".gltf", ".obj", ".stl", ".fbx", ".blend"}]
                    if len(candidates) != 1:
                        raise AssetError("Paket enthält mehrere Modelle; einen eindeutigen Einstiegspunkt wählen", "entry_required")
                    entry = str(candidates[0].relative_to(folder))
                options: dict[str, Any] = {"entry": entry, "kind": kind, "normalize": normalize or {"scale": 1, "up": "Y"}}
                if profile: options["profile"] = PROFILES[profile]
                if retarget: options["retarget"] = retarget
                if license: options["license"] = license
                if source_licenses: options["sourceLicenses"] = source_licenses
                (folder / "job.json").write_bytes(canonical(options))
                assert self.node is not None
                # Node permissions constrain FS, child processes and worker threads.
                # They do NOT block network in Node 24; bwrap supplies that boundary.
                # Native sharp is pinned; image pixel/byte limits are checked separately.
                command = [self.node, "--max-old-space-size=512", "--permission", "--allow-addons",
                           "--allow-fs-read=" + str(ROOT / "node_modules"),
                           "--allow-fs-read=" + str(ROOT / "tools/assets"),
                           "--allow-fs-read=" + str(folder), "--allow-fs-write=" + str(folder),
                           str(ROOT / "tools/assets/resolver-worker.mjs")]
                if self.sandbox:
                    isolation = [self.sandbox, "--unshare-all", "--die-with-parent", "--new-session", "--tmpfs", "/tmp",
                                 "--proc", "/proc", "--dev", "/dev"]
                    for system in ("/usr", "/lib", "/lib64"):
                        if Path(system).exists(): isolation += ["--ro-bind", system, system]
                    for path in (Path(self.node).resolve().parent, ROOT / "node_modules", ROOT / "tools/assets"):
                        isolation += ["--ro-bind", str(path), str(path)]
                    command = isolation + ["--bind", str(folder), str(folder), "--chdir", str(folder), "--", *command]
                env = {key: value for key, value in os.environ.items() if key in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "LD_LIBRARY_PATH"}}
                process = await asyncio.create_subprocess_exec(*command, cwd=folder, env=env,
                                                              stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE)
                try:
                    _, stderr = await asyncio.wait_for(process.communicate(), self.timeout)
                    if process.returncode:
                        raise AssetError("Assetprüfung fehlgeschlagen: " + stderr.decode(errors="replace")[-1800:], "conversion")
                except TimeoutError as error:
                    raise AssetError("Assetauftrag überschreitet Zeitbudget", "timeout") from error
                finally:
                    if process.returncode is None:
                        process.kill(); await process.wait()
                output = folder / "output.glb", folder / "report.json"
                if output[0].stat().st_size > MAX_CANONICAL or output[1].stat().st_size > 2 * 1024**2:
                    raise AssetError("Assetergebnis überschreitet Budget", "budget")
                data, report = output[0].read_bytes(), json.loads(output[1].read_text())
                report["performance"] = performance(report)
                return data, report
        finally: self.jobs.discard(task)

    @staticmethod
    def prepare(folder: Path, files: dict[str, bytes]) -> None:
        if len(files) > 512 or sum(map(len, files.values())) > MAX_EXPANDED: raise AssetError("Paketbudget", "budget")
        total = 0
        for name, data in files.items():
            if name.lower().endswith(".zip"):
                # Archives are read from a private temporary path, not an attacker-supplied path.
                archive = folder / "_source.zip"
                archive.write_bytes(data)
                try: unpack(archive, folder)
                except zipfile.BadZipFile as error: raise AssetError("Ungültiges oder beschädigtes ZIP", "archive") from error
                finally: archive.unlink(missing_ok=True)
            else:
                target = folder / safe_name(name); target.parent.mkdir(parents=True, exist_ok=True)
                with target.open("xb") as output: output.write(data)
            total = sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())
            if total > MAX_EXPANDED: raise AssetError("Paketbudget", "budget")
