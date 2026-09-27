"""Provider-neutral character contracts. NPCs can speak/animate, not run code."""
from dataclasses import asdict, dataclass, field
from typing import Any, Protocol
from orbit_server.missions.schema import validate


@dataclass(frozen=True)
class CharacterResponse:
    speech: str
    emotion: str = "calm"
    animation: str = "glide"
    hint_level: int = 0
    requested_action: None = None
    options: list[str] = field(default_factory=list)

    def validated(self) -> dict[str, Any]:
        result = asdict(self)
        validate("ai-response", result)
        return result


class DialogueProvider(Protocol):
    async def reply(self, context: dict[str, Any], message: str, history: list[dict[str, str]]) -> CharacterResponse: ...


class AnantaOracle:
    """Authored hint ladder; a full solution requires the player's explicit request."""
    def advise(self, mission, level: int, full_help: bool = False) -> CharacterResponse:
        return CharacterResponse(mission.hint(level, full_help), "curious", "head_tilt", level)
