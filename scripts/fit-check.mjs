// Reports parts whose 3D model pokes outside the reference body (from data/body-envelope.json,
// produced by raycasting the ZL1 1LE mesh). Usage: node scripts/fit-check.mjs [--json]
import fs from 'node:fs';
const env = JSON.parse(fs.readFileSync(new URL('../data/body-envelope.json', import.meta.url), 'utf8'));
const db = JSON.parse(fs.readFileSync(new URL('../public/data/db.json', import.meta.url), 'utf8'));
const WH = env.wheels.front;

export function inWheel(x, y, z, pad = 0.06) {
  return [0, 2.811].some((xc) => Math.hypot(x - xc, y - WH.y) <= WH.diameter / 2 + pad && Math.abs(Math.abs(z) - WH.z) <= WH.width / 2 + 0.3);
}
function cell(x, z) {
  const i = Math.floor((x - env.x0) / env.dx), k = Math.floor((z - env.z0) / env.dz);
  if (i < 0 || i >= env.nx || k < 0 || k >= env.nz) return 0;
  return env.top[i][k];
}
export function topAt(x, z) {
  // lenient: max of the 3x3 neighbourhood
  let m = 0;
  for (const dx of [-env.dx, 0, env.dx]) for (const dz of [-env.dz, 0, env.dz]) m = Math.max(m, cell(x + dx, z + dz));
  return m;
}

function sideW(x, y) {
  const i = Math.floor((x - env.x0) / env.dx), j = Math.floor((y - env.y0) / env.dy);
  if (i < 0 || i >= env.nx || j < 0 || j >= env.ny) return 0;
  let m = 0;
  for (const a of [i - 1, i, i + 1]) if (a >= 0 && a < env.nx) m = Math.max(m, env.side[a][j]);
  return m;
}
export function excess(p) {
  const [x, y, z] = p;
  if (inWheel(x, y, z)) return 0;
  const t = topAt(x, z);
  if (!t) {
    // outside footprint: distance to nearest covered cell (approx along z then x)
    for (let d = 0.05; d < 1.5; d += 0.05) {
      if (topAt(x, z - Math.sign(z) * d) || topAt(x + d, z) || topAt(x - d, z)) return d;
    }
    return 1.5;
  }
  let e = Math.max(0, y - t);
  const sw = y > 0.3 ? sideW(x, y) : 0;
  if (sw > 0.5) e = Math.max(e, Math.abs(z) - sw);
  if (y < 0.05) e = Math.max(e, 0.05 - y);
  return e;
}
export function points(m) {
  const out = [];
  const mir = (p) => (m.mirror ? [p, [p[0], p[1], -p[2]]] : [p]);
  if (m.path) { for (const p of m.path) out.push(...mir(p)); return out; }
  const s = m.size || [0.05, 0.05, 0.05];
  const centers = m.instances?.length ? m.instances : [m.pos || [0, 0, 0]];
  for (const c of centers) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1])
    out.push(...mir([c[0] + (dx * s[0]) / 2, c[1] + (dy * s[1]) / 2, c[2] + (dz * s[2]) / 2]));
  return out;
}
if (process.argv[1].endsWith('fit-check.mjs')) {
  const rows = [];
  for (const c of db.components) {
    if (c.system === 'wheels') continue;
    let worst = 0;
    for (const m of c.model) for (const p of points(m)) worst = Math.max(worst, excess(p));
    if (worst > 0.04) rows.push([c.system, worst, c.id]);
  }
  for (const s of db.systems) for (const r of s.routes) {
    let worst = 0;
    for (const p of r.points) worst = Math.max(worst, excess(p));
    if (worst > 0.04) rows.push([s.id, worst, 'route:' + r.id]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
  console.log(`${rows.length} offenders`);
  for (const r of rows) console.log(`${r[0].padEnd(15)} ${r[1].toFixed(2)}  ${r[2]}`);
}
