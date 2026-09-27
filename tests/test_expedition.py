import math
import unittest
from orbit_server.world.environment import LiveWorld
from orbit_server.entities.wildlife import Expedition
from orbit_server.physics.flight import CEILING, HALF_WORLD, boost


class ExpeditionTests(unittest.TestCase):
    def setUp(self):
        self.env = LiveWorld(); self.world = Expedition(self.env)

    def advance_motion(self, direction, seconds, flying):
        for _ in range(round(seconds / .05)):
            seq = self.world.move_sequence + 1
            self.world.move({'direction': direction, 'dt': .05, 'seq': seq, 'flight': flying}, seq * .05)
            for _ in range(3): self.world.step()

    def test_flight_climbs_hovers_and_streams_new_islands(self):
        self.world.start(0)
        ground = self.world.player[1]
        self.advance_motion([0, 1, 0], 4, True)
        self.assertGreater(self.world.player[1], ground + 11)
        self.assertLess(self.world.player[1], ground + 12, 'Acceleration must be gradual')
        self.advance_motion([0, 0, 0], 2, True)
        hover = self.world.player[1]
        self.assertEqual(self.world.velocity, [0, 0, 0])
        for _ in range(120): self.world.step()
        self.assertEqual(self.world.player[1], hover, 'No sinking while hovering')
        initial = self.env.packet(position=self.world.player)
        known = {c['id']: c['version'] for c in initial['upsert']}
        self.advance_motion([0, 0, -1], 8, True)
        self.assertLess(self.world.player[2], -40)
        self.assertGreater(self.world.player[2], -44)
        self.assertEqual(self.world.player[1], hover)
        update = self.env.packet(known, self.world.player)
        self.assertTrue(update['remove']); self.assertTrue(update['upsert'])
        self.assertIn('tile:0:-4', {c['id'] for c in update['upsert']})
        self.assertEqual(self.world.snapshot(12)['locomotion'], 'fly')
        origin = [self.world.player[0], self.world.player[1] + 1.5, self.world.player[2]]
        self.assertEqual(self.world.loose({'origin': origin, 'direction': [0, 0, -1], 'draw': .6, 'seq': 1}, 12)['type'], 'released')

    def test_landing_is_gradual_can_be_cancelled_and_stops_at_ground(self):
        self.world.start(0)
        ground = self.world.player[1]
        self.advance_motion([0, 1, 0], 2, True)
        peak = self.world.player[1]
        self.advance_motion([0, 0, 0], .5, False)
        self.assertLess(self.world.player[1], peak)
        self.assertGreater(self.world.player[1], ground)
        self.assertEqual(self.world.snapshot(3)['locomotion'], 'landing')
        before_hover = self.world.player[1]
        self.advance_motion([0, 0, 0], 1.5, True)
        self.assertEqual(self.world.velocity[1], 0, 'Re-enabling flight gradually arrests descent')
        self.assertGreater(self.world.player[1], before_hover - .6)
        self.advance_motion([0, 0, 0], 3, False)
        self.assertAlmostEqual(self.world.player[1], ground)
        self.assertEqual(self.world.snapshot(6)['locomotion'], 'walk')

    def test_flight_limits_direction_speed_ground_and_ceiling(self):
        self.world.start(0)
        ground = self.world.player[1]
        self.advance_motion([0, 999, 0], .1, True)
        self.assertGreater(self.world.player[1], ground)
        self.assertLess(self.world.player[1], ground + .3)
        self.world.player[1] = CEILING - 1; self.world.velocity = [0, 300, 0]
        self.advance_motion([0, 1, 0], .1, True)
        self.assertEqual(self.world.player[1], CEILING)
        self.assertEqual(self.world.velocity[1], 0)
        self.advance_motion([100, 0, -100], .5, True)
        self.assertLessEqual(math.hypot(self.world.velocity[0], self.world.velocity[2]), 550)
        self.advance_motion([0, -100, 0], 60, True)
        self.assertAlmostEqual(self.world.player[1], self.env.terrain.ground(self.world.player[0], self.world.player[2]))

    def test_high_flight_accelerates_wraps_and_keeps_ground_work_bounded(self):
        self.world.start(0)
        self.assertLess(boost(20), boost(100)); self.assertLess(boost(100), boost(400))
        self.assertEqual(boost(4000), 100)
        self.world.player = [HALF_WORLD - 1, 800, 0]
        self.world.velocity = [500, 0, 0]
        self.advance_motion([1, 0, 0], .05, True)
        self.assertLess(self.world.player[0], -900)
        self.assertLess(self.world.distance, 30, 'Wrapping must not count as a 2 km jump')
        self.assertEqual(self.world.bodies, [])
        self.assertEqual(self.env.packet(position=self.world.player)['upsert'], [])

    def test_pause_and_mixed_reality_prevent_flight_and_mode_switch_resets_it(self):
        self.world.start(0)
        self.advance_motion([0, 1, 0], .5, True)
        self.world.pause(1); position = self.world.player[:]
        self.advance_motion([0, -1, 0], 1, False)
        self.assertEqual(self.world.player, position); self.assertTrue(self.world.flying)
        self.world.resume(2)
        self.advance_motion([0, 0, 0], .1, True)
        self.assertEqual(self.world.player, position)
        self.world.enter('mr'); self.world.start(3)
        self.advance_motion([1, 1, -1], 1, True)
        self.assertEqual(self.world.player, [0, 0, 0]); self.assertFalse(self.world.flying)
        self.world.enter('vr'); self.world.start(4)
        self.advance_motion([0, 1, 0], .1, False)
        self.assertEqual(self.world.player[1], self.env.terrain.ground(0, 0))

    def test_invalid_flight_input_and_packet_spam_cannot_add_height(self):
        self.world.start(0)
        ground = self.world.player[1]
        for direction, flying in [([0, math.nan, 0], True), ([0, math.inf, 0], True), ([0, True, 0], True), ([0, 1, 0], 'yes'), ([0, 1, 0], 1)]:
            with self.assertRaises(ValueError):
                self.world.move({'direction': direction, 'flight': flying, 'dt': .05, 'seq': 0}, 0)
        self.assertEqual(self.world.move_sequence, -1)
        for seq in range(30):
            self.world.move({'direction': [0, 1, 0], 'flight': True, 'dt': .1, 'seq': seq}, 1)
        self.assertLessEqual(self.world.player[1], ground + .600001)

    def test_three_species_roam_on_ground_without_round_timeout(self):
        self.assertEqual({b.species for b in self.world.bodies}, {'deer', 'boar', 'alien'})
        initial = [b.position[:] for b in self.world.bodies]
        self.world.start(0)
        for _ in range(180): self.world.step()
        self.assertNotEqual(initial, [b.position for b in self.world.bodies])
        state = self.world.snapshot(999999)
        self.assertEqual(state['phase'], 'playing'); self.assertNotIn('bodies', state)
        self.assertTrue(all(b['species'] in ('deer', 'boar', 'alien') for b in state['creatures']))

    def test_walking_is_authoritative_and_pause_mr_and_bad_input_block_motion(self):
        self.world.start(0)
        for seq in range(40):
            self.world.move({'direction': [0, -1], 'dt': .05, 'seq': seq}, seq * .05)
        self.assertLess(self.world.player[2], -4)
        self.assertAlmostEqual(self.world.player[1], self.env.terrain.ground(self.world.player[0], self.world.player[2]))
        self.assertGreater(self.world.distance, 4)
        position = self.world.player[:]; self.world.pause(3)
        self.world.move({'direction': [1, 0], 'dt': .05, 'seq': 40}, 3)
        self.assertEqual(self.world.player, position)
        self.world.enter('mr'); self.world.resume(4)
        self.world.move({'direction': [0, -1], 'dt': .05, 'seq': 41}, 4)
        self.assertEqual(self.world.player, [0, 0, 0])
        for direction, dt, seq in [([math.nan, 0], .05, 42), ([1, 0], 1, 42), ([1, 0], .05, 41)]:
            with self.assertRaises(ValueError): self.world.move({'direction': direction, 'dt': dt, 'seq': seq}, 5)

    def test_shots_remain_valid_far_from_initial_island(self):
        self.world.player = [100, self.env.terrain.ground(100, 0), 0]
        self.world.start(0)
        origin = [100, self.world.player[1] + 1.5, 0]
        result = self.world.loose({'origin': origin, 'direction': [0, 0, -1], 'draw': .6, 'seq': 1}, 1)
        self.assertEqual(result['type'], 'released')
        self.world.step(); self.assertFalse(self.world.arrows[0].stuck)
        with self.assertRaises(ValueError):
            self.world.loose({'origin': [0, 2, 0], 'direction': [0, 0, -1], 'draw': .6, 'seq': 2}, 2)

    def test_head_hit_and_mode_switch_after_pause(self):
        self.world.target_speed = 0
        deer = self.world.bodies[0]; deer.heading = 0
        self.world.bodies = [deer]
        self.world.start(0)
        self.world.loose({'origin': [deer.position[0], deer.position[1] + .74, deer.position[2] + 5],
                          'direction': [0, 0, -1], 'draw': .65, 'seq': 1}, 1)
        for _ in range(15): self.world.step()
        self.assertEqual(self.world.hits, 1)
        self.world.pause(2); self.world.enter('mr'); self.world.start(3)
        self.assertEqual(self.world.phase, 'playing')
        self.assertEqual(self.world.player, [0, 0, 0])
