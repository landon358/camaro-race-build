// Snaps research part placements to the reference body (data/body-envelope.json):
//  - shapes the front splitter / air dam to the real nose outline
//  - sets the race wing at a realistic height above the decklid
//  - pulls any other part that pokes through the body back inside it
// Edits data/systems/**/*.json in place. Run: node scripts/fit-fix.mjs && npm run data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = JSON.parse(fs.readFileSync(path.join(root, 'data/body-envelope.json'), 'utf8'));
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---- envelope queries
function topAt(x, z) {
  const i = Math.floor((x - env.x0) / env.dx), k = Math.floor((z - env.z0) / env.dz);
  if (i < 0 || i >= env.nx || k < 0 || k >= env.nz) return 0;
  return env.top[i][k];
}
function sideAt(x, y) {
  const i = Math.floor((x - env.x0) / env.dx), j = Math.floor((y - env.y0) / env.dy);
  if (i < 0 || i >= env.nx || j < 0 || j >= env.ny) return 0;
  return env.side[i][j];
}
/** frontmost body x at lateral offset z (height band y). */
function noseX(z, y) {
  for (let x = env.x0; x < 0; x += 0.01) if (sideAt(x, y) >= Math.abs(z)) return x;
  return -0.9;
}
function inWheel(x, y, z) {
  const w = env.wheels.front;
  return [0, 2.811].some((xc) => Math.hypot(x - xc, y - w.y) <= w.diameter / 2 + 0.06 && Math.abs(Math.abs(z) - w.z) <= w.width / 2 + 0.3);
}
function excess([x, y, z]) {
  if (inWheel(x, y, z)) return 0;
  const t = Math.max(topAt(x, z), topAt(x - 0.05, z), topAt(x + 0.05, z));
  if (!t) return 0.05; // outside the footprint
  return y > t + 0.02 ? y - t : 0;
}
function corners(m) {
  const s = m.size || [0.05, 0.05, 0.05];
  const centres = m.instances?.length ? m.instances : [m.pos];
  const out = [];
  for (const c of centres) {
    if (!c) continue;
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) out.push([c[0] + (dx * s[0]) / 2, c[1] + (dy * s[1]) / 2, c[2] + (dz * s[2]) / 2]);
  }
  return out;
}
const DIRS = {
  z: (p, d) => { p[2] -= Math.sign(p[2]) * d; },
  '+x': (p, d) => { p[0] += d; },
  '-x': (p, d) => { p[0] -= d; },
  '-y': (p, d) => { p[1] -= d; },
};
const worstOf = (pts) => Math.max(0, ...pts.map(excess));
/** Smallest single-direction move (1 cm steps, max 35 cm) that brings `pts` inside; -y is a last resort. */
function bestMove(pointsAfter) {
  let best = null;
  for (const [dir, fn] of Object.entries(DIRS)) {
    for (let step = 1; step <= 35; step++) {
      const pts = pointsAfter(fn, step * 0.01);
      if (worstOf(pts) <= 0.015) {
        const cost = step + (dir === '-y' ? 12 : 0);
        if (!best || cost < best.cost) best = { dir, step, cost };
        break;
      }
    }
  }
  return best;
}
function pullInside(m) {
  if (m.path) {
    let moved = false;
    m.path.forEach((p, i) => {
      if (excess(p) <= 0.015) return;
      const mv = bestMove((fn, d) => { const q = [...p]; fn(q, d); return [q]; });
      if (mv) { DIRS[mv.dir](p, mv.step * 0.01); m.path[i] = p.map(r3); moved = true; }
    });
    return moved;
  }
  if (worstOf(corners(m)) <= 0.015) return false;
  if (m.instances?.length > 1) {
    // move each repeated copy on its own (e.g. front and rear marker lights)
    let moved = false;
    m.instances = m.instances.map((q) => {
      const one = { size: m.size, pos: [...q] };
      if (pullInside(one)) moved = true;
      return one.pos;
    });
    if (m.pos) m.pos = [...m.instances[0]];
    return moved;
  }
  const mv = bestMove((fn, d) => {
    const c = JSON.parse(JSON.stringify(m));
    if (c.pos) fn(c.pos, d);
    if (c.instances) c.instances.forEach((q) => fn(q, d));
    return corners(c);
  });
  if (!mv) return false;
  const d = mv.step * 0.01;
  if (m.pos) { DIRS[mv.dir](m.pos, d); m.pos = m.pos.map(r3); }
  if (m.instances) m.instances = m.instances.map((q) => { DIRS[mv.dir](q, d); return q.map(r3); });
  return true;
}

// ---- special cases
const special = {
  'aero.front-splitter.splitter-blade'(c) {
    const y = 0.25, rearX = -0.42, t = 0.012, lip = 0.07;
    const zmax = Math.min(sideAt(rearX, y), 0.9) - 0.02;
    const front = [];
    for (let i = 0; i <= 24; i++) {
      const z = -zmax + (i / 24) * 2 * zmax;
      front.push([r3(Math.min(rearX - 0.05, noseX(z, y) - lip)), r3(z)]);
    }
    c.model = [{ shape: 'plate', outline: [...front, [rearX, zmax], [rearX, -zmax]], y: 0.115, thickness: t, color: '#1b1b1b' }];
  },
  'aero.front-splitter.air-dam'(c) {
    const y = 0.25;
    const zmax = Math.min(sideAt(-0.42, y), 0.9) - 0.06;
    const edge = [];
    for (let i = 0; i <= 24; i++) {
      const z = -zmax + (i / 24) * 2 * zmax;
      edge.push([r3(noseX(z, y) + 0.01), r3(z)]);
    }
    c.model = [{ shape: 'wall', edge, y0: 0.121, height: 0.09, color: '#1b1b1b' }];
  },
  'aero.dive-planes-canards.factory-dive-planes'(c) { snapToSide(c, 0.03); },
  'aero.dive-planes-canards.upper-canards'(c) { snapToSide(c, 0.03); },
  'aero.side-skirts.side-skirts'(c) { snapToSide(c, 0.012); },
  'aero.side-skirts.skirt-extensions'(c) { snapToSide(c, 0.035); },
  'aero.rear-wing.main-element'(c) { wing(c, 'main'); },
  'aero.rear-wing.endplates'(c) { wing(c, 'end'); },
  'aero.rear-wing.gurney-flap'(c) { wing(c, 'gurney'); },
  'aero.rear-wing.uprights'(c) { wing(c, 'uprights'); },
  'aero.rear-wing.mount-plates'(c) { wing(c, 'plates'); },
  'aero.rear-diffuser.diffuser-panel'(c) {
    const m = c.model[0];
    m.pos = [3.5, 0.22, 0];
    m.size = [0.55, 0.006, Math.min(1.2, 2 * sideAt(3.75, 0.35) - 0.12)].map(r3);
  },
};
const ALLOW = new Set(['safety.tow-hooks.front-tow-strap', 'safety.tow-hooks.rear-tow-strap', 'safety.tow-hooks.tow-markers', 'electrical.comms-video-timing.antenna', 'aero.front-splitter.support-rods']);

function snapToSide(c, out) {
  for (const m of c.model) {
    if (!m.pos || !m.size) continue;
    const surf = sideAt(m.pos[0], m.pos[1]) || sideAt(m.pos[0] + 0.05, m.pos[1]);
    if (!surf) continue;
    const sign = Math.sign(m.pos[2]) || 1;
    m.pos[2] = r3(sign * (surf + out - m.size[2] / 2));
  }
}
const WING = (() => {
  const xm = 3.66, deck = Math.max(topAt(3.56, 0.4), topAt(3.56, -0.4)) || 1.2;
  const deckC = topAt(xm, 0) || 1.22;
  return { xm, deck, y: r3(deckC + 0.3), plateX: 3.56 };
})();
function wing(c, part) {
  const m = c.model;
  if (part === 'main') { m[0].pos = [WING.xm, WING.y, 0]; m[0].size = [0.3, 0.03, 1.7]; m[0].rot = [0, 0, -8]; }
  if (part === 'end') { m[0].pos = [WING.xm, WING.y - 0.02, 0.86]; m[0].size = [0.36, 0.24, 0.006]; }
  if (part === 'gurney') { m[0].pos = [r3(WING.xm + 0.15), r3(WING.y + 0.03), 0]; }
  if (part === 'plates') { m[0].pos = [WING.plateX, r3(WING.deck + 0.004), 0.4]; }
  if (part === 'uprights') {
    for (const [i, s] of [[0, 1], [1, -1]]) if (m[i]) m[i].path = [[WING.plateX, r3(WING.deck), 0.4 * s], [r3(WING.xm - 0.02), r3(WING.y - 0.02), 0.4 * s]];
  }
}

// ---- run over data files
const sysDir = path.join(root, 'data/systems');
let fixed = 0, specials = 0;
for (const sys of fs.readdirSync(sysDir)) {
  const dir = path.join(sysDir, sys);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === '_system.json') continue;
    const file = path.join(dir, f);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let changed = false;
    for (const c of data.components || []) {
      if (!c.model) continue;
      if (!Array.isArray(c.model)) c.model = [c.model];
      if (special[c.id]) { special[c.id](c); specials++; changed = true; continue; }
      if (ALLOW.has(c.id) || sys === 'wheels' || sys === 'body') continue;
      for (const m of c.model) if ((m.pos || m.path || m.instances) && pullInside(m)) { fixed++; changed = true; console.log('  pulled inside:', c.id); }
    }
    if (changed) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  }
}
// routes in _system.json
for (const sys of fs.readdirSync(sysDir)) {
  const file = path.join(sysDir, sys, '_system.json');
  if (!fs.existsSync(file) || sys === 'aero') continue;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  for (const r of data.routes || []) {
    const m = { path: r.points };
    if (pullInside(m)) { r.points = m.path; fixed++; changed = true; console.log('  pulled inside: route', r.id); }
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
console.log(`special placements: ${specials}, parts pulled inside the body: ${fixed}; wing deck ${WING.deck}, wing y ${WING.y}`);
