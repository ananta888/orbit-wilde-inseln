import copy
import json
from pathlib import Path
import tempfile
import unittest
from orbit_server.world.environment import DEFAULT_PATH, LiveWorld, validate
from orbit_server.world.terrain import STEPS


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'scene.json'
        self.data = json.loads(DEFAULT_PATH.read_text(encoding='utf-8'))
        self.save(); self.world = LiveWorld(self.path)

    def save(self):
        self.path.write_text(json.dumps(self.data), encoding='utf-8')

    def test_streaming_moves_with_player_and_reconnect_restores_same_terrain(self):
        first = self.world.packet()
        known = {c['id']: c['version'] for c in first['upsert']}
        self.assertEqual(len(known), 25)
        self.assertEqual(first, LiveWorld(self.path).packet())
        moved = self.world.packet(known, [33, 3, 0])
        self.assertEqual(len(moved['upsert']), 11)
        self.assertEqual(len(moved['remove']), 5)
        self.assertTrue(any(c['id'].startswith('tile:3:') for c in moved['upsert']))
        self.assertTrue(all(not c['props'] for c in moved['upsert'] if c['version'].endswith('-far')))
        returned = self.world.packet(position=[0, 3, 0])
        self.assertEqual({c['id']: c['version'] for c in returned['upsert']}, known)

    def test_height_fields_meet_without_cracks_and_cache_is_bounded(self):
        terrain = self.world.terrain
        a, b = terrain.tile(0, 0)['terrain'], terrain.tile(1, 0)['terrain']
        for row in range(STEPS + 1):
            self.assertEqual(a['heights'][row * (STEPS + 1) + STEPS], b['heights'][row * (STEPS + 1)])
        for i in range(115):
            terrain.tile(i, 0)
        self.assertLessEqual(len(terrain.cache), 96)
        self.assertLessEqual(len(terrain.islands), 256)

    def test_live_edits_and_invalid_file_preserve_last_good_world(self):
        original = self.world.packet()
        known = {c['id']: c['version'] for c in original['upsert']}
        self.data['objects'] = [{'id': 'tower', 'kind': 'box', 'position': [3, 3, -5], 'color': '#ff0000'}]
        self.save(); self.assertTrue(self.world.reload(20))
        edited = self.world.packet(known)
        self.assertEqual([c['id'] for c in edited['upsert']], ['authored-0'])
        revision = self.world.revision
        self.path.write_text('{unfinished', encoding='utf-8')
        self.assertFalse(self.world.reload(21)); self.assertIsNotNone(self.world.error)
        self.assertEqual(self.world.revision, revision)
        self.save(); self.world.reload(22); self.assertIsNone(self.world.error)
        self.data['palette']['foliage'] = '#119966'; self.save(); self.world.reload(23)
        self.assertGreater(len(self.world.packet(known)['upsert']), 1)

    def test_validation_limits(self):
        for key, value in [('viewRadius', 10), ('density', float('nan')), ('density', 100)]:
            invalid = copy.deepcopy(self.data); invalid['generation'][key] = value
            with self.assertRaises(ValueError): validate(invalid)

    def test_planet_is_same_seed_and_ground_detail_returns_from_orbit(self):
        first = self.world.packet()
        globe = first['planet']; stride = globe['width'] + 1
        self.assertEqual(globe['seed'], self.data['seed'])
        self.assertEqual(len(globe['heights']), stride * (globe['height'] + 1))
        center = globe['height'] // 2 * stride + globe['width'] // 2
        self.assertEqual(globe['heights'][center], self.world.terrain.raw_height(0, 0))
        for row in range(globe['height'] + 1):
            self.assertEqual(globe['heights'][row * stride], globe['heights'][row * stride + globe['width']])
        known = {chunk['id']: chunk['version'] for chunk in first['upsert']}
        orbit = self.world.packet(known, (200, 800, 40), include_planet=False)
        self.assertEqual(set(orbit['remove']), set(known)); self.assertEqual(orbit['upsert'], [])
        self.assertNotIn('planet', orbit)
        returned = self.world.packet({}, (200, 100, 40))
        self.assertEqual(len(returned['upsert']), 25)
        self.assertEqual(returned['planet']['version'], globe['version'])

    def test_world_replacement_is_published_atomically_after_background_build(self):
        revision, terrain, planet = self.world.revision, self.world.terrain, self.world.planet
        self.data['seed'] += 1
        candidate = self.world.prepare(json.dumps(self.data).encode())
        self.assertEqual(self.world.revision, revision)
        self.assertIs(self.world.terrain, terrain); self.assertIs(self.world.planet, planet)
        self.world.apply(candidate)
        self.assertEqual(self.world.revision, revision + 1)
        self.assertEqual(self.world.planet['seed'], self.data['seed'])
        self.assertIsNot(self.world.terrain, terrain)
