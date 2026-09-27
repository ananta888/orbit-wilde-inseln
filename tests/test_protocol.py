import asyncio
import json
from pathlib import Path
import tempfile
import unittest

from orbit_server.networking.http import make_app
from orbit_server.world.environment import DEFAULT_PATH
from aiohttp import WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer


class ProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.world_path = Path(self.temp.name) / 'scene.json'
        self.data = json.loads(DEFAULT_PATH.read_text(encoding='utf-8'))
        self.world_path.write_text(json.dumps(self.data), encoding='utf-8')
        self.client = TestClient(TestServer(make_app(world_path=self.world_path)))
        await self.client.start_server()
        self.origin = str(self.client.make_url('/')).rstrip('/')

    async def asyncTearDown(self):
        await self.client.close()
        self.temp.cleanup()

    async def packet(self, socket, predicate):
        async with asyncio.timeout(3):
            while True:
                message = await socket.receive_json()
                if predicate(message):
                    return message

    async def test_live_protocol_and_malformed_input(self):
        socket = await self.client.ws_connect('/ws', headers={'Origin': self.origin})
        hello = await socket.receive_json()
        self.assertEqual(hello['simulation'], 'Framework / Python')
        state = await self.packet(socket, lambda item: item['type'] == 'state')
        next_state = await self.packet(socket, lambda item: item['type'] == 'state' and item['tick'] > state['tick'])
        self.assertNotEqual(state['creatures'], next_state['creatures'])
        await socket.send_str('{invalid json')
        self.assertEqual((await self.packet(socket, lambda item: item['type'] == 'error'))['type'], 'error')
        await socket.send_json({'type': 'start'})
        await self.packet(socket, lambda item: item['type'] == 'state' and item['phase'] == 'playing')
        await socket.send_json({'type': 'pause'})
        paused = await self.packet(socket, lambda item: item['type'] == 'state' and item['phase'] == 'paused')
        await socket.send_json({'type': 'ping', 'time': 123.45})
        self.assertEqual((await self.packet(socket, lambda item: item['type'] == 'pong'))['echo'], 123.45)
        another = await self.packet(socket, lambda item: item['type'] == 'state')
        self.assertEqual(paused['tick'], another['tick'])
        self.assertEqual(paused['remaining'], another['remaining'])
        await socket.close()

    async def test_foreign_website_cannot_open_socket(self):
        with self.assertRaises(WSServerHandshakeError) as raised:
            await self.client.ws_connect('/ws', headers={'Origin': 'https://unrelated.example'})
        self.assertEqual(raised.exception.status, 403)

    async def test_flight_packets_acknowledge_height_and_gradual_landing(self):
        socket = await self.client.ws_connect('/ws', headers={'Origin': self.origin})
        await socket.send_json({'type': 'start'})
        before = await self.packet(socket, lambda p: p['type'] == 'state' and p['phase'] == 'playing')
        await socket.send_json({'type': 'move', 'direction': [0, 1, 0], 'dt': .1, 'seq': 1, 'flight': True})
        flight = await self.packet(socket, lambda p: p['type'] == 'state' and p['moveAck'] == 1)
        self.assertEqual(flight['locomotion'], 'fly')
        self.assertGreater(flight['player'][1], before['player'][1])
        self.assertLess(flight['player'][1] - before['player'][1], .3)
        self.assertGreater(flight['velocity'][1], 0)
        await socket.send_json({'type': 'move', 'direction': [0, 0, 0], 'dt': .05, 'seq': 2, 'flight': False})
        landing = await self.packet(socket, lambda p: p['type'] == 'state' and p['moveAck'] == 2)
        self.assertEqual(landing['locomotion'], 'landing')
        self.assertLess(landing['velocity'][1], flight['velocity'][1], 'Landing brakes the upward momentum first')
        self.assertGreater(landing['player'][1], before['player'][1])
        await socket.close()

    async def test_world_edit_reaches_live_clients_and_reconnect_without_reset(self):
        sockets = [await self.client.ws_connect('/ws', headers={'Origin': self.origin}) for _ in range(2)]
        initial = await self.packet(sockets[0], lambda p: p['type'] == 'environment')
        await self.packet(sockets[1], lambda p: p['type'] == 'environment')
        await sockets[0].send_json({'type': 'start'})
        await self.packet(sockets[0], lambda p: p['type'] == 'state' and p['phase'] == 'playing')
        self.data['title'] = 'Live geändert'
        self.data['objects'] = [{'id': 'live-tree', 'kind': 'box', 'position': [3, 4, -6], 'color': '#ffcc00'}]
        self.data['rules']['targetSpeed'] = 0
        self.world_path.write_text(json.dumps(self.data), encoding='utf-8')
        for socket in sockets:
            packet = await self.packet(socket, lambda p: p['type'] == 'environment' and p['revision'] > initial['revision'])
            self.assertEqual(packet['title'], 'Live geändert')
            self.assertIn('authored-0', [c['id'] for c in packet['upsert']])
        state = await self.packet(sockets[0], lambda p: p['type'] == 'state')
        self.assertEqual(state['phase'], 'playing', 'File updates must not reset the game')
        reconnect = await self.client.ws_connect('/ws', headers={'Origin': self.origin})
        full = await self.packet(reconnect, lambda p: p['type'] == 'environment')
        self.assertTrue(full['full'])
        self.assertEqual(full['title'], 'Live geändert')
        self.assertIn('authored-0', [c['id'] for c in full['upsert']])
        for socket in [*sockets, reconnect]:
            await socket.close()

    async def test_only_public_assets_are_served(self):
        for path in ('/.local/key.pem', '/network/simulation.py', '/tools/run-hybrid.ps1', '/%2e%2e/.local/key.pem', '/vendor/'):
            with self.subTest(path=path):
                response = await self.client.get(path)
                self.assertEqual(response.status, 404)
        self.assertEqual((await self.client.get('/')).status, 200)
        response = await self.client.get('/src/app.js')
        self.assertIn('javascript', response.headers['Content-Type'])


if __name__ == '__main__':
    unittest.main()
