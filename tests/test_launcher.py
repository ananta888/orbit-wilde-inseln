import asyncio
import importlib.util
from pathlib import Path


spec = importlib.util.spec_from_file_location("tcp_relay", Path(__file__).parents[1] / "tools/tcp_relay.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Relay = module.Relay


def test_relay_preserves_bytes_and_response_after_half_close():
    async def run():
        async def respond(reader, writer):
            received = await reader.read()
            writer.write(received[::-1]); await writer.drain()
            writer.close(); await writer.wait_closed()
        upstream = await asyncio.start_server(respond, "127.0.0.1", 0)
        relay = Relay(upstream.sockets[0].getsockname()[1])
        server = await asyncio.start_server(relay.connect, "127.0.0.1", 0)
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", server.sockets[0].getsockname()[1])
            data = bytes(range(256)) * 1024
            writer.write(data); await writer.drain(); writer.write_eof()
            assert await asyncio.wait_for(reader.read(), 3) == data[::-1]
            writer.close(); await writer.wait_closed()
        finally:
            server.close(); upstream.close()
            await server.wait_closed(); await upstream.wait_closed(); await relay.close()
        assert not relay.connections
    asyncio.run(run())


def test_relay_caps_connections_and_shutdown_releases_active_sockets():
    async def run():
        writers = []
        async def hold(reader, writer):
            writers.append(writer)
            await reader.read()
            writer.close(); await writer.wait_closed()
        upstream = await asyncio.start_server(hold, "127.0.0.1", 0)
        relay = Relay(upstream.sockets[0].getsockname()[1], limit=1)
        server = await asyncio.start_server(relay.connect, "127.0.0.1", 0)
        clients = []
        try:
            port = server.sockets[0].getsockname()[1]
            first = await asyncio.open_connection("127.0.0.1", port); clients.append(first)
            async with asyncio.timeout(2):
                while not writers: await asyncio.sleep(.001)
            second = await asyncio.open_connection("127.0.0.1", port); clients.append(second)
            assert await asyncio.wait_for(second[0].read(), 2) == b""
            assert len(relay.connections) == 1
            await asyncio.wait_for(relay.close(), 2)
            assert not relay.connections
            assert await asyncio.wait_for(first[0].read(), 2) == b""
        finally:
            for _, writer in clients:
                writer.close(); await writer.wait_closed()
            server.close(); upstream.close()
            await server.wait_closed(); await upstream.wait_closed(); await relay.close()
    asyncio.run(run())
