import asyncio
import unittest

from aiohttp import WSServerHandshakeError
from aiohttp.test_utils import TestClient, TestServer
from orbit_server.networking.http import make_app


class FoundationProtocolTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = TestClient(TestServer(make_app()))
        await self.client.start_server()
        self.origin = str(self.client.make_url("/")).rstrip("/")
        await self.client.get("/")

    async def asyncTearDown(self): await self.client.close()

    async def packet(self, socket, predicate):
        async with asyncio.timeout(4):
            while True:
                packet = await socket.receive_json()
                if predicate(packet): return packet

    async def test_mission_reconnect_settings_and_rejected_fake_completion(self):
        ws = await self.client.ws_connect("/ws", headers={"Origin": self.origin})
        self.assertEqual((await ws.receive_json())["protocol"], 4)
        await ws.send_json({"type": "start"})
        await ws.send_json({"type": "mission_start", "id": "language_001_bridge"})
        await self.packet(ws, lambda p: p["type"] == "mission" and p["active"])
        await ws.send_json({"type": "interact", "target": "traveler", "verb": "observe"})
        state = await self.packet(ws, lambda p: p["type"] == "mission" and p["active"]["phase"] == "movement")
        self.assertFalse(state["active"]["complete"])
        for bad in [{"type": "mission_complete"}, {"type": "hit", "target": "practice"}, {"type": "move", "direction": [float("nan"), 0], "dt": .1, "seq": 1}]:
            await ws.send_json(bad)
            await self.packet(ws, lambda p: p["type"] == "error")
        await ws.send_json({"type": "hint", "level": 4})
        await self.packet(ws, lambda p: p["type"] == "error")
        await ws.send_json({"type": "hint", "level": 4, "full_help": True})
        hint = await self.packet(ws, lambda p: p["type"] == "oracle")
        self.assertEqual(hint["hint_level"], 4)
        await ws.send_json({"type": "settings", "fitness": "seated", "difficulty": 1, "adaptive": False})
        await self.packet(ws, lambda p: p["type"] == "mission" and p["settings"]["fitness"] == "seated")
        with self.assertRaises(WSServerHandshakeError): await self.client.ws_connect("/ws", headers={"Origin": self.origin})
        await ws.close()
        # Closing the socket lets its handler commit the profile before reopening.
        await asyncio.sleep(.1)
        ws = await self.client.ws_connect("/ws", headers={"Origin": self.origin})
        state = await self.packet(ws, lambda p: p["type"] == "mission")
        self.assertEqual(state["active"]["phase"], "movement")
        self.assertEqual(state["settings"]["fitness"], "seated")
        await ws.close()

    async def test_asr_requires_same_origin_and_size_bound(self):
        self.assertEqual((await self.client.post("/api/dragon/transcribe", data=b"x")).status, 403)
        response = await self.client.post("/api/dragon/transcribe", data=b"x" * (2 * 1024 * 1024 + 1), headers={"Origin": self.origin})
        self.assertEqual(response.status, 413)
