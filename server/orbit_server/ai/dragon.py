"""Non-blocking, per-player NPC dialogue via the Ananta Hub (never direct LLM calls)."""
import asyncio
from collections import OrderedDict
import json
import os
from dataclasses import asdict
from orbit_server.ai.ananta import AnantaAdapter
from orbit_server.ai.context import build_context
from orbit_server.speech.adapters import AnantaSpeech, WhisperCppHTTP, PiperHTTP, FallbackRecognizer
from orbit_server.ai.contracts import CharacterResponse
from pathlib import Path
from orbit_server.paths import ROOT
import secrets
import time
import aiohttp

CONFIG_PATH = ROOT / '.local' / 'dragon.json'


class DragonBridge:
    def __init__(self, config_path=CONFIG_PATH):
        self.config_path = config_path
        self.config = {}; self.session = None; self.audio = OrderedDict()
        self.adapter = None; self.speech = None
        self.recognizer = None; self.synthesizer = None

    async def start(self):
        try: self.config = json.loads(self.config_path.read_text(encoding='utf-8'))
        except (OSError, ValueError): self.config = {}
        self.session = aiohttp.ClientSession()
        if os.environ.get('ORBIT_ANANTA_URL'):
            self.config = {'hub_url': os.environ['ORBIT_ANANTA_URL'], 'token_file': os.environ.get('ORBIT_ANANTA_TOKEN_FILE', '')}
        if self.config.get('hub_url') and self.config.get('token_file'):
            self.adapter = AnantaAdapter(self.session, self.config['hub_url'], Path(self.config['token_file']))
            self.speech = AnantaSpeech(self.adapter)
        self.recognizer = self.synthesizer = self.speech
        if os.environ.get('ORBIT_WHISPER_URL'):
            self.recognizer = WhisperCppHTTP(self.session, os.environ['ORBIT_WHISPER_URL'])
            if os.environ.get('ORBIT_WHISPER_CPU_URL'):
                self.recognizer = FallbackRecognizer(self.recognizer, WhisperCppHTTP(self.session, os.environ['ORBIT_WHISPER_CPU_URL']))
        if os.environ.get('ORBIT_PIPER_URL'):
            self.synthesizer = PiperHTTP(self.session, os.environ['ORBIT_PIPER_URL'])

    async def close(self):
        if self.session: await self.session.close()
        self.audio.clear()

    async def request(self, route, *, data=None, raw=None, mime='application/json', timeout=25):
        if not self.adapter: raise RuntimeError('Drachen-KI ist nicht eingerichtet.')
        return await self.adapter.request(route, data=data, raw=raw, mime=mime, timeout=timeout)

    async def decide(self, world, message, history):
        context = world.character_context('arin') if hasattr(world, 'character_context') else build_context(world)
        if self.adapter:
            answer = await self.adapter.reply(context, message, history)
            source = 'ananta-local-jev'
        else:
            region = context['environment']['region']
            if context['player']['current_activity'] == 'mixed_reality':
                line = 'Ich bin da. Wir können die Gegenstände vor dir in Ruhe untersuchen. Was möchtest du ausprobieren?'
            elif not world.flying:
                line = 'Ich bleibe an deiner Seite. Zwischen den Bäumen warten alte Spuren. Lass uns erst beobachten, bevor wir handeln.'
            elif region == 'orbit':
                line = 'Von hier oben sehen die Inseln aus wie Erinnerungen, die wieder zusammenfinden.'
            else:
                line = 'Der Wind trägt uns über diese Inseln. Unten warten alte Erinnerungen.'
            answer = CharacterResponse(line, options=['Was entdecken wir?', 'Erzähl mir von dir.', 'Ich möchte etwas fragen.'])
            source = 'authored-offline'
        result = answer.validated()
        result.update(mood={'encouraging': 'excited', 'concerned': 'alert'}.get(answer.emotion, answer.emotion), gesture={'head_tilt': 'nod'}.get(answer.animation, answer.animation), source=source)
        return result

    async def speak(self, text):
        if not self.synthesizer: raise RuntimeError('Sprachausgabe ist nicht eingerichtet')
        audio = await self.synthesizer.synthesize(text)
        if not audio.startswith(b'RIFF'): raise RuntimeError('Sprachausgabe nicht verfügbar.')
        ident = secrets.token_urlsafe(20)
        self.audio[ident] = (time.monotonic(), audio)
        while len(self.audio) > 12: self.audio.popitem(last=False)
        return '/api/dragon/audio/' + ident

    async def transcribe(self, data, mime):
        if not self.recognizer: raise RuntimeError('Spracherkennung ist nicht eingerichtet')
        return asdict(await self.recognizer.transcribe(data, mime))


class DragonConversation:
    def __init__(self, bridge, socket, world):
        self.bridge, self.socket, self.world = bridge, socket, world
        self.history = []; self.task = None; self.last_request = 0; self.serial = 0; self.pending = None

    def reset(self):
        self.serial += 1; self.history.clear(); self.pending = None
        if self.task: self.task.cancel()
        self.task = None

    async def ask(self, message):
        if not isinstance(message, str) or len(message) > 600: raise ValueError('Drachen-Nachricht: höchstens 600 Zeichen.')
        if self.world.phase != 'playing': return
        if self.task and not self.task.done():
            if message.strip(): self.pending = message
            return
        now = time.monotonic()
        if not message.strip() and now - self.last_request < 1.5: return
        self.last_request = now; self.serial += 1
        self.task = asyncio.create_task(self._reply(message, self.serial))

    async def _reply(self, message, serial):
        try:
            await self.socket.send_json({'type': 'dragon', 'status': 'thinking', 'serial': serial})
            answer = await self.bridge.decide(self.world, message, self.history)
            if serial != self.serial or self.socket.closed or self.world.phase != 'playing': return
            if message.strip(): self.history.append({'role': 'user', 'text': message})
            self.history.append({'role': 'assistant', 'text': answer['speech']}); self.history = self.history[-6:]
            await self.socket.send_json({'type': 'dragon', 'status': 'ready', 'serial': serial, **answer})
            try:
                url = await self.bridge.speak(answer['speech'])
                if serial == self.serial and not self.socket.closed and self.world.phase == 'playing':
                    await self.socket.send_json({'type': 'dragon_audio', 'url': url, 'serial': serial})
            except (OSError, RuntimeError, aiohttp.ClientError, asyncio.TimeoutError):
                pass  # Caption is already delivered; flight and dialogue continue without audio.
        except (OSError, RuntimeError, ValueError, KeyError, aiohttp.ClientError, asyncio.TimeoutError):
            if serial == self.serial and not self.socket.closed and self.world.phase == 'playing':
                await self.socket.send_json({'type': 'dragon', 'status': 'offline', 'serial': serial,
                                            'speech': 'Die Verbindung zu Ananta fehlt gerade. Du kannst weiter erkunden.'})
        finally:
            if serial == self.serial:
                pending, self.pending, self.task = self.pending, None, None
                if pending is not None and not self.socket.closed:
                    await self.ask(pending)
