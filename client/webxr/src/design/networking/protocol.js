/** ODG1 decoder. Typed arrays stay private until the enclosing transaction commits. */
export const widths = { positions: 3, normals: 3, colors: 3, mask: 1, surface: 4 };
const bases = new WeakMap();
export async function decodeFrame(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8 || buffer.byteLength > 8 * 1024 * 1024) throw Error('Geometriegröße');
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (String.fromCharCode(...bytes.slice(0, 4)) !== 'ODG1') throw Error('Geometrieformat');
  const size = view.getUint32(4, true);
  if (size < 1 || size > 16384 || size + 8 > bytes.length) throw Error('Headerlänge');
  const header = JSON.parse(new TextDecoder().decode(bytes.slice(8, 8 + size)));
  if (header.protocol !== 1 || !['replace', 'patch'].includes(header.mode)) throw Error('Geometrieversion');
  const payload = bytes.slice(8 + size), arrays = {};
  let end = 0;
  for (const [name, info] of Object.entries(header.buffers).sort((a, b) => a[1].offset - b[1].offset)) {
    const integer = ['indices', 'vertex_ids'].includes(name);
    if (!(name in widths) && !integer) throw Error('Attribut');
    if (![info.offset, info.bytes, info.count].every(x => Number.isSafeInteger(x) && x >= 0) ||
        info.offset !== end || info.bytes !== info.count * 4 || info.offset + info.bytes > payload.length ||
        info.dtype !== (integer ? 'u32' : 'f32')) throw Error('Bufferlayout');
    const raw = payload.slice(info.offset, info.offset + info.bytes);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== info.sha256) throw Error('Geometrieprüfsumme');
    const result = integer ? new Uint32Array(raw.buffer) : new Float32Array(raw.buffer);
    if (!result.every(Number.isFinite)) throw Error('Nichtendliche Geometrie');
    arrays[name] = result; end += info.bytes;
  }
  if (end !== payload.length) throw Error('Restbytes');
  return { header, arrays };
}

export function applyFrame(store, packet) {
  const { header: h, arrays: a } = packet;
  if (h.asset_id !== store.id || h.revision !== store.revision || h.base_revision !== bases.get(store)) throw Error('Dokumentrevision');
  const old = store.regions.get(h.region_id);
  if (!old || old.topology_revision !== h.topology_revision) throw Error('Unbekannte Region oder Topologie');
  if (h.mode === 'replace') {
    const count = a.positions?.length / 3;
    if (!Number.isInteger(count) || count < 3 || count > 100000 || !a.indices || a.indices.length % 3 ||
        old.vertex_count !== count || old.index_count !== a.indices.length) throw Error('Meshlayout');
    for (const [key, width] of Object.entries(widths)) if (a[key]?.length !== count * width) throw Error('Attributlänge');
    if (a.indices.some(x => x >= count)) throw Error('Meshindex');
    store.regions.set(h.region_id, { ...old, ...a, topology_revision: h.topology_revision });
  } else {
    if (!old.positions || !a.vertex_ids) throw Error('Topologiekonflikt');
    const next = { ...old }, count = old.positions.length / 3;
    if (a.vertex_ids.some((x, i) => x >= count || (i > 0 && x <= a.vertex_ids[i - 1]))) throw Error('Deltaindex');
    for (const [key, width] of Object.entries(widths)) {
      if (a[key]?.length !== a.vertex_ids.length * width) throw Error('Deltalänge');
      next[key] = old[key].slice();
      a.vertex_ids.forEach((vertex, i) => next[key].set(a[key].subarray(i * width, (i + 1) * width), vertex * width));
    }
    store.regions.set(h.region_id, next);
  }
}

export function beginDocument(before, message) {
  const doc = message.document, full = message.base_revision === -1;
  if (!doc || !Number.isSafeInteger(doc.revision) || doc.revision < 0 || !Array.isArray(doc.regions) ||
      !doc.regions.length || doc.regions.length > 96 || !Number.isInteger(message.frames) || message.frames < 0 || message.frames > 96)
    throw Error('Dokumentbudget');
  if (!full && (!before || before.id !== doc.id || before.revision !== message.base_revision)) throw Error('Basisrevision fehlt');
  const regions = new Map(); let vertices = 0, indices = 0;
  for (const metadata of doc.regions) {
    if (regions.has(metadata.id) || !Number.isSafeInteger(metadata.topology_revision) || metadata.topology_revision < 0 ||
        !Number.isSafeInteger(metadata.vertex_count) || metadata.vertex_count < 3 ||
        !Number.isSafeInteger(metadata.index_count) || metadata.index_count < 3 || metadata.index_count % 3) throw Error('Regionsmetadaten');
    vertices += metadata.vertex_count; indices += metadata.index_count;
    const old = full ? null : before.regions.get(metadata.id);
    regions.set(metadata.id, { ...(old?.topology_revision === metadata.topology_revision ? old : {}), ...metadata });
  }
  if (vertices > 100000 || indices > 540000) throw Error('Geometriebudget');
  const result = { ...doc, regions, history: message.history };
  bases.set(result, message.base_revision); return result;
}
