"""Small deterministic mission state machine; only trusted game events enter here."""
from dataclasses import dataclass
from typing import Any

from orbit_server.missions.packages import Package


@dataclass(frozen=True)
class GameEvent:
    kind: str
    target: str


class MissionRuntime:
    def __init__(self, package: Package):
        self.package = package
        self.data = package.data()
        self.stages = self.data["mission"]["stages"]
        self.objectives = {item["id"]: item for item in self.data["objectives"]["objectives"]}
        self.objects = {item["id"]: item for item in self.data["world"]["objects"]}
        self.stage_index = 0
        self.counts: dict[str, int] = {}
        self.inventory: set[str] = set()
        self.elapsed = 0.0
        self.hints_used = 0

    @property
    def complete(self) -> bool:
        return self.stage_index == len(self.stages)

    def current_objectives(self) -> list[dict[str, Any]]:
        if self.complete: return []
        return [self.objectives[key] for key in self.stages[self.stage_index]["objectives"]]

    def satisfied(self, ident: str) -> bool:
        return self.counts.get(ident, 0) >= self.objectives[ident]["count"]

    def accepts(self, event: GameEvent) -> list[dict[str, Any]]:
        return [item for item in self.current_objectives()
                if item["event"] == event.kind and item["target"] == event.target
                and not self.satisfied(item["id"])
                and set(item["requires_items"]) <= self.inventory]

    def handle(self, event: GameEvent) -> list[str]:
        completed = []
        for item in self.accepts(event):
            key = item["id"]
            self.counts[key] = self.counts.get(key, 0) + 1
            if event.kind == "collect": self.inventory.add(event.target)
            if self.satisfied(key):
                self.inventory.difference_update(item["consumes_items"])
                completed.append(key)
        if not self.complete:
            stage = self.stages[self.stage_index]
            done = [self.satisfied(key) for key in stage["objectives"]]
            if (all(done) if stage["completion"] == "all" else any(done)):
                self.stage_index += 1
        return completed

    def hint(self, level: int, full_help: bool = False) -> str:
        if level not in (1, 2, 3, 4) or (level == 4 and not full_help):
            raise ValueError("Vollständige Hilfe muss ausdrücklich angefordert werden.")
        self.hints_used += 1
        return next(item["text"] for item in self.data["dialogue"]["hints"] if item["level"] == level)

    def visible(self, ident: str) -> bool:
        visible = ident not in self.inventory
        for event in self.data["encounters"]["events"]:
            if event["target"] == ident and self.satisfied(event["on_objective"]):
                visible = event["action"] == "reveal"
        return visible

    def dump(self) -> dict[str, Any]:
        return {"id": self.package.ident, "version": self.package.version, "digest": self.package.digest,
                "stage_index": self.stage_index, "counts": dict(self.counts), "inventory": sorted(self.inventory),
                "elapsed": self.elapsed, "hints_used": self.hints_used}

    def restore(self, state: dict[str, Any]) -> None:
        if (state["id"], state["version"], state["digest"]) != (self.package.ident, self.package.version, self.package.digest):
            raise ValueError("Der gespeicherte Paketstand ist nicht mehr installiert.")
        if not 0 <= state["stage_index"] <= len(self.stages): raise ValueError("Invalid saved stage")
        if not set(state["counts"]) <= set(self.objectives) or not set(state["inventory"]) <= set(self.objects):
            raise ValueError("Invalid saved references")
        if any(value > self.objectives[key]["count"] for key, value in state["counts"].items()):
            raise ValueError("Invalid saved objective count")
        for stage in self.stages[:state["stage_index"]]:
            done = [state["counts"].get(key, 0) >= self.objectives[key]["count"] for key in stage["objectives"]]
            if not (all(done) if stage["completion"] == "all" else any(done)):
                raise ValueError("Saved stage prerequisites are incomplete")
        self.stage_index, self.counts = state["stage_index"], dict(state["counts"])
        self.inventory = set(state["inventory"])
        self.elapsed, self.hints_used = state["elapsed"], state["hints_used"]

    def snapshot(self) -> dict[str, Any]:
        stage = None if self.complete else self.stages[self.stage_index]
        lines = {line["id"]: line for line in self.data["dialogue"]["lines"]}
        return {"id": self.package.ident, "version": self.package.version,
                "title": self.data["manifest"]["title"], "complete": self.complete,
                "stage": stage["title"] if stage else "Fragment wiederhergestellt",
                "phase": stage["phase"] if stage else "complete",
                "narration": lines[stage["narration"]] if stage else None,
                "objectives": [{**item, "progress": self.counts.get(item["id"], 0)} for item in self.current_objectives()],
                "inventory": sorted(self.inventory), "elapsed": round(self.elapsed, 1), "hints_used": self.hints_used}
