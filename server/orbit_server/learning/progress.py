"""Domain-neutral observations, deliberately not a knowledge/fitness diagnosis."""
from typing import Any
from orbit_server.missions.runtime import MissionRuntime


def record_objectives(save: dict[str, Any], runtime: MissionRuntime, completed: list[str]) -> None:
    goals = {item["id"]: item for item in runtime.data["learning"]["goals"]}
    for ident in completed:
        objective = runtime.objectives[ident]
        for goal in objective["learning_goals"]:
            for axis in goals[goal]["axes"]:
                observation = {"goal": goal, "mission": runtime.package.ident, "axis": axis, "event": objective["event"]}
                if observation not in save["learning"]:
                    save["learning"].append(observation)
                    save["abilities"][axis] = min(100000, save["abilities"][axis] + 1)
    save["learning"] = save["learning"][-4096:]


def complete_mission(save: dict[str, Any], runtime: MissionRuntime) -> None:
    ident = runtime.package.ident
    if ident not in save["completed_missions"]:
        save["completed_missions"].append(ident)
        save["arin"]["relationship"] = min(100, save["arin"]["relationship"] + 1)
    rewards = runtime.data["mission"]["rewards"]
    save["arin"]["memories"] = sorted(set(save["arin"]["memories"]) | set(rewards["memories"]))[:4096]
    save["world"]["discoveries"] = sorted(set(save["world"]["discoveries"]) | set(rewards["discoveries"]))[:4096]
    for solution in runtime.data["mission"]["solutions"]:
        if all(runtime.satisfied(key) for key in solution["objectives"]):
            key = f"{ident}.{solution['id']}"
            # Stable IDs in the save contract are capped at 64 characters.
            save["play_style"]["solutions"].append(key[:64])
    save["play_style"]["solutions"] = save["play_style"]["solutions"][-4096:]


def recommend_difficulty(current: int, attempts: int, hints: int) -> int:
    """A suggestion only; the caller must never silently overwrite settings."""
    return max(1, current - 1) if attempts >= 8 or hints >= 3 else current
