"""External Ananta game-dragon API adapter; no Ananta code or model bundled."""
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
import aiohttp

from orbit_server.ai.contracts import CharacterResponse


class AnantaAdapter:
    def __init__(self, session: aiohttp.ClientSession, url: str, token_path: Path):
        parsed = urlsplit(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Ananta URL must be an operator-configured HTTP(S) service")
        self.session, self.url, self.token_path = session, url.rstrip("/"), token_path

    async def request(self, route: str, *, data=None, raw=None, mime="application/json", timeout=25) -> bytes:
        if route not in {"decide", "speak", "transcribe"}: raise ValueError("Unsupported Ananta route")
        token = self.token_path.read_text(encoding="utf-8").strip()
        async with self.session.post(self.url + "/api/game-dragon/" + route,
                                     json=data if raw is None else None, data=raw,
                                     headers={"Authorization": "Bearer " + token, "Content-Type": mime},
                                     timeout=aiohttp.ClientTimeout(total=timeout), allow_redirects=False) as response:
            if response.status != 200: raise RuntimeError("Ananta ist gerade nicht erreichbar")
            body = bytearray()
            async for chunk in response.content.iter_chunked(65536):
                body.extend(chunk)
                if len(body) > 2 * 1024 * 1024: raise RuntimeError("Provider response exceeds limit")
            return bytes(body)

    async def reply(self, context: dict[str, Any], message: str, history: list[dict[str, str]]) -> CharacterResponse:
        environment = context["environment"]
        # Compatibility with the already deployed Jev game-dragon endpoint.
        projection = {"altitude": environment["height"], "speed": environment["speed"], "region": environment["region"],
                      "creatures": list(dict.fromkeys(item["species"] for item in environment["nearby_entities"]))[:3]}
        data = json.loads(await self.request("decide", data={"context": projection, "message": message, "history": history[-6:]}))
        if data.get("requested_action") is not None: raise ValueError("Game actions are not permitted from dialogue")
        response = CharacterResponse(data["speech"],
                                     {"warm": "encouraging", "excited": "encouraging", "alert": "concerned"}.get(data["mood"], data["mood"]),
                                     {"nod": "head_tilt", "look": "look_around"}.get(data["gesture"], data["gesture"]),
                                     options=data.get("options", [])[:3])
        response.validated()
        return response
