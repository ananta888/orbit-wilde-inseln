"""Per-player application service joining simulation and domain modules."""
import math
from typing import Any

from orbit_server.entities.mission_objects import MissionTarget
from orbit_server.ai.context import build_context
from orbit_server.entities.wildlife import Expedition
from orbit_server.fitness.profiles import PROFILES
from orbit_server.learning.progress import complete_mission, record_objectives
from orbit_server.missions.packages import Catalog
from orbit_server.missions.runtime import GameEvent, MissionRuntime
from orbit_server.physics.ballistics import STEP


class GameSession:
    def __init__(self, environment, catalog: Catalog, save: dict[str, Any]):
        self.world = Expedition(environment)
        self.catalog, self.save = catalog, save
        self.mission: MissionRuntime | None = None
        self.last_interaction = -math.inf
        self.notice = ""
        self.world.character_context = lambda character: build_context(self.world, character, self.mission, self.save)
        self.dirty = False
        active = save["active_mission"]
        if active:
            try:
                self.mission = MissionRuntime(catalog.packages[active["id"]])
                self.mission.restore(active)
                self.configure_targets()
            except (KeyError, ValueError):
                self.mission = None
                self.notice = "Gespeicherte Episode benötigt ihre ursprüngliche Paketversion. Du kannst eine neue Episode starten."

    def start_mission(self, ident: str) -> None:
        package = self.catalog.packages.get(ident)
        if package is None: raise ValueError("Unbekannte Mission")
        missing = set(package.data()["manifest"]["prerequisites"]) - set(self.save["completed_missions"])
        if missing: raise ValueError("Voraussetzungen noch nicht erfüllt")
        self.mission = MissionRuntime(package)
        self.save["package_versions"][ident] = package.version
        self.notice = ""
        self.configure_targets()
        self.checkpoint()

    def leave_mission(self) -> None:
        self.mission = None
        self.save["active_mission"] = None
        self.configure_targets()
        self.dirty = True

    def position(self, item: dict[str, Any]) -> list[float]:
        if self.world.mode == "mr": return list(item["mr_position"])
        x, y, z = item["position"]
        return [x, self.world.floor_height(x, z) + y, z]

    def configure_targets(self) -> None:
        world = self.world
        world.arrows.clear()
        world.bodies = [body for body in world.bodies if not isinstance(body, MissionTarget)]
        world.mission_targets = []
        world.wind = list(self.mission.data["world"]["wind"]) if self.mission else [0, 0, 0]
        if not self.mission: return
        scale = PROFILES[self.save["settings"]["fitness"]].target_scale
        difficulty = self.save["settings"]["difficulty"]
        for item in self.mission.objects.values():
            if item["kind"] not in {"target", "moving_target"}: continue
            position = self.position(item); position[1] += 1.2
            target = MissionTarget(position, [0, 0, 0], .38 * scale * (1.2 - .1 * difficulty),
                                   mission_id=item["id"], material=item["material"], anchor=tuple(position), motion=item.get("motion"))
            world.mission_targets.append(target)
        world.bodies.extend(world.mission_targets)

    def enter(self, mode: str) -> None:
        self.world.enter(mode)
        self.configure_targets()

    def settings(self, data: dict[str, Any]) -> None:
        self.save["settings"] = {key: data[key] for key in ("fitness", "difficulty", "adaptive")}
        self.configure_targets()
        self.dirty = True

    def interact(self, target: str, verb: str, text: str, now: float) -> None:
        if not self.mission or self.mission.complete: raise ValueError("Keine aktive Aufgabe")
        if self.world.phase != "playing": raise ValueError("Spiel ist pausiert")
        if now - self.last_interaction < .2: raise ValueError("Bitte kurz warten")
        self.last_interaction = now
        item = self.mission.objects.get(target)
        if not item or verb not in item["verbs"]: raise ValueError("Diese Interaktion ist nicht möglich")
        if verb == "hit": raise ValueError("Treffer entstehen ausschließlich aus der Pfeilphysik")
        # No synthetic walking in MR. All room objects are placed in a compact interaction area.
        reach = PROFILES[self.save["settings"]["fitness"]].reach
        if math.dist(self.position(item), self.world.player) > reach:
            raise ValueError("Komm näher an das Objekt heran")
        if not self.mission.visible(target): raise ValueError("Objekt ist nicht verfügbar")
        if verb == "speak" and not text.strip(): raise ValueError("Antworte mit eigenen Worten")
        event = GameEvent(verb, target)
        if not self.mission.accepts(event): raise ValueError("Beobachte die aktuelle Aufgabe oder prüfe dein Inventar")
        self.accept(event)

    def accept(self, event: GameEvent) -> None:
        if not self.mission: return
        already_complete = self.mission.complete
        completed = self.mission.handle(event)
        record_objectives(self.save, self.mission, completed)
        if self.mission.complete and not already_complete:
            complete_mission(self.save, self.mission)
        if completed or self.mission.accepts(event): self.checkpoint()

    def hint(self, level: int, full_help: bool) -> str:
        if not self.mission: raise ValueError("Wähle zunächst eine Episode")
        text = self.mission.hint(level, full_help)
        self.checkpoint()
        return text

    def step(self) -> list[dict[str, Any]]:
        self.world.step()
        if self.world.phase == "playing" and self.mission and not self.mission.complete:
            self.mission.elapsed += STEP
        events = self.world.take_events()
        for event in events:
            if event["type"] == "hit" and event.get("target"):
                self.accept(GameEvent("hit", event["target"]))
        return events

    def checkpoint(self) -> None:
        if self.mission: self.save["active_mission"] = self.mission.dump()
        self.dirty = True

    def snapshot(self) -> dict[str, Any]:
        mission = self.mission
        objects = []
        if mission:
            targets = {target.mission_id: target for target in self.world.mission_targets}
            for item in mission.objects.values():
                obj = {**item, "position": self.position(item), "visible": mission.visible(item["id"]), "resolved": [o["event"] for o in mission.objectives.values() if o["target"] == item["id"] and mission.satisfied(o["id"])]}
                if item["id"] in targets:
                    target = targets[item["id"]]
                    obj.update(position=list(target.position), radius=target.radius)
                objects.append(obj)
        return {"type": "mission", "active": mission.snapshot() if mission else None, "objects": objects,
                "catalog": [{"id": p.ident, "version": p.version, "title": p.data()["manifest"]["title"]} for p in self.catalog.packages.values()],
                "catalogRevision": self.catalog.revision, "settings": self.save["settings"],
                "completed": self.save["completed_missions"], "notice": self.notice,
                "wind": self.world.wind}
