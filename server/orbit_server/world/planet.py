"""A bounded overview of the same island height function used on the ground."""
import hashlib
import json
from orbit_server.physics.flight import RADIUS, HALF_WORLD


def build_planet(terrain):
    width, height = 128, 64
    heights = []
    for j in range(height + 1):
        z = (j / height - .5) * HALF_WORLD
        row = [terrain.raw_height((i / width - .5) * 2 * HALF_WORLD, z) for i in range(width)]
        heights.extend(row + [row[0]])
    data = {'width': width, 'height': height, 'radius': RADIUS, 'heights': heights,
            'seed': terrain.seed, 'palette': terrain.palette}
    data['version'] = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
    return data
