"""Laptop-authoritative targets and ballistic arrows, in metres and seconds."""
from dataclasses import dataclass
import math
import random

STEP = 1 / 60
BOUNDS = ((-3.1, 3.1), (0.65, 2.6), (-6.7, -3.4))
GRAVITY = 9.81
ARROW_MASS = 0.028
BOW_STIFFNESS = 240.0
BOW_EFFICIENCY = 0.7
MAX_DRAW = 0.65


def arrow_speed(draw):
    # 1/2 k x² * efficiency = 1/2 m v². Training-bow approximation.
    return draw * math.sqrt(BOW_STIFFNESS * BOW_EFFICIENCY / ARROW_MASS)


@dataclass
class Arrow:
    ident: int
    position: list[float]
    velocity: list[float]
    age: float = 0.0
    stuck: bool = False


@dataclass
class Body:
    position: list[float]
    velocity: list[float]
    radius: float = 0.27
    cooldown: float = 0.0


class World:
    def __init__(self, seed=None):
        self.random = random.Random(seed)
        self.bodies = []
        for index in range(12):
            self.bodies.append(Body(
                [-2.4 + (index % 4) * 1.6, 1.0 + (index // 4) * 0.55, -4.2 - (index // 4) * 0.8],
                [self.random.uniform(-0.5, 0.5) for _ in range(3)],
            ))
        self.phase = 'ready'
        self.score = self.shots = self.hits = self.streak = 0
        self.deadline = 0.0
        self.saved_time = 0.0
        self.saved_phase = 'ready'
        self.arrows = []
        self.events = []
        self.target_speed = 1.0
        self.round_seconds = self.current_round_seconds = 60
        self.last_shot = -math.inf
        self.last_sequence = -1
        self.ticks = 0
        self.wind = [0.0, 0.0, 0.0]

    @property
    def multiplier(self):
        return min(3, 1 + self.streak // 5)

    def start(self, now):
        self.phase = 'countdown'
        self.deadline = now + 3
        self.score = self.shots = self.hits = self.streak = 0
        for body in self.bodies:
            body.cooldown = 0
        self.arrows.clear()
        self.events.clear()
        self.current_round_seconds = self.round_seconds

    def configure(self, rules):
        self.target_speed = rules['targetSpeed']
        self.round_seconds = rules['roundSeconds']

    def update_clock(self, now):
        if self.phase == 'countdown' and now >= self.deadline:
            self.phase = 'playing'
            self.deadline += self.current_round_seconds
        if self.phase == 'playing' and now >= self.deadline:
            self.phase = 'ended'

    def pause(self, now):
        self.update_clock(now)
        if self.phase in ('countdown', 'playing'):
            self.saved_time = max(0, self.deadline - now)
            self.saved_phase = self.phase
            self.phase = 'paused'

    def resume(self, now):
        if self.phase == 'paused':
            self.phase = self.saved_phase
            self.deadline = now + self.saved_time

    def step(self, dt=STEP):
        if self.phase == 'paused':
            return
        self.ticks += 1
        previous_positions = [body.position.copy() for body in self.bodies]
        for body in self.bodies:
            body.cooldown = max(0, body.cooldown - dt)
            if body.cooldown:
                continue
            for axis, (low, high) in enumerate(BOUNDS):
                body.position[axis] += body.velocity[axis] * dt * self.target_speed
                if body.position[axis] < low + body.radius:
                    body.position[axis] = low + body.radius
                    body.velocity[axis] = abs(body.velocity[axis])
                elif body.position[axis] > high - body.radius:
                    body.position[axis] = high - body.radius
                    body.velocity[axis] = -abs(body.velocity[axis])
        # Equal-mass elastic sphere collisions, resolved on the laptop only.
        for index, a in enumerate(self.bodies):
            if a.cooldown:
                continue
            for b in self.bodies[index + 1:]:
                if b.cooldown:
                    continue
                delta = [b.position[k] - a.position[k] for k in range(3)]
                squared = sum(value * value for value in delta)
                radius = a.radius + b.radius
                if squared >= radius * radius:
                    continue
                distance = math.sqrt(squared)
                normal = [value / distance for value in delta] if distance > 1e-8 else [1, 0, 0]
                overlap = (radius - distance) / 2
                relative = sum((b.velocity[k] - a.velocity[k]) * normal[k] for k in range(3))
                for axis in range(3):
                    a.position[axis] -= normal[axis] * overlap
                    b.position[axis] += normal[axis] * overlap
                    if relative < 0:
                        a.velocity[axis] += relative * normal[axis]
                        b.velocity[axis] -= relative * normal[axis]
        self.step_arrows(dt, previous_positions)

    def step_arrows(self, dt, previous_positions):
        for arrow in self.arrows:
            arrow.age += dt
            if arrow.stuck:
                continue
            old = arrow.position.copy()
            # Analytic gravity within each short step, light linear air drag.
            for axis in range(3):
                arrow.position[axis] += arrow.velocity[axis] * dt
            arrow.position[1] -= 0.5 * GRAVITY * dt * dt
            arrow.velocity[1] -= GRAVITY * dt
            arrow.velocity = [w + (v - w) * math.exp(-0.09 * dt) for v, w in zip(arrow.velocity, self.wind)]
            nearest, hit = 2.0, None
            for index, body in enumerate(self.bodies):
                if body.cooldown or self.phase != 'playing':
                    continue
                # Swept relative motion: a fast arrow cannot tunnel through a moving target.
                old_shapes = self.collision_shapes(body, previous_positions[index])
                new_shapes = self.collision_shapes(body, body.position)
                for (old_center, radius), (new_center, _) in zip(old_shapes, new_shapes):
                    start = [old[k] - old_center[k] for k in range(3)]
                    delta = [arrow.position[k] - new_center[k] - start[k] for k in range(3)]
                    a = sum(v * v for v in delta)
                    b = 2 * sum(start[k] * delta[k] for k in range(3))
                    c = sum(v * v for v in start) - (radius + 0.012) ** 2
                    discriminant = b * b - 4 * a * c
                    if c <= 0:
                        fraction = 0.0
                    elif a > 1e-12 and discriminant >= 0:
                        fraction = (-b - math.sqrt(discriminant)) / (2 * a)
                    else:
                        continue
                    if 0 <= fraction <= 1 and fraction < nearest:
                        nearest, hit = fraction, index
            floor_old = old[1] - self.floor_height(old[0], old[2])
            floor_new = arrow.position[1] - self.floor_height(arrow.position[0], arrow.position[2])
            floor_fraction = max(0, floor_old / (floor_old - floor_new)) if floor_new <= 0 < floor_old else (0 if floor_old <= 0 else 2)
            if floor_fraction < nearest:
                nearest, hit = floor_fraction, None
            expired = arrow.age > 5
            if nearest <= 1 or expired:
                if nearest <= 1:
                    arrow.position = [old[k] + (arrow.position[k] - old[k]) * nearest for k in range(3)]
                arrow.stuck = True
                arrow.age = 0
                if hit is not None:
                    points = 100 * self.multiplier
                    self.score += points
                    self.hits += 1
                    self.streak += 1
                    self.bodies[hit].cooldown = 0.6 if getattr(self.bodies[hit], 'mission_id', None) else getattr(self, 'respawn_seconds', 0.8)
                    self.events.append({'type': 'hit', 'seq': arrow.ident, 'id': hit, 'points': points, 'target': getattr(self.bodies[hit], 'mission_id', None), 'material': getattr(self.bodies[hit], 'material', 'organic')})
                else:
                    self.streak = 0
                    self.events.append({'type': 'miss', 'seq': arrow.ident})
        self.arrows = [arrow for arrow in self.arrows if not (arrow.stuck and arrow.age > 1.5)]

    def take_events(self):
        events, self.events = self.events, []
        return events

    def floor_height(self, x, z):
        return 0.0

    def collision_shapes(self, body, position):
        return [(position, body.radius)]

    def valid_origin(self, origin):
        return sum(value * value for value in origin) <= 400 and origin[1] >= 0.05

    def snapshot(self, now):
        self.update_clock(now)
        bodies = [[i, *[round(value, 5) for value in body.position], body.radius, not bool(body.cooldown)]
                  for i, body in enumerate(self.bodies)]
        remaining = self.saved_time if self.phase == 'paused' else max(0, self.deadline - now)
        return {'type': 'state', 'time': now, 'tick': self.ticks, 'phase': self.phase,
                'remaining': remaining if self.phase != 'ready' else self.round_seconds,
                'roundSeconds': self.round_seconds,
                'score': self.score, 'shots': self.shots, 'hits': self.hits,
                'multiplier': self.multiplier, 'bodies': bodies, 'physicsHz': 60,
                'arrows': [[a.ident, *[round(v, 5) for v in a.position],
                            *[round(v, 5) for v in a.velocity], a.stuck] for a in self.arrows]}

    def loose(self, message, now):
        self.update_clock(now)
        origin, direction = message.get('origin'), message.get('direction')
        draw, sequence = message.get('draw'), message.get('seq')
        if not all(isinstance(vector, list) and len(vector) == 3 for vector in (origin, direction)):
            raise ValueError('Ungültiger Zielstrahl')
        if not all(type(value) in (int, float) and math.isfinite(value) for vector in (origin, direction) for value in vector):
            raise ValueError('Ungültige Koordinaten')
        if type(draw) not in (int, float) or not math.isfinite(draw) or not 0.08 <= draw <= MAX_DRAW:
            raise ValueError('Bogenauszug muss zwischen 0.08 und 0.65 Metern liegen')
        if type(sequence) is not int or sequence <= self.last_sequence:
            raise ValueError('Ungültige Schussnummer')
        length = math.sqrt(sum(value * value for value in direction))
        if not 0.5 < length < 2 or not self.valid_origin(origin):
            raise ValueError('Zielstrahl außerhalb des Spielbereichs')
        direction = [value / length for value in direction]
        self.last_sequence = sequence
        if now - self.last_shot < 0.15 or len(self.arrows) >= 24:
            return {'type': 'ignored', 'seq': sequence}
        self.last_shot = now
        if self.phase != 'playing':
            return {'type': 'ignored', 'seq': sequence}
        speed = arrow_speed(draw)
        self.arrows.append(Arrow(sequence, list(origin), [v * speed for v in direction]))
        self.shots += 1
        return {'type': 'released', 'seq': sequence, 'speed': speed}
