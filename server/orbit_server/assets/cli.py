"""Headless access to the same resolver service and versioned tool schemas."""
import argparse
import asyncio
import json
from pathlib import Path
import sys

from .contracts import AssetError
from .service import Resolver


def main():
    parser = argparse.ArgumentParser(description='Orbit Open Asset Resolver')
    parser.add_argument('--data-dir', type=Path, default=Path('.local/assets'))
    parser.add_argument('--owner', default='cli', help='Local catalog namespace; HTTP uses the browser profile')
    commands = parser.add_subparsers(dest='command', required=True)
    tool = commands.add_parser('tool', help='Invoke any versioned tool without an LLM')
    tool.add_argument('name'); tool.add_argument('--arguments', type=Path, help='JSON file; stdin if omitted')
    upload = commands.add_parser('upload')
    upload.add_argument('file', type=Path); upload.add_argument('--metadata', type=Path, required=True)
    upload.add_argument('--profile', default='quest3-balanced')
    commands.add_parser('capabilities')
    args = parser.parse_args()

    async def run():
        resolver = Resolver(args.data_dir)
        await resolver.start()
        try:
            if args.command == 'capabilities': return resolver.capabilities()
            if args.command == 'upload':
                from .profiles import PROFILES
                if args.profile not in PROFILES: raise AssetError('Unknown optimization profile')
                from .contracts import MAX_SOURCE
                if args.file.stat().st_size > MAX_SOURCE: raise AssetError('Source exceeds byte budget')
                return await resolver.upload(args.owner, args.file.name, args.file.read_bytes(),
                                              json.loads(args.metadata.read_text()), profile=args.profile)
            raw = args.arguments.read_text() if args.arguments else sys.stdin.read(65537)
            if len(raw) > 65536: raise AssetError('Tool argument budget')
            return await resolver.tool(args.owner, args.name, json.loads(raw))
        finally: await resolver.close()
    try: print(json.dumps(asyncio.run(run()), ensure_ascii=False, indent=2))
    except (AssetError, OSError, ValueError) as error:
        print(json.dumps({'error': {'code': getattr(error, 'code', 'invalid'), 'message': str(error)}}), file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == '__main__': main()
