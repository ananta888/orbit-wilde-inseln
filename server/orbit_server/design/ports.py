"""Ports keep providers and transport independent of the pure editing domain."""
from typing import Any, Protocol


class GeometryBackend(Protocol):
    def apply(self, document: dict[str, Any], operation: dict[str, Any]) -> dict[str, Any]: ...


class CreatureGenerator(Protocol):
    async def generate(self, request: dict[str, Any]) -> dict[str, Any]: ...


class DesignPlanner(Protocol):
    async def propose(self, context: dict[str, Any], instruction: str) -> dict[str, Any]: ...


class AutoRigProvider(Protocol):
    def propose(self, document: dict[str, Any]) -> dict[str, Any]: ...
