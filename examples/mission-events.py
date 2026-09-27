"""Headless domain example. These are trusted simulation events, not client messages."""
from orbit_server.missions.packages import Catalog
from orbit_server.missions.runtime import GameEvent, MissionRuntime
from orbit_server.missions.schema import read_json
from orbit_server.paths import ROOT

catalog = Catalog(ROOT / "content/missions", read_json(ROOT / "content/assets/catalog.json"))
catalog.apply(catalog.prepare())
mission = MissionRuntime(catalog.packages["logic_001_temple"])
for kind, target in [("observe", "boar"), ("collect", "fruit"), ("sneak", "side_path"), ("reach", "temple")]:
    mission.handle(GameEvent(kind, target))
    print(mission.snapshot()["stage"])
assert mission.complete
