// Builds every component's 3D model headlessly and reports problems.
// Usage: node scripts/check-parts.mjs [--system brakes] [--id brakes.front-calipers.caliper] [--verbose]
// Reports: generator used, triangle count, generated bounding box vs. the declared model box,
// NaN geometry, and build errors. Run `npm run data` first so public/data/db.json is current.
import fs from 'node:fs';
import * as THREE from 'three';
import { makePrimitive, makeWhole, wholeRuleFor, mirrored } from '../src/parts/index.js';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const sysFilter = opt('--system');
const idFilter = opt('--id');
const verbose = args.includes('--verbose');

const db = JSON.parse(fs.readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));
let problems = 0, total = 0, totalTris = 0;
const rows = [];

function tris(obj) {
  let n = 0, nan = false;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    n += (g.index ? g.index.count : pos.count) / 3;
    for (let i = 0; i < pos.array.length; i += 97) if (!Number.isFinite(pos.array[i])) { nan = true; break; }
  });
  return { n: Math.round(n), nan };
}

function declaredBox(c) {
  const b = new THREE.Box3();
  for (const m of c.model) {
    if (m.path) { for (const p of m.path) { b.expandByPoint(new THREE.Vector3(...p)); if (m.mirror) b.expandByPoint(new THREE.Vector3(p[0], p[1], -p[2])); } continue; }
    if (m.outline) { for (const [x, z] of m.outline) b.expandByPoint(new THREE.Vector3(x, m.y || 0.1, z)); continue; }
    if (m.edge) { for (const [x, z] of m.edge) b.expandByPoint(new THREE.Vector3(x, m.y0 || 0.1, z)); continue; }
    const s = m.size || [0.05, 0.05, 0.05];
    for (const p of m.instances?.length ? m.instances : [m.pos || [0, 0, 0]]) {
      for (const zz of m.mirror ? [p[2], -p[2]] : [p[2]]) {
        b.expandByPoint(new THREE.Vector3(p[0] - s[0] / 2, p[1] - s[1] / 2, zz - s[2] / 2));
        b.expandByPoint(new THREE.Vector3(p[0] + s[0] / 2, p[1] + s[1] / 2, zz + s[2] / 2));
      }
    }
  }
  return b;
}

for (const c of db.components) {
  if (sysFilter && c.system !== sysFilter) continue;
  if (idFilter && c.id !== idFilter) continue;
  if (!c.model.length) continue;
  total++;
  const group = new THREE.Group();
  let gens = new Set();
  try {
    const wg = wholeRuleFor(c);
    if (wg) { for (const o of makeWhole(c, wg)) group.add(o); gens.add(`whole:${wg}`); }
    else c.model.forEach((m, i) => {
      for (const p of m.instances?.length ? m.instances : [m.pos || null]) {
        const o = makePrimitive(c, m, p, i);
        if (!o) continue;
        gens.add(o.userData.generator || (m.path ? 'path' : m.shape || 'box'));
        group.add(o);
        if (m.mirror) { const t = makePrimitive(c, m, p, i); if (t) group.add(mirrored(t)); }
      }
    });
  } catch (e) {
    problems++;
    rows.push(`ERROR  ${c.id}: ${e.message}`);
    continue;
  }
  group.updateMatrixWorld(true);
  const got = new THREE.Box3().setFromObject(group);
  const want = declaredBox(c);
  const t = tris(group);
  totalTris += t.n;
  const gs = got.getSize(new THREE.Vector3()), ws = want.getSize(new THREE.Vector3());
  const over = Math.max(gs.x - ws.x, gs.y - ws.y, gs.z - ws.z);
  const shift = got.getCenter(new THREE.Vector3()).distanceTo(want.getCenter(new THREE.Vector3()));
  const flags = [];
  if (t.nan) flags.push('NaN geometry');
  if (got.isEmpty()) flags.push('empty');
  if (over > 0.05 && over > 0.25 * Math.max(ws.x, ws.y, ws.z)) flags.push(`bigger than its model box by ${(over * 100).toFixed(0)} cm`);
  if (shift > 0.08) flags.push(`centre moved ${(shift * 100).toFixed(0)} cm from its model box`);
  if (t.n > 60000) flags.push(`heavy: ${t.n} tris`);
  if (flags.length) problems++;
  if (flags.length || verbose) rows.push(`${flags.length ? 'WARN ' : 'ok   '}  ${c.id}  [${[...gens].join(',')}]  ${t.n} tris  size ${gs.toArray().map((v) => v.toFixed(3)).join('x')}${flags.length ? '  -> ' + flags.join('; ') : ''}`);
}
console.log(rows.join('\n'));
console.log(`\n${total} components built, ${problems} with problems, ${totalTris.toLocaleString()} triangles total`);
