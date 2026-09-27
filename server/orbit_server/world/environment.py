"""Bounded procedural scenery and validated file updates, shared by all players."""
import hashlib
import json
import logging
import math
from pathlib import Path
from orbit_server.paths import ROOT
import re
from orbit_server.world.terrain import IslandTerrain, SIZE
from orbit_server.world.planet import build_planet
from orbit_server.physics.flight import CONFIG as FLIGHT

DEFAULT_PATH = ROOT / 'content' / 'core' / 'world.json'
KINDS = {'box', 'sphere', 'cylinder', 'cone', 'crystal'}


def number(value, low, high, name, integer=False):
    if type(value) not in ((int,) if integer else (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name}: erwartet {low} bis {high}')
    return value


def color(value):
    if not isinstance(value, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
        raise ValueError('Farbe muss #RRGGBB sein')
    return value


def vector(value, low, high):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError('Position/Rotation/Skalierung braucht drei Zahlen')
    return [number(v, low, high, 'Vektor') for v in value]


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('Weltdatei muss ein JSON-Objekt sein')
    title = data.get('title')
    if not isinstance(title, str) or not 1 <= len(title) <= 70:
        raise ValueError('Titel: 1 bis 70 Zeichen')
    gen, rules, palette = (data.get(key) for key in ('generation', 'rules', 'palette'))
    if not all(isinstance(item, dict) for item in (gen, rules, palette)):
        raise ValueError('generation, rules und palette müssen Objekte sein')
    if type(gen.get('enabled')) is not bool:
        raise ValueError('generation.enabled muss true oder false sein')
    generation = {'enabled': gen['enabled'],
                  'viewRadius': number(gen.get('viewRadius', 1), 1, 2, 'Sichtbereiche', True),
                  'density': number(gen.get('density', 1), 0.3, 1.6, 'Vegetationsdichte')}
    rule_values = {'targetSpeed': number(rules.get('targetSpeed', 1), 0, 3, 'Tiergeschwindigkeit'),
                   'roundSeconds': number(rules.get('roundSeconds', 90), 10, 600, 'Rundendauer', True)}
    colors = {key: color(palette.get(key)) for key in ('ground', 'foliage', 'stone', 'accent')}
    source = data.get('objects')
    if not isinstance(source, list) or len(source) > 128:
        raise ValueError('objects: maximal 128 Objekte')
    objects, ids = [], set()
    for item in source:
        if not isinstance(item, dict):
            raise ValueError('Ungültiges Objekt')
        ident = item.get('id')
        if not isinstance(ident, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,48}', ident) or ident in ids:
            raise ValueError('Objekt-IDs müssen eindeutig sein (Buchstaben, Zahlen, _ oder -)')
        ids.add(ident)
        if item.get('kind') not in KINDS or item.get('space', 'both') not in ('both', 'vr'):
            raise ValueError('Unbekannte Objektform oder space')
        objects.append({'id': ident, 'kind': item['kind'], 'position': vector(item.get('position'), -10000, 10000),
                        'scale': vector(item.get('scale', [1, 1, 1]), 0.01, 12),
                        'rotation': vector(item.get('rotation', [0, 0, 0]), -6.284, 6.284),
                        'color': color(item.get('color')), 'space': item.get('space', 'both')})
    return {'title': title, 'seed': number(data.get('seed'), 0, 2**31 - 1, 'Seed', True),
            'generation': generation, 'rules': rule_values, 'palette': colors, 'objects': objects}


class LiveWorld:
    def __init__(self, path=DEFAULT_PATH):
        self.path = Path(path)
        self.config = None
        self.chunks = {}
        self.revision = 0
        self.area_count = 0
        self.error = None
        self._digest = None
        self.terrain = None
        self.planet = None
        self.reload(0)
        if self.config is None:
            raise ValueError(f'Weltdatei konnte nicht geladen werden: {self.error}')

    def read(self):
        with self.path.open('rb') as source:
            return source.read(256 * 1024 + 1)

    def prepare(self, raw=None):
        """Build a replacement off the event loop without publishing partial state."""
        raw = self.read() if raw is None else raw
        if len(raw) > 256 * 1024:
            raise ValueError('Weltdatei ist größer als 256 KiB')
        digest = hashlib.sha256(raw).hexdigest()
        if digest == self._digest:
            return None
        config = validate(json.loads(raw.decode('utf-8-sig')))
        if config == self.config:
            return {'digest': digest, 'unchanged': True}
        terrain, planet = self.terrain, self.planet
        terrain_key = lambda c: (c['seed'], c['palette'], c['generation']['density'])
        if self.config is None or terrain_key(self.config) != terrain_key(config):
            terrain = IslandTerrain(config['seed'], config['palette'], config['generation']['density'])
            planet = build_planet(terrain)
        chunks = {}
        for offset in range(0, len(config['objects']), 24):
            objects = config['objects'][offset:offset + 24]
            ident = f'authored-{offset // 24}'
            chunks[ident] = {'id': ident, 'objects': objects,
                'version': hashlib.sha256(json.dumps(objects, sort_keys=True).encode()).hexdigest()[:16]}
        return {'digest': digest, 'config': config, 'terrain': terrain, 'planet': planet, 'chunks': chunks}

    def apply(self, prepared):
        if prepared is None:
            return False
        self._digest, self.error = prepared['digest'], None
        if prepared.get('unchanged'):
            return False
        self.config, self.terrain = prepared['config'], prepared['terrain']
        self.planet, self.chunks = prepared['planet'], prepared['chunks']
        self.revision += 1
        if self.revision > 1:
            logging.info('Weltdatei übernommen: Revision %s', self.revision)
        return True

    def reject(self, error):
        if str(error) != self.error:
            logging.warning('Letzte gültige Welt bleibt aktiv: %s', error)
        self.error, self._digest = str(error), None

    def reload(self, now, raw=None):
        try:
            return self.apply(self.prepare(raw))
        except (OSError, ValueError, TypeError) as error:
            self.reject(error)
            return False

    def interest(self, position):
        x, height, z = position
        if height > FLIGHT['streamCutoff']:
            return {}  # Orbit uses the overview; ground detail returns before landing.
        if not self.config['generation']['enabled']:
            x = z = 0
        cx, cz = math.floor(x / SIZE), math.floor(z / SIZE)
        radius = self.config['generation']['viewRadius']
        # Cheap terrain-only horizon prevents the detailed area's edge becoming a visible hole.
        horizon = radius + 1
        coords = [(cx + dx, cz + dz) for dz in range(-horizon, horizon + 1) for dx in range(-horizon, horizon + 1)]
        coords.sort(key=lambda c: (max(abs(c[0] - cx), abs(c[1] - cz)) > radius,
                                  (c[0] * SIZE + SIZE / 2 - x) ** 2 + (c[1] * SIZE + SIZE / 2 - z) ** 2))
        chunks = {}
        for coord in coords:
            chunk = self.terrain.tile(*coord)
            if max(abs(coord[0] - cx), abs(coord[1] - cz)) > radius:
                chunk = {**chunk, 'props': [], 'falls': [], 'version': chunk['version'] + '-far'}
            chunks[chunk['id']] = chunk
        chunks.update(self.chunks)
        self.area_count = len(self.terrain.cache)
        return chunks

    def packet(self, known=None, position=(0, 0, 0), include_planet=True):
        known = known if known is not None else {}
        chunks = self.interest(position)
        packet = {'type': 'environment', 'revision': self.revision, 'full': not bool(known),
                'title': self.config['title'], 'areas': len(chunks), 'rules': self.config['rules'],
                'upsert': [chunk for key, chunk in chunks.items() if known.get(key) != chunk['version']],
                'remove': [key for key in known if key not in chunks]}
        if include_planet:
            packet['planet'] = self.planet
        return packet
