"""HTTP speech adapters. Whisper/Piper run as separately installed services."""
import json
import aiohttp
from orbit_server.ai.ananta import AnantaAdapter
from orbit_server.speech.ports import Transcript


class AnantaSpeech:
    def __init__(self, adapter: AnantaAdapter): self.adapter = adapter

    async def transcribe(self, audio: bytes, mime: str) -> Transcript:
        data = json.loads(await self.adapter.request("transcribe", raw=audio, mime=mime, timeout=50))
        text = data.get("text")
        if not isinstance(text, str) or len(text) > 600: raise ValueError("Invalid transcript")
        return Transcript(text, data.get("language", "auto"), "ananta/whisper.cpp", bool(data.get("fallback", False)))

    async def synthesize(self, text: str) -> bytes:
        data = await self.adapter.request("speak", data={"text": text[:280]})
        if not data.startswith(b"RIFF") or data[8:12] != b"WAVE": raise ValueError("Invalid WAV response")
        return data


async def bounded(response: aiohttp.ClientResponse) -> bytes:
    if response.status != 200: raise RuntimeError("Speech service unavailable")
    output = bytearray()
    async for chunk in response.content.iter_chunked(65536):
        output.extend(chunk)
        if len(output) > 2 * 1024 * 1024: raise ValueError("Speech response too large")
    return bytes(output)


class WhisperCppHTTP:
    """whisper-server /inference expects WAV. Convert browser audio in the service bridge."""
    def __init__(self, session: aiohttp.ClientSession, url: str):
        self.session, self.url = session, url.rstrip("/")

    async def transcribe(self, audio: bytes, mime: str) -> Transcript:
        if mime not in {"audio/wav", "audio/x-wav"} or audio[:4] != b"RIFF":
            raise ValueError("Direct whisper.cpp requires PCM WAV; use the Ananta audio conversion bridge for WebM")
        form = aiohttp.FormData()
        form.add_field("file", audio, filename="speech.wav", content_type="audio/wav")
        form.add_field("response_format", "json"); form.add_field("language", "auto")
        async with self.session.post(self.url + "/inference", data=form, timeout=aiohttp.ClientTimeout(total=45), allow_redirects=False) as response:
            data = json.loads(await bounded(response))
        text = data.get("text")
        if not isinstance(text, str) or len(text) > 600: raise ValueError("Invalid transcript")
        return Transcript(text.strip(), data.get("language", "auto"), "whisper.cpp")


class FallbackRecognizer:
    """Primary may be Vulkan; fallback is a separately configured CPU-only service."""
    def __init__(self, primary, cpu): self.primary, self.cpu = primary, cpu

    async def transcribe(self, audio: bytes, mime: str) -> Transcript:
        try: return await self.primary.transcribe(audio, mime)
        except (aiohttp.ClientError, TimeoutError, RuntimeError):
            result = await self.cpu.transcribe(audio, mime)
            return Transcript(result.text, result.language, result.provider, True)


class PiperHTTP:
    """Adapter for a local Piper-compatible POST / service returning WAV."""
    def __init__(self, session: aiohttp.ClientSession, url: str): self.session, self.url = session, url

    async def synthesize(self, text: str) -> bytes:
        async with self.session.post(self.url, json={"text": text[:600]}, timeout=aiohttp.ClientTimeout(total=20), allow_redirects=False) as response:
            data = await bounded(response)
        if data[:4] != b"RIFF" or data[8:12] != b"WAVE": raise ValueError("Invalid WAV response")
        return data
