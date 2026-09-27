import asyncio
import unittest

from aiohttp import WSMsgType, WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer
import pytest

pytest.importorskip("numpy")
pytest.importorskip("trimesh")
pytest.importorskip("manifold3d")
from orbit_server.networking.http import make_app


class DesignProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = TestClient(TestServer(make_app()))
        await self.client.start_server()
        await self.client.get("/api/design/catalog")
        self.origin = str(self.client.make_url("/")).rstrip("/")

    async def asyncTearDown(self):
        await self.client.close()

    async def socket(self):
        socket = await self.client.ws_connect("/api/design/ws", headers={"Origin": self.origin})
        self.assertEqual((await socket.receive_json())["protocol"], 1)
        return socket

    async def document(self, socket):
        metadata = None; frames = []
        async with asyncio.timeout(15):
            while True:
                message = await socket.receive()
                if message.type == WSMsgType.BINARY: frames.append(message.data)
                elif message.type == WSMsgType.TEXT:
                    value = message.json()
                    if value["type"] == "error": self.fail(value["message"])
                    if value["type"] == "document": metadata = value
                    if value["type"] == "committed":
                        self.assertEqual(len(frames), metadata["frames"])
                        return metadata, frames
                else: self.fail("Unexpected socket closure")

    async def test_origin_leases_cas_and_reconnect(self):
        with self.assertRaises(WSServerHandshakeError):
            await self.client.ws_connect("/api/design/ws", headers={"Origin": "https://wrong.example"})
        socket = await self.socket()
        await socket.send_json({"type": "new", "template": "dragon"})
        meta, initial = await self.document(socket)
        ident = meta["document"]["id"]
        rival = await self.socket()
        await rival.send_json({"type": "open", "id": ident})
        self.assertEqual((await rival.receive_json())["code"], "conflict")
        command = {"type": "command", "command_id": "stroke_1", "asset_id": ident, "base_revision": 0,
                   "operation": {"tool": "pull", "regions": ["head"], "samples": [[0, 1.8, -1.6]],
                                 "radius": .5, "strength": .5}}
        await socket.send_json(command)
        edited, delta = await self.document(socket)
        self.assertEqual(edited["document"]["revision"], 1)
        self.assertLess(sum(map(len, delta)), sum(map(len, initial)) // 5)
        await socket.send_json(command)
        self.assertTrue((await socket.receive_json())["duplicate"])
        await socket.send_json(command | {"command_id": "stale"})
        self.assertEqual((await socket.receive_json())["code"], "conflict")
        await socket.close()
        await asyncio.sleep(.05)
        await rival.send_json({"type": "open", "id": ident})
        reopened, _ = await self.document(rival)
        self.assertEqual(reopened["document"]["revision"], 1)
        await rival.close()

    async def test_editor_keeps_game_running_and_accepts_ai_once_with_undo(self):
        game = await self.client.ws_connect('/ws', headers={'Origin': self.origin})
        await game.send_json({'type': 'start'})
        async def game_packet(kind):
            async with asyncio.timeout(5):
                while True:
                    packet = await game.receive_json()
                    if packet['type'] == kind: return packet
        await game_packet('state')
        socket = await self.socket(); await socket.send_json({'type':'new', 'template':'dragon'})
        initial, _ = await self.document(socket); ident = initial['document']['id']
        self.assertEqual((await self.client.get('/designer/index.html')).status, 200)
        await socket.send_json({'type':'proposal', 'instruction':'Glätte den Kopf', 'regions':['head'], 'base_revision':0})
        proposal = await socket.receive_json()
        self.assertEqual(proposal['source'], 'local-command-parser')
        self.assertTrue(proposal['blendable'])
        while True:
            message = await socket.receive()
            if message.type == WSMsgType.TEXT and message.json()['type'] == 'preview_ready': break
        self.assertEqual((await self.client.get('/api/design/assets/' + ident)).status, 200)
        before = await (await self.client.get('/api/design/assets/' + ident)).json()
        self.assertEqual(before['revision'], 0, 'preview must not autosave proposed changes')
        command = {'type':'accept_proposal', 'command_id':'accept_half', 'asset_id':ident,
                   'base_revision':0, 'proposal_id':proposal['id'], 'blend':.5}
        await socket.send_json(command); committed, _ = await self.document(socket)
        self.assertEqual(committed['document']['revision'], 1)
        await socket.send_json(command); self.assertTrue((await socket.receive_json())['duplicate'])
        await socket.send_json({'type':'undo', 'command_id':'undo_ai', 'asset_id':ident, 'base_revision':1})
        await self.document(socket)
        after = await (await self.client.get('/api/design/assets/' + ident)).json()
        self.assertEqual(before['regions'], after['regions'])
        report = await (await self.client.get('/api/design/assets/' + ident + '/analysis')).json()
        self.assertEqual(report['revision'], 2)
        await game.send_json({'type':'ping','time':7})
        self.assertEqual((await game_packet('pong'))['echo'], 7)
        self.assertEqual((await game_packet('state'))['phase'], 'playing')
        await socket.close(); await game.close()
