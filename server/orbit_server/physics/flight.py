"""Flight tuning shared with the browser; smooth acceleration and an altitude boost."""
import json
import math
from orbit_server.paths import ROOT

CONFIG = json.loads((ROOT / 'shared' / 'protocol' / 'flight-config.json').read_text())
CEILING = CONFIG['ceiling']
RADIUS = CONFIG['planetRadius']
HALF_WORLD = math.pi * RADIUS
POLAR_LIMIT = HALF_WORLD / 2 - 16


def boost(height):
    return min(CONFIG['maxBoost'], 1 + (max(0, height - CONFIG['boostStart']) / CONFIG['boostScale']) ** CONFIG['boostPower'])


def coordinates(x, z):
    return (x + HALF_WORLD) % (2 * HALF_WORLD) - HALF_WORLD, max(-POLAR_LIMIT, min(POLAR_LIMIT, z))


def accelerate(velocity, direction, height, dt, flying):
    gain = boost(height)
    horizontal = CONFIG['horizontalSpeed'] * gain if flying else 2.8
    dx, dy, dz = direction
    target = [dx * horizontal, dy * CONFIG['verticalSpeed'] * gain if flying else -CONFIG['landingSpeed'] * gain, dz * horizontal]
    blend = 1 - math.exp(-CONFIG['response'] * dt)
    return [0 if abs(t) < 1e-8 and abs(v) < .02 else v + (t - v) * blend for v, t in zip(velocity, target)]
