"""Bounded TCP relay: TLS terminates in Orbit, never in this Windows bridge."""
from __future__ import annotations

import argparse
import asyncio
import json
import logging

LOG = logging.getLogger(__name__)


class Relay:
    def __init__(self, upstream_port: int, *, limit: int = 128, idle_timeout: float = 120.):
        self.upstream_port = upstream_port
        self.limit, self.idle_timeout = limit, idle_timeout
        self.connections: set[asyncio.Task] = set()

    async def copy(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        while data := await asyncio.wait_for(reader.read(65536), self.idle_timeout):
            writer.write(data)
            await asyncio.wait_for(writer.drain(), self.idle_timeout)
        if writer.can_write_eof():
            writer.write_eof()
            await writer.drain()

    async def connect(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        task = asyncio.current_task()
        if task is None or len(self.connections) >= self.limit:
            writer.close()
            return
        self.connections.add(task)
        upstream_writer = None
        transfers: list[asyncio.Task] = []
        try:
            upstream_reader, upstream_writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", self.upstream_port), 5.)
            transfers = [asyncio.create_task(self.copy(reader, upstream_writer)),
                         asyncio.create_task(self.copy(upstream_reader, writer))]
            await asyncio.gather(*transfers)
        except (OSError, TimeoutError):
            LOG.debug("relay_connection_closed")
        finally:
            for transfer in transfers: transfer.cancel()
            for stream in (writer, upstream_writer):
                if stream is not None: stream.close()
            try:
                await asyncio.gather(*transfers, return_exceptions=True)
                for stream in (writer, upstream_writer):
                    if stream is not None:
                        try: await asyncio.wait_for(stream.wait_closed(), 2.)
                        except (OSError, TimeoutError): pass
            finally:
                self.connections.discard(task)

    async def close(self) -> None:
        tasks = tuple(self.connections)
        for task in tasks: task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


async def serve(host: str, port: int, upstream_port: int) -> None:
    relay = Relay(upstream_port)
    server = await asyncio.start_server(relay.connect, host, port)
    print(json.dumps({"event": "orbit_tls_relay_ready", "host": host, "port": port,
                      "upstream_port": upstream_port}), flush=True)
    try:
        async with server: await server.serve_forever()
    finally:
        await relay.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8443)
    parser.add_argument("--upstream-port", type=int, default=8444)
    args = parser.parse_args()
    if not all(1024 <= p <= 65535 for p in (args.port, args.upstream_port)) or args.port == args.upstream_port:
        parser.error("Use two different unprivileged ports")
    try: asyncio.run(serve(args.host, args.port, args.upstream_port))
    except KeyboardInterrupt: pass


if __name__ == "__main__": main()
