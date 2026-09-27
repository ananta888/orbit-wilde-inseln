import math

import pytest

from orbit_server.ai.context import build_context
from orbit_server.ai.contracts import CharacterResponse
from orbit_server.missions.packages import Catalog
from orbit_server.missions.schema import read_json
from orbit_server.networking.session import GameSession
from orbit_server.paths import ROOT
from orbit_server.persistence.store import SQLiteStore, new_save
from orbit_server.world.environment import LiveWorld


@pytest.fixture
def game():
    catalog = Catalog(ROOT / "content/missions", read_json(ROOT / "content/assets/catalog.json"))
    catalog.apply(catalog.prepare())
    game = GameSession(LiveWorld(), catalog, new_save())
    game.world.start(0)
    return game


def interact(game, target, verb, now=1, text=""):
    game.world.player = game.position(game.mission.objects[target])
    game.interact(target, verb, text, now)


def shoot(game, target_id, seq):
    target = next(target for target in game.world.mission_targets if target.mission_id == target_id)
    game.world.player = [target.position[0], game.world.floor_height(target.position[0], target.position[2]), target.position[2] + 1]
    game.world.loose({"origin": [target.position[0], target.position[1], target.position[2] + 1], "direction": [0, 0, -1], "draw": .65, "seq": seq}, float(seq))
    for _ in range(45): game.step()


def test_physics_mission_requires_real_swept_arrow_hits(game):
    game.start_mission("physics_001_projectile")
    interact(game, "wind", "observe")
    with pytest.raises(ValueError, match="Pfeilphysik"): game.interact("practice", "hit", "", 2)
    shoot(game, "practice", 1); shoot(game, "practice", 2)
    assert game.mission.stage_index == 2
    interact(game, "wind", "observe", 4)
    shoot(game, "final_target", 3); shoot(game, "final_target", 4)
    assert game.mission.complete
    assert game.world.hits == 4
    assert game.save["completed_missions"] == ["physics_001_projectile"]
    assert game.save["arin"]["memories"]
    assert {item["axis"] for item in game.save["learning"]} == {"body", "skill", "mind"}


def test_bridge_requires_inventory_free_reply_and_application(game):
    game.start_mission("language_001_bridge")
    with pytest.raises(ValueError): interact(game, "bridge", "use")
    interact(game, "traveler", "observe", 2)
    interact(game, "plank_a", "collect", 3); interact(game, "plank_b", "collect", 4)
    with pytest.raises(ValueError): interact(game, "traveler", "speak", 5)
    interact(game, "traveler", "speak", 6, "I found two planks for our bridge.")
    interact(game, "bridge", "use", 7)
    assert game.mission.complete
    assert not game.mission.inventory
    assert "I found" not in str(game.save)  # Raw speech isn't persisted as learning telemetry.


@pytest.mark.parametrize("target,verb,solution", [("boar", "distract", "distraction"), ("side_path", "sneak", "stealth"), ("stone", "use", "environment")])
def test_temple_accepts_three_different_solutions(game, target, verb, solution):
    game.start_mission("logic_001_temple")
    interact(game, "boar", "observe"); interact(game, "fruit", "collect", 2)
    interact(game, target, verb, 3); interact(game, "temple", "reach", 4)
    assert game.mission.complete
    assert game.save["play_style"]["solutions"] == ["logic_001_temple." + solution]


def test_proximity_pause_stage_and_full_help_gates(game):
    game.start_mission("logic_001_temple")
    game.world.player = [100, 0, 100]
    with pytest.raises(ValueError, match="näher"): game.interact("boar", "observe", "", 1)
    game.world.pause(2)
    with pytest.raises(ValueError, match="pausiert"): interact(game, "boar", "observe", 3)
    game.world.resume(4)
    with pytest.raises(ValueError): game.hint(4, False)
    assert game.hint(4, True)
    assert game.mission.hints_used == 1


def test_mr_keeps_player_stationary_and_mission_objects_in_reach(game):
    game.enter("mr"); game.world.start(0); game.start_mission("language_001_bridge")
    assert all(math.dist(item["position"], [0, 0, 0]) < 3 for item in game.snapshot()["objects"])
    game.world.move({"direction": [1, 1, -1], "dt": .1, "seq": 1, "flight": True}, 1)
    assert game.world.player == [0, 0, 0]
    assert not game.world.flying
    game.interact("traveler", "observe", "", 1)


def test_local_save_roundtrip_resume_and_future_version_refusal(game, tmp_path):
    store = SQLiteStore(tmp_path / "save.sqlite3")
    game.start_mission("language_001_bridge")
    interact(game, "traveler", "observe"); interact(game, "plank_a", "collect", 2)
    store.save("player", game.save); store.close()
    reopened = SQLiteStore(tmp_path / "save.sqlite3")
    restored = GameSession(game.world.environment, game.catalog, reopened.load("player"))
    assert restored.mission.inventory == {"plank_a"}
    assert restored.mission.stage_index == 1
    broken = new_save(); broken["schema_version"] = 2
    with pytest.raises(ValueError): reopened.save("player", broken)
    assert reopened.load("player")["active_mission"]["inventory"] == ["plank_a"]
    reopened.close()


def test_context_projection_and_model_action_rejection(game):
    game.start_mission("logic_001_temple")
    context = build_context(game.world, "ananta", game.mission, game.save)
    assert "memories" not in context
    assert "save" not in context and "objects" not in context
    assert len(context["environment"]["nearby_entities"]) <= 6
    with pytest.raises(ValueError): CharacterResponse("hello", requested_action={"exec": "bad"}).validated()
    with pytest.raises(ValueError): CharacterResponse("hello", animation="teleport").validated()


def test_fixed_step_wind_is_deterministic_and_deflects_arrows(game):
    game.world.bodies = []; game.world.start(0)
    game.world.player = [0, 0, 0]
    game.world.loose({"origin": [0, 3, 0], "direction": [0, 0, -1], "draw": .5, "seq": 1}, 1)
    game.world.wind = [5, 0, 0]
    for _ in range(10): game.world.step()
    assert game.world.arrows[0].position[0] > 0
