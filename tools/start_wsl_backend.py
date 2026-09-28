"""Start or reuse only this checkout's explicitly managed WSL HTTPS backend."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def healthy(port: int, certificate: Path) -> bool:
    try:
        context = ssl.create_default_context(cafile=str(certificate))
        with urllib.request.urlopen(f"https://localhost:{port}/health", context=context, timeout=2) as response:
            health = json.load(response)
        return health.get("app") == "orbit-wilde-inseln" and health.get("protocol") == 4
    except (OSError, ValueError, urllib.error.URLError):
        return False


def owned_process(pid: int, command: list[str]) -> bool:
    try:
        actual = Path(f"/proc/{pid}/cmdline").read_bytes().rstrip(b"\0").split(b"\0")
        return [os.fsdecode(value) for value in actual] == command
    except OSError:
        return False


def check_port_available(port: int) -> None:
    # Match asyncio's Unix TCP server: closed connections in TIME_WAIT must not
    # block a restart. SO_REUSEADDR alone never shares an active listening socket.
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try: probe.bind(("127.0.0.1", port))
        except OSError as error:
            raise ValueError(f"WSL-Port {port} belegt; den zugehoerigen Dienst zuerst beenden.") from error


def start(port: int, certificate: Path, key: Path, data: Path, urls: list[str]) -> int:
    python = ROOT / ".venv/bin/python"
    if not python.is_file(): raise ValueError("Im WSL-Checkout zuerst die .venv laut README einrichten.")
    if not certificate.is_file() or not key.is_file(): raise ValueError("Lokales HTTPS-Zertifikat oder Schluessel fehlt.")
    local = ROOT / ".local"
    local.mkdir(exist_ok=True)
    state_path = local / f"wsl-{port}.json"
    command = [str(python), "-u", str(ROOT / "tools/run-local.py"), "--host", "127.0.0.1",
               "--port", str(port), "--cert", str(certificate), "--key", str(key), "--data-dir", str(data)]
    for url in urls: command.extend(["--url", url])
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state.get("command") == command and owned_process(state["pid"], command) and healthy(port, certificate):
            return int(state["pid"])
    # Never replace a foreign listener, even if it happens to report Orbit health.
    check_port_available(port)
    with (local / f"wsl-{port}.log").open("ab") as log:
        process = subprocess.Popen(command, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                   start_new_session=True, close_fds=True)
    try:
        deadline = time.monotonic() + 30
        while process.poll() is None and time.monotonic() < deadline:
            if healthy(port, certificate):
                state_path.write_text(json.dumps({"pid": process.pid, "command": command}))
                state_path.chmod(0o600)
                return process.pid
            time.sleep(.2)
        raise ValueError(f"WSL-HTTPS-Start fehlgeschlagen; siehe .local/wsl-{port}.log.")
    except BaseException:
        if process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8444)
    parser.add_argument("--cert", type=Path, default=ROOT / ".local/cert.pem")
    parser.add_argument("--key", type=Path, default=ROOT / ".local/key.pem")
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".local")
    parser.add_argument("--url", action="append", default=[])
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535: parser.error("Use an unprivileged port")
    try: pid = start(args.port, args.cert.resolve(), args.key.resolve(), args.data_dir.resolve(), args.url)
    except (OSError, ValueError) as error: parser.exit(1, str(error) + "\n")
    print(json.dumps({"app": "orbit-wilde-inseln", "backend_pid": pid, "port": args.port}))


if __name__ == "__main__": main()
