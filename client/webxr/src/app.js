import { MissionUI } from '/src/ui/missions.js';
import { detectSupport } from '/src/xr/capabilities.js';
import { PROTOCOL_VERSION } from '/src/networking/protocol.js';
import * as THREE from '/vendor/three.module.js';
import { LiveScene } from '/src/rendering/live-world.js';
import { Bow, makeArrow } from '/src/input/bow.js';
import { addSky } from '/src/rendering/jungle.js';
import { makeCreature, animateCreature } from '/src/rendering/creatures.js';
import { Movement } from '/src/input/movement.js';
import { flightBoost } from '/src/input/flight.js';
import { Planet } from '/src/rendering/planet.js';
import { DragonMount } from '/src/rendering/dragon.js';
import { DragonDialogue } from '/src/ui/dragon-dialogue.js';

const $ = (id) => document.getElementById(id);
const mint = 0xbceccc, gold = 0xefac76;
export const view = { state: null, snapshots: [], renderTime: 0, camera: null, renderer: null, bodies: [] };
let socket, connected = false, lastReceived = 0, serverOffset = null, sequence = 0;
let inGame = false, xrSupported = false, mrSupported = false, xrStarting = false, rtt = null, fps = 0, sound = true;
let needsPlacement = false, mouseDrawStarted = null;
let audioContext, lastUi = '', lastBoard = '', lastBoardAt = 0, lastFrame = performance.now(), frameCount = 0, fpsStart = lastFrame;
let address = location.origin, reconnectTimer, flashTimer;
let ambience, nextBird = 0;
let voiceNode = null, voiceGeneration = 0;
const pending = new Map();
const scene = new THREE.Scene();
const background = new THREE.Color(0x9cc9bb), fog = new THREE.Fog(0x9cc9bb, 24, 65);
scene.background = background;
scene.fog = fog;
const backdrop = new THREE.Group(), contentRoot = new THREE.Group();
scene.add(backdrop, contentRoot);
const environment = new LiveScene(contentRoot);
Object.assign(view, { scene, backdrop, contentRoot, environment, mode: 'desktop', arrows: new Map() });
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.04, 8000);
view.camera = camera;
const rig = new THREE.Group(); rig.add(camera); scene.add(rig); view.rig = rig;
const creatures = new Map(); view.creatures = creatures;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFramebufferScaleFactor(0.85);
  $('scene').appendChild(renderer.domElement);
  view.renderer = renderer;
} catch (error) {
  $('fatal').hidden = false;
  $('fatal').textContent = '3D konnte nicht starten. Öffne die Seite im aktuellen Quest-Browser oder einem Browser mit WebGL 2.';
  throw error;
}

const standard = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
const basic = (color) => new THREE.MeshBasicMaterial({ color });
function mesh(geometry, material, position, parent = backdrop) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(...position);
  parent.add(object);
  return object;
}
scene.add(new THREE.HemisphereLight(0xc5e8dc, 0x4b6340, 2.2));
const sun = new THREE.DirectionalLight(0xffe1ad, 2.6);
sun.position.set(-25, 45, -30); scene.add(sun);
const sky = addSky(backdrop);
sky.renderOrder = -1000;
const planet = new Planet(scene), dragon = new DragonMount(scene);
Object.assign(view, { planet, dragon });
const movement = new Movement(rig, camera, renderer, environment, send);
view.movement = movement;
$('flight').addEventListener('click', () => movement.toggleFlight());

const boardCanvas = document.createElement('canvas');
boardCanvas.width = 1400; boardCanvas.height = 430;
const boardContext = boardCanvas.getContext('2d');
const boardTexture = new THREE.CanvasTexture(boardCanvas);
boardTexture.colorSpace = THREE.SRGBColorSpace;
const board = mesh(new THREE.PlaneGeometry(5.0, 1.535), new THREE.MeshBasicMaterial({ map: boardTexture }), [0, 3.65, -7.1], contentRoot);
board.visible = false;

const controllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
const hands = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
for (const hand of hands) rig.add(hand);
const dialogue = new DragonDialogue(scene, send, playVoice, stopVoice); view.dialogue = dialogue;
const missions = new MissionUI(scene, contentRoot, send, () => dialogue.stream?.clone()); view.missions = missions;
const raycaster = new THREE.Raycaster();
const bow = new Bow(scene, loose);
view.bow = bow;
for (let i = 0; i < 2; i++) {
  const controller = controllers[i];
  rig.add(controller);
  mesh(new THREE.BoxGeometry(0.025, 0.03, 0.06), standard(0x234249), [0, -0.015, 0.035], controller);
  controller.addEventListener('connected', (event) => { controller.userData.source = event.data; });
  controller.addEventListener('disconnected', () => { controller.userData.source = null; bow.cancel(); });
  controller.addEventListener('selectstart', () => {
    unlockSound();
    if (missions.select(controller) || dialogue.select(controller)) { bow.cancel(); controller.userData.dialogueSelected = true; return; }
    if (!healthy()) return;
    if (['ready', 'ended'].includes(view.state?.phase)) send({ type: 'start' });
    else if (view.state?.phase === 'paused') send({ type: 'resume' });
    else bow.begin(controller, view.state?.phase === 'playing');
  });
  controller.addEventListener('selectend', () => {
    if (controller.userData.dialogueSelected) { controller.userData.dialogueSelected = false; return; }
    bow.end(controller, healthy() && view.state?.phase === 'playing');
  });
  controller.addEventListener('squeezestart', () => {
    if (view.mode === 'mr' && controller.userData.source?.handedness === bow.hand) {
      bow.cancel(); needsPlacement = true;
    }
  });
}
$('bow-hand').addEventListener('change', event => { bow.hand = event.target.value; bow.cancel(); });

function healthy() { return connected && performance.now() - lastReceived < 1500; }
function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  socket.addEventListener('open', () => { send({ type: 'enter', mode: view.mode }); });
  socket.addEventListener('message', ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'hello' && message.protocol !== PROTOCOL_VERSION) {
      $('fatal').hidden = false; $('fatal').textContent = 'Client und Server verwenden unterschiedliche Protokollversionen. Bitte neu laden.'; socket.close();
    } else if (message.type === 'mission') {
      missions.receive(message);
    } else if (message.type === 'oracle') {
      missions.error('Ananta: ' + message.speech);
    } else if (message.type === 'state') {
      lastReceived = performance.now();
      connected = true;
      const offset = lastReceived / 1000 - message.time;
      serverOffset = serverOffset === null ? offset : Math.min(serverOffset + 0.0001, offset);
      view.state = message;
      movement.accept(message);
      view.snapshots.push(message);
      if (view.snapshots.length > 20) view.snapshots.shift();
    } else if (message.type === 'environment') {
      environment.receive(message);
      planet.receive(message.planet);
    } else if (message.type === 'dragon') {
      dialogue.receive(message); dragon.react(message);
    } else if (message.type === 'dragon_audio' && message.serial === dialogue.serial) {
      playVoice(message.url);
    } else if (message.type === 'pong' && typeof message.echo === 'number') {
      rtt = Math.round(performance.now() - message.echo);
    } else if (['hit', 'miss', 'ignored', 'started', 'resumed'].includes(message.type)) {
      const controller = pending.get(message.seq);
      pending.delete(message.seq);
      if (message.type === 'hit') {
        playTone(800 + (view.state?.multiplier || 1) * 100, 0.1);
        $('hit-flash').classList.add('flash');
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => $('hit-flash').classList.remove('flash'), 120);
        const actuator = controller?.userData.source?.gamepad?.hapticActuators?.[0];
        if (actuator) actuator.pulse(0.4, 55).catch(() => {});
      } else if (message.type === 'miss') playTone(170, 0.055);
    } else if (message.type === 'error') {
      $('xr-status').textContent = message.message; missions.error(message.message);
    }
  });
  socket.addEventListener('close', () => {
    connected = false;
    serverOffset = null;
    view.snapshots.length = 0;
    pending.clear();
    bow.cancel(); movement.reset(view.mode);
    dialogue.finishRecording(true); missions.voice.finish(true); stopVoice();
    reconnectTimer = setTimeout(connect, 2000);
  });
  socket.addEventListener('error', () => { connected = false; });
}
connect();
setInterval(() => send({ type: 'ping', time: performance.now() }), 1000);

function loose(from, to, draw, controller = null) {
  if (!healthy() || view.state?.phase !== 'playing') return;
  const seq = ++sequence;
  pending.set(seq, controller);
  if (pending.size > 40) pending.delete(pending.keys().next().value);
  contentRoot.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(contentRoot.matrixWorld).invert();
  const localOrigin = from.clone().applyMatrix4(inverse);
  const localDirection = to.clone().transformDirection(inverse);
  send({ type: 'loose', seq, origin: localOrigin.toArray(), direction: localDirection.toArray(), draw });
  playTone(240 + draw * 350, 0.09);
}
function unlockSound() {
  if (!sound) return;
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    if (!ambience) {
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
      const data = buffer.getChannelData(0); let previous = 0;
      for (let i = 0; i < data.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .035) / 1.02; data[i] = previous * 4; }
      const source = audioContext.createBufferSource(), filter = audioContext.createBiquadFilter(), gain = audioContext.createGain();
      source.buffer = buffer; source.loop = true; filter.type = 'lowpass'; filter.frequency.value = 1400; gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(audioContext.destination); source.start(); ambience = gain;
    }
  } catch { /* Sound is optional; gameplay still works. */ }
}

function stopVoice() {
  voiceGeneration++;
  if (voiceNode) { try { voiceNode.stop(); } catch {} voiceNode = null; }
}
async function playVoice(url) {
  if (!sound || !dialogue.active || !url.startsWith('/api/dragon/audio/')) return;
  stopVoice(); const generation = voiceGeneration;
  try {
    unlockSound();
    const response = await fetch(url);
    if (!response.ok) return;
    const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
    if (generation !== voiceGeneration || !sound || !dialogue.active) return;
    voiceNode = audioContext.createBufferSource(); voiceNode.buffer = buffer;
    const gain = audioContext.createGain(); gain.gain.value = .85;
    voiceNode.connect(gain).connect(audioContext.destination); voiceNode.start();
  } catch { /* Dialogue remains readable if the device cannot play audio. */ }
}
function playTone(frequency, duration) {
  if (!sound || !audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.07, audioContext.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
}

function resize() {
  if (renderer.xr.isPresenting) return;
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.clearViewOffset();
  if (inGame) {
    camera.position.set(0, 1.65, 0); camera.rotation.set(movement.pitch, movement.yaw, 0, 'YXZ');
  } else {
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    camera.position.set(8, 8, 15); camera.lookAt(-6, 6, -19);
    if (innerWidth > 850) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.12, 0, innerWidth, innerHeight);
  }
  camera.updateProjectionMatrix();
}
function setGame(active) {
  inGame = active;
  $('landing').hidden = active;
  $('hud').hidden = !active;
  board.visible = active && renderer.xr.isPresenting;
  document.body.classList.toggle('playing', active);
  resize();
}
addEventListener('resize', resize);
resize();
$('desktop').addEventListener('click', () => {
  if (!healthy()) return;
  unlockSound(); setMode('desktop'); send({ type: 'enter', mode: 'desktop' }); setGame(true);
  send({ type: 'start' });
});
$('home').addEventListener('click', () => { send({ type: 'pause' }); setGame(false); });
$('pause').addEventListener('click', () => send({ type: view.state?.phase === 'paused' ? 'resume' : 'pause' }));
$('action').addEventListener('click', () => {
  unlockSound();
  send({ type: view.state?.phase === 'paused' ? 'resume' : 'restart' });
});
$('sound').addEventListener('click', () => {
  sound = !sound; unlockSound();
  if (!sound) stopVoice();
  $('sound').setAttribute('aria-pressed', String(sound));
  $('sound').setAttribute('aria-label', sound ? 'Ton ausschalten' : 'Ton einschalten');
  $('sound').textContent = sound ? '♪' : '×';
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!inGame || renderer.xr.isPresenting) return;
  if (event.button === 2) { renderer.domElement.setPointerCapture(event.pointerId); return; }
  if (event.button !== 0) return;
  unlockSound();
  if (view.state?.phase !== 'playing') return;
  mouseDrawStarted = performance.now();
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (mouseDrawStarted === null || event.button !== 0) return;
  const draw = Math.min(0.65, 0.08 + (performance.now() - mouseDrawStarted) / 1000 * 0.7);
  mouseDrawStarted = null;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
  loose(raycaster.ray.origin, raycaster.ray.direction, draw);
});
renderer.domElement.addEventListener('pointercancel', () => { mouseDrawStarted = null; });
addEventListener('keydown', (event) => {
  if (!inGame || event.repeat || $('help-dialog').open || event.target.matches('input, select, textarea')) return;
  if (event.code === 'Escape') send({ type: view.state?.phase === 'paused' ? 'resume' : 'pause' });
  if (event.code === 'KeyR') send({ type: 'restart' });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { bow.cancel(); mouseDrawStarted = null; send({ type: 'pause' }); } });
addEventListener('blur', () => { if (inGame && !renderer.xr.isPresenting) send({ type: 'pause' }); });

async function detectXR() {
  const support = await detectSupport(); xrSupported = support.vr; mrSupported = support.mr;
  $('vr').textContent = xrSupported ? 'Offene Welt starten ↗' : 'Offene Welt auf der Quest ↗';
  $('mr').textContent = mrSupported ? 'Mixed Reality starten ↗' : 'Mixed Reality auf der Quest ↗';
  $('xr-status').textContent = mrSupported ? 'Offene Welt: links bewegen, rechts drehen, A zum Fliegen. Mixed Reality: Tiere und Bogen in deinem Raum.' : 'Öffne die HTTPS-Spieladresse im Quest-Browser. Hier kannst du mit Maus und Tastatur testen.';
  if (!isSecureContext) $('xr-status').textContent = 'Für Mixed Reality bitte die HTTPS-Adresse im Quest-Browser öffnen.';
}
detectXR();

function setMode(mode) {
  view.mode = mode;
  const mixed = mode === 'mr';
  scene.background = mixed ? null : background;
  scene.fog = mixed ? null : fog;
  renderer.setClearColor(background, mixed ? 0 : 1);
  backdrop.visible = !mixed;
  environment.setMixed(mixed);
  contentRoot.position.set(0, 0, 0);
  contentRoot.rotation.set(0, 0, 0);
  needsPlacement = mixed;
  movement.reset(mode);
  bow.cancel();
}

async function startXR(mode) {
  if (!healthy() || !(mode === 'mr' ? mrSupported : xrSupported) || xrStarting) return;
  xrStarting = true;
  unlockSound();
  let session;
  try {
    session = await navigator.xr.requestSession(mode === 'mr' ? 'immersive-ar' : 'immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    if (mode === 'mr' && session.environmentBlendMode === 'opaque') throw new Error('Dieser Browser liefert keinen durchsichtigen MR-Modus. Bitte den Quest-Browser verwenden.');
    setMode(mode);
    camera.clearViewOffset();
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); camera.updateProjectionMatrix();
    await renderer.xr.setSession(session);
    renderer.xr.setFoveation(1);
    setGame(true);
    send({ type: 'enter', mode }); send({ type: 'start' });
    document.body.classList.add('xr', mode);
    session.addEventListener('visibilitychange', () => {
      if (session.visibilityState !== 'visible') { bow.cancel(); dialogue.finishRecording(true); missions.voice.finish(true); stopVoice(); send({ type: 'pause' }); }
    });
  } catch (error) {
    if (session) await session.end().catch(() => {});
    setMode('desktop');
    $('xr-status').textContent = `${mode === 'mr' ? 'Mixed Reality' : 'VR'} konnte nicht starten: ${error.message}`;
    resize();
  } finally {
    xrStarting = false;
  }
}
$('mr').addEventListener('click', () => startXR('mr'));
$('vr').addEventListener('click', () => startXR('vr'));
renderer.xr.addEventListener('sessionend', () => {
  send({ type: 'pause' });
  document.body.classList.remove('xr', 'vr', 'mr');
  setMode('desktop');
  bow.root.visible = false;
  setGame(false);
});
$('help').addEventListener('click', () => $('help-dialog').showModal());
$('close-help').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('click', (event) => { if (event.target === $('help-dialog')) $('help-dialog').close(); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(address); $('address').textContent = 'Adresse kopiert'; setTimeout(() => $('address').textContent = address, 1500); }
  catch { $('help-dialog').showModal(); }
});
fetch('/connection.json').then((response) => response.json()).then((data) => {
  address = data.urls[0] || location.origin;
  $('address').textContent = address;
  $('help-address').textContent = address;
}).catch(() => { $('address').textContent = address; $('help-address').textContent = address; });

function interpolate(now) {
  if (!view.snapshots.length || serverOffset === null) return;
  const desired = now / 1000 - serverOffset - 0.075;
  const first = view.snapshots[0], last = view.snapshots.at(-1);
  view.renderTime = Math.max(first.time, Math.min(last.time, desired));
  let before = first, after = last;
  for (const snapshot of view.snapshots) {
    if (snapshot.time >= view.renderTime) { after = snapshot; break; }
    before = snapshot;
  }
  const span = after.time - before.time;
  const alpha = span ? Math.max(0, Math.min(1, (view.renderTime - before.time) / span)) : 0;
  const latestCreatures = new Map((last.creatures || []).map(c => [c.id, c]));
  const priorCreatures = new Map((before.creatures || []).map(c => [c.id, c]));
  const nextCreatures = new Map((after.creatures || []).map(c => [c.id, c]));
  for (const [id, creature] of creatures) {
    if (!latestCreatures.has(id)) { contentRoot.remove(creature.group); creatures.delete(id); }
  }
  for (const [id, state] of latestCreatures) {
    if (!creatures.has(id)) { const creature = makeCreature(state.species); contentRoot.add(creature.group); creatures.set(id, creature); }
    const creature = creatures.get(id), a = priorCreatures.get(id) || state, b = nextCreatures.get(id) || a;
    creature.active = state.active; creature.group.visible = state.active;
    creature.group.position.set(...a.position.map((v, k) => v + (b.position[k] - v) * alpha));
    const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
    creature.group.rotation.y = a.heading + turn * alpha;
    animateCreature(creature, state, now / 1000);
  }
  view.bodies = [...creatures.values()];
  const latestArrows = new Map((last.arrows || []).map(arrow => [arrow[0], arrow]));
  const beforeArrows = new Map((before.arrows || []).map(arrow => [arrow[0], arrow]));
  const afterArrows = new Map((after.arrows || []).map(arrow => [arrow[0], arrow]));
  for (const [id, arrow] of view.arrows) {
    if (!latestArrows.has(id)) { contentRoot.remove(arrow); view.arrows.delete(id); }
  }
  for (const [id, latest] of latestArrows) {
    if (!view.arrows.has(id)) { const arrow = makeArrow(); contentRoot.add(arrow); view.arrows.set(id, arrow); }
    const arrow = view.arrows.get(id), a = beforeArrows.get(id) || latest, b = afterArrows.get(id) || a;
    arrow.position.set(...[1, 2, 3].map(k => a[k] + (b[k] - a[k]) * alpha));
    const velocity = new THREE.Vector3(...b.slice(4, 7)).normalize();
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), velocity);
  }
}

function updateUI() {
  const state = view.state, online = healthy(), phase = state?.phase || 'ready';
  const bowHint = mouseDrawStarted === null ? bow.hint : `Auszug ${Math.round(Math.min(65, 8 + (performance.now() - mouseDrawStarted) * .07))} cm · loslassen`;
  const locomotion = movement.locomotion, altitude = Math.round(movement.altitude);
  const speed = Math.round(Math.hypot(...movement.velocity) * 3.6);
  const height = altitude >= 1000 ? `${(altitude / 1000).toFixed(1)} KM` : `${altitude} M`;
  const flightStatus = locomotion === 'fly' ? `${altitude > 350 ? 'PLANETENFLUG' : 'DRACHENFLUG'} · ${height} · ${speed} KM/H` : locomotion === 'landing' ? `SANFT LANDEN · ${height}` : 'ZU FUSS';
  const key = [online, phase, state?.score, state?.discovered, Math.floor(state?.distance || 0), fps, rtt, view.mode, environment.appliedRevision, xrStarting, xrSupported, mrSupported, bowHint, flightStatus].join('/');
  if (key === lastUi) return; lastUi = key;
  $('desktop').disabled = !online;
  $('vr').disabled = !online || !xrSupported || xrStarting || renderer.xr.isPresenting;
  $('mr').disabled = !online || !mrSupported || xrStarting || renderer.xr.isPresenting;
  $('connection-dot').classList.toggle('connected', online);
  $('connection').textContent = online ? `Laptop verbunden · ${rtt ?? '–'} ms` : 'Verbindung zum Laptop fehlt';
  $('score').textContent = state?.hits || 0;
  $('time').textContent = `${Math.floor(state?.distance || 0)} m`;
  $('combo').textContent = state?.discovered || 1;
  $('world-status').textContent = `${environment.title || 'Inseln entstehen'} · ${environment.areas} Gebiete in Sicht`;
  $('telemetry').textContent = online ? `LAPTOP: 60 Hz · RTT ${rtt ?? '–'} ms · ${fps} FPS · ${environment.areas} GEBIETE` : 'Verbindung fehlt. Erneuter Verbindungsaufbau läuft.';
  $('bow-status').textContent = mouseDrawStarted === null ? (movement.flying ? 'WASD: fliegen · Leertaste: steigen · Shift: sinken · F: sanft landen' : 'WASD: gehen · F: fliegen · rechte Maus: umsehen · linke halten / loslassen: Bogen') : bowHint;
  $('flight-status').textContent = view.mode === 'mr' ? '' : flightStatus;
  $('flight').hidden = view.mode === 'mr';
  $('flight').disabled = !online || phase !== 'playing';
  $('flight').setAttribute('aria-pressed', String(movement.flying));
  $('flight-label').textContent = movement.flying ? 'Landen' : locomotion === 'landing' ? 'Flug fortsetzen' : 'Fliegen';
  $('overlay').hidden = online && phase === 'playing';
  $('action').hidden = !online;
  $('overlay-title').textContent = !online ? 'Verbindung fehlt' : phase === 'paused' ? 'Eine kleine Pause' : 'Die Insel wartet';
  $('overlay-text').textContent = !online ? 'Laptop-Server und WLAN prüfen.' : phase === 'paused' ? 'Dein Platz in der Welt bleibt erhalten.' : 'Erkunde den Dschungel. Folge dem Wasser.\nLinks gehen · rechts drehen · A: fliegen.';
  $('action').textContent = phase === 'paused' ? 'Weiter spielen →' : 'Erkundung starten →';
  if (performance.now() - lastBoardAt < 180) return; lastBoardAt = performance.now();
  const c = boardContext;
  c.clearRect(0, 0, 1400, 430); c.fillStyle = '#142c28e8'; c.fillRect(0, 0, 1400, 430);
  c.fillStyle = '#dce7ba'; c.textAlign = 'center'; c.font = '40px sans-serif'; c.fillText('O R B I T   /   W I L D E   I N S E L N', 700, 73);
  c.font = locomotion === 'fly' ? '43px sans-serif' : '54px sans-serif';
  c.fillText(!online ? 'VERBINDUNG FEHLT' : phase === 'paused' ? 'PAUSE · TRIGGER ZUM WEITERSPIELEN' : locomotion !== 'walk' && view.mode !== 'mr' ? flightStatus : `${state?.discovered || 1} GEBIETE ENTDECKT   ·   ${Math.floor(state?.distance || 0)} METER`, 700, 163);
  const movementHint = movement.flying ? 'LINKS: FLIEGEN · RECHTS ↑/↓: HÖHE · A: LANDEN' : 'LINKS: GEHEN · RECHTS: DREHEN · A: FLIEGEN';
  c.font = '29px sans-serif'; c.fillText(view.mode === 'mr' ? 'MIXED REALITY · GRIFFTASTE: WELT PLATZIEREN' : movementHint, 700, 245);
  c.fillStyle = '#a9c5ae'; c.font = '26px sans-serif'; c.fillText(phase === 'playing' ? bowHint : 'BOGEN LINKS · RECHTS SEHNE GREIFEN, ZIEHEN, LOSLASSEN', 700, 312);
  c.font = '22px sans-serif'; c.fillText(movement.flying ? `B ${dialogue.stream ? 'HALTEN: SPRECHEN' : ': ARIN FRAGEN'} · ANTWORTEN ANZEIGEN / PINCH · ${Math.round(flightBoost(movement.position[1]))}× FLUGTEMPO` : `X LINKS: EPISODEN · ${environment.areas} GEBIETE · ${fps} FPS`, 700, 378);
  boardTexture.needsUpdate = true;
}

renderer.setAnimationLoop((now, frame) => {
  if (needsPlacement && frame) {
    const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (pose) {
      const { position, orientation } = pose.transform;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(orientation.x, orientation.y, orientation.z, orientation.w));
      contentRoot.position.set(position.x, 0, position.z);
      contentRoot.rotation.y = Math.atan2(-forward.x, -forward.z);
      needsPlacement = false;
    }
  }
  const dt = Math.max(0, Math.min(.05, (now - lastFrame) / 1000));
  const focusedForMove = !renderer.xr.isPresenting || renderer.xr.getSession()?.visibilityState === 'visible';
  movement.update(dt, controllers, inGame && healthy() && view.state?.phase === 'playing' && focusedForMove);
  planet.update(movement.position, view.mode === 'mr', now);
  environment.detailOpacity = 1 - planet.mix;
  environment.tick(dt, now);
  sky.material.uniforms.uSpace.value = THREE.MathUtils.smoothstep(movement.position[1], 100, 700);
  fog.near = 24 + Math.max(0, movement.position[1] - 20) * .5;
  fog.far = 65 + Math.max(0, movement.position[1] - 20) * 2;
  const exploring = inGame && healthy() && view.state?.phase === 'playing' && focusedForMove;
  dragon.update(dt, camera, movement, controllers, exploring);
  dialogue.update(dt, camera, movement, controllers, hands, exploring, renderer.xr.isPresenting, now);
  missions.update(camera, hands, exploring, renderer.xr.isPresenting, controllers);
  if (ambience && audioContext.state === 'running') {
    const audible = inGame && sound && view.mode !== 'mr' && view.state?.phase === 'playing' && focusedForMove;
    ambience.gain.setTargetAtTime(audible ? .045 + Math.sin(now / 3400) * .008 : 0, audioContext.currentTime, .4);
    if (audible && now > nextBird) { playTone(1700 + Math.random() * 800, .07); nextBird = now + 6000 + Math.random() * 6000; }
  }
  sky.position.copy(rig.position);
  if (renderer.xr.isPresenting) {
    // A small floating field guide follows the player, outside the aiming corridor.
    const head = camera.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0; forward.normalize();
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const target = head.clone().addScaledVector(forward, 2.5).addScaledVector(side, -1.7); target.y += .6;
    board.position.copy(contentRoot.worldToLocal(target));
    board.scale.setScalar(.29); board.quaternion.copy(contentRoot.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(camera.getWorldQuaternion(new THREE.Quaternion()));
  }
  interpolate(now);
  scene.updateMatrixWorld(true);
  const focused = renderer.xr.getSession()?.visibilityState === 'visible';
  bow.update(controllers, renderer.xr.isPresenting && focused, healthy() && view.state?.phase === 'playing' && focused, now);
  frameCount++;
  if (now - fpsStart >= 1000) { fps = Math.round(frameCount * 1000 / (now - fpsStart)); frameCount = 0; fpsStart = now; }
  updateUI();
  renderer.render(scene, camera);
  lastFrame = now;
});
