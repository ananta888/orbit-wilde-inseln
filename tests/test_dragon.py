import asyncio
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

from orbit_server.ai.dragon import DragonBridge, DragonConversation
from orbit_server.ai.context import build_context
from orbit_server.networking.http import Service


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
        for value in ['ready', 'paused', 'ended']:
            field = 'phase'
            before = getattr(self.world, field); setattr(self.world, field, value)
            await self.chat.ask('blockiert')
            self.assertIsNone(self.chat.task)
            setattr(self.world, field, before)

    async def test_ground_and_mixed_reality_conversations_reach_the_provider(self):
        self.bridge.ready.set()
        for mode, flying in [('vr', False), ('mr', False), ('vr', True)]:
            self.world.mode, self.world.flying = mode, flying
            await self.chat.ask(mode)
            await self.chat.task
            self.assertEqual(self.socket.packets[-2]['speech'], 'Hallo ' + mode)
            self.assertEqual(self.socket.packets[-1]['type'], 'dragon_audio')
        self.assertEqual(len(self.bridge.requests), 3)

    async def test_phase_change_during_generation_discards_text_history_and_audio(self):
        await self.chat.ask('alt'); await asyncio.sleep(0)
        self.world.phase = 'paused'; self.bridge.ready.set()
        await self.chat.task
        self.assertEqual(len(self.socket.packets), 1)
        self.assertEqual(self.chat.history, [])

    async def test_slow_audio_is_discarded_after_pause(self):
        speaking, finished = asyncio.Event(), asyncio.Event()

        async def slow_speak(text):
            speaking.set(); await finished.wait()
            return '/api/dragon/audio/stale'

        self.bridge.speak = slow_speak; self.bridge.ready.set()
        await self.chat.ask('Hallo'); await speaking.wait()
        self.assertEqual(self.socket.packets[-1]['status'], 'ready')
        self.world.phase = 'paused'; finished.set(); await self.chat.task
        self.assertFalse(any(packet['type'] == 'dragon_audio' for packet in self.socket.packets))

    async def test_restart_dispatch_cancels_an_answer_before_new_game(self):
        await self.chat.ask('alt'); await asyncio.sleep(0)
        task = self.chat.task
        self.world.start = lambda now: None
        await Service.dispatch(None, self.socket, SimpleNamespace(world=self.world), self.chat, {'type': 'restart'}, 123)
        self.bridge.ready.set(); await asyncio.gather(task, return_exceptions=True)
        self.assertEqual(len(self.socket.packets), 1)
        self.assertIsNone(self.chat.task)

    async def test_authored_reply_matches_ground_and_room_without_claiming_flight(self):
        self.world.player = [0, 1, 0]; self.world.velocity = [0, 0, 0]
        self.world.bodies = []; self.world.ground_height = lambda: 1
        bridge = DragonBridge()
        for mode, activity, phrase in [('vr', 'exploring', 'an deiner Seite'), ('mr', 'mixed_reality', 'vor dir')]:
            self.world.mode, self.world.flying = mode, False
            context = build_context(self.world)
            self.assertEqual(context['player']['current_activity'], activity)
            answer = await bridge.decide(self.world, 'Hallo', [])
            self.assertEqual(answer['source'], 'authored-offline')
            self.assertIn(phrase, answer['speech'])

    async def test_missing_configuration_is_reported_without_fake_model_reply(self):
        with tempfile.TemporaryDirectory() as folder:
            bridge = DragonBridge(Path(folder) / 'absent.json'); await bridge.start()
            try:
                with self.assertRaises(RuntimeError): await bridge.request('decide', data={})
            finally: await bridge.close()


if __name__ == '__main__': unittest.main()
