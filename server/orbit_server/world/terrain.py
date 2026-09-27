"""Deterministic island terrain calculated on the laptop, streamed as height fields."""
from collections import OrderedDict
import hashlib
import json
import math
import random
from orbit_server.physics.flight import CONFIG as FLIGHT, CEILING, accelerate, coordinates

SIZE, STEPS = 32, 16
WATER = 0.0


def mix(a, b, t):
    return a + (b - a) * t


def noise(x, z, seed):
    ix, iz = math.floor(x), math.floor(z)
    tx, tz = x - ix, z - iz
    tx, tz = tx * tx * (3 - 2 * tx), tz * tz * (3 - 2 * tz)
    def corner(a, b):
        n = (a * 374761393 + b * 668265263 + seed * 1274126177) & 0xffffffff
        n = ((n ^ (n >> 13)) * 1274126177) & 0xffffffff
        return ((n ^ (n >> 16)) & 65535) / 65535
    return mix(mix(corner(ix, iz), corner(ix + 1, iz), tx),
               mix(corner(ix, iz + 1), corner(ix + 1, iz + 1), tx), tz)


class IslandTerrain:
    def __init__(self, seed=16, palette=None, density=1):
        self.seed, self.palette, self.density = seed, palette or {}, density
        self.cache = OrderedDict()
        self.islands = {}
        self.generated = 0

    def island(self, ix, iz):
        if (ix, iz) in self.islands:
            return self.islands[ix, iz]
        rng = random.Random(f'{self.seed}/island/{ix}/{iz}')
        if ix == iz == 0:
            return 0.0, -12.0, 49.0
        result = ix * 98 + rng.uniform(-10, 10), iz * 98 - 12 + rng.uniform(-10, 10), rng.uniform(36, 49)
        self.islands[ix, iz] = result
        if len(self.islands) > 256:
            self.islands.pop(next(iter(self.islands)))
        return result

    def raw_height(self, x, z):
        ix, iz = round(x / 98), round((z + 12) / 98)
        best = -5.0
        for a in range(ix - 1, ix + 2):
            for b in range(iz - 1, iz + 2):
                cx, cz, radius = self.island(a, b)
                dx, dz = x - cx, z - cz
                distance = math.hypot(dx, dz * 0.91)
                if distance > radius + 12:
                    continue
                shore = radius + (noise(x * 0.047, z * 0.047, self.seed) - 0.5) * 12
                edge = shore - distance
                height = min(2.7, edge * 0.28) + (noise(x * 0.10, z * 0.10, self.seed + 8) - 0.5) * min(1, max(0, edge / 8))
                mountain = 7.5 * math.exp(-((dx + 13) ** 2 / 90 + (dz + 19) ** 2 / 65))
                height += mountain
                best = max(best, height)
        return round(best, 4)

    def tile(self, cx, cz):
        key = (cx, cz)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        rng = random.Random(f'{self.seed}/tile/{cx}/{cz}')
        x0, z0 = cx * SIZE, cz * SIZE
        heights = [self.raw_height(x0 + x * SIZE / STEPS, z0 + z * SIZE / STEPS)
                   for z in range(STEPS + 1) for x in range(STEPS + 1)]
        props = []
        for index in range(round(48 * self.density)):
            x, z = x0 + rng.random() * SIZE, z0 + rng.random() * SIZE
            y = self.sample_grid(heights, x - x0, z - z0)
            if y < 0.35:
                continue
            # A winding clearing leaves sight lines and a walkable jungle trail.
            path = abs(x - math.sin(z * 0.07) * 4) < 2.8 and abs(z) < 42
            kind = rng.choices(['palm', 'broadleaf', 'fern', 'rock'], [28, 22, 38, 12])[0]
            if path and kind != 'fern':
                continue
            if path and abs(x) < 1.8:
                continue
            scale = rng.uniform(0.8, 1.5)
            props.append({'kind': kind, 'position': [round(x, 3), round(y, 3), round(z, 3)],
                          'scale': scale, 'yaw': rng.random() * math.tau, 'variant': index % 3})
        falls = []
        # A cascade and rock escarpment on each island; assigned to one owning tile.
        for ix in range(round(x0 / 98) - 1, round(x0 / 98) + 2):
            for iz in range(round((z0 + 12) / 98) - 1, round((z0 + 12) / 98) + 2):
                center_x, center_z, _ = self.island(ix, iz)
                x, z = center_x - 11, center_z - 12
                if math.floor(x / SIZE) == cx and math.floor(z / SIZE) == cz:
                    floor = self.raw_height(x, z + 5)
                    falls.append({'position': [x, floor, z], 'height': 8.5, 'width': 3.2})
                    for j in range(7):
                        props.append({'kind': 'cliff', 'position': [x + (j - 3) * 2.2, floor - 0.5, z - 1.8 - rng.random()],
                                      'scale': 1.0 + rng.random() * 0.35, 'yaw': rng.random(), 'variant': j % 3})
        payload = {'id': f'tile:{cx}:{cz}', 'terrain': {'x': x0, 'z': z0, 'size': SIZE, 'steps': STEPS, 'heights': heights},
                   'props': props, 'falls': falls, 'palette': self.palette, 'objects': []}
        payload['version'] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:16]
        self.cache[key] = payload
        self.generated += 1
        while len(self.cache) > 96:
            self.cache.popitem(last=False)
        return payload

    @staticmethod
    def sample_grid(heights, x, z):
        gx, gz = max(0, min(STEPS - 1e-8, x / SIZE * STEPS)), max(0, min(STEPS - 1e-8, z / SIZE * STEPS))
        ix, iz = math.floor(gx), math.floor(gz)
        fx, fz = gx - ix, gz - iz
        a = heights[iz * (STEPS + 1) + ix]
        b = heights[iz * (STEPS + 1) + ix + 1]
        c = heights[(iz + 1) * (STEPS + 1) + ix]
        d = heights[(iz + 1) * (STEPS + 1) + ix + 1]
        # Match the rendered triangle diagonal exactly, including steep ground.
        return a + (b - a) * fx + (c - a) * fz if fx + fz <= 1 else d + (c - d) * (1 - fx) + (b - d) * (1 - fz)

    def height(self, x, z):
        cx, cz = math.floor(x / SIZE), math.floor(z / SIZE)
        return self.sample_grid(self.tile(cx, cz)['terrain']['heights'], x - cx * SIZE, z - cz * SIZE)

    def ground(self, x, z):
        return max(-0.5, self.height(x, z))

    def travel(self, position, velocity, dx, dy, dz, dt, flying):
        """Walking, hovering and gradual landing; mirrored by LiveScene.travel."""
        x, y, z = position
        floor = max(-.5, self.raw_height(x, z)) if y > FLIGHT['streamCutoff'] else self.ground(x, z)
        if not flying and y <= floor + 0.001:
            return self.walk(position, dx, dz, dt), [0, 0, 0]
        velocity = accelerate(velocity, (dx, dy, dz), y, dt, flying)
        nx, nz = coordinates(x + velocity[0] * dt, z + velocity[2] * dt)
        ny = min(CEILING, y + velocity[1] * dt)
        next_floor = max(-.5, self.raw_height(nx, nz)) if ny > FLIGHT['streamCutoff'] else self.ground(nx, nz)
        # Meet steep terrain without jumping up through a hillside.
        if next_floor > max(y, floor) + 0.24 + math.hypot(coordinates(nx - x, 0)[0], nz - z) * 0.8:
            return [x, max(floor, ny), z], [0, velocity[1], 0]
        if ny <= next_floor or ny >= CEILING:
            velocity[1] = 0
        return [nx, max(next_floor, ny), nz], velocity

    def walk(self, position, dx, dz, dt):
        x, _, z = position
        speed = 1.35 if self.height(x, z) < 0.1 else 2.8
        nx, nz = x + dx * dt * speed, z + dz * dt * speed
        nx, nz = coordinates(nx, nz)
        before, after = self.ground(x, z), self.ground(nx, nz)
        if after - before > 0.24 + math.hypot(coordinates(nx - x, 0)[0], nz - z) * 0.8:
            return [x, before, z]
        tile = self.tile(math.floor(nx / SIZE), math.floor(nz / SIZE))
        for prop in tile['props']:
            radius = {'palm': 0.35, 'broadleaf': 0.45, 'rock': 0.7, 'cliff': 1.4}.get(prop['kind'], 0) * prop['scale']
            if radius and math.hypot(nx - prop['position'][0], nz - prop['position'][2]) < radius + 0.23:
                return [x, before, z]
        return [nx, after, nz]
