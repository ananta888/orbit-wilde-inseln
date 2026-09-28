"""Explicit per-character projection; never serialize the world or save wholesale."""
import math


def build_context(world, character="arin", mission=None, save=None):
    height = max(0, round(world.player[1], 1))
    region = "orbit" if height > 350 else "clouds" if height > 80 else "coast" if world.ground_height() < .3 else "jungle"
    nearby = []
    for body in world.bodies:
        species = getattr(body, "species", None)
        if species and not body.cooldown and math.dist(body.position, world.player) <= 25:
            nearby.append({"species": species})
    context = {"character": character,
               "player": {"position": [round(v, 1) for v in world.player], "current_activity": "mixed_reality" if getattr(world, "mode", "vr") == "mr" else "flying" if world.flying else "exploring", "recent_actions": []},
               "environment": {"region": region, "height": height, "speed": round(math.hypot(*world.velocity), 1), "weather": "trade_winds", "nearby_entities": nearby[:6]},
               "mission": {"id": mission.package.ident if mission else "", "stage": mission.snapshot()["stage"] if mission else "", "objectives": [item["description"] for item in mission.current_objectives()][:4] if mission else []}}
    if character == "arin":
        context["memories"] = (save or {}).get("arin", {}).get("memories", [])[-8:]
    else:
        # Oracle gets the current learning domain, never the player's private conversation history.
        context["learning_domain"] = mission.data["learning"]["domain"] if mission else ""
    return context
