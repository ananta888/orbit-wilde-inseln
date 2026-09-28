import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assetTool, localLicense } from './api.js';
import { AssetInstances } from './instances.js';

const $ = id => document.getElementById(id), cache = new AssetInstances();
let selected = null, instance = null, generation = 0, busy = false, searchGeneration = 0, providerCapabilities = {};
function status(text) { $('status').textContent = text; }
function fail(error) { status(error.message || String(error)); }
async function task(action) {
  if (busy) return;
  busy = true; status('Asset wird geprüft und vorbereitet …');
  try { await action(); } catch (error) { fail(error); } finally { busy = false; }
}
function button(text, action) { const b = document.createElement('button'); b.textContent = text; b.type = 'button'; b.onclick = () => task(action); return b; }
function safeLink(url, label) {
  const a = document.createElement('a'); a.textContent = label;
  if (/^https:\/\//.test(url)) { a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  return a;
}
const renderer = new THREE.WebGLRenderer({ canvas: $('preview'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.xr.enabled = true;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, .01, 1000);
const stage = new THREE.Group(); scene.add(stage); camera.position.set(2, 1.5, 2);
scene.add(new THREE.HemisphereLight(0xf3ffdd, 0x30493e, 2.5));
const light = new THREE.DirectionalLight(0xffeac5, 3); light.position.set(4, 6, 3); scene.add(light);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
const resize = () => { if (renderer.xr.isPresenting) return; const r = $('preview').parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); };
new ResizeObserver(resize).observe($('preview').parentElement); resize();
let last = performance.now(), xrPose = null;
renderer.xr.addEventListener('sessionend', () => {
  if (xrPose) { stage.position.copy(xrPose.position); stage.scale.copy(xrPose.scale); xrPose = null; } resize();
});
renderer.setAnimationLoop(time => { const dt = Math.min(.1, (time - last) / 1000); last = time;
  instance?.mixer.update(dt); controls.update(); renderer.render(scene, camera); });
async function xr(mode) {
  const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor', 'hand-tracking'] });
  xrPose = { position: stage.position.clone(), scale: stage.scale.clone() };
  const box = new THREE.Box3().setFromObject(instance.root), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const scale = .8 / Math.max(size.x, size.y, size.z, .01); stage.scale.setScalar(scale);
  stage.position.copy(center.multiplyScalar(-scale)).add(new THREE.Vector3(0, 1.25, -1.5));
  await renderer.xr.setSession(session);
}
for (const [id, mode] of [['preview-vr', 'immersive-vr'], ['preview-mr', 'immersive-ar']]) {
  $(id).onclick = () => task(() => xr(mode));
  navigator.xr?.isSessionSupported(mode).then(ok => { $(id).dataset.supported = String(ok); }).catch(() => {});
}

async function select(asset) {
  const mine = ++generation;
  if (!asset.verified) asset = (await assetTool('import_asset', { id: asset.id, profile: $('profile').value })).asset;
  const descriptor = await assetTool('preview_asset', { id: asset.id });
  const next = await cache.acquire(descriptor);
  if (mine !== generation) { next.dispose(); return; }
  instance?.dispose(); instance = next; selected = asset; stage.clear(); stage.position.set(0, 0, 0); stage.scale.setScalar(1); stage.add(instance.root); cache.clearUnused();
  const box = new THREE.Box3().setFromObject(instance.root), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const distance = Math.max(size.x, size.y, size.z, .1) * 1.6;
  camera.position.copy(center).add(new THREE.Vector3(distance, distance * .6, distance)); controls.target.copy(center); controls.update();
  $('asset-name').textContent = asset.name;
  $('asset-summary').textContent = `${asset.license.license} · ${asset.geometry.triangles.toLocaleString('de')} Dreiecke · ${asset.skeleton.bones} Bones · ${asset.animations.length} Clips · ${(asset.size / 1048576).toFixed(1)} MiB`;
  $('preview-hint').textContent = 'Ziehen: drehen · Scrollen: zoomen';
  $('clip').replaceChildren(new Option('Standpose', ''), ...asset.animations.map((a, i) => new Option(`${a.name} · ${a.duration.toFixed(1)} s`, i)));
  $('provenance').textContent = JSON.stringify({ license: asset.license, provenance: asset.provenance, report: asset.report }, null, 2);
  for (const id of ['optimize', 'lod', 'edit', 'place', 'credits', 'build']) $(id).disabled = false;
  for (const id of ['preview-vr', 'preview-mr']) $(id).disabled = $(id).dataset.supported !== 'true';
  status(asset.performance[$('profile').value]?.withinBudget ? 'Asset geprüft und lokal gespeichert. Zielbudget eingehalten.' : 'Asset gespeichert. Das ausgewählte Zielbudget wird überschritten; Analyse unter Lizenz und Herkunft.');
  window.orbitAssetBrowser = { scene, stage, instance, selected, cache };
}
$('clip').onchange = () => { if (instance) instance.play($('clip').value === '' ? -1 : +$('clip').value); };
function renderResults(records) {
  $('results').replaceChildren();
  for (const asset of records) {
    const card = document.createElement('article'); card.className = 'card';
    const heading = document.createElement('h3'); heading.textContent = asset.name;
    const license = document.createElement('p'); license.className = 'badge'; license.textContent = asset.license.license + ' · ' + asset.provider;
    const detail = document.createElement('p'); detail.textContent = asset.verified
      ? `${asset.geometry.triangles.toLocaleString('de')} Dreiecke · ${asset.animations.length} Clips · Quest: ${asset.performance['quest3-balanced'].withinBudget ? 'Budget erfüllt' : 'über Budget'}`
      : 'Geometrie, Rig und Quest-Budget werden beim Import geprüft.';
    card.append(heading, license, detail);
    if (asset.verified || providerCapabilities[asset.provider]?.download) card.append(button(asset.verified ? '3D-Vorschau' : 'Import & Vorschau', () => select(asset)));
    else { const hint = document.createElement('p'); hint.textContent = 'Download über die Quelle; anschließend Datei importieren.'; card.append(hint); }
    card.append(safeLink(asset.sourceUrl, 'Quelle ↗'));
    $('results').append(card);
  }
}
async function search() {
  const mine = ++searchGeneration;
  status('Quellen werden durchsucht …');
  const args = { query: $('query').value, providers: [...$('providers').querySelectorAll('input:checked')].map(i => i.value),
    licenses: [...document.querySelectorAll('[name=license]:checked')].map(i => i.value), limit: 24 };
  for (const [id, key] of [['rigged','rigged'],['animated','animated'],['quest','quest_compatible'],['pbr','pbr']]) if ($(id).checked) args[key] = true;
  if ($('type').value) args.types = [$('type').value];
  if ($('triangles').value) args.max_triangles = +$('triangles').value;
  if ($('texture').value) args.max_texture_resolution = +$('texture').value;
  if (!args.query.trim()) args.providers = args.providers.filter(id => ['local','bundled'].includes(id));
  const data = await assetTool('search_assets', args);
  if (mine !== searchGeneration) return;
  renderResults(data.results); $('source-links').replaceChildren(...data.links.map(l => safeLink(l.url, `${l.provider}: auf Quellseite suchen ↗`)));
  status(`${data.results.length} Assets gefunden.${data.errors.length ? ' ' + data.errors.map(e => e.provider + ': ' + e.message).join(' · ') : ''}`);
}
$('search').onsubmit = e => { e.preventDefault(); search().catch(fail); };
$('file').onchange = () => { if ($('file').files[0]) $('upload-name').value = $('file').files[0].name.replace(/\.[^.]+$/, ''); };
$('upload').onsubmit = e => { e.preventDefault(); task(async () => {
  const form = new FormData(), license = localLicense($('upload-license').value, $('upload-creator').value, $('upload-source').value, $('upload-version').value);
  license.notice = $('upload-notice').value;
  form.append('metadata', JSON.stringify({ name: $('upload-name').value, type: 'model', license })); form.append('profile', $('profile').value); form.append('file', $('file').files[0]);
  const response = await fetch('/api/assets/upload', { method: 'POST', body: form }); const data = await response.json();
  if (!response.ok) throw Error(data.error?.message || 'Import fehlgeschlagen');
  if (!data.decision.allowed) { status('Datei isoliert: ' + data.decision.reasons.join('; ')); return; }
  await select(data.asset); renderResults([data.asset]);
}); };
for (const id of ['optimize', 'lod']) $(id).onclick = () => task(async () => select((await assetTool('optimize_asset', { id: selected.id, profile: $('profile').value, lod: id === 'lod' })).asset));
$('edit').onclick = () => { if (selected) location.href = '/designer/index.html?library_asset=' + selected.id; };
async function placements() {
  const response = await fetch('/api/assets/placements'); const data = await response.json(); $('placements').replaceChildren();
  for (const item of data.items) {
    const p = document.createElement('p'); p.textContent = item.asset.name;
    p.append(button('Entfernen', async () => { await assetTool('remove_placement', { placement_id: item.id, revision: data.revision }); await placements(); status('Platzierung entfernt.'); }));
    $('placements').append(p);
  }
  return data;
}
$('place').onclick = () => task(async () => {
  const current = await placements();
  await assetTool('place_asset', { id: selected.id, revision: current.revision, position: ['x','y','z'].map(id => +$(id).value), rotation: [0,0,0], scale: +$('scale').value });
  await placements(); status('In deiner Spielwelt platziert. Die laufende Welt lädt es automatisch nach.');
});
function download(name, blob) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
$('credits').onclick = () => task(async () => { const data = await assetTool('export_credits', { ids: [selected.id] }); download(data.filename, new Blob([data.text], { type: 'text/markdown' })); status('Credits erstellt.'); });
$('build').onclick = () => task(async () => {
  const response = await fetch('/api/assets/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [selected.id] }) });
  if (!response.ok) throw Error((await response.json()).error.message);
  download('orbit-assets.zip', await response.blob()); status('Assetpaket mit Herkunftsmanifest und Credits erstellt.');
});
async function start() {
  const capabilities = await (await fetch('/api/assets/capabilities')).json();
  providerCapabilities = capabilities.providers;
  for (const [id, value] of Object.entries(capabilities.providers)) {
    const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.value = id; input.checked = true;
    label.append(input, document.createTextNode(id + (value.search ? '' : ' ↗'))); $('providers').append(label);
  }
  await search(); await placements();
  const asset = new URLSearchParams(location.search).get('asset'); if (asset) await select((await assetTool('inspect_asset', { id: asset })).asset);
}
start().catch(fail);
