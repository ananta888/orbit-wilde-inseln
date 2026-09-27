import math
import unittest

from orbit_server.physics.ballistics import Body, World, STEP, arrow_speed, GRAVITY


class SimulationTests(unittest.TestCase):
    def test_physics_runs_and_bounces_on_laptop(self):
        world = World(16)
        world.bodies = [Body([2.82, 1, -4], [1, 0, 0])]
        world.step(0.1)
        self.assertLess(world.bodies[0].velocity[0], 0)
        self.assertLessEqual(world.bodies[0].position[0], 3.1 - 0.27)

    def test_equal_mass_collision_exchanges_velocity(self):
        world = World(16)
        world.bodies = [Body([0, 1, -4], [1, 0, 0]), Body([0.5, 1, -4], [-1, 0, 0])]
        world.step(0)
        self.assertEqual(world.bodies[0].velocity[0], -1)
        self.assertEqual(world.bodies[1].velocity[0], 1)
        self.assertAlmostEqual(world.bodies[1].position[0] - world.bodies[0].position[0], 0.54)

    def test_countdown_pause_resume_and_deadline(self):
        world = World(16)
        world.start(10)
        self.assertEqual(world.snapshot(12)['phase'], 'countdown')
        self.assertEqual(world.snapshot(14)['remaining'], 59)
        world.pause(15)
        self.assertEqual(world.snapshot(200)['remaining'], 58)
        ticks = world.ticks
        world.step()
        self.assertEqual(world.ticks, ticks)
        world.resume(200)
        self.assertEqual(world.snapshot(257)['phase'], 'playing')
        self.assertEqual(world.snapshot(258)['phase'], 'ended')

    def test_server_ballistic_hit_and_cooldown(self):
        world = World(16)
        world.bodies = [Body([0, 1, -4], [0, 0, 0])]
        world.start(0)
        message = {'origin': [0, 1, 0], 'direction': [0, 0, -1], 'draw': 0.65, 'seq': 1}
        result = world.loose(message, 4)
        self.assertEqual(result['type'], 'released')
        self.assertEqual(world.score, 0, 'A release alone must not score')
        for _ in range(8):
            world.step()
        self.assertEqual(world.score, 100)
        self.assertEqual(world.take_events()[0]['type'], 'hit')
        message['seq'] = 2
        world.loose(message, 4.2)
        for _ in range(8):
            world.step()
        self.assertEqual(world.hits, 1)

    def test_draw_energy_gravity_and_swept_collision(self):
        self.assertAlmostEqual(arrow_speed(0.6), 2 * arrow_speed(0.3))
        world = World(16)
        world.bodies = []
        world.start(0)
        world.loose({'origin': [0, 2, 0], 'direction': [0, 0, -1], 'draw': 0.6, 'seq': 1}, 4)
        world.step(0.1)
        self.assertAlmostEqual(world.arrows[0].position[1], 2 - 0.5 * GRAVITY * 0.01)
        self.assertLess(world.arrows[0].velocity[1], 0)
        # A whole target diameter is crossed between two snapshots/steps.
        world = World(16)
        world.bodies = [Body([0, 1, -4], [0, 0, 0], radius=0.05)]
        world.start(0)
        world.loose({'origin': [0, 1.03, -3.5], 'direction': [0, 0, -1], 'draw': 0.65, 'seq': 1}, 4)
        world.step(STEP)
        self.assertEqual(world.hits, 1)

    def test_live_rules_preserve_score_and_current_round(self):
        world = World(16)
        world.configure({'targetSpeed': 0.5, 'roundSeconds': 90})
        world.start(0)
        world.snapshot(4)
        world.score = 300
        world.configure({'targetSpeed': 0, 'roundSeconds': 30})
        positions = [body.position.copy() for body in world.bodies]
        world.step()
        self.assertEqual(positions, [body.position for body in world.bodies])
        self.assertEqual(world.snapshot(4)['remaining'], 89)
        self.assertEqual(world.score, 300)
        world.start(10)
        self.assertEqual(world.snapshot(14)['remaining'], 29)

    def test_pause_freezes_arrows_and_misses_expire(self):
        world = World(16)
        world.bodies = []
        world.start(0)
        world.loose({'origin': [0, 1, 0], 'direction': [0, 0, -1], 'draw': 0.1, 'seq': 1}, 4)
        world.pause(4.1)
        initial = world.snapshot(4.1)['arrows']
        world.step(1)
        self.assertEqual(initial, world.snapshot(5)['arrows'])
        world.resume(5)
        for _ in range(180):
            world.step()
        self.assertEqual(world.arrows, [])
        self.assertEqual([e['type'] for e in world.take_events()], ['miss'])

    def test_invalid_input_cannot_corrupt_world(self):
        world = World(16)
        for origin in ([math.nan, 0, 0], [math.inf, 0, 0], ['0', 0, 0], [0], None):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                world.loose({'origin': origin, 'direction': [0, 0, -1], 'draw': 0.5, 'seq': 1}, 0)
        for draw in (math.nan, math.inf, -1, 0, 0.66, True):
            with self.subTest(draw=draw), self.assertRaises(ValueError):
                world.loose({'origin': [0, 1, 0], 'direction': [0, 0, -1], 'draw': draw, 'seq': 1}, 0)
        self.assertEqual(world.score, 0)

    def test_duplicate_packet_cannot_score_twice(self):
        world = World(16)
        world.start(0)
        message = {'origin': [0, 1, 0], 'direction': [0, 0, -1], 'draw': 0.5, 'seq': 7}
        world.loose(message, 4)
        with self.assertRaises(ValueError):
            world.loose(message, 5)


if __name__ == '__main__':
    unittest.main()
