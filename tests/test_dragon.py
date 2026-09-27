import asyncio
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from orbit_server.ai.dragon import DragonBridge, DragonConversation


class FakeBridge:
    def __init__(self): self.requests = []; self.ready = asyncio.Event()
    async def decide(self, world, message, history):
        self.requests.append((message, list(history)))
        await self.ready.wait()
        return {'speech': 'Hallo ' + message, 'mood': 'calm', 'gesture': 'glide'}
    async def speak(self, text): return '/api/dragon/audio/synthetic'


class FakeSocket:
    closed = False
    def __init__(self): self.packets = []
    async def send_json(self, value): self.packets.append(value)


class DragonTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.bridge, self.socket = FakeBridge(), FakeSocket()
        self.world = SimpleNamespace(mode='vr', phase='playing', flying=True)
        self.chat = DragonConversation(self.bridge, self.socket, self.world)

    async def asyncTearDown(self):
        task = self.chat.task; self.chat.reset()
        if task:
            await asyncio.gather(task, return_exceptions=True)

    async def test_decision_does_not_block_and_user_reply_survives_an_inflight_answer(self):
        await self.chat.ask('eins'); await asyncio.sleep(0)
        self.assertEqual(self.socket.packets[0]['status'], 'thinking')
        await self.chat.ask('zwei'); await self.chat.ask('')
        self.bridge.ready.set()
        await self.chat.task
        if self.chat.task: await self.chat.task
        self.assertEqual([r[0] for r in self.bridge.requests], ['eins', 'zwei'])
        self.assertIn({'role': 'user', 'text': 'eins'}, self.bridge.requests[1][1])
        self.assertEqual([p['speech'] for p in self.socket.packets if p.get('status') == 'ready'], ['Hallo eins', 'Hallo zwei'])
        self.assertTrue(any(p['type'] == 'dragon_audio' for p in self.socket.packets))

    async def test_reset_cancels_old_dialogue_and_modes_gate_requests(self):
        await self.chat.ask('alt'); await asyncio.sleep(0)
        task = self.chat.task; self.chat.reset(); self.bridge.ready.set()
        await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(len(self.socket.packets), 1)
        self.assertEqual(self.chat.history, [])
        for field, value in [('mode', 'mr'), ('phase', 'paused'), ('flying', False)]:
            before = getattr(self.world, field); setattr(self.world, field, value)
            await self.chat.ask('blockiert')
            self.assertIsNone(self.chat.task)
            setattr(self.world, field, before)

    async def test_missing_configuration_is_reported_without_fake_model_reply(self):
        with tempfile.TemporaryDirectory() as folder:
            bridge = DragonBridge(Path(folder) / 'absent.json'); await bridge.start()
            try:
                with self.assertRaises(RuntimeError): await bridge.request('decide', data={})
            finally: await bridge.close()


if __name__ == '__main__': unittest.main()
