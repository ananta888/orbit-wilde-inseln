import argparse
import json
import logging
import os
from pathlib import Path
import ssl

from aiohttp import web
from orbit_server.networking.http import make_app
from orbit_server.paths import ROOT


class JsonLog(logging.Formatter):
    def format(self, record):
        result = {"level": record.levelname, "logger": record.name, "event": record.getMessage()}
        if hasattr(record, "revision"): result["revision"] = record.revision
        if record.exc_info: result["exception"] = self.formatException(record.exc_info)
        return json.dumps(result, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(description="Orbit – Wilde Inseln")
    parser.add_argument("--host", default=os.getenv("ORBIT_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("ORBIT_PORT", "8443")))
    parser.add_argument("--http", action="store_true", help="Local desktop testing; Quest requires HTTPS")
    parser.add_argument("--cert", type=Path)
    parser.add_argument("--key", type=Path)
    parser.add_argument("--url", action="append", default=[], help="Display this HTTPS LAN URL in the client")
    parser.add_argument("--world", type=Path, default=ROOT / "content/core/world.json")
    parser.add_argument("--content", type=Path, default=ROOT / "content")
    parser.add_argument("--data-dir", type=Path, default=Path(os.getenv("ORBIT_DATA_DIR", ROOT / ".local")))
    args = parser.parse_args()
    if not args.http and not (args.cert and args.key): parser.error("Use --http for local testing or supply --cert and --key for Quest HTTPS")
    context = None
    if not args.http:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(args.cert, args.key)
    handler = logging.StreamHandler(); handler.setFormatter(JsonLog())
    logging.basicConfig(level=logging.INFO, handlers=[handler])
    logging.info("Orbit listening on %s:%s (%s)", args.host, args.port, "http" if args.http else "https")
    web.run_app(make_app(args.url, args.world, content_root=args.content, data_path=args.data_dir / "orbit.sqlite3"),
                host=args.host, port=args.port, ssl_context=context, print=None, access_log=None)


if __name__ == "__main__": main()
