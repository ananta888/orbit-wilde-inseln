import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DesignClient } from './networking/client.js';
import { CreatureView } from './rendering.js';
import { PinchState, Stroke } from './input.js';
import { Palette } from './palette.js';
import { download, existingArin, exportGLB, importFile } from './assets.js';
import { VoiceCapture } from '../audio/recording.js';
import { WorkpieceNavigation } from './navigation.js';

const $ = id => document.getElementById(id);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#182d28');
scene.fog = new THREE.Fog('#182d28', 8, 32);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .01, 200);
camera.position.set(1.65, 1.9, 1.9);
const renderer = new THREE.WebGLRenderer({ canvas: $('world'), antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
renderer.setClearColor('#182d28', 1);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.1, -1.1);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; controls.update();
scene.add(new THREE.HemisphereLight('#daefd9', '#203635', 2.5));
const sun = new THREE.DirectionalLight('#fff1c4', 3); sun.position.set(3, 6, 1); scene.add(sun);
const rim = new THREE.DirectionalLight('#91cfc3', 2); rim.position.set(-4, 3, -4); scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 64), new THREE.MeshStandardMaterial({ color: '#273c33', roughness: .95 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const table = new THREE.Mesh(new THREE.CylinderGeometry(.72, .65, .07, 48),
  new THREE.MeshStandardMaterial({ color: '#58664c', roughness: .7, metalness: .1 }));
table.position.set(0, .82, -1.1); scene.add(table);
const ring = new THREE.Mesh(new THREE.TorusGeometry(.7, .007, 8, 80), new THREE.MeshBasicMaterial({ color: '#b9ce82' }));
ring.rotation.x = Math.PI / 2; ring.position.copy(table.position).y += .04; scene.add(ring);
const stage = new THREE.Group(); stage.position.set(0, .87, -1.1); stage.scale.setScalar(.25); stage.rotation.y = Math.PI; scene.add(stage);
const creature = new CreatureView(stage), ghost = new CreatureView(stage); ghost.root.visible = false;
const cursor = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshBasicMaterial({ color: '#d4ee95', wireframe: true, transparent: true, opacity: .45 }));
cursor.visible = false; scene.add(cursor);
const palette = new Palette(scene); palette.root.visible = false;
const client = new DesignClient(), selected = new Set();
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
let lastHit = null, stroke = null, activeSource = null, living = false, clip = null, proposal = null, originalShown = false, flight = false;
let micStream = null, mixed = false;
const grips = new Map(), navigation = new WorkpieceNavigation(stage);
let beforeFlight = null;
export const workspace = { scene, camera, renderer, creature, client, selected, get stroke() { return stroke; } };

function status(text) { $('status').textContent = text; palette.status(text); }
function error(error) { status(error.message || String(error)); }
function guard(action) { return () => Promise.resolve().then(action).catch(error); }
function action(id, fn) { $(id).addEventListener('click', guard(fn)); }
function settings() {
  const color = new THREE.Color($('color').value);
  return { radius: +$('radius').value, strength: +$('strength').value, symmetry: $('symmetry').value,
    radial: +$('radial').value, axis: 1, color: [color.r, color.g, color.b], channel: $('channel').value,
    value: $('tool').value === 'mask' ? ($('erase-mask').checked ? 0 : 1) : $('tool').value === 'scale' ? 1.2 : +$('channel-value').value,
    paint_tool: $('paint-tool').value };
}
function choose(hit, multiple = false) {
  if (!hit) return;
  if (!multiple) selected.clear();
  if (multiple && selected.has(hit.region)) selected.delete(hit.region); else selected.add(hit.region);
  lastHit = hit; creature.highlight(selected);
  $('selection').textContent = [...selected].join(' · ');
}
function surfaceHit(origin, direction) {
  stage.updateMatrixWorld(true); ray.set(origin, direction);
  const found = ray.intersectObjects([...creature.meshes.values()], false)[0];
  if (!found || found.distance > 12) return null;
  const point = stage.worldToLocal(found.point.clone());
  const normal = found.face?.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(found.object.matrixWorld));
  if (!normal) return null;
  normal.transformDirection(new THREE.Matrix4().copy(stage.matrixWorld).invert());
  return { region: found.object.userData.region, point: point.toArray(), normal: normal.toArray(), world: found.point.clone() };
}
function hitFromObject(object) {
  const origin = object.getWorldPosition(new THREE.Vector3()), direction = new THREE.Vector3(0, 0, -1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
  return { origin, direction, hit: surfaceHit(origin, direction) };
}
function begin(hit, source, multiple = false) {
  if (!hit || stroke || flight || client.pending || ghost.root.visible) return;
  choose(hit, multiple || $('multi-select').checked);
  if ($('tool').value === 'select') return;
  living = false; clip = null; creature.pose(false, 0);
  stroke = new Stroke($('tool').value, hit, settings()); activeSource = source;
  if (stroke.settings.symmetry.includes('x')) {
    const part = client.document.regions.get(hit.region).part;
    const other = part.startsWith('left_') ? part.replace(/^left_/, 'right_') : part.startsWith('right_') ? part.replace(/^right_/, 'left_') : null;
    const mirrored = [...client.document.regions.values()].filter(r => r.part === other && !r.locked).map(r => r.id);
    if (mirrored.length) stroke.settings.regions = [hit.region, ...mirrored];
  }
  creature.localPreview(stroke.operation());
}
function move(hit, source) {
  if (hit) {
    cursor.visible = true; cursor.position.copy(hit.world); cursor.scale.setScalar(+$('radius').value * stage.scale.x);
    lastHit = hit;
  } else cursor.visible = false;
  if (stroke && source === activeSource && hit?.region === stroke.region) {
    stroke.update(hit.point); creature.localPreview(stroke.operation());
  }
}
async function finish(source, cancel = false) {
  if (!stroke || source !== activeSource) return;
  const operation = stroke.operation(); stroke = null; activeSource = null;
  if (cancel) creature.resetPreview();
  else { try { await client.command(operation); } catch (failure) { creature.resetPreview(); throw failure; } }
}
function cancel() { if (stroke) finish(activeSource, true).catch(error); grips.clear(); navigation.reset(); }
function domRay(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
  return surfaceHit(ray.ray.origin.clone(), ray.ray.direction.clone());
}
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0 || renderer.xr.isPresenting) return;
  renderer.domElement.setPointerCapture(event.pointerId); begin(domRay(event), 'mouse', event.shiftKey);
});
renderer.domElement.addEventListener('pointermove', event => { if (!renderer.xr.isPresenting) move(domRay(event), 'mouse'); });
renderer.domElement.addEventListener('pointerup', event => { if (event.button === 0) finish('mouse').catch(error); });
renderer.domElement.addEventListener('pointercancel', cancel); addEventListener('blur', cancel);
$('radius').oninput = () => { $('radius-value').value = Math.round(+$('radius').value * 100) + ' cm'; };

client.addEventListener('status', event => status(event.detail));
client.addEventListener('error', event => { error(event.detail); $('conflict').hidden = !event.detail.command_id; creature.resetPreview(); });
client.addEventListener('document', event => {
  const doc = event.detail; cancel(); creature.update(doc); creature.root.visible = true; ghost.root.visible = false; proposal = null; $('proposal').hidden = true;
  for (const id of selected) if (!doc.regions.has(id)) selected.delete(id);
  creature.highlight(selected);
  $('undo').disabled = !doc.history.undo; $('redo').disabled = !doc.history.redo; $('conflict').hidden = true;
  $('stats').textContent = [...doc.regions.values()].reduce((n, r) => n + r.indices.length / 3, 0) + ' Dreiecke · ' + doc.regions.size + ' Bereiche';
  const option = [...$('saved-creatures').options].find(o => o.value === doc.id);
  if (option) option.textContent = doc.name; else $('saved-creatures').add(new Option(doc.name, doc.id));
  $('saved-creatures').value = doc.id;
});
client.addEventListener('proposal', event => {
  proposal = event.detail; $('assistant-text').textContent = event.detail.speech +
    (event.detail.source === 'local-command-parser' ? ' · Lokaler Befehlsmodus, kein LLM.' : ' · Design-KI');
  $('blend').value = 1; $('blend').disabled = !proposal.blendable;
});
client.addEventListener('preview', event => {
  if (event.detail) {
    ghost.load(event.detail); ghost.root.visible = true; creature.root.visible = false; originalShown = false; $('proposal').hidden = false;
  } else { ghost.root.visible = false; creature.root.visible = true; $('proposal').hidden = true; }
});
function targets() { if (!selected.size) throw Error('Zuerst einen Bereich auswählen'); return [...selected]; }
function op(tool, extra = {}) { return client.command({ tool, regions: targets(), ...extra }); }
action('undo', () => client.command(null, 'undo')); action('redo', () => client.command(null, 'redo'));
action('discard', () => client.discardPending());
action('mini', () => { stage.scale.setScalar(.075); stage.position.set(0, .87, -1.1); });
action('life', () => { stage.scale.setScalar(1); stage.position.set(0, 0, -3); });
action('reset', () => { stage.scale.setScalar(.25); stage.position.set(0, .87, -1.1); stage.rotation.set(0, Math.PI, 0); controls.target.set(0, 1.1, -1.1); });
action('apply-material', () => op('material', { material: { detail: $('material').value } }));
action('lock', () => op('lock', { value: true })); action('unlock', () => op('lock', { value: false }));
action('add-part', () => client.command({ tool: 'add', kind: $('part').value, id: 'part_' + crypto.randomUUID().slice(0, 8),
  position: lastHit?.point || [0, 2, 0], size: [.12, .3, .12] }));
for (const tool of ['refine', 'simplify', 'union', 'subtract', 'delete']) action(tool, () => op(tool));
action('cut', () => { if (!lastHit) throw Error('Zuerst eine Schnittfläche markieren'); return op('cut', { position: lastHit.point, normal: lastHit.normal }); });
action('rig', () => client.command({ tool: 'rig' }));
action('pose', () => { $('tool').value = 'pose'; return client.command({ tool: 'pose', bone: targets()[0], rotation: [0, 0, +$('pose-angle').value] }); });
action('living', () => { cancel(); living = !living; clip = null; $('living').textContent = living ? 'Statisch formen' : 'Lebendig ansehen'; });
action('clip', () => {
  const names = client.document.rig.bones.filter(b => b.id.includes('wing')).map(b => b.id);
  if (!names.length) throw Error('Rig mit Flügeln erforderlich');
  return client.command({ tool: 'clip', id: 'fly', duration: 2, loop: true,
    keys: names.flatMap((bone, i) => [0, .5, 1, 1.5, 2].map(time => ({ bone, time, rotation: [0, 0, Math.sin(time * Math.PI) * .3 * (i ? 1 : -1)] }))) });
});
action('mount', () => client.command({ tool: 'mount', id: 'rider_seat', position: lastHit?.point || [0, 1.6, 0], rotation: [0, 0, 0], radius: .3 }));
function stopFlight() {
  if (beforeFlight) { stage.position.copy(beforeFlight.position); stage.scale.copy(beforeFlight.scale); stage.quaternion.copy(beforeFlight.rotation); }
  beforeFlight = null; flight = false; living = false; $('flight').textContent = 'Sitzansicht prüfen';
}
action('flight', () => {
  if (mixed) throw Error('Sitzansicht ist nur im VR- oder Laptopmodus verfügbar');
  cancel();
  if (flight) { stopFlight(); return; }
  beforeFlight = { position: stage.position.clone(), scale: stage.scale.clone(), rotation: stage.quaternion.clone() };
  flight = true; living = true; stage.scale.setScalar(1); stage.quaternion.identity();
  const seat = client.document.mount_points.find(p => p.id === 'rider_seat')?.position || [0, 1.6, 0];
  const head = (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(new THREE.Vector3());
  stage.position.copy(head).sub(new THREE.Vector3(...seat)).add(new THREE.Vector3(0, -.45, -.35));
  $('flight').textContent = 'Zurück zur Werkstatt';
});
action('before', () => { originalShown = !originalShown; creature.root.visible = originalShown; ghost.root.visible = !originalShown; });
function blendPreview() {
  if (!client.preview || !proposal?.blendable) return;
  const amount = +$('blend').value;
  for (const [id, mesh] of ghost.meshes) {
    const a = client.document.regions.get(id), b = client.preview.regions.get(id);
    for (const [field, attr] of [['positions', 'position'], ['colors', 'color'], ['surface', 'surface']]) {
      const target = mesh.geometry.attributes[attr];
      for (let i = 0; i < target.array.length; i++) target.array[i] = a[field][i] + (b[field][i] - a[field][i]) * amount;
      target.needsUpdate = true;
    }
    mesh.geometry.computeVertexNormals();
  }
}
$('blend').oninput = blendPreview;
action('accept', () => client.command(null, 'accept_proposal', { proposal_id: proposal.id, blend: +$('blend').value }));
action('regenerate', () => $('propose').click());
action('reject', () => { client.send({ type: 'reject_proposal' }); ghost.root.visible = false; creature.root.visible = true; });
action('propose', () => { targets(); client.send({ type: 'proposal', instruction: $('instruction').value,
  regions: [...selected], base_revision: client.document.revision }); status('Ananta bereitet eine Vorschau vor …'); });
async function ingest(doc) {
  const response = await fetch('/api/design/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  if (!response.ok) throw Error(await response.text());
  client.send({ type: 'open', id: (await response.json()).id });
}
action('original', () => ingest(existingArin()));
action('open-saved', async () => {
  if ((await client.journal.list()).length) throw Error('Zuerst ausstehende Änderungen sichern');
  if ($('saved-creatures').value) client.send({ type: 'open', id: $('saved-creatures').value });
});
action('analyze', async () => {
  const id = client.document.id, response = await fetch('/api/design/assets/' + id + '/analysis');
  if (!response.ok) throw Error('Modellprüfung fehlgeschlagen');
  const report = await response.json();
  if (client.document.id !== id || client.document.revision !== report.revision) throw Error('Modell seit der Prüfung verändert');
  const text = report.issues.map(i => (i.region ? i.region + ': ' : '') + i.message).join(' · ') || 'Keine strukturellen Geometrieprobleme gefunden';
  $('analysis-result').textContent = text; status(text);
});
action('new', async () => { if ((await client.journal.list()).length) throw Error('Zuerst ausstehende Änderungen sichern'); client.send({ type: 'new', template: $('template').value }); });
action('save', async () => {
  const response = await fetch('/api/design/assets/' + client.document.id);
  if (!response.ok) throw Error('Export fehlgeschlagen');
  download(client.document.name + '.creature.json', await response.text());
});
action('glb-export', () => exportGLB(creature));
$('import').onchange = guard(async () => { const file = $('import').files[0]; if (file) await ingest(await importFile(file)); });
action('journal-export', async () => download('orbit-ausstehende-aenderungen.json', JSON.stringify(await client.journal.list(), null, 2)));
const voice = new VoiceCapture({ onStatus: status, onText: text => { $('instruction').value = text; $('propose').click(); } });
action('mic', async () => {
  if (voice.recording) { voice.finish(); return; }
  if (!micStream) micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  voice.start(micStream);
});

const tools = [...$('tool').options].map(o => o.value);
const spatial = [
  ['Werkzeug ◀', () => { $('tool').value = tools[(tools.indexOf($('tool').value) - 1 + tools.length) % tools.length]; status($('tool').selectedOptions[0].text); }],
  ['Werkzeug ▶', () => { $('tool').value = tools[(tools.indexOf($('tool').value) + 1) % tools.length]; status($('tool').selectedOptions[0].text); }],
  ['Zurück', () => $('undo').click()], ['Wiederholen', () => $('redo').click()],
  ['Kleiner Pinsel', () => { $('radius').value = Math.max(.02, +$('radius').value * .75); }],
  ['Größer Pinsel', () => { $('radius').value = Math.min(1, +$('radius').value * 1.3); }],
  ['Miniatur', () => $('mini').click()], ['Lebensgröße', () => $('life').click()],
  ['Sprechen', () => $('mic').click()], ['Übernehmen', () => $('accept').click()],
  ['Verwerfen', () => $('reject').click()], ['Form hinzufügen', () => $('add-part').click()]
];
function cycle(id) { const element = $(id); element.selectedIndex = (element.selectedIndex + 1) % element.options.length; status(element.selectedOptions[0].text); }
function toggle(id) { $(id).checked = !$(id).checked; status($(id).checked ? 'Eingeschaltet' : 'Ausgeschaltet'); }
const pages = [spatial, [
  ['Pinselart', () => cycle('paint-tool')], ['Farbkanal', () => cycle('channel')],
  ['Farbe wechseln', () => { const colors = ['#408a59', '#8d593d', '#d8c784', '#69b5d4', '#702c9a']; $('color').value = colors[(colors.indexOf($('color').value) + 1) % colors.length]; status('Farbe ' + $('color').value); }],
  ['Material', () => cycle('material')], ['Material anwenden', () => $('apply-material').click()],
  ['Spiegelung', () => cycle('symmetry')], ['Mehrfachauswahl', () => toggle('multi-select')], ['Maske lösen', () => toggle('erase-mask')],
  ['Teil sperren', () => $('lock').click()], ['Teil freigeben', () => $('unlock').click()],
  ['Stärker', () => { $('strength').value = Math.min(1, +$('strength').value + .1); }], ['Schwächer', () => { $('strength').value = Math.max(.05, +$('strength').value - .1); }]
  ], [['Formart', () => cycle('part')], ['Form hinzufügen', () => $('add-part').click()], ['Verbinden', () => $('union').click()],
    ['Abziehen', () => $('subtract').click()], ['Verfeinern', () => $('refine').click()], ['Vereinfachen', () => $('simplify').click()],
    ['Rig vorbereiten', () => $('rig').click()], ['Lebendig / statisch', () => $('living').click()], ['Flügelbewegung', () => $('clip').click()],
    ['Sitz setzen', () => $('mount').click()], ['Sitzansicht', () => $('flight').click()], ['Original ansehen', () => $('before').click()]]];
let palettePage = 0;
function showPalette() {
  palette.actions([...pages[palettePage], ['Werkzeugseite →', () => { palettePage = (palettePage + 1) % pages.length; showPalette(); }]]);
}
showPalette();

const controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
const hands = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
const pinches = [new PinchState(), new PinchState()];
const fists = [new PinchState(1.3, 1.65), new PinchState(1.3, 1.65)];
controllers.forEach((controller, index) => {
  scene.add(controller);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)]),
    new THREE.LineBasicMaterial({ color: '#c5dea8', transparent: true, opacity: .4 }));
  controller.add(line);
  controller.addEventListener('connected', e => { controller.userData.source = e.data; line.visible = !e.data.hand; });
  controller.addEventListener('disconnected', () => { controller.userData.source = null; cancel(); });
  controller.addEventListener('selectstart', () => {
    if (controller.userData.source?.hand || grips.size) return;
    const value = hitFromObject(controller); ray.set(value.origin, value.direction);
    const ui = ray.intersectObjects(palette.buttons, false)[0];
    if (ui) { ui.object.userData.activate(); return; }
    begin(value.hit, 'controller' + index);
    controller.userData.source?.gamepad?.hapticActuators?.[0]?.pulse(.15, 30);
  });
  controller.addEventListener('selectend', () => finish('controller' + index).catch(error));
  controller.addEventListener('squeezestart', () => {
    if (controller.userData.source?.hand || flight) return;
    if (stroke) finish(activeSource, true).catch(error);
    grips.set('controller' + index, controller);
  });
  controller.addEventListener('squeezeend', () => { grips.delete('controller' + index); });
});
hands.forEach(hand => {
  scene.add(hand);
  hand.addEventListener('connected', event => { hand.userData.source = event.data; });
  hand.addEventListener('disconnected', () => { hand.userData.source = null; cancel(); });
});
const jointGeometry = new THREE.SphereGeometry(.009, 8, 6), jointMaterial = new THREE.MeshBasicMaterial({ color: '#dbe5bd' });
const dots = hands.map(() => { const mesh = new THREE.InstancedMesh(jointGeometry, jointMaterial, 25); mesh.visible = false; scene.add(mesh); return mesh; });
async function startXR(mode) {
  const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
  mixed = mode === 'immersive-ar';
  if (mixed && session.environmentBlendMode === 'opaque') { await session.end(); throw Error('Passthrough wird von diesem Browser nicht bereitgestellt'); }
  cancel(); controls.enabled = false; document.body.classList.add('xr'); palette.root.visible = true;
  floor.visible = !mixed; scene.background = mixed ? null : new THREE.Color('#182d28'); scene.fog = mixed ? null : new THREE.Fog('#182d28', 8, 32);
  renderer.setClearColor('#182d28', mixed ? 0 : 1);
  await renderer.xr.setSession(session);
  session.addEventListener('visibilitychange', () => { if (session.visibilityState !== 'visible') { cancel(); voice.finish(true); } });
  session.addEventListener('end', () => {
    if (flight) stopFlight();
    cancel(); voice.finish(true); mixed = false; flight = false; controls.enabled = true; palette.root.visible = false;
    document.body.classList.remove('xr'); floor.visible = true; scene.background = new THREE.Color('#182d28'); scene.fog = new THREE.Fog('#182d28', 8, 32);
    renderer.setClearColor('#182d28', 1); dots.forEach(d => { d.visible = false; });
  });
}
action('vr', () => startXR('immersive-vr')); action('mr', () => startXR('immersive-ar'));
if (navigator.xr) {
  navigator.xr.isSessionSupported('immersive-vr').then(v => { $('vr').disabled = !v; });
  navigator.xr.isSessionSupported('immersive-ar').then(v => { $('mr').disabled = !v; });
} else { $('vr').disabled = true; $('mr').disabled = true; }

// Small original Ananta figure beside the table, independent of mission logic.
const snake = new THREE.Group(); scene.add(snake); snake.position.set(.55, .89, -.9);
const snakePoints = Array.from({ length: 28 }, (_, i) => new THREE.Vector3(Math.cos(i * .3) * .10, .008 + Math.max(0, i - 18) * .012, Math.sin(i * .3) * .10));
const snakeMaterial = new THREE.MeshStandardMaterial({ color: '#97b76f', roughness: .5 });
snake.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(snakePoints), 72, .017, 8, false), snakeMaterial));
const snakeHead = new THREE.Mesh(new THREE.SphereGeometry(.028, 16, 10), snakeMaterial);
snakeHead.position.copy(snakePoints.at(-1)); snakeHead.scale.set(1, .7, 1.4); snake.add(snakeHead);
for (const side of [-1, 1]) {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.006, 8, 6), new THREE.MeshStandardMaterial({ color: '#16221c', roughness: .2 }));
  eye.position.copy(snakeHead.position).add(new THREE.Vector3(side * .02, .007, .018)); snake.add(eye);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('pagehide', () => { client.close(); voice.finish(true); micStream?.getTracks().forEach(t => t.stop()); });
renderer.setAnimationLoop((time) => {
  if (!renderer.xr.isPresenting) controls.update();
  const focused = !renderer.xr.isPresenting || renderer.xr.getSession()?.visibilityState === 'visible';
  if (focused && renderer.xr.isPresenting) {
    controllers.forEach((c, i) => { if (c.userData.source && !c.userData.source.hand) move(hitFromObject(c).hit, 'controller' + i); });
    hands.forEach((hand, i) => {
      const finger = hand.joints?.['index-finger-tip'], thumb = hand.joints?.['thumb-tip'];
      const visible = hand.visible && finger?.visible && thumb?.visible;
      const point = visible ? finger.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
      const distance = visible ? point.distanceTo(thumb.getWorldPosition(new THREE.Vector3())) : Infinity;
      const state = pinches[i].update(distance, visible);
      const wrist = hand.joints?.wrist, knuckle = hand.joints?.['middle-finger-phalanx-proximal'];
      let curl = Infinity;
      if (visible && wrist?.visible && knuckle?.visible && distance > .035) {
        const base = wrist.getWorldPosition(new THREE.Vector3());
        const span = Math.max(.03, base.distanceTo(knuckle.getWorldPosition(new THREE.Vector3())));
        const tips = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip'].map(name => hand.joints[name]);
        if (tips.every(j => j?.visible)) curl = Math.max(...tips.map(j => j.getWorldPosition(new THREE.Vector3()).distanceTo(base) / span));
      }
      const fist = fists[i].update(curl, !!visible && $('fist-navigation').checked && !flight);
      if (fist === 'begin') { if (stroke) finish(activeSource, true).catch(error); grips.set('hand' + i, wrist); }
      if (fist === 'end' || fist === 'cancel') grips.delete('hand' + i);
      dots[i].visible = !!visible;
      if (visible) {
        let index = 0; const matrix = new THREE.Matrix4();
        for (const joint of Object.values(hand.joints)) { if (index >= 25) break; matrix.makeTranslation(...joint.getWorldPosition(new THREE.Vector3()).toArray()); dots[i].setMatrixAt(index++, matrix); }
        dots[i].count = index; dots[i].instanceMatrix.needsUpdate = true;
        const head = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
        const direction = point.clone().sub(head).normalize();
        const hit = surfaceHit(point.clone().addScaledVector(direction, -.05), direction);
        move(hit, 'hand' + i);
        if (state === 'begin' && !grips.size) {
          ray.set(point, direction); const ui = ray.intersectObjects(palette.buttons, false)[0];
          if (ui) ui.object.userData.activate(); else begin(hit, 'hand' + i);
        }
      }
      if (state === 'end' || state === 'cancel') finish('hand' + i, state === 'cancel').catch(error);
    });
    navigation.update(grips);
  }
  if (stroke?.tool !== 'pose') creature.pose(living, time / 1000, clip || (living ? client.document?.clips?.[0] : null));
  if (!living && !flight && $('tool').value !== 'pose') creature.restPose();
  renderer.render(scene, camera);
});
client.start().then(() => {
  for (const name of client.catalog.templates) $('template').add(new Option(name, name));
  for (const asset of client.catalog.assets) if (![...$('saved-creatures').options].some(o => o.value === asset.id))
    $('saved-creatures').add(new Option(asset.name || asset.id, asset.id));
}).catch(error);
