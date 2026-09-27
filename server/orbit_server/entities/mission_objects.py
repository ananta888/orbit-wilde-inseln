"""Ballistic mission targets share the same laptop collision solver as wildlife."""
from dataclasses import dataclass
import math
from typing import Any
from orbit_server.physics.ballistics import Body


@dataclass
class MissionTarget(Body):
    mission_id: str = ""
    material: str = "wood"
    anchor: tuple[float, float, float] = (0, 0, 0)
    motion: dict[str, Any] | None = None

    def advance(self, elapsed: float) -> None:
        self.position[:] = self.anchor
        if self.motion:
            axis = 0 if self.motion["axis"] == "x" else 2
            self.position[axis] += math.sin(elapsed * self.motion["speed"]) * self.motion["amplitude"]
