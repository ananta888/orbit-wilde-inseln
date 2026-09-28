import importlib.util
from pathlib import Path
import socket
import sys

import pytest


pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="WSL launcher uses Linux socket reuse semantics")

spec = importlib.util.spec_from_file_location(
    "start_wsl_backend", Path(__file__).parents[1] / "tools/start_wsl_backend.py"
)
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


def test_closed_connection_does_not_block_immediate_backend_restart():
    with socket.socket() as listener, socket.socket() as client:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.settimeout(2); client.settimeout(2)
        listener.bind(("127.0.0.1", 0)); listener.listen()
        address = listener.getsockname()
        client.connect(address)
        connection, _ = listener.accept()
        with connection:
            connection.settimeout(2)
            # The server closes first, leaving its port in TIME_WAIT after FIN/ACK.
            connection.shutdown(socket.SHUT_WR)
            assert client.recv(1) == b""
            client.close()
            assert connection.recv(1) == b""
    with socket.socket() as old_probe, pytest.raises(OSError):
        old_probe.bind(address)
    backend.check_port_available(address[1])


def test_active_foreign_listener_is_rejected_and_remains_usable():
    with socket.socket() as listener, socket.socket() as client:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.settimeout(2); client.settimeout(2)
        listener.bind(("127.0.0.1", 0)); listener.listen()
        address = listener.getsockname()
        with pytest.raises(ValueError, match="belegt"):
            backend.check_port_available(address[1])
        client.connect(address)
        connection, _ = listener.accept()
        with connection:
            connection.settimeout(2)
            connection.sendall(b"still running")
            assert client.recv(32) == b"still running"
