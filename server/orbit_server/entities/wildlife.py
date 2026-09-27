"""Open-ended exploration, authoritative locomotion and wandering wildlife."""
from dataclasses import dataclass, field
from orbit_server.entities.mission_objects import MissionTarget
import math
import random
from orbit_server.physics.ballistics import World, Body, STEP
from orbit_server.world.terrain import SIZE
from orbit_server.physics.flight import CONFIG as FLIGHT, CEILING, boost, coordinates


@dataclass
class Creature(Body):
    ident: str = ''
    species: str = 'deer'
    home: list = field(default_factory=list)
    heading: float = 0
    mood: str = 'grazing'
    age: float = 0


class Expedition(World):
    def __init__(self, environment):
        super().__init__(environment.config['seed'])
        self.environment = environment
        self.mode = 'vr'
        self.flying = False
        self.velocity = [0, 0, 0]
        self.player = [0, environment.terrain.ground(0, 0), 0]
        self.move_sequence = -1
        self.move_time = None
        self.move_credit = 0.2
        self.distance = 0
        self.visited = set()
        self.respawn_seconds = 25
        self.bodies = []
        self.mission_targets = []
        self.region = None
        self.elapsed = 0
        self.populate()

    def enter(self, mode):
        if mode not in ('mr', 'vr', 'desktop'):
            raise ValueError('Unbekannter Spielmodus')
        self.mode = mode
        self.flying = False
        self.velocity = [0, 0, 0]
        self.phase = 'ready'
        self.player = [0, 0 if mode == 'mr' else self.environment.terrain.ground(0, 0), 0]
        self.region = None
        self.populate()

    def start(self, now):
        self.phase = 'playing'

    def update_clock(self, now):
        pass  # Exploration has no countdown or time limit.

    def pause(self, now):
        if self.phase == 'playing':
            self.phase = 'paused'
            self.velocity = [0, 0, 0]

    def resume(self, now):
        if self.phase == 'paused':
            self.phase = 'playing'

    def floor_height(self, x, z):
        return 0 if self.mode == 'mr' else max(0, self.environment.terrain.height(x, z))

    def valid_origin(self, origin):
        return math.hypot(origin[0] - self.player[0], origin[2] - self.player[2]) < 6 and abs(origin[1] - self.player[1]) < 4

    def collision_shapes(self, body, position):
        if isinstance(body, MissionTarget): return [(position, body.radius)]
        head = {'deer': (0.68, .64, .25), 'boar': (.06, .62, .29), 'alien': (.88, .01, .34)}[body.species]
        dy, forward, radius = head
        return [(position, body.radius), ([position[0] + math.sin(body.heading) * forward,
                position[1] + dy, position[2] + math.cos(body.heading) * forward], radius)]

    def move(self, message, now):
        direction, dt, seq = message.get('direction'), message.get('dt'), message.get('seq')
        if not isinstance(direction, list) or len(direction) not in (2, 3) or any(type(v) not in (int, float) or not math.isfinite(v) for v in direction):
            raise ValueError('Ungültige Bewegungsrichtung')
        flying = message.get('flight', self.flying)
        if type(flying) is not bool:
            raise ValueError('Ungültiger Flugmodus')
        if type(dt) not in (int, float) or not math.isfinite(dt) or not 0 < dt <= 0.12 or type(seq) is not int or seq <= self.move_sequence:
            raise ValueError('Ungültiger Bewegungsschritt')
        self.move_credit = min(0.3, self.move_credit + (0 if self.move_time is None else max(0, now - self.move_time)))
        self.move_time, self.move_sequence = now, seq
        step_time = min(dt, self.move_credit)
        self.move_credit -= step_time
        if self.mode == 'mr' or self.phase != 'playing':
            return
        self.flying = flying
        dx, dy, dz = direction if len(direction) == 3 else (direction[0], 0, direction[1])
        length = max(1, math.hypot(dx, dz))
        dx, dy, dz = dx / length, max(-1, min(1, dy)), dz / length
        before = self.player[:]
        # Same small steps as local visual prediction.
        while step_time > 1e-7:
            part = min(STEP, step_time)
            self.player, self.velocity = self.environment.terrain.travel(self.player, self.velocity, dx, dy, dz, part, self.flying)
            step_time -= part
        self.distance += math.hypot(coordinates(self.player[0] - before[0], 0)[0], self.player[2] - before[2])
        self.populate()

    def populate(self):
        cx, cz = math.floor(self.player[0] / SIZE), math.floor(self.player[2] / SIZE)
        orbital = self.mode != 'mr' and self.player[1] > FLIGHT['streamCutoff']
        region = (cx, cz, self.environment.config['seed'], self.mode, orbital)
        if region == self.region:
            return
        self.region = region
        self.visited.add((cx, cz))
        if len(self.visited) > 4096:
            self.visited.pop()
        if orbital:
            self.bodies = []
            return
        old = {body.ident: body for body in self.bodies if not isinstance(body, MissionTarget)}
        specs = [('deer', -3.0, -8.0), ('boar', 4.0, -11.0), ('alien', 0.5, -17.0)]
        for z in range(cz - 1, cz + 2):
            for x in range(cx - 1, cx + 2):
                rng = random.Random(f'{region[2]}/wildlife/{x}/{z}')
                for j in range(2):
                    px, pz = (x + rng.uniform(0.15, 0.85)) * SIZE, (z + rng.uniform(0.15, 0.85)) * SIZE
                    if self.environment.terrain.height(px, pz) > 0.7:
                        specs.append((['deer', 'boar', 'alien'][(x + z + j) % 3], px, pz))
        self.bodies = []
        for index, (species, x, z) in enumerate(specs):
            if math.hypot(x - self.player[0], z - self.player[2]) > 61 or (self.mode == 'mr' and index > 2):
                continue
            ident = f'{species}/{x:.2f}/{z:.2f}'
            if ident in old:
                self.bodies.append(old[ident]); continue
            radius = {'deer': 0.48, 'boar': 0.45, 'alien': 0.5}[species]
            center = {'deer': 0.85, 'boar': 0.56, 'alien': 1.0}[species]
            self.bodies.append(Creature([x, self.floor_height(x, z) + center, z], [0, 0, 0], radius,
                                       ident=ident, species=species, home=[x, z], age=index * 2.3, heading=index * 0.7))

        self.bodies.extend(self.mission_targets)

    def step(self, dt=STEP):
        if self.phase == 'paused':
            return
        self.ticks += 1
        if self.mode != 'mr':
            floor = self.ground_height()
            self.player[1] = max(floor, min(CEILING, self.player[1]))
        if self.phase == 'playing':
            self.elapsed += dt
        self.populate()
        previous = [body.position.copy() for body in self.bodies]
        for body in self.bodies:
            body.cooldown = max(0, body.cooldown - dt)
            if isinstance(body, MissionTarget):
                body.advance(self.elapsed)
                continue
            body.age += dt
            if body.cooldown:
                continue
            x, _, z = body.position
            distance = math.hypot(x - self.player[0], z - self.player[2])
            alert = distance < (7 if body.species == 'deer' else 4)
            body.mood = 'alert' if alert else ('walking' if math.sin(body.age * 0.27) > -0.3 else 'grazing')
            if alert and body.species != 'alien':
                dx, dz = x - self.player[0], z - self.player[2]
                speed = 2.0
            else:
                tx = body.home[0] + math.sin(body.age * 0.10) * 4
                tz = body.home[1] + math.cos(body.age * 0.13) * 3
                dx, dz = tx - x, tz - z
                speed = 0.45 if body.mood != 'grazing' else 0
            norm = max(1e-6, math.hypot(dx, dz))
            dx, dz = dx / norm * speed * self.target_speed, dz / norm * speed * self.target_speed
            nx, nz = x + dx * dt, z + dz * dt
            if self.mode == 'mr' or self.environment.terrain.height(nx, nz) > 0.35:
                body.position[0], body.position[2] = nx, nz
                if speed and self.target_speed:
                    body.heading = math.atan2(dx, dz)
            center = {'deer': 0.85, 'boar': 0.56, 'alien': 1.0}[body.species]
            body.position[1] = self.floor_height(body.position[0], body.position[2]) + center
            body.velocity = [dx, 0, dz]
        self.step_arrows(dt, previous)

    def ground_height(self):
        terrain = self.environment.terrain
        return max(-.5, terrain.raw_height(self.player[0], self.player[2])) if self.player[1] > FLIGHT['streamCutoff'] else terrain.ground(self.player[0], self.player[2])

    def snapshot(self, now):
        state = super().snapshot(now)
        altitude = 0 if self.mode == 'mr' else max(0, self.player[1] - self.ground_height())
        state.update(player=[round(v, 5) for v in self.player], moveAck=self.move_sequence,
                     velocity=[round(v, 6) for v in self.velocity], speed=round(math.hypot(*self.velocity), 1),
                     flightBoost=round(boost(self.player[1]), 2),
                     flying=self.flying, altitude=round(altitude, 2),
                     locomotion='fly' if self.flying else ('landing' if altitude > 0.001 else 'walk'),
                     elapsed=round(self.elapsed, 1), distance=round(self.distance, 1), discovered=len(self.visited),
                     creatures=[{'id': b.ident, 'species': b.species, 'position': [round(v, 4) for v in b.position],
                                 'heading': round(b.heading, 4), 'active': not bool(b.cooldown),
                                 'mood': b.mood, 'speed': round(math.hypot(b.velocity[0], b.velocity[2]), 3)} for b in self.bodies if not isinstance(b, MissionTarget)])
        state.pop('bodies')
        return state
