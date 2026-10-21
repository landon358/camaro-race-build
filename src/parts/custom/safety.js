// Precise part models for the "safety" group (safety, interior, aero). See data/MODELING.md.
// Owned by one modeling pass; generator names must be prefixed "safety_".
import * as THREE from 'three';
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, V } from '../geo.js';
import { paths as basePaths } from '../generators.js';

const PI = Math.PI;
const IN = 0.0254;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const CAGE_R = (1.75 * IN) / 2; // 1.75 in OD DOM / 4130 tube
const BEND_R = 0.15; // ~6 in centre-line radius, typical for 1.75 in cage tube benders

// Driver torso axis (pelvis -> base of neck) used to orient harness webbing on the body.
const PELVIS = V(1.82, 0.36, 0.37);
const NECK = V(1.97, 0.95, 0.37);

// =================================================================== helpers

/** Replace the corners of a vertex polyline with circular-arc bends (like a tube bender). */
export function filletPoints(pts, R = BEND_R) {
  if (pts.length < 3) return pts.map((p) => p.clone());
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i], A = pts[i - 1], B = pts[i + 1];
    const la = P.distanceTo(A), lb = P.distanceTo(B);
    if (la < 1e-4 || lb < 1e-4) continue;
    const u = V().subVectors(A, P).normalize(), v = V().subVectors(B, P).normalize();
    const th = Math.acos(clamp(u.dot(v), -1, 1)); // interior angle
    if (th > PI - 0.02) { out.push(P.clone()); continue; }
    let t = R / Math.tan(th / 2);
    t = Math.min(t, 0.48 * Math.min(la, lb));
    const r = t * Math.tan(th / 2);
    const T1 = P.clone().addScaledVector(u, t), T2 = P.clone().addScaledVector(v, t);
    const C = P.clone().addScaledVector(V().addVectors(u, v).normalize(), r / Math.sin(th / 2));
    const a = V().subVectors(T1, C), b = V().subVectors(T2, C);
    const phi = PI - th, sp = Math.sin(phi);
    const n = Math.max(2, Math.ceil(phi / 0.13));
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      out.push(C.clone().addScaledVector(a, Math.sin((1 - s) * phi) / sp).addScaledVector(b, Math.sin(s * phi) / sp));
    }
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

/** Indexed grid surface from rows of Vector3 (all rows the same length). */
function gridGeo(rows, closed = false) {
  const m = rows[0].length;
  const pos = [], idx = [];
  for (const row of rows) for (const p of row) pos.push(p.x, p.y, p.z);
  const segs = closed ? m : m - 1;
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * m + j, b = i * m + ((j + 1) % m), c = (i + 1) * m + j, d = (i + 1) * m + ((j + 1) % m);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Fan cap closing a ring of points. */
function capGeo(ring, centre) {
  const pos = [centre.x, centre.y, centre.z];
  for (const p of ring) pos.push(p.x, p.y, p.z);
  const idx = [];
  for (let j = 0; j < ring.length; j++) idx.push(0, 1 + j, 1 + ((j + 1) % ring.length));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Tangents + rotation-minimising normals along a polyline; normalFn(i, T) may impose a normal. */
function frames(pts, normalFn = null) {
  const n = pts.length, T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(V().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
  for (let i = 0; i < n; i++) {
    let nn = normalFn ? normalFn(i, T[i]) : null;
    if (nn) nn = nn.clone().addScaledVector(T[i], -nn.dot(T[i]));
    if (!nn || nn.lengthSq() < 1e-8) {
      if (i === 0) { const ax = Math.abs(T[0].y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); nn = V().crossVectors(T[0], ax).cross(T[0]); }
      else nn = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i]));
    }
    N.push(nn.normalize());
    B.push(V().crossVectors(T[i], N[i]).normalize());
  }
  return { T, N, B };
}

/** Sweep a 2D profile ([a along N, b along B]) along a polyline. */
function sweep(pts, profile, { closed = true, caps = false, normalFn = null } = {}) {
  const { N, B } = frames(pts, normalFn);
  const rows = pts.map((p, i) => profile.map(([a, b]) => p.clone().addScaledVector(N[i], a).addScaledVector(B[i], b)));
  const geos = [gridGeo(rows, closed)];
  if (caps) { geos.push(capGeo(rows[0], pts[0]), capGeo(rows[rows.length - 1], pts[pts.length - 1])); }
  return geos;
}

const circle = (r, n = 14) => Array.from({ length: n }, (_, k) => [Math.cos((k / n) * 2 * PI) * r, Math.sin((k / n) * 2 * PI) * r]);
const rect = (w, t) => [[-t / 2, -w / 2], [t / 2, -w / 2], [t / 2, w / 2], [-t / 2, w / 2]];

/** Matrix placing local X along `dir` at point p (local Y/Z rotation-minimised). */
function frameAt(p, dir, up = null) {
  const x = dir.clone().normalize();
  let y = up ? up.clone().addScaledVector(x, -up.dot(x)) : null;
  if (!y || y.lengthSq() < 1e-8) { const ax = Math.abs(x.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); y = ax.addScaledVector(x, -ax.dot(x)); }
  y.normalize();
  const z = V().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
}

/** Dense smooth polyline through control points (for webbing, cables). */
function smooth(pts, step = 0.02) {
  if (pts.length < 3) return pts.map((p) => p.clone());
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  return c.getSpacedPoints(Math.max(8, Math.round(c.getLength() / step)));
}

/** Closest point on segment ab to p. */
function closestOnSeg(p, a, b) {
  const ab = V().subVectors(b, a);
  const t = clamp(V().subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t);
}

function shapeFrom(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}
function roundRectPts(w, h, r, n = 4) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  const out = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, PI / 2], [-w / 2 + r, -h / 2 + r, PI], [w / 2 - r, -h / 2 + r, 1.5 * PI]];
  for (const [cx, cy, a0] of corners) for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
function circlePts(cx, cy, r, n = 12, reverse = true) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = ((reverse ? -k : k) / n) * 2 * PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
/** Extrude a shape drawn in (x, y) along z (thickness centred). */
function extrudeZ(shape, t, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -t / 2);
  return g;
}
/** Extrude a shape drawn in (x, z) along y (thickness centred) — horizontal plates. */
function extrudeY(shape, t, curveSegments = 12) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments });
  g.rotateX(PI / 2); // shape y -> world z, extrusion -> -y
  g.translate(0, t / 2, 0);
  return g;
}
const thinAxis = (s) => s.indexOf(Math.min(...s));

/** Inverted (downforce) cambered airfoil, chord 1, LE at u=0. Returns [[u, y], ...] closed loop. */
function airfoil(n = 24, m = 0.075, p = 0.42, t = 0.13) {
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const u = (1 - Math.cos((i / n) * PI)) / 2; // cosine spacing
    const yt = 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
    const yc = u < p ? (m / (p * p)) * (2 * p * u - u * u) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * u - u * u);
    // inverted: camber bows downward (suction side underneath)
    up.push([u, -yc + yt]);
    lo.push([u, -yc - yt]);
  }
  return [...up.reverse(), ...lo.slice(1, -1)];
}

// =================================================================== PATH generators
const paths = {
  /** Bent cage tube: straight runs + real bender radii, weld beads at both ends. */
  safety_cageTube(pts, r, ctx) {
    const rr = clamp(r, 0.012, 0.03);
    const dense = filletPoints(pts, ctx?.variant === 'tight' ? 0.1 : BEND_R);
    const b = new PartBuilder();
    for (const g of sweep(dense, circle(rr, 16), { caps: true })) b.add(g, 'cage');
    const n = dense.length;
    for (const [p, q] of [[dense[0], dense[1]], [dense[n - 1], dense[n - 2]]]) {
      const dir = V().subVectors(q, p).normalize();
      b.addMatrix(torusX(rr + 0.001, 0.0035, 6, 20), 'cage', frameAt(p.clone().addScaledVector(dir, 0.004), dir));
    }
    return b.build();
  },

  /** SFI 45.1 high-density cage padding (black vinyl sleeve, tape wraps). */
  safety_cagePad(pts, r) {
    const rr = clamp(r, 0.03, 0.05);
    const dense = filletPoints(pts, BEND_R);
    const b = new PartBuilder();
    for (const g of sweep(dense, circle(rr, 14), { caps: true })) b.add(g, 'seat');
    // tape wraps every ~300 mm and at both ends
    let acc = 0;
    const wraps = [0.03];
    let total = 0;
    for (let i = 1; i < dense.length; i++) total += dense[i].distanceTo(dense[i - 1]);
    for (let d = 0.3; d < total - 0.1; d += 0.3) wraps.push(d);
    wraps.push(total - 0.03);
    let wi = 0;
    for (let i = 1; i < dense.length && wi < wraps.length; i++) {
      const seg = dense[i].distanceTo(dense[i - 1]);
      while (wi < wraps.length && acc + seg >= wraps[wi]) {
        const t = (wraps[wi] - acc) / seg;
        const p = dense[i - 1].clone().lerp(dense[i], t);
        const dir = V().subVectors(dense[i], dense[i - 1]).normalize();
        b.addMatrix(cylX(rr + 0.0015, 0.025, 14), 'black', frameAt(p, dir));
        wi++;
      }
      acc += seg;
    }
    return b.build();
  },

  /** Triangular plate gussets: the path holds triplets [armA, junction, armB]. */
  safety_gussets(pts) {
    const b = new PartBuilder();
    for (let i = 0; i + 2 < pts.length; i += 3) {
      const A = pts[i], J = pts[i + 1], Bp = pts[i + 2];
      const u = V().subVectors(A, J), w = V().subVectors(Bp, J);
      const la = u.length(); u.normalize();
      const nrm = V().crossVectors(u, w).normalize();
      if (nrm.lengthSq() < 0.5) continue;
      const v = V().crossVectors(nrm, u);
      const bx = w.dot(u), by = w.dot(v);
      // gusset sits on the tube centre-lines; free edge slightly concave
      const mid = [(la + bx) / 2, by / 2];
      const inset = 0.12;
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(la, 0);
      sh.quadraticCurveTo(mid[0] - mid[0] * inset, mid[1] - mid[1] * inset, bx, by);
      sh.lineTo(0, 0);
      const g = extrudeZ(sh, 0.003, 8);
      b.addMatrix(g, 'cage', new THREE.Matrix4().makeBasis(u, v, nrm).setPosition(J));
    }
    return b.build();
  },

  /** Harness webbing following the body: flat strap, adjuster, end fitting, latch tongue. */
  safety_harnessStrap(pts, r) {
    const W = clamp(r * 7.62, 0.045, 0.08); // r 0.0065 -> 2 in, r 0.01 -> 3 in
    const dense = smooth(pts, 0.015);
    const normalFn = (i) => V().subVectors(dense[i], closestOnSeg(dense[i], PELVIS, NECK));
    const b = new PartBuilder();
    for (const g of sweep(dense, rect(W, 0.003), { normalFn })) b.add(g, 'webbing');
    const { T, N } = frames(dense, normalFn);
    const n = dense.length;
    // adjuster (pull-up/pull-down slide) ~35% from the anchor end
    const ia = Math.round(n * 0.35);
    b.addMatrix(box(0.05, 0.009, W + 0.012, 0.002), 'machined', frameAt(dense[ia], T[ia], N[ia]));
    b.addMatrix(box(0.03, 0.005, W, 0.001), 'webbing', frameAt(dense[ia].clone().addScaledVector(N[ia], 0.006), T[ia], N[ia]));
    // anchor end fitting (snap hook / eye)
    b.addMatrix(box(0.05, 0.006, W * 0.8, 0.002), 'chrome', frameAt(dense[0].clone().addScaledVector(T[0], -0.02), T[0], N[0]));
    // latch tongue at the buckle end
    b.addMatrix(box(0.04, 0.003, Math.min(W, 0.05), 0.001), 'chrome', frameAt(dense[n - 1].clone().addScaledVector(T[n - 1], 0.015), T[n - 1], N[n - 1]));
    return b.build();
  },

  /** Window-net mounting rod with weld-on tabs at both ends (tabs rise to the tube above; variant 'down': drop to the tube below). */
  safety_netRod(pts, r, ctx) {
    const rr = clamp(r, 0.004, 0.008);
    const b = new PartBuilder();
    const a = pts[0], z = pts[pts.length - 1];
    const dir = V().subVectors(z, a).normalize();
    b.addMatrix(cylX(rr, 1, 10), 'machined', frameAt(a.clone().lerp(z, 0.5), dir).multiply(new THREE.Matrix4().makeScale(a.distanceTo(z), 1, 1)));
    const dn = ctx?.variant === 'down' ? -1 : 1;
    for (const p of [a, z]) {
      b.addMatrix(box(0.02, 0.05, 0.004, 0.002), 'cage', frameAt(p.clone().add(V(0, dn * 0.022, 0)), dir));
      b.addMatrix(cylX(rr * 1.6, 0.012, 10), 'black', frameAt(p, dir));
    }
    return b.build();
  },

  /** APR-style 10 mm billet pedestal riser between decklid base and wing underside. */
  safety_wingStand(pts) {
    const p0 = pts[0], p1 = pts[pts.length - 1];
    const H = p0.distanceTo(p1);
    const y = V().subVectors(p1, p0).normalize();
    const z = V(0, 0, 1);
    const x = V().crossVectors(y, z).normalize();
    const zz = V().crossVectors(x, y);
    const outline = [[-0.075, 0], [0.065, 0], [0.04, H * 0.55], [0.045, H - 0.02], [0.02, H], [-0.035, H], [-0.05, H - 0.02], [-0.035, H * 0.55]];
    const hole = [[-0.03, H * 0.18], [0.035, H * 0.18], [0.02, H * 0.62], [-0.02, H * 0.62]].reverse();
    const b = new PartBuilder();
    const m = new THREE.Matrix4().makeBasis(x, y, zz).setPosition(p0);
    b.addMatrix(extrudeZ(shapeFrom(outline, [hole]), 0.01), 'satin', m);
    // foot flange and top saddle
    b.addMatrix(box(0.15, 0.008, 0.05, 0.003), 'satin', m.clone().multiply(new THREE.Matrix4().makeTranslation(-0.005, 0.03, 0)));
    b.addMatrix(box(0.09, 0.006, 0.04, 0.002), 'satin', m.clone().multiply(new THREE.Matrix4().makeTranslation(-0.005, H - 0.003, 0)));
    for (const dx of [-0.05, 0.04]) b.addMatrix(cylY(0.006, 0.012, 6), 'chrome', m.clone().multiply(new THREE.Matrix4().makeTranslation(dx, 0.037, 0.012)));
    return b.build();
  },

  /** Seat-back brace: tube from the shell to the harness bar with a pad plate and clamp. */
  safety_seatBrace(pts, r) {
    const rr = clamp(r, 0.008, 0.016);
    const a = pts[0], z = pts[pts.length - 1];
    const dir = V().subVectors(z, a).normalize();
    const b = new PartBuilder();
    for (const g of sweep([a, z], circle(rr, 12), { caps: true })) b.add(g, 'steel');
    b.addMatrix(box(0.006, 0.04, 0.045, 0.004), 'steel', frameAt(a, dir));
    // welded tab on the harness bar with the brace bolt
    b.addMatrix(box(0.03, 0.004, 0.035, 0.001), 'steel', frameAt(z.clone().addScaledVector(dir, -0.012), dir));
    b.addMatrix(cylY(0.005, 0.014, 8), 'chrome', new THREE.Matrix4().makeTranslation(z.x - dir.x * 0.012, z.y - dir.y * 0.012, z.z));
    return b.build();
  },

  /** APR splitter rods: aluminium rod with rod ends. */
  safety_splitterRod(pts, r) {
    return basePaths.link(pts, r, { finish: 'aluminum' });
  },
};

// =================================================================== AXIAL generators
const axial = {
  /** Fire-system bottle (variant 'system') or hand-held extinguisher (variant 'handheld'). Valve at +X. */
  safety_fireBottle(L, D1, D2, ctx) {
    const hand = ctx?.variant === 'handheld';
    const R = Math.min(D1, D2) / 2;
    const valve = hand ? 0.1 : 0.075;
    const body = L - valve;
    const x0 = -L / 2, x1 = x0 + body;
    const e = R * 0.55;
    const prof = [[0.0001, x0]];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (PI / 2); prof.push([Math.sin(a) * R, x0 + e - Math.cos(a) * e]); }
    for (let i = 0; i <= 6; i++) { const a = PI / 2 - (i / 6) * (PI / 2); prof.push([Math.sin(a) * R, x1 - e + Math.cos(a) * e]); }
    prof.push([R * 0.32, x1 + 0.004], [R * 0.32, x1 + 0.015], [0.0001, x1 + 0.015]);
    const b = new PartBuilder();
    b.add(latheX(prof, 32), 'red');
    // label band
    b.add(cylX(R * 1.004, body * 0.35, 32, R * 1.004), 'cage', [x0 + body * 0.5, 0, 0]);
    // valve neck + head
    const vx = x1 + 0.015;
    b.add(hexX(R * 0.33, 0.016), 'machined', [vx + 0.008, 0, 0]);
    b.add(box(valve * 0.55, R * 0.9, R * 0.62, 0.006), hand ? 'black' : 'black', [vx + 0.016 + valve * 0.27, 0, 0]);
    // pressure gauge (face up)
    b.add(cylY(R * 0.28, 0.012, 20), 'chrome', [vx + 0.03, R * 0.5, 0]);
    b.add(cylY(R * 0.24, 0.002, 20), 'cage', [vx + 0.03, R * 0.5 + 0.007, 0]);
    if (hand) {
      // squeeze lever + carry handle + safety pin ring + short discharge hose
      b.add(box(valve * 0.9, 0.008, R * 0.4, 0.002), 'black', [vx + valve * 0.55, R * 0.62, 0], [0, 0, 0.18]);
      b.add(box(valve * 0.8, 0.008, R * 0.4, 0.002), 'black', [vx + valve * 0.5, -R * 0.55, 0], [0, 0, -0.1]);
      b.add(torusX(0.012, 0.002, 6, 16), 'yellow', [vx + 0.02, R * 0.2, R * 0.4]);
      b.add(cylX(0.008, 0.05, 10), 'black', [vx + valve * 0.75, 0, -R * 0.45], [0, 0.5, 0]);
    } else {
      // mechanical pull-head with cable nipple and outlet union
      b.add(cylZ(R * 0.16, R * 0.9, 12), 'chrome', [vx + valve * 0.45, 0, R * 0.55]);
      b.add(hexX(R * 0.2, 0.02), 'blue', [vx + valve * 0.85, -R * 0.2, 0]);
      b.add(cylY(R * 0.12, R * 0.6, 10), 'machined', [vx + valve * 0.4, -R * 0.55, 0]);
    }
    return b.build();
  },

  /** Rotary camlock buckle (6-point harness centre). L = thickness. */
  safety_camlock(L, D1, D2) {
    const R = Math.min(D1, D2) / 2, t = Math.min(L, 0.03);
    const b = new PartBuilder();
    b.add(latheX([[0.0001, -t / 2], [R * 0.95, -t / 2], [R, -t / 2 + 0.004], [R, t / 2 - 0.006], [R * 0.9, t / 2], [0.0001, t / 2]], 36), 'machined');
    b.add(latheX([[0.0001, t / 2 - 0.001], [R * 0.62, t / 2 - 0.001], [R * 0.58, t / 2 + 0.004], [0.0001, t / 2 + 0.004]], 28), 'black');
    // rotary release lever across the face
    b.add(box(0.006, R * 1.5, R * 0.42, 0.003), 'red', [t / 2 + 0.006, 0, 0]);
    b.add(cylX(R * 0.2, 0.01, 16), 'chrome', [t / 2 + 0.008, 0, 0]);
    return b.build();
  },

  /** Discharge nozzle: hex body, threaded stem, spray tip. variant 'cockpit' (blue) | 'engine' (gold). */
  safety_nozzle(L, D1, D2, ctx) {
    const R = Math.min(D1, D2) / 2;
    const fin = ctx?.variant === 'engine' ? 'gold' : 'blue';
    const b = new PartBuilder();
    b.add(hexX(R * 0.95, L * 0.35), fin, [-L * 0.1, 0, 0]);
    b.add(cylX(R * 0.55, L * 0.35, 12), 'machined', [-L * 0.4, 0, 0]);
    b.add(latheX([[R * 0.6, L * 0.08], [R * 0.85, L * 0.3], [R * 0.4, L * 0.5], [0.0001, L * 0.5]], 16), fin);
    return b.build();
  },

  /** Firewall bulkhead fitting: flange, hex body, jam nut. */
  safety_bulkhead(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    b.add(cylX(R, L * 0.15, 20), 'machined', [0, 0, 0]);
    b.add(hexX(R * 0.75, L * 0.3), 'blue', [-L * 0.3, 0, 0]);
    b.add(hexX(R * 0.75, L * 0.2), 'blue', [L * 0.25, 0, 0]);
    b.add(cylX(R * 0.4, L, 10), 'machined');
    return b.build();
  },

  /** Wing main element: inverted cambered section, variable chord (10-12 in) and outer-section twist. */
  safety_wingElement(L, D1, D2) {
    // canonical: span on X, thickness on Y, chord on Z with +Z = leading edge (forward)
    const af = airfoil(26);
    let ymin = Infinity, ymax = -Infinity;
    for (const [, y] of af) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
    const cMax = D2, cTip = D2 * 0.84;
    const yScale = Math.min(1.4, D1 / ((ymax - ymin) * cMax));
    const ns = 17;
    const rows = [];
    for (let i = 0; i < ns; i++) {
      const s = i / (ns - 1);
      const x = -L / 2 + s * L;
      const e = Math.abs(x) / (L / 2); // 0 centre .. 1 tip
      const k = clamp((e - 0.42) / 0.2, 0, 1); // transition centre -> outer section
      const k2 = k * k * (3 - 2 * k);
      const c = cMax + (cTip - cMax) * clamp((e - 0.42) / 0.58, 0, 1);
      const tw = THREE.MathUtils.degToRad(5) * k2;
      const cs = Math.cos(tw), sn = Math.sin(tw);
      rows.push(af.map(([u, y]) => {
        const zz = c / 2 - u * c; // LE at +c/2
        const yy = (y - (ymax + ymin) / 2) * c * yScale;
        // rotate about the span axis (positive = trailing edge up)
        return V(x, yy * cs - zz * sn, yy * sn + zz * cs);
      }));
    }
    const b = new PartBuilder();
    b.add(gridGeo(rows, true), 'carbon');
    b.add(capGeo(rows[0], V(-L / 2, 0, 0)), 'carbon');
    b.add(capGeo(rows[ns - 1], V(L / 2, 0, 0)), 'carbon');
    return b.build();
  },

  /** Rocker side skirt: curved outer face with a flat bottom lip. Built for the left (+z) side. */
  safety_sideSkirt(L, D1, D2) {
    const h = D1, w = D2;
    // shape coords: x = -z (extrudeX convention), y = y
    const prof = [[-0.5, 0.5], [-0.12, 0.5], [0.18, 0.32], [0.38, 0.05], [0.47, -0.3], [0.5, -0.42], [0.5, -0.5], [-0.5, -0.5]];
    const sh = shapeFrom(prof.map(([z, y]) => [-z * w, y * h]));
    const b = new PartBuilder();
    b.add(extrudeX(sh, L * 0.97), 'carbon');
    // tapered end caps
    for (const s of [-1, 1]) b.add(extrudeX(shapeFrom(prof.map(([z, y]) => [-(z * 0.6 - 0.2) * w, y * h * 0.8])), L * 0.03), 'carbon', [s * L * 0.49, -h * 0.08, 0]);
    return b.build();
  },

  /** 1.75 in tube clamp (mirror mount). Length along X = clamp width. */
  safety_tubeClamp(L, D1, D2) {
    const b = new PartBuilder();
    b.add(ringX(CAGE_R + 0.006, CAGE_R, L, 28), 'black');
    for (const s of [-1, 1]) b.add(box(L * 0.9, 0.006, 0.02, 0.001), 'black', [0, -CAGE_R - 0.012, s * 0.006]);
    b.add(cylZ(0.004, 0.03, 8), 'chrome', [0, -CAGE_R - 0.015, 0]);
    return b.build();
  },

  /** 12 V inline blower (HVAC-delete demister fan). */
  safety_blower(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.6, -L / 2], [R, -L * 0.3], [R, L * 0.25], [R * 0.6, L / 2], [R * 0.55, L / 2]], 28), 'black');
    b.add(cylX(R * 0.62, L * 0.25, 20), 'black', [L * 0.55, 0, 0]);
    b.add(cylX(R * 0.62, L * 0.2, 20), 'black', [-L * 0.55, 0, 0]);
    b.add(box(0.02, 0.012, 0.01), 'plastic', [0, R + 0.004, 0]);
    return b.build();
  },

  /** Fascia brake-duct inlet: bell-mouth ring + ribbed duct hose stub (+X = into the car). */
  safety_ductInlet(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    b.add(latheX([[R, -L / 2], [R * 0.82, -L / 2 + 0.012], [R * 0.72, -L / 2 + 0.03], [R * 0.72, L * 0.1], [R * 0.66, L * 0.1]], 28), 'black');
    for (let i = 0; i < 4; i++) b.add(torusX(R * 0.7, 0.003, 6, 24), 'rubber', [L * 0.15 + i * L * 0.09, 0, 0]);
    b.add(cylX(R * 0.68, L * 0.4, 20), 'rubber', [L * 0.3, 0, 0]);
    return b.build();
  },

  /** External kill-switch / fire pull T-handle on the cowl (length = shaft along axis). */
  safety_tHandle(L, D1, D2, ctx) {
    // variant 'fire': red fire-system pull handle; default: yellow electrical cut-off pull
    const b = new PartBuilder();
    b.add(cylX(0.004, L, 8), 'chrome', [-L * 0.1, 0, 0]);
    b.add(cylX(0.012, 0.006, 16), 'black', [-L / 2 + 0.003, 0, 0]);
    b.add(box(0.012, Math.max(D1, D2) * 0.9, 0.012, 0.004), ctx?.variant === 'fire' ? 'red' : 'yellow', [L / 2 - 0.006, 0, 0]);
    return b.build();
  },
};

// =================================================================== BOX generators (world aligned unless the model has rot)
const boxes = {
  /** Cage mounting / backing plate (1/8 in steel, rounded corners) with the fillet weld ring of the tube foot. */
  safety_cagePlate(sx, sy, sz, ctx) {
    const t = Math.min(sy, 0.004);
    const b = new PartBuilder();
    const fin = ctx?.variant || 'cage';
    b.add(extrudeY(shapeFrom(roundRectPts(sx, sz, 0.012)), t), fin);
    if (!ctx?.variant) b.add(torusX(CAGE_R + 0.002, 0.004, 6, 24), 'cage', [0, t / 2, 0], [0, 0, PI / 2]);
    else for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(cylY(0.0045, 0.006, 8), 'machined', [dx * (sx / 2 - 0.015), t / 2 + 0.003, dz * (sz / 2 - 0.012)]);
    return b.build();
  },

  /** Seat side-mount bracket: 4 mm L-bracket with slotted seat holes (295 mm spacing) and lightening holes. */
  safety_seatBracket(sx, sy, sz) {
    const t = 0.004;
    const out = [[-sx / 2, -sy / 2], [sx / 2, -sy / 2], [sx / 2, -sy / 2 + sy * 0.35], [sx / 2 - 0.05, sy / 2], [-sx / 2 + 0.05, sy / 2], [-sx / 2, -sy / 2 + sy * 0.35]];
    const holes = [];
    for (const hx of [-0.1475, 0.1475]) holes.push(circlePts(hx, sy * 0.3, 0.0055, 10));
    for (const hx of [-0.07, 0, 0.07]) holes.push(circlePts(hx, -sy * 0.02, 0.018, 12));
    const b = new PartBuilder();
    b.add(extrudeZ(shapeFrom(out, holes), t), 'satin');
    // bottom flange to the base rails
    b.add(box(sx, 0.004, 0.035, 0.001), 'satin', [0, -sy / 2 + 0.002, -0.0175]);
    for (const hx of [-0.1475, 0.1475]) b.add(hexX(0.008, 0.008), 'chrome', [hx, sy * 0.3, 0.006], [0, PI / 2, 0]);
    return b.build();
  },

  /** Welded seat base: two 1x2 in rectangular rails + cross tubes + floor feet. */
  safety_seatBase(sx, sy, sz) {
    const b = new PartBuilder();
    const rh = Math.min(sy, 0.03);
    for (const s of [-1, 1]) {
      b.add(box(sx, rh, 0.025, 0.002), 'satin', [0, 0, s * (sz / 2 - 0.0125)]);
      for (const fx of [-1, 1]) b.add(box(0.07, 0.004, 0.045, 0.001), 'satin', [fx * (sx / 2 - 0.035), -rh / 2 + 0.002, s * (sz / 2 - 0.0125)]);
    }
    for (const fx of [-0.3, 0.3]) b.add(cylZ(0.0125, sz - 0.05, 12), 'satin', [fx * sx, 0, 0]);
    return b.build();
  },

  /** Frontal head restraint (HANS-type) — carbon yoke on the shoulders, rear collar, tethers. Local x = forward/back. */
  safety_hans(sx, sy, sz) {
    const b = new PartBuilder();
    const yb = -sy / 2 + 0.015;
    // yoke: U in plan (open to the front), flattened section
    const U = [[-sx / 2, sz * 0.36], [-sx * 0.1, sz * 0.43], [sx * 0.25, sz * 0.36], [sx * 0.36, 0], [sx * 0.25, -sz * 0.36], [-sx * 0.1, -sz * 0.43], [-sx / 2, -sz * 0.36]].map(([x, z]) => V(x, yb, z));
    const dense = smooth(U, 0.012);
    for (const g of sweep(dense, rect(0.05, 0.012), { normalFn: () => V(0, 1, 0) })) b.add(g, 'carbon');
    // foam pads under the arms
    for (const s of [-1, 1]) b.add(box(sx * 0.4, 0.008, 0.04, 0.003), 'seat', [-sx * 0.2, yb - 0.009, s * sz * 0.4]);
    // rear collar (rises behind the neck)
    const collar = shapeFrom(roundRectPts(sz * 0.5, sy * 0.85, 0.02));
    b.add(extrudeX(collar, 0.012), 'carbon', [sx * 0.38, yb + sy * 0.42, 0], [0, 0, 0.12]);
    // tether anchors + short tethers forward to the helmet posts
    for (const s of [-1, 1]) {
      b.add(cylZ(0.008, 0.012, 10), 'chrome', [sx * 0.36, sy * 0.3, s * sz * 0.2]);
      b.add(box(sx * 0.32, 0.003, 0.022, 0.001), 'harness', [sx * 0.2, sy * 0.38, s * sz * 0.26], [0, s * 0.35, 0.25]);
    }
    return b.build();
  },

  /** Closed-face helmet with FHR (HANS) posts on both sides. */
  safety_helmet(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(sphere(0.5, 28, 18), 'cage', [0, 0, 0], [0, 0, 0], [sx, sy, sz]);
    // visor / eyeport (front = -x)
    const vis = new THREE.SphereGeometry(0.505, 20, 6, -0.65, 1.3, 1.25, 0.42);
    b.add(vis, 'black', [0, 0, 0], [0, 0, 0], [sx, sy, sz]);
    // chin bar band + neck roll
    const roll = new THREE.TorusGeometry(0.5, 0.02, 6, 28);
    roll.rotateX(PI / 2);
    b.add(roll, 'black', [0, -sy * 0.32, 0], [0, 0, 0], [sx * 0.85, 1, sz * 0.85]);
    for (const s of [-1, 1]) {
      b.add(cylZ(0.012, 0.016, 12), 'black', [sx * 0.04, -sy * 0.12, s * (sz / 2 + 0.004)]);
      b.add(cylZ(0.005, 0.008, 8), 'chrome', [sx * 0.04, -sy * 0.12, s * (sz / 2 + 0.014)]);
    }
    return b.build();
  },

  /** Head-surround foam padding (FIA 8857-type): rear pad + two side pads. Local: thin back along x. */
  safety_headPad(sx, sy, sz) {
    const b = new PartBuilder();
    const t = 0.045;
    b.add(box(t, sy, sz * 0.62, 0.015), 'seat', [sx / 2 - t / 2, 0, 0]);
    for (const s of [-1, 1]) b.add(box(sx, sy * 0.95, t, 0.015), 'seat', [0, 0, s * (sz / 2 - t / 2)]);
    return b.build();
  },

  /** SFI 27.1 ribbon window net: 1 in black webbing grid, bound border, top/bottom rod sleeves. */
  safety_windowNet(sx, sy, sz, ctx) {
    const d = [sx, sy, sz];
    const diag = ctx?.variant === 'diag'; // net plane runs from the top-inboard edge to the bottom-outboard edge of the box
    const ti = diag ? 2 : thinAxis(d);
    const b = new PartBuilder();
    // build in x (length) / y (height) plane then rotate if the thin axis is not z
    const Lx = ti === 0 ? sz : sx, Hy = diag ? Math.hypot(sy, sz) - 0.01 : sy;
    const rib = 0.025, pitch = 0.075, t = 0.003;
    const nv = Math.max(2, Math.round((Lx - 0.05) / pitch)), nh = Math.max(2, Math.round((Hy - 0.06) / pitch));
    const parts = [];
    for (let i = 0; i <= nv; i++) parts.push([box(rib, Hy - 0.04, t, 0), 'net', [-Lx / 2 + 0.025 + (i / nv) * (Lx - 0.05), 0, 0]]);
    for (let j = 0; j <= nh; j++) parts.push([box(Lx - 0.04, rib, t, 0), 'net', [0, -Hy / 2 + 0.03 + (j / nh) * (Hy - 0.06), t]]);
    for (const s of [-1, 1]) {
      parts.push([cylX(0.012, Lx, 12), 'harness', [0, s * (Hy / 2 - 0.012), 0]]); // rod sleeves
      parts.push([box(0.025, Hy, 0.006, 0.002), 'harness', [s * (Lx / 2 - 0.0125), 0, 0]]); // bound edges
    }
    parts.push([box(0.04, 0.025, 0.002, 0), 'cage', [Lx / 2 - 0.06, -Hy / 2 + 0.05, 0.004]]); // SFI tag
    const rot = diag ? [-Math.atan2(sz, sy) * (ctx?.side || 1), 0, 0] : ti === 0 ? [0, PI / 2, 0] : ti === 1 ? [PI / 2, 0, 0] : [0, 0, 0];
    for (const [g, f, p] of parts) {
      g.translate(p[0], p[1], p[2]);
      b.add(g, f, [0, 0, 0], rot);
    }
    return b.build();
  },

  /** Lever-action window-net latch (spring-rod receiver on the roof bar). */
  safety_netLatch(sx, sy, sz, ctx) {
    // clamp block on the cage tube (top), rod receiver, over-centre lever and a red pull tab toward the driver (inboard)
    const b = new PartBuilder();
    const inb = -(Math.sign(ctx?.pos?.[2] ?? 1) || 1);
    b.add(box(sx, sy * 0.35, sz, 0.004), 'machined', [0, sy * 0.3, 0]);
    // weld-on tab from the clamp block up onto the cage tube
    b.add(box(sx * 0.6, 0.014, 0.004, 0.001), 'cage', [0, sy * 0.475 + 0.006, 0]);
    b.add(box(sx * 0.9, 0.008, sz * 0.5, 0.003), 'yellow', [-sx * 0.05, -sy * 0.05, 0], [0, 0, -0.35]);
    b.add(cylZ(0.006, sz * 1.1, 10), 'chrome', [sx * 0.3, sy * 0.3, 0]);
    b.add(box(0.012, 0.008, 0.04, 0.003), 'red', [-sx * 0.1, -sy * 0.12, inb * (sz / 2 + 0.018)]);
    b.add(torusX(0.008, 0.002, 6, 14), 'red', [-sx * 0.1, -sy * 0.12, inb * (sz / 2 + 0.042)], [0, PI / 2, 0]);
    return b.build();
  },

  /** Bottle / extinguisher bracket: base plate, saddles and two quick-release metal straps around the bottle axis. */
  safety_bottleBracket(sx, sy, sz) {
    const along = sx >= sz ? 'x' : 'z';
    const La = along === 'x' ? sx : sz, Wd = along === 'x' ? sz : sx;
    const R = (sy - 0.015) / 2;
    const yc = -sy / 2 + 0.015 + R;
    const b = new PartBuilder();
    const rotY = along === 'x' ? 0 : PI / 2;
    const plate = box(La, 0.005, Wd, 0.002);
    b.add(plate, 'satin', [0, -sy / 2 + 0.0025, 0], [0, rotY, 0]);
    for (const s of [-1, 1]) {
      const off = s * La * 0.3;
      const pos = along === 'x' ? [off, yc, 0] : [0, yc, off];
      // strap band (torus around the bottle axis) + over-centre latch
      b.add(torusX(R + 0.002, 0.0025, 6, 32), 'stainless', pos, [0, along === 'x' ? 0 : PI / 2, 0], [1, 1, 1]);
      b.add(box(0.012, 0.03, 0.025, 0.003), 'stainless', along === 'x' ? [off, yc, R + 0.008] : [R + 0.008, yc, off]);
      b.add(box(along === 'x' ? 0.03 : Wd * 0.9, 0.012, along === 'x' ? Wd * 0.9 : 0.03, 0.002), 'rubber', along === 'x' ? [off, -sy / 2 + 0.011, 0] : [0, -sy / 2 + 0.011, off]);
    }
    return b.build();
  },

  /** Nylon racing tow strap: folded loop of 2 in webbing with steel eyelet bolted to the beam. */
  safety_towStrap(sx, sy, sz) {
    const b = new PartBuilder();
    const L = sx, W = Math.min(sz, 0.05), gap = Math.max(0.006, sy * 0.5);
    for (const s of [-1, 1]) b.add(box(L * 0.85, 0.004, W, 0.001), 'red', [L * 0.07, s * gap / 2, 0]);
    const loop = new THREE.TorusGeometry(gap / 2, 0.002, 4, 12, PI);
    loop.rotateZ(PI / 2);
    b.add(loop, 'red', [-L * 0.355, 0, 0], [0, 0, 0], [1, 1, W / 0.004]);
    b.add(ringX(0.014, 0.006, 0.004, 16), 'stainless', [L * 0.4, gap / 2 + 0.004, 0], [0, 0, PI / 2]);
    b.add(hexX(0.009, 0.008), 'chrome', [L * 0.4, gap / 2 + 0.01, 0], [0, 0, PI / 2]);
    return b.build();
  },

  /** Race dash: sloped top skin + vertical driver panel with column hole and instrument brow. */
  safety_dashPanel(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const zc = ctx?.pos ? ctx.pos[2] : 0;
    const drv = 0.37 - zc; // driver centre line, local
    const t = 0.004;
    // top skin from the windshield base (front, high) back to the panel (rear, lower)
    const topLen = Math.hypot(sx, sy * 0.17);
    b.add(box(topLen, t, sz, 0.002), 'carbon', [0, sy / 2 - sy * 0.085, 0], [0, 0, -Math.atan2(sy * 0.17, sx)]);
    // driver face panel with column + display openings (shape in YZ, x = -z)
    const H = sy * 0.83, W = sz;
    const yc = -sy / 2 + H / 2;
    const out = roundRectPts(W, H, 0.02);
    const col = circlePts(-drv, (0.745 - (ctx?.pos?.[1] ?? 0.8)) - yc, 0.055, 16);
    const face = shapeFrom(out, [col]);
    b.add(extrudeX(face, t), 'carbon', [sx / 2 - t / 2, yc, 0]);
    // instrument brow over the display
    const brow = new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16, 1, true, 0, PI);
    brow.rotateX(PI / 2);
    brow.rotateZ(PI / 2);
    b.add(brow, 'carbon', [sx / 2 - 0.02, sy / 2 - sy * 0.17 - 0.005, drv], [0, 0, 0], [0.55, 1, 1]);
    // end caps
    for (const s of [-1, 1]) b.add(box(sx, sy * 0.83, t, 0.002), 'carbon', [0, yc, s * (sz / 2 - t / 2)]);
    // rivet line along the top edge of the face panel
    for (let z = -sz / 2 + 0.05; z < sz / 2 - 0.04; z += 0.09) b.add(cylX(0.003, 0.003, 6), 'machined', [sx / 2 + 0.001, yc + H / 2 - 0.012, z]);
    return b.build();
  },

  /** Switch-panel plate (brushed aluminium, countersunk screws) that carries the keypad and buttons. */
  safety_switchPanel(sx, sy, sz) {
    const b = new PartBuilder();
    const ti = thinAxis([sx, sy, sz]);
    const t = Math.min(sx, sy, sz);
    const plate = ti === 0 ? box(t, sy, sz, 0.002) : box(sx, sy, t, 0.002);
    b.add(plate, 'aluminum');
    const W = ti === 0 ? sz : sx;
    for (const u of [-1, 1]) for (const v of [-1, 1]) {
      const p = ti === 0 ? [t / 2 + 0.001, v * (sy / 2 - 0.012), u * (W / 2 - 0.012)] : [u * (W / 2 - 0.012), v * (sy / 2 - 0.012), t / 2 + 0.001];
      b.add(ti === 0 ? cylX(0.004, 0.002, 8) : cylZ(0.004, 0.002, 8), 'black', p);
    }
    return b.build();
  },

  /** Display mount: cradle/bezel around the dash display — 3 mm back plate plus a 12 mm wide frame (box depth = sx)
   *  that wraps the display edges, with four bezel screws on the driver-facing (+x) face. */
  safety_displayMount(sx, sy, sz) {
    const b = new PartBuilder();
    const fw = 0.012;
    b.add(box(0.003, sy, sz, 0.001), 'satin', [-sx / 2 + 0.0015, 0, 0]);
    const frame = shapeFrom(roundRectPts(sz, sy, 0.008), [roundRectPts(sz - 2 * fw, sy - 2 * fw, 0.004).reverse()]);
    b.add(extrudeX(frame, sx), 'black');
    for (const u of [-1, 1]) for (const v of [-1, 1]) b.add(cylX(0.003, 0.002, 8), 'chrome', [sx / 2 + 0.001, v * (sy / 2 - fw / 2), u * (sz / 2 - fw / 2)]);
    return b.build();
  },

  /** Safety decal lying on a body surface (thin along the box's smallest dimension, outward = +normal; for a decal on a
   *  vertical x-facing surface the outward side is picked from the car end it sits on).
   *  variant 'spark' = electrical cut-off symbol: blue triangle, white border, red spark;
   *  'fire' = fire-system marking: white disc, red border, red 'E'; 'arrow' = tow-point arrow (yellow on black) pointing down. */
  safety_decal(sx, sy, sz, ctx) {
    const d = [sx, sy, sz];
    const ti = thinAxis(d);
    const t = Math.max(0.0015, Math.min(d[ti], 0.003));
    const [U, V] = ti === 2 ? [sx, sy] : ti === 0 ? [sz, sy] : [sx, sz];
    const out = ti === 0 && (ctx?.pos?.[0] ?? 0) < 1.4 ? -1 : 1; // front-facing decal: layers stack toward -x
    const b = new PartBuilder();
    const rot = ti === 2 ? [0, 0, 0] : ti === 0 ? [0, PI / 2, 0] : [-PI / 2, 0, 0];
    const lay = (pts, fin, k) => {
      const g = extrudeZ(shapeFrom(pts), t / 3);
      g.translate(0, 0, out * (-t / 2 + (k + 0.5) * (t / 3)));
      b.add(g, fin, [0, 0, 0], rot);
    };
    const v = ctx?.variant;
    if (v === 'fire') {
      const R = Math.min(U, V) / 2;
      lay(circlePts(0, 0, R, 32, false), 'red', 0);
      lay(circlePts(0, 0, R * 0.84, 32, false), 'cage', 1);
      const w = R * 0.8, h = R * 1.04, s = R * 0.18;
      lay([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + s], [-w / 2 + s, -h / 2 + s], [-w / 2 + s, -s / 2], [w * 0.35, -s / 2],
        [w * 0.35, s / 2], [-w / 2 + s, s / 2], [-w / 2 + s, h / 2 - s], [w / 2, h / 2 - s], [w / 2, h / 2], [-w / 2, h / 2]], 'red', 2);
    } else if (v === 'spark') {
      const S = Math.min(U, V / 0.866), H = S * 0.866;
      const tri = (k) => [[-S * k / 2, -H * k / 3], [S * k / 2, -H * k / 3], [0, (2 * H * k) / 3]];
      lay(tri(1), 'cage', 0);
      lay(tri(0.82), 'blue', 1);
      const bolt = [[0.04, 0.3], [-0.1, 0.02], [0.0, 0.02], [-0.07, -0.24], [0.11, 0.07], [0.01, 0.07], [0.1, 0.3]].map(([x, y]) => [x * S, y * S - H * 0.05]);
      lay(bolt, 'red', 2);
    } else {
      // tow arrow pointing down (-V) at the strap
      lay(roundRectPts(U, V, 0.004), 'black', 0);
      const head = V * 0.42;
      const arrow = [[-0.14 * U, V / 2 - 0.006], [0.14 * U, V / 2 - 0.006], [0.14 * U, -V / 2 + head], [0.4 * U, -V / 2 + head], [0, -V / 2 + 0.005],
        [-0.4 * U, -V / 2 + head], [-0.14 * U, -V / 2 + head]];
      lay(arrow, 'yellow', 1);
      lay(arrow, 'yellow', 2);
    }
    return b.build();
  },

  /** 5-panel wink mirror on an arc, faces +x (the driver), with a stalk up to the cage clamp. */
  safety_winkMirror(sx, sy, sz) {
    const b = new PartBuilder();
    const n = 5, w = sz / n;
    const R = 0.75; // panel arc radius (concave toward the driver)
    for (let i = 0; i < n; i++) {
      const zc = -sz / 2 + w * (i + 0.5);
      const a = Math.asin(clamp(zc / R, -1, 1));
      const x = -sx / 2 + 0.006 + (R - Math.sqrt(R * R - zc * zc)) * -1;
      b.add(box(0.008, sy, w * 0.97, 0.002), 'black', [x + 0.004, 0, zc], [0, a, 0]);
      b.add(box(0.001, sy * 0.86, w * 0.88, 0), 'chrome', [x + 0.0085, 0, zc], [0, a, 0]);
    }
    b.add(cylY(0.005, 0.07, 8), 'black', [-sx / 2, sy / 2 + 0.03, 0]);
    return b.build();
  },

  /** Aluminium diamond-tread heel plate. */
  safety_heelPlate(sx, sy, sz) {
    const b = new PartBuilder();
    const t = Math.max(0.003, Math.min(sy, 0.004));
    b.add(extrudeY(shapeFrom(roundRectPts(sx, sz, 0.015)), t), 'aluminum');
    const px = 0.03, pz = 0.022;
    let k = 0;
    for (let x = -sx / 2 + 0.02; x < sx / 2 - 0.015; x += px) for (let z = -sz / 2 + 0.02; z < sz / 2 - 0.015; z += pz) {
      const s = (k++ % 2) ? 1 : -1;
      b.add(new THREE.BoxGeometry(0.018, 0.0015, 0.004), 'aluminum', [x, t / 2 + 0.0007, z], [0, s * PI / 4, 0]);
    }
    return b.build();
  },

  /** Dead pedal: angled footrest plate with lightening holes on a floor bracket (inside its box). */
  safety_deadPedal(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    if (thinAxis([sx, sy, sz]) === 1) {
      // The box IS the angled footrest plate (tilted by the model rot about z): plate with lightening holes and grip
      // slots, a floor tab under the low end and a support web from the high end down to the floor (world vertical).
      const t = Math.min(sy, 0.006);
      const a = THREE.MathUtils.degToRad(+(ctx?.m?.rot?.[2]) || 0);
      const holes = [-0.28, 0, 0.28].map((f) => circlePts(f * sx, 0, Math.min(0.016, sz * 0.15), 14));
      b.add(extrudeY(shapeFrom(roundRectPts(sx, sz, 0.012), holes), t), 'aluminum');
      for (const f of [-0.42, -0.14, 0.14, 0.42]) b.add(box(0.006, 0.002, sz * 0.7, 0.0005), 'black', [f * sx, t / 2 + 0.001, 0]);
      const hi = a < 0 ? -1 : 1; // plate end that is up in the world
      const H = Math.abs(sx * Math.sin(a)); // drop from the high end to the low end (which rests on the floor)
      const up = [Math.sin(a), Math.cos(a)]; // world up expressed in the plate frame
      const P = [hi * (sx / 2 - 0.012), -t / 2];
      b.add(box(0.004, H, sz * 0.8, 0.001), 'aluminum', [P[0] - up[0] * H / 2, P[1] - up[1] * H / 2, 0], [0, 0, -a]);
      // floor tab: horizontal in the world, running from the low end away from the high end
      const wx = -hi * 0.02, wy = -0.0015;
      const L = [-hi * (sx / 2) + wx * Math.cos(a) + wy * Math.sin(a), -t / 2 - wx * Math.sin(a) + wy * Math.cos(a)];
      b.add(box(0.04, 0.003, sz * 0.8, 0.001), 'aluminum', [L[0], L[1], 0], [0, 0, -a]);
      return b.build();
    }
    const th = 0.61; // plate ~55 deg from horizontal, face toward the driver (rear/up)
    const L = Math.min((sy * 0.9) / Math.cos(th), (sx * 0.8) / Math.sin(th));
    b.add(new THREE.BoxGeometry(0.004, L, sz * 0.9), 'aluminum', [sx * 0.1, 0.01, 0], [0, 0, th]);
    for (const s of [-0.28, 0.28]) b.add(cylX(0.011, 0.005, 12), 'black', [sx * 0.1 - s * L * Math.sin(th) + 0.003, 0.01 + s * L * Math.cos(th), 0], [0, 0, th]);
    b.add(box(sx * 0.6, 0.004, sz * 0.8, 0.001), 'aluminum', [-sx * 0.15, -sy / 2 + 0.002, 0]);
    b.add(box(0.004, sy * 0.45, sz * 0.8, 0.001), 'aluminum', [-sx / 2 + 0.01, -sy * 0.27, 0]);
    return b.build();
  },

  /** Coolshirt 19 qt cooler: white chest, black lid, handle, pump outlet and dry-break fittings. */
  safety_coolshirt(sx, sy, sz) {
    const b = new PartBuilder();
    const lid = sy * 0.18;
    b.add(box(sx, sy - lid, sz, 0.02), 'cage', [0, -lid / 2, 0]);
    b.add(box(sx * 1.02, lid, sz * 1.02, 0.015), 'plastic', [0, sy / 2 - lid / 2, 0]);
    b.add(box(sx * 0.5, 0.012, 0.025, 0.005), 'plastic', [0, sy / 2 + 0.006, 0]);
    for (const s of [-1, 1]) b.add(box(0.02, 0.03, 0.03, 0.006), 'plastic', [s * sx * 0.27, sy / 2 + 0.005, 0]);
    // fittings on the end panel (inboard, -z face for a passenger-side cooler)
    for (const [dx, f] of [[-0.06, 'blue'], [0.0, 'blue'], [0.07, 'black']]) b.add(cylZ(0.01, 0.03, 12), f, [dx, sy * 0.15, sz / 2 + 0.012]);
    b.add(box(0.06, 0.04, 0.03, 0.006), 'plastic', [sx * 0.3, sy * 0.15, sz / 2 + 0.012]);
    return b.build();
  },

  /** NACA submerged inlet mounted on the polycarbonate window with a round outlet (inward). */
  safety_nacaDuct(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const inward = -(Math.sign(ctx?.pos?.[2] ?? 1) || 1);
    // planform in x (flow, rearward) / y: narrow throat at the front, flared ogive walls
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([-sx / 2 + u * sx, (0.12 + 0.88 * u * u) * sy / 2]); }
    for (let i = n; i >= 0; i--) { const u = i / n; pts.push([-sx / 2 + u * sx, -(0.12 + 0.88 * u * u) * sy / 2]); }
    const flange = shapeFrom([[-sx / 2 - 0.01, sy / 2 + 0.008], [sx / 2 + 0.01, sy / 2 + 0.008], [sx / 2 + 0.01, -sy / 2 - 0.008], [-sx / 2 - 0.01, -sy / 2 - 0.008]], [pts.slice().reverse()]);
    b.add(extrudeZ(flange, 0.004), 'black', [0, 0, -inward * (sz / 2 - 0.002)]);
    // ramp floor (descends inward toward the rear)
    const ramp = extrudeZ(shapeFrom(pts), 0.003);
    b.add(ramp, 'black', [0, 0, 0], [0, inward * 0.18, 0]);
    b.add(cylZ(sy * 0.4, sz * 0.8, 16), 'black', [sx / 2 - sy * 0.4, 0, inward * sz * 0.2]);
    return b.build();
  },

  /** Ballast: stacked steel plates with through-bolts. */
  safety_ballast(sx, sy, sz) {
    const b = new PartBuilder();
    const n = Math.max(2, Math.round(sy / 0.0127));
    const pt = sy / n;
    for (let i = 0; i < n; i++) b.add(box(sx, pt * 0.96, sz, 0.002), 'black', [0, -sy / 2 + pt * (i + 0.5), 0]);
    for (const u of [-1, 1]) for (const v of [-1, 1]) {
      b.add(cylY(0.008, sy + 0.012, 12), 'chrome', [u * (sx / 2 - 0.03), 0.006, v * (sz / 2 - 0.025)]);
      b.add(hexX(0.011, 0.01), 'chrome', [u * (sx / 2 - 0.03), sy / 2 + 0.008, v * (sz / 2 - 0.025)], [0, 0, PI / 2]);
    }
    return b.build();
  },

  /** Rear-wing endplate (side plate): carbon plate, rounded leading/bottom edge, bolt pattern. Thin along z. */
  safety_wingEndplate(sx, sy, sz) {
    const t = Math.min(sz, 0.006);
    const pts = [[-sx / 2 + 0.03, sy / 2], [sx / 2, sy / 2], [sx / 2, -sy / 2 + 0.03], [sx / 2 - 0.03, -sy / 2], [-sx * 0.05, -sy / 2], [-sx * 0.38, -sy * 0.3], [-sx / 2, -sy * 0.05], [-sx / 2, sy / 2 - 0.03]];
    const b = new PartBuilder();
    b.add(extrudeZ(shapeFrom(pts), t), 'carbon');
    for (const [x, y] of [[-0.06, 0.0], [0.0, 0.01], [0.06, 0.02], [0.0, -0.035]]) b.add(cylZ(0.006, t + 0.004, 8), 'machined', [x, y, 0]);
    return b.build();
  },

  /** Gurney flap: thin L-angle along the trailing edge (span along z). */
  safety_gurney(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(new THREE.BoxGeometry(0.002, sy, sz), 'carbon', [sx / 2 - 0.001, 0, 0]);
    b.add(new THREE.BoxGeometry(0.014, 0.002, sz), 'carbon', [sx / 2 - 0.008, -sy / 2 + 0.001, 0]);
    return b.build();
  },

  /** Front dive plane / canard: swept planform, thin cambered blade, up-turned tip and mounting flange. */
  safety_canard(sx, sy, sz) {
    const b = new PartBuilder();
    const t = Math.max(0.003, Math.min(sy, 0.006));
    // planform in (x, z): root along inner edge (z = -sz/2), swept leading edge, tip chord ~45 %
    const pf = [[-sx / 2, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2 - 0.01], [sx * 0.05, sz / 2], [-sx * 0.2, sz * 0.2]];
    b.add(extrudeY(shapeFrom(pf), t), 'carbon');
    b.add(box(sx * 0.4, 0.02, 0.003, 0.001), 'carbon', [sx * 0.25, 0.01, sz / 2 - 0.002]);
    b.add(box(sx, 0.025, 0.003, 0.001), 'carbon', [0, -0.008, -sz / 2 + 0.0015]);
    for (const x of [-sx * 0.3, sx * 0.3]) b.add(cylZ(0.004, 0.006, 8), 'chrome', [x, -0.012, -sz / 2 - 0.002]);
    return b.build();
  },

  /** Louvred vent panel (hood extractor / fender louvres): frame + angled slats across z. */
  safety_louvers(sx, sy, sz, ctx) {
    // variant 'bend:R' bends the panel across z about a centre of curvature R below it (louvres let into a crowned fender)
    const R = String(ctx?.variant || '').startsWith('bend:') ? parseFloat(ctx.variant.slice(5)) : 0;
    const b = new PartBuilder();
    const fw = R ? 0.012 : 0.02, t = Math.min(sy, 0.004);
    const seg = R ? 10 : 1;
    if (!R) {
      const frame = shapeFrom(roundRectPts(sx, sz, 0.02), [roundRectPts(sx - 2 * fw, sz - 2 * fw, 0.012).reverse()]);
      b.add(extrudeY(frame, t), 'carbon', [0, sy / 2 - t / 2, 0]);
    } else {
      for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(sx, t, fw, 6, 1, 2), 'carbon', [0, sy / 2 - t / 2, s * (sz / 2 - fw / 2)]);
      for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(fw, t, sz - 2 * fw, 1, 1, seg), 'carbon', [s * (sx / 2 - fw / 2), sy / 2 - t / 2, 0]);
    }
    const n = Math.max(3, Math.round((sx - 2 * fw) / 0.028));
    const drop = R ? Math.min(sy * 0.5, 0.008) : Math.min(sy * 0.5, 0.012);
    for (let i = 0; i < n; i++) {
      const x = -sx / 2 + fw + ((i + 0.5) / n) * (sx - 2 * fw);
      b.add(new THREE.BoxGeometry(0.026, 0.0025, sz - 2 * fw, 1, 1, seg), 'carbon', [x, sy / 2 - drop, 0], [0, 0, -0.6]);
    }
    const out = b.build();
    if (R) {
      out.traverse((o) => {
        if (!o.isMesh) return;
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const y = pa.getY(i), z = pa.getZ(i), f = z / R, r = R + y;
          pa.setY(i, r * Math.cos(f) - R);
          pa.setZ(i, r * Math.sin(f));
        }
        pa.needsUpdate = true;
        o.geometry.computeVertexNormals();
        o.geometry.computeBoundingSphere();
      });
    }
    return out;
  },

  /** Rear diffuser: ramp panel, vertical strakes deepening to the rear, side fences. Local box (rot applied).
   *  variant 'cut:len,z0,z1': exhaust cut-outs from the leading edge back `len` (along the ramp) between |z| z0 and z1;
   *  strakes inside that band start behind the cut-out. */
  safety_diffuser(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const t = 0.004, top = sy / 2 - t / 2;
    const cut = /^cut:/.test(ctx?.variant || '') ? ctx.variant.slice(4).split(',').map(Number) : null;
    const x0 = -sx / 2, xc = cut ? x0 + cut[0] : x0;
    if (cut) {
      const [, z0, z1] = cut;
      // outline with the two notches open at the leading edge
      const out = [[x0, -sz / 2], [sx / 2, -sz / 2], [sx / 2, sz / 2], [x0, sz / 2], [x0, z1], [xc, z1], [xc, z0], [x0, z0],
        [x0, -z0], [xc, -z0], [xc, -z1], [x0, -z1]];
      b.add(extrudeY(shapeFrom(out), t), 'carbon', [0, top, 0]);
    } else {
      b.add(new THREE.BoxGeometry(sx, t, sz), 'carbon', [0, top, 0]);
    }
    const zs = [-0.5, -0.32, -0.12, 0.12, 0.32, 0.5];
    for (const k of zs) {
      const zk = k * (sz - 0.006);
      const xs = cut && Math.abs(zk) > cut[1] - 0.005 && Math.abs(zk) < cut[2] + 0.005 ? xc + 0.01 : -sx / 2;
      const strake = shapeFrom([[xs, 0], [sx / 2, 0], [sx / 2, -(sy - t)], [Math.max(sx * 0.3, xs + 0.05), -(sy - t)]]);
      const g = extrudeZ(strake, k === -0.5 || k === 0.5 ? 0.005 : 0.004);
      b.add(g, 'carbon', [0, sy / 2 - t, zk]);
    }
    // leading-edge lip (split around the cut-outs)
    const lips = cut ? [[-sz / 2, -cut[2]], [-cut[1], cut[1]], [cut[2], sz / 2]] : [[-sz / 2, sz / 2]];
    for (const [a, c] of lips) b.add(box(0.02, 0.006, c - a, 0.002), 'carbon', [-sx / 2 + 0.01, top - 0.004, (a + c) / 2]);
    return b.build();
  },

  /** Radiator inlet/exit duct: four aluminium walls, flanged inlet, open both ends (flow along x). */
  safety_radDuct(sx, sy, sz) {
    const b = new PartBuilder();
    const t = 0.0025;
    for (const s of [-1, 1]) {
      b.add(new THREE.BoxGeometry(sx, t, sz), 'aluminum', [0, s * (sy / 2 - t / 2), 0]);
      b.add(new THREE.BoxGeometry(sx, sy, t), 'aluminum', [0, 0, s * (sz / 2 - t / 2)]);
      b.add(new THREE.BoxGeometry(0.004, 0.025, sz), 'aluminum', [-sx / 2, s * (sy / 2 + 0.01), 0]);
      b.add(new THREE.BoxGeometry(0.004, sy, 0.025), 'aluminum', [-sx / 2, 0, s * (sz / 2 + 0.01)]);
    }
    return b.build();
  },

  /** Seat foam insert / cushion. */
  safety_seatInsert(sx, sy, sz) {
    return new PartBuilder().add(box(sx, sy, sz, Math.min(sy * 0.45, 0.012)), 'seat').build();
  },
};

// =================================================================== WHOLE-component generators
const whole = {
  /**
   * FIA 8862-style fixed-back race seat (Racetech RT4119/4129 class): fibreglass shell with thigh bolsters,
   * high hip sides, shoulder wings and integral head surround; cloth cover; harness slots; side-mount inserts.
   * Faces -x. Built from the union box (min/max relative to the box centre).
   */
  safety_raceSeat(min, max) {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const kx = sx / 0.67, ky = sy / 0.915, kz = sz / 0.62;
    const P = (X, Y) => V(min.x + X * kx, min.y + Y * ky, 0);
    // [X from front, Y from base, inner half-width, side-wall height (toward occupant), flare]
    const ST = [
      [0.02, 0.088, 0.165, 0.045, 0.01],
      [0.1, 0.074, 0.172, 0.075, 0.015],
      [0.22, 0.056, 0.178, 0.11, 0.02],
      [0.34, 0.046, 0.182, 0.15, 0.025],
      [0.43, 0.056, 0.185, 0.19, 0.03],
      [0.485, 0.11, 0.185, 0.2, 0.03],
      [0.505, 0.2, 0.188, 0.19, 0.03],
      [0.535, 0.33, 0.195, 0.16, 0.035],
      [0.565, 0.47, 0.215, 0.14, 0.04],
      [0.59, 0.58, 0.245, 0.13, 0.04],
      [0.603, 0.645, 0.24, 0.13, 0.035],
      [0.614, 0.7, 0.175, 0.17, 0.02],
      [0.628, 0.765, 0.155, 0.19, 0.02],
      [0.641, 0.84, 0.155, 0.19, 0.02],
      [0.65, 0.9, 0.15, 0.16, 0.015],
    ];
    // refine stations with Catmull-Rom interpolation of all parameters
    const sub = 3, rowsP = [];
    for (let i = 0; i < ST.length - 1; i++) for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const p0 = ST[Math.max(0, i - 1)], p1 = ST[i], p2 = ST[i + 1], p3 = ST[Math.min(ST.length - 1, i + 2)];
      rowsP.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
    }
    rowsP.push(ST[ST.length - 1]);
    const centres = rowsP.map(([X, Y]) => P(X, Y));
    const n = centres.length;
    const Tn = centres.map((_, i) => V().subVectors(centres[Math.min(n - 1, i + 1)], centres[Math.max(0, i - 1)]).normalize());
    const Nn = Tn.map((T) => V(-T.y, T.x, 0)); // toward the occupant
    const kk = (kx + ky) / 2;
    const section = (i, off) => {
      const [, , w0, h0, f] = rowsP[i];
      const w = w0 * kz + off, h = h0 * kk, rc = Math.min(0.045, h * 0.6);
      const half = [[0, -off], [w - rc, -off]];
      for (let a = 1; a <= 3; a++) { const an = (a / 4) * (PI / 2); half.push([w - rc + Math.sin(an) * rc, rc - Math.cos(an) * rc - off * (1 - a / 4)]); }
      half.push([w, rc], [w + f * 0.4 * kz, h * 0.55], [w + f * kz, h]);
      const full = [...half.slice().reverse().map(([z, nn]) => [z, nn]), ...half.slice(1).map(([z, nn]) => [-z, nn])];
      return full.map(([z, nn]) => centres[i].clone().addScaledVector(Nn[i], nn).add(V(0, 0, z)));
    };
    const inner = [], outer = [];
    for (let i = 0; i < n; i++) { inner.push(section(i, 0)); outer.push(section(i, 0.012)); }
    const b = new PartBuilder();
    b.add(gridGeo(inner), 'seat');
    b.add(gridGeo(outer), 'black');
    // rolled edges: side-wall tops, front lip and top of the head surround
    const m = inner[0].length;
    for (const j of [0, m - 1]) b.add(gridGeo(inner.map((row, i) => [row[j], outer[i][j]])), 'black');
    b.add(gridGeo([inner[0], outer[0]]), 'black');
    b.add(gridGeo([inner[n - 1], outer[n - 1]]), 'black');
    // harness slots
    const back = Math.atan2(Tn[Math.round(n * 0.75)].x, Tn[Math.round(n * 0.75)].y);
    for (const s of [-1, 1]) {
      b.add(new THREE.BoxGeometry(0.006, 0.024, 0.065), 'black', P(0.598, 0.635).add(V(-0.002, 0, s * 0.075 * kz)).toArray(), [0, 0, -back]);
      b.add(new THREE.BoxGeometry(0.05, 0.024, 0.006), 'black', P(0.455, 0.11).add(V(0, 0.01, s * (0.188 * kz - 0.002))).toArray());
    }
    b.add(new THREE.BoxGeometry(0.024, 0.004, 0.065), 'black', P(0.11, 0.074).add(V(0, 0.002, 0)).toArray());
    // side-mount threaded inserts (295 mm centres)
    for (const s of [-1, 1]) for (const X of [0.155, 0.45]) b.add(cylZ(0.012, 0.004, 12), 'machined', P(X, 0.105).add(V(0, 0, s * (0.188 * kz + 0.014))).toArray());
    return b.build();
  },
};

export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules: [
    // ---------------- roll cage
    [/^safety\.roll-cage\.padding$/, 'safety_cagePad', { shapes: ['tube'] }],
    [/^safety\.roll-cage\.gussets$/, 'safety_gussets', { shapes: ['tube'] }],
    [/^safety\.roll-cage\.door-bar-uprights$/, 'safety_cageTube', { shapes: ['tube'], variant: 'tight' }],
    [/^safety\.roll-cage\./, 'safety_cageTube', { shapes: ['tube'] }],
    [/^safety\.roll-cage\.(main-hoop|front-hoop|backstay|strut-tower)-plates$/, 'safety_cagePlate'],
    // ---------------- seat, harness, head & neck
    [/^safety\.seat-and-mounts\.seat-shell$/, 'safety_raceSeat', { whole: true }],
    [/^safety\.seat-and-mounts\.side-brackets$/, 'safety_seatBracket'],
    [/^safety\.seat-and-mounts\.floor-mount$/, 'safety_seatBase'],
    [/^safety\.seat-and-mounts\.floor-reinforcement-plates$/, 'safety_cagePlate', { variant: 'steel' }],
    [/^safety\.seat-and-mounts\.seat-back-brace$/, 'safety_seatBrace', { shapes: ['tube'] }],
    [/^safety\.seat-and-mounts\.seat-insert$/, 'safety_seatInsert'],
    [/^safety\.harness\.harness-assembly$/, 'safety_harnessStrap', { shapes: ['tube'] }],
    [/^safety\.harness\.harness-assembly$/, 'safety_camlock', { shapes: ['cylinder'] }],
    [/^safety\.head-and-neck\.fhr-device$/, 'safety_hans'],
    [/^safety\.head-and-neck\.helmet-anchors$/, 'safety_helmet'],
    [/^safety\.head-and-neck\.head-surround-padding$/, 'safety_headPad'],
    // ---------------- window net
    [/^safety\.window-net\.net$/, 'safety_windowNet'],
    [/^safety\.window-net\.lower-mount$/, 'safety_netRod', { shapes: ['tube'], variant: 'down' }],
    [/^safety\.window-net\.(upper-mount-rod|lower-mount)$/, 'safety_netRod', { shapes: ['tube'] }],
    [/^safety\.window-net\.latch$/, 'safety_netLatch'],
    // ---------------- fire system, extinguisher, kill switch, tow
    [/^safety\.fire-suppression\.bottle$/, 'safety_fireBottle', { variant: 'system' }],
    [/^safety\.extinguisher\.handheld$/, 'safety_fireBottle', { variant: 'handheld' }],
    [/^safety\.(fire-suppression\.bottle-bracket|extinguisher\.quick-release-mount)$/, 'safety_bottleBracket'],
    [/^safety\.fire-suppression\.cockpit-nozzles$/, 'safety_nozzle', { variant: 'cockpit' }],
    [/^safety\.fire-suppression\.engine-nozzles$/, 'safety_nozzle', { variant: 'engine' }],
    [/^safety\.fire-suppression\.bulkhead-fitting$/, 'safety_bulkhead'],
    [/^safety\.kill-switches\.external-t-handle$/, 'safety_tHandle'],
    [/^safety\.fire-suppression\.(internal|external)-pull-cable$/, 'safety_tHandle', { shapes: ['cylinder'], variant: 'fire' }],
    [/^safety\.kill-switches\.decal$/, 'safety_decal', { variant: 'spark' }],
    [/^safety\.fire-suppression\.decals$/, 'safety_decal', { variant: 'fire' }],
    [/^safety\.tow-hooks\.tow-markers$/, 'safety_decal', { variant: 'arrow', usesPos: true }],
    [/^safety\.tow-hooks\.(front|rear)-tow-strap$/, 'safety_towStrap'],
    // ---------------- interior
    [/^interior\.dash\.race-dash-panel$/, 'safety_dashPanel', { usesPos: true }],
    [/^interior\.dash\.switch-panel$/, 'safety_switchPanel'],
    [/^interior\.dash\.display-mount$/, 'safety_displayMount'],
    [/^interior\.dash\.defrost-fan$/, 'safety_blower'],
    [/^interior\.mirrors\.wink-mirror$/, 'safety_winkMirror'],
    [/^interior\.mirrors\.cage-clamp$/, 'safety_tubeClamp'],
    [/^interior\.pedal-area-floor\.heel-plate$/, 'safety_heelPlate'],
    [/^interior\.pedal-area-floor\.dead-pedal$/, 'safety_deadPedal'],
    [/^interior\.driver-cooling\.coolshirt-cooler$/, 'safety_coolshirt'],
    [/^interior\.driver-cooling\.cooler-tray$/, 'safety_cagePlate', { variant: 'satin' }],
    [/^interior\.driver-cooling\.fresh-air-duct$/, 'safety_nacaDuct', { usesPos: true }],
    [/^interior\.ballast\.ballast-plates$/, 'safety_ballast'],
    [/^interior\.ballast\.ballast-mount$/, 'safety_cagePlate', { variant: 'satin' }],
    // ---------------- aero
    [/^aero\.rear-wing\.main-element$/, 'safety_wingElement'],
    [/^aero\.rear-wing\.endplates$/, 'safety_wingEndplate'],
    [/^aero\.rear-wing\.gurney-flap$/, 'safety_gurney'],
    [/^aero\.rear-wing\.uprights$/, 'safety_wingStand', { shapes: ['tube'] }],
    [/^aero\.rear-wing\.mount-plates$/, 'safety_cagePlate', { variant: 'carbon' }],
    [/^aero\.dive-planes-canards\./, 'safety_canard'],
    [/^aero\.ducts-and-vents\.fender-louvers$/, 'safety_louvers', { variant: 'bend:0.17' }],
    [/^aero\.ducts-and-vents\.(hood-extractor|fender-louvers)$/, 'safety_louvers'],
    [/^aero\.ducts-and-vents\.fascia-inlets$/, 'safety_ductInlet'],
    [/^aero\.ducts-and-vents\.radiator-ducting$/, 'safety_radDuct'],
    [/^aero\.rear-diffuser\.(diffuser-panel|diffuser-ramp)$/, 'safety_diffuser', { variant: 'cut:0.225,0.17,0.405' }],
    [/^aero\.side-skirts\.(side-skirts|skirt-shells)$/, 'safety_sideSkirt'],
    [/^aero\.front-splitter\.support-rods$/, 'safety_splitterRod', { shapes: ['tube'] }],
  ],
  axial,
  boxes,
  paths,
  whole,
};
