import asyncio
import json
from pathlib import Path
import tempfile
import unittest

import aiohttp
from aiohttp import web
from aiohttp.test_utils import TestServer

from orbit_server.ai.ananta import AnantaAdapter
from orbit_server.ai.dragon import DragonBridge
from orbit_server.speech.adapters import AnantaSpeech, FallbackRecognizer, PiperHTTP, WhisperCppHTTP
from orbit_server.speech.ports import Transcript


class SpeechTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_jev_contract_is_projected_and_actions_rejected(self):
        seen = []
        async def respond(request):
            data = await request.json(); seen.append(data)
            if data["message"] == "invalid": return web.json_response({"requested_action": {"exec": "bad"}})
            return web.json_response({"speech": "Der Wind trägt uns nach Osten.", "mood": "curious", "gesture": "nod", "options": ["Weiter"], "source": "ananta-local-jev"})
        app = web.Application(); app.router.add_post("/api/game-dragon/decide", respond)
        server = TestServer(app); await server.start_server()
        with tempfile.TemporaryDirectory() as folder:
            token = Path(folder) / "token"; token.write_text("test-token")
            async with aiohttp.ClientSession() as session:
                adapter = AnantaAdapter(session, str(server.make_url("/")).rstrip("/"), token)
                context = {"environment": {"height": 30, "speed": 5, "region": "jungle", "nearby_entities": [{"species": "deer"}]}, "private": "must-not-leak"}
                response = await adapter.reply(context, "hello", [])
                assert response.animation == "head_tilt"
                assert "private" not in json.dumps(seen)
                with self.assertRaises(ValueError): await adapter.reply(context, "invalid", [])
        await server.close()

    async def test_whisper_piper_and_ananta_audio_contracts(self):
        wav = b"RIFF" + b"\0" * 4 + b"WAVE" + b"\0" * 64
        async def inference(request):
            form = await request.post()
            assert form["language"] == "auto"
            return web.json_response({"text": "I found two planks.", "language": "en"})
        async def speak(request): return web.Response(body=wav, content_type="audio/wav")
        async def transcribe(request): return web.json_response({"text": "Hallo Arin", "language": "de"})
        app = web.Application(); app.router.add_post("/inference", inference); app.router.add_post("/", speak)
        app.router.add_post("/api/game-dragon/speak", speak); app.router.add_post("/api/game-dragon/transcribe", transcribe)
        server = TestServer(app); await server.start_server()
        with tempfile.TemporaryDirectory() as folder:
            token = Path(folder) / "token"; token.write_text("test-token")
            async with aiohttp.ClientSession() as session:
                url = str(server.make_url("/")).rstrip("/")
                whisper = WhisperCppHTTP(session, url)
                self.assertEqual((await whisper.transcribe(wav, "audio/wav")).language, "en")
                with self.assertRaises(ValueError): await whisper.transcribe(b"webm", "audio/webm")
                self.assertEqual(await PiperHTTP(session, url + "/").synthesize("hello"), wav)
                speech = AnantaSpeech(AnantaAdapter(session, url, token))
                self.assertEqual((await speech.transcribe(b"webm", "audio/webm")).text, "Hallo Arin")
                self.assertEqual(await speech.synthesize("Hallo"), wav)
        await server.close()

    async def test_cpu_fallback_is_explicit_and_validation_errors_do_not_retry(self):
        class Primary:
            async def transcribe(self, audio, mime): raise asyncio.TimeoutError()
        class CPU:
            async def transcribe(self, audio, mime): return Transcript("hello", "en", "whisper-cpu")
        result = await FallbackRecognizer(Primary(), CPU()).transcribe(b"wav", "audio/wav")
        assert result.fallback and result.provider == "whisper-cpu"
        class Invalid:
            async def transcribe(self, audio, mime): raise ValueError("invalid audio")
        with self.assertRaises(ValueError): await FallbackRecognizer(Invalid(), CPU()).transcribe(b"bad", "text/plain")

    async def test_missing_ananta_does_not_claim_a_model_reply(self):
        from types import SimpleNamespace
        world = SimpleNamespace(player=[0, 400, 0], velocity=[0, 0, 0], bodies=[], flying=True, ground_height=lambda: 0)
        with tempfile.TemporaryDirectory() as folder:
            bridge = DragonBridge(Path(folder) / "absent.json")
            await bridge.start()
            try: self.assertEqual((await bridge.decide(world, "hello", []))["source"], "authored-offline")
            finally: await bridge.close()
