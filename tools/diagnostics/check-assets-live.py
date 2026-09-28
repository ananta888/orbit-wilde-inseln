"""Opt-in public-provider integration. Never called by unattended tests or CI."""
import argparse
import asyncio
import json
from pathlib import Path

from orbit_server.assets.service import Resolver


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asset', default='polyhaven:wooden_stool_01')
    parser.add_argument('--query', default='wooden stool')
    parser.add_argument('--data-dir', type=Path, default=Path('.local/assets-live-diagnostic'))
    args=parser.parse_args()
    async def run():
        resolver=Resolver(args.data_dir);await resolver.start()
        try:
            search=await resolver.tool('diagnostic','search_assets',{'query':args.query,'providers':[args.asset.split(':')[0]],'limit':3})
            imported=await resolver.tool('diagnostic','import_asset',{'id':args.asset,'profile':'quest3-balanced'})
            asset=imported['asset']
            return {'remote_search_results':[r['id'] for r in search['results']], 'errors':search['errors'],
                    'asset_id':asset['id'],'sha256':asset['sha256'],'license':asset['license'],
                    'geometry':asset['geometry'],'performance':asset['performance'],
                    'preview':resolver.descriptor('diagnostic',asset['id'])['url']}
        finally:await resolver.close()
    print(json.dumps(asyncio.run(run()),ensure_ascii=False,indent=2))


if __name__=='__main__':main()
