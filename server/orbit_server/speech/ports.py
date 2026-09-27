from typing import Protocol
from dataclasses import dataclass


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str
    provider: str
    fallback: bool = False


class SpeechRecognizer(Protocol):
    async def transcribe(self, audio: bytes, mime: str) -> Transcript: ...


class SpeechSynthesizer(Protocol):
    async def synthesize(self, text: str) -> bytes: ...
