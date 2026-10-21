// Precise part models for the "chassis" group (systems: chassis, suspension, steering). See data/MODELING.md.
// Owned by one modeling pass; generator names are prefixed "chassis_".
//
// Geometry basis (Gen 6 Camaro, GM Alpha platform; ZL1 / ZL1 1LE baseline):
//  - Front: double-pivot MacPherson strut. Cast-aluminium knuckle with two lower ball joints: a lateral link
//    (GM "front lower control arm, rear") and a curved aluminium tension rod (GM "front lower control link /
//    radius rod", hydraulic bushing at the front of the cradle). Extruded-aluminium front cradle (two lateral
//    extrusions + cast side nodes, 4 isolated body mounts). ZF belt-drive EPS rack bolted to the transverse
//    face of the cradle front extrusion, ahead of the axle (front steer). Direct-acting front bar (end link to
//    a tab on the strut body).
//  - Rear: 5-link IRS on a steel cradle with hydroformed side rails and 4 bushed body mounts. Links: lower control
//    arm (spring link with spring pocket), upper camber link, upper + lower trailing links, toe link. Rear knuckle
//    carries 3 pressed bushings (upper camber, upper trailing, lower trailing). Shock is separate, behind the
//    halfshaft. Direct-acting rear bar (ZL1 1LE: 3-hole adjustable arms).
// All hard points (left side, metres, x rearward from the front axle, y up, z left) live in GEOM so the JSON
// `model` paths and these generators always agree.
import * as THREE from 'three';
// eslint-disable-next-line no-unused-vars
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, Helix, curveFrom, tubeAlong, ribbonAlong, alignX, V } from '../geo.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const Y = () => V(0, 1, 0);
const vv = (p) => (p.isVector3 ? p.clone() : V(p[0], p[1], p[2]));

// ------------------------------------------------------------------ frames & helpers
/** Matrix whose local +X is `u`, local +Y is as close as possible to `up`, origin `c`. */
function frame(c, u, up = V(0, 1, 0)) {
  const x = u.clone().normalize();
  let y = up.clone().addScaledVector(x, -up.dot(x));
  if (y.lengthSq() < 1e-8) {
    const alt = Math.abs(x.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
    y = alt.addScaledVector(x, -alt.dot(x));
  }
  y.normalize();
  const z = V().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(c);
}
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const R = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
function put(b, geo, fin, F, p = [0, 0, 0], r = [0, 0, 0]) {
  b.addMatrix(geo, fin, F.clone().multiply(T(p[0], p[1], p[2])).multiply(R(r[0], r[1], r[2])));
}
/** Hollow tube along X (closed-wall lathe). */
function tubeGeo(ro, ri, len, seg = 24) {
  return latheX([[ri, -len / 2], [ro, -len / 2], [ro, len / 2], [ri, len / 2], [ri, -len / 2]], seg);
}
function rodAB(b, fin, a, c, r, seg = 12, r2 = r) {
  const d = V().subVectors(c, a);
  const L = d.length();
  if (L < 1e-5) return;
  put(b, cylX(r, L, seg, r2), fin, frame(a.clone().add(c).multiplyScalar(0.5), d));
}
/** Box member from a to c; sy along `up`, sz across. */
function barAB(b, fin, a, c, sy, sz, up = Y(), rad = null, ext = 0) {
  const d = V().subVectors(c, a);
  const L = d.length();
  if (L < 1e-5) return;
  put(b, box(L + ext, sy, sz, rad), fin, frame(a.clone().add(c).multiplyScalar(0.5), d, up));
}
function tubeAt(b, fin, c, axis, ro, ri, len, seg = 20) { put(b, tubeGeo(ro, ri, len, seg), fin, frame(c, axis)); }
function cylAt(b, fin, c, axis, r, len, seg = 16) { put(b, cylX(r, len, seg), fin, frame(c, axis)); }
function horizPerp(d) {
  const p = V(-d.z, 0, d.x);
  return p.lengthSq() < 1e-8 ? V(1, 0, 0) : p.normalize();
}
/** Hex-head bolt centred at c along axis (head at -axis end). */
function boltAt(b, c, axis, len, r = 0.006, fin = 'chrome') {
  const a = axis.clone().normalize();
  cylAt(b, 'steel', c, a, r, len, 8);
  put(b, hexX(r * 1.7, r * 1.2), fin, frame(c.clone().addScaledVector(a, -len / 2), a));
  put(b, hexX(r * 1.7, r * 1.4), fin, frame(c.clone().addScaledVector(a, len / 2), a));
}
/** Rubber bushing (outer shell, rubber, inner sleeve) centred at c along axis. */
function bushAt(b, c, axis, ro, len, shell = 'steel') {
  const F = frame(c, axis);
  put(b, tubeGeo(ro, ro * 0.84, len, 20), shell, F);
  put(b, tubeGeo(ro * 0.84, ro * 0.42, len * 0.9, 18), 'rubber', F);
  put(b, tubeGeo(ro * 0.42, ro * 0.27, len * 1.16, 10), 'chrome', F);
}
/** Ball joint with its ball centre at c and stud pointing along `up`. */
function ballJointAt(b, c, up, r = 0.019) {
  const F = frame(c, up);
  put(b, latheX([[0.0001, -r * 1.25], [r * 0.9, -r * 1.2], [r * 1.12, -r * 0.6], [r * 1.12, r * 0.2], [r * 0.85, r * 0.3]], 18), 'steel', F);
  put(b, latheX([[r * 0.9, r * 0.25], [r * 1.05, r * 0.6], [r * 0.6, r * 1.05], [r * 0.45, r * 1.15]], 16), 'rubber', F);
  put(b, cylX(r * 0.42, r * 1.7, 12, r * 0.3), 'machined', F, [r * 1.75, 0, 0]);
  put(b, hexX(r * 0.55, r * 0.5), 'chrome', F, [r * 2.7, 0, 0]);
}
/** Clevis (two ear plates straddling a bolt at p) on a link coming from direction `into` (p -> link body). */
function clevisAt(b, fin, p, into, eyeAxis, gap = 0.062) {
  const d = into.clone().normalize();
  const e = eyeAxis.clone().normalize();
  const up = V().crossVectors(e, d).normalize();
  for (const s of [-1, 1]) {
    const c = p.clone().addScaledVector(d, 0.026).addScaledVector(e, (s * gap) / 2);
    put(b, box(0.07, 0.044, 0.005, 0.002), fin, frame(c, d, up));
  }
  boltAt(b, p, e, gap + 0.03, 0.006);
}
function roundRect(sh, x0, y0, x1, y1, r) {
  sh.moveTo(x0 + r, y0);
  sh.lineTo(x1 - r, y0);
  sh.quadraticCurveTo(x1, y0, x1, y0 + r);
  sh.lineTo(x1, y1 - r);
  sh.quadraticCurveTo(x1, y1, x1 - r, y1);
  sh.lineTo(x0 + r, y1);
  sh.quadraticCurveTo(x0, y1, x0, y1 - r);
  sh.lineTo(x0, y0 + r);
  sh.quadraticCurveTo(x0, y0, x0 + r, y0);
  return sh;
}
function rectPath(x0, y0, x1, y1) {
  const p = new THREE.Path();
  p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.lineTo(x0, y0);
  return p;
}
/** Shape (XY) extruded along +Z from z0 to z1. */
function extrudeZ(shape, z0, z1, seg = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, z0);
  return g;
}
/** Shape drawn in the (x, z) plane, extruded upward by t (shape y -> -z). */
function plateXZ(shape, t, seg = 8) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: seg });
  g.rotateX(-PI / 2);
  return g;
}
/** Aluminium extrusion along z with internal webs (open ends show the multi-cell section). */
function extrusionZ(b, fin, cx, cy, w, h, z0, z1, cells = 3) {
  const sh = roundRect(new THREE.Shape(), cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, Math.min(w, h) * 0.18);
  const t = 0.005;
  const cw = (w - 2 * t - (cells - 1) * t) / cells;
  for (let i = 0; i < cells; i++) {
    const x0 = cx - w / 2 + t + i * (cw + t);
    sh.holes.push(rectPath(x0, cy - h / 2 + t, x0 + cw, cy + h / 2 - t));
  }
  b.add(extrudeZ(sh, z0, z1, 4), fin);
}
function curveSamples(pts, n, t0 = 0, t1 = 1) {
  const c = new THREE.CatmullRomCurve3(pts.map(vv), false, 'centripetal', 0.5);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(c.getPointAt(t0 + ((t1 - t0) * i) / n));
  return out;
}

/** Lathe about local +X (up). phi = 0 faces local +Z (outboard after the y-axis canonical rotation). */
function latheXPart(profile, seg, phiStart = 0, phiLength = PI * 2) {
  const pts = profile.map(([r, x]) => new THREE.Vector2(Math.max(0.0001, r), x));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  g.rotateZ(-PI / 2);
  return g;
}
/** Strut / shock tower shell (+X up): tapered skirt open outboard by +/-open below the cap, flat cap on top. */
function towerShell(b, L, R0, o) {
  const t = 0.003;
  const top = L / 2, bot = -L / 2, hs = top - o.split;
  const rCap = R0 * o.capR, rSh = R0 * (o.capR + 0.1);
  const rAt = (h) => R0 + ((rSh - R0) * (h - bot)) / (top - o.shoulder - bot);
  const ps = o.open, pl = PI * 2 - 2 * o.open;
  // upper ring (full) up to and including the cap
  b.add(latheXPart([[rAt(hs), hs], [rSh, top - o.shoulder], [rCap, top - t], [o.hole, top - t], [o.hole, top], [rCap + t, top], [rSh + t, top - o.shoulder + 0.002], [rAt(hs) + t, hs], [rAt(hs), hs]], 36), 'chassis');
  // lower skirt, open toward the wheel
  b.add(latheXPart([[R0, bot], [rAt(hs), hs], [rAt(hs) + t, hs], [R0 + t, bot], [R0, bot]], 30, ps, pl), 'chassis');
  // base weld flange
  b.add(latheXPart([[R0, bot], [R0 * 1.12, bot], [R0 * 1.12, bot + 0.004], [R0, bot + 0.004], [R0, bot]], 30, ps, pl), 'chassis');
  for (let i = 0; i < 3; i++) {
    const a = PI / 2 + (i * 2 * PI) / 3;
    b.add(cylX(0.0075, 0.003, 10), 'black', [top + 0.0005, Math.cos(a) * R0 * o.studR, Math.sin(a) * R0 * o.studR]);
  }
  for (let i = 0; i < o.ribs; i++) {
    const a = ps + ((i + 0.5) / o.ribs) * pl;
    const h0 = bot + 0.03, h1 = hs - 0.01;
    const r0 = rAt(h0) + 0.002, r1 = rAt(h1) + 0.002;
    // lathe vertex (r, h, phi) -> local (h, -r sin phi, r cos phi)
    barAB(b, 'chassis', V(h0, -r0 * Math.sin(a), r0 * Math.cos(a)), V(h1, -r1 * Math.sin(a), r1 * Math.cos(a)), 0.006, 0.012, V(0, -Math.sin(a), Math.cos(a)), 0.002);
  }
}

// ------------------------------------------------------------------ hard points (left side)
const _fsT = V(0.05, 0.875, 0.52);
// strut axis: 6 deg caster, 10 deg inward lean in the front view (was 15); top fixed at the tower centre
const _fsC = V(0.012, 0.52, 0.5826);
const _fsD = V().subVectors(_fsT, _fsC).normalize();
const _fsB = _fsC.clone().addScaledVector(_fsD, (0.46 - 0.52) / _fsD.y);
const fsAt = (y) => _fsB.clone().addScaledVector(_fsD, (y - _fsB.y) / _fsD.y);
// local frame of the strut (same as chassis_strut): X = axis, Y ~ outboard, Z ~ rearward
const _fsF = frame(_fsB, _fsD, V(0, 0, 1));
const _fsZ = V().setFromMatrixColumn(_fsF, 2);
const _fsY = V().setFromMatrixColumn(_fsF, 1);
const _fsTabX = (0.53 - _fsB.y) / _fsD.y;
const _rsL = V(2.95, 0.245, 0.625);
const _rsT = V(2.93, 0.73, 0.57);
const _rsD = V().subVectors(_rsT, _rsL).normalize();
const rsAt = (y) => _rsL.clone().addScaledVector(_rsD, (y - _rsL.y) / _rsD.y);
const rotFor = (d) => {
  const rz = -Math.asin(d.x);
  const rx = Math.asin(d.z / Math.cos(rz));
  return [THREE.MathUtils.radToDeg(rx), 0, THREE.MathUtils.radToDeg(rz)];
};
const a3 = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 10000) / 10000);

export const GEOM = {
  front: {
    strutBottom: a3(_fsB), strutTop: a3(_fsT), strutRot: rotFor(_fsD), at: (y) => a3(fsAt(y)),
    endLinkTab: a3(_fsB.clone().addScaledVector(_fsD, _fsTabX).addScaledVector(_fsZ, -0.045)),
    lbjLateral: [0.025, 0.17, 0.655], lbjTension: [-0.045, 0.175, 0.645],
    lateralInner: [0.045, 0.19, 0.33], tensionInner: [-0.37, 0.2, 0.38], tensionMid: [-0.225, 0.19, 0.545],
    tieRodBall: [-0.135, 0.25, 0.645], barEnd: [-0.055, 0.335, 0.575], hub: [0, 0.3715, 0.66],
  },
  rack: { x: -0.115, y: 0.22, half: 0.3, inner: 0.33, pinion: [-0.049, 0.323, 0.265] },
  rear: {
    // upper camber, upper trailing, toe and end-link pivots sit inboard of the rear wheel (inner face z 0.611):
    // their eyes / clevises end at z <= 0.60. The lower trailing pivot is at z 0.60 (its link grazed the barrel lip); the LCA clevis stays at r < 0.21,
    // inside the barrel clear zone (barrel inner radius 0.235).
    uca: [2.87, 0.575, 0.57], utl: [2.75, 0.565, 0.57], ltl: [2.73, 0.215, 0.6], lca: [2.87, 0.195, 0.66],
    toe: [3.0, 0.26, 0.575], shockLow: a3(_rsL), shockTop: a3(_rsT), shockRot: rotFor(_rsD), at: (y) => a3(rsAt(y)),
    endLink: [3.02, 0.31, 0.585], hub: [2.811, 0.3715, 0.666],
    ucaIn: [2.89, 0.52, 0.32], utlIn: [2.5, 0.5, 0.5], ltlIn: [2.45, 0.255, 0.47], lcaIn: [2.93, 0.235, 0.3],
    toeIn: [3.04, 0.235, 0.33], pocket: [2.915, 0.225, 0.52],
  },
};

// ------------------------------------------------------------------ coil spring with closed ends
class Coil extends THREE.Curve {
  constructor(r, len, turns, wire) {
    super();
    this.r = r; this.l = len; this.n = turns; this.w = wire;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.n * PI * 2;
    const e = 0.85 / this.n;
    const lo = -this.l / 2 + this.w / 2, hi = this.l / 2 - this.w / 2;
    const endH = this.w * 1.05;
    let x;
    if (t < e) x = lo + (t / e) * endH;
    else if (t > 1 - e) x = hi - ((1 - t) / e) * endH;
    else x = lo + endH + ((t - e) / (1 - 2 * e)) * (hi - lo - 2 * endH);
    return target.set(x, Math.cos(a) * this.r, Math.sin(a) * this.r);
  }
}

// ======================================================================= AXIAL (length along +X)
const axial = {
  chassis_bushing(L, D, D2, ctx) {
    const R0 = Math.max(D, D2) / 2;
    const b = new PartBuilder();
    if (ctx?.variant === 'hydro') {
      // GM hydraulic (fluid-filled) radius-rod bushing: steel can, thick rubber with fluid pockets, top flange
      b.add(tubeGeo(R0, R0 * 0.9, L, 28), 'steel');
      b.add(tubeGeo(R0 * 1.12, R0 * 0.9, L * 0.1, 28), 'steel', [L * 0.45, 0, 0]);
      b.add(tubeGeo(R0 * 0.9, R0 * 0.35, L * 0.86, 24), 'rubber');
      for (const s of [-1, 1]) b.add(box(L * 0.7, R0 * 0.25, R0 * 0.5, 0.004), 'black', [0, s * R0 * 0.62, 0]);
      b.add(tubeGeo(R0 * 0.35, R0 * 0.22, L * 1.18, 12), 'chrome');
      return b.build();
    }
    bushAt(b, V(), V(1, 0, 0), R0, L);
    return b.build();
  },

  chassis_ballJoint(L, D) {
    const b = new PartBuilder();
    ballJointAt(b, V(0, 0, 0), V(1, 0, 0), D / 2 * 0.8);
    return b.build();
  },

  chassis_cradleMount(L, D) {
    // +X = up. Cradle isolator / solid spacer, washer under the cradle, long TTY bolt up into the body nut.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R0 * 0.35, -L / 2], [R0, -L / 2], [R0 * 1.02, -L * 0.1], [R0 * 0.9, L / 2], [R0 * 0.35, L / 2]], 24), 'rubber');
    b.add(ringX(R0 * 1.05, R0 * 0.35, 0.004, 24), 'steel', [L / 2 + 0.002, 0, 0]);
    b.add(cylX(0.007, L + 0.03, 10), 'steel', [0.005, 0, 0]);
    b.add(hexX(0.013, 0.01), 'chrome', [-L / 2 - 0.012, 0, 0]);
    b.add(ringX(0.02, 0.007, 0.003, 16), 'chrome', [-L / 2 - 0.005, 0, 0]);
    return b.build();
  },

  chassis_rearCradleBushing(L, D) {
    // GM rear cradle mount: bonded rubber bushing with steel outer can, upper rebound flange, through bolt.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(tubeGeo(R0 * 0.8, R0 * 0.74, L * 0.85, 28), 'steel', [-L * 0.05, 0, 0]);
    b.add(latheX([[R0 * 0.25, -L / 2], [R0 * 0.74, -L / 2], [R0 * 0.74, L * 0.35], [R0, L * 0.38], [R0, L / 2], [R0 * 0.25, L / 2]], 28), 'rubber');
    b.add(ringX(R0 * 0.98, R0 * 0.25, 0.004, 24), 'steel', [L / 2 - 0.002, 0, 0]);
    b.add(cylX(0.0075, L + 0.04, 10), 'steel', [0.01, 0, 0]);
    b.add(hexX(0.014, 0.011), 'chrome', [-L / 2 - 0.016, 0, 0]);
    b.add(ringX(R0 * 0.6, 0.008, 0.004, 20), 'steel', [-L / 2 - 0.006, 0, 0]);
    return b.build();
  },

  chassis_jounce(L, D) {
    // +X = up along the damper rod. Convoluted MCU foam jounce bumper (pale yellow) with its cap.
    const R0 = D / 2;
    const prof = [[R0 * 0.32, -L / 2]];
    const n = 4;
    for (let i = 0; i <= n * 2; i++) {
      const x = -L / 2 + 0.004 + (i / (n * 2)) * (L - 0.012);
      prof.push([R0 * (i % 2 ? 0.78 : 0.98) * (1 - 0.15 * (i / (n * 2))), x]);
    }
    prof.push([R0 * 0.32, L / 2 - 0.008]);
    const b = new PartBuilder();
    b.add(latheX(prof, 20), 'yellow');
    b.add(latheX([[R0 * 0.3, L / 2 - 0.008], [R0 * 1.05, L / 2 - 0.008], [R0 * 1.05, L / 2], [R0 * 0.3, L / 2]], 20), 'black');
    return b.build();
  },

  chassis_coil(L, D) {
    const wire = clamp(D * 0.098, 0.008, 0.016);
    const turns = clamp(Math.round((L - 2 * wire) / (wire * 2.6)) + 1.6, 4, 9);
    const b = new PartBuilder();
    b.add(tubeAlong(new Coil(D / 2 - wire / 2, L, turns, wire), wire / 2, Math.round(turns * 30), 8), 'spring');
    return b.build();
  },

  chassis_strutMount(L, D) {
    // +X = up along the strut. OE top mount: bonded rubber, stamped 3-stud plate, bearing, rod nut.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R0 * 0.2, -L / 2], [R0 * 0.8, -L / 2], [R0 * 0.88, -L * 0.2], [R0 * 0.88, L / 2 - 0.006], [R0 * 0.2, L / 2 - 0.006]], 28), 'rubber');
    b.add(ringX(R0 * 0.62, R0 * 0.3, 0.008, 24), 'black', [-L / 2 + 0.004, 0, 0]);
    const tri = new THREE.Shape();
    for (let i = 0; i < 3; i++) {
      const a = PI / 2 + (i * 2 * PI) / 3;
      const p = [Math.cos(a) * R0 * 0.82, Math.sin(a) * R0 * 0.82];
      if (i === 0) tri.moveTo(p[0], p[1]); else tri.lineTo(p[0], p[1]);
      const m = a + PI / 3;
      tri.quadraticCurveTo(Math.cos(m) * R0 * 1.05, Math.sin(m) * R0 * 1.05, Math.cos(a + (2 * PI) / 3) * R0 * 0.82, Math.sin(a + (2 * PI) / 3) * R0 * 0.82);
    }
    b.add(extrudeX(tri, 0.004, 6), 'steel', [L / 2 - 0.004, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = PI / 2 + (i * 2 * PI) / 3;
      b.add(cylX(0.005, 0.03, 8), 'chrome', [L / 2 + 0.012, Math.cos(a) * R0 * 0.72, Math.sin(a) * R0 * 0.72]);
    }
    b.add(hexX(0.012, 0.012), 'chrome', [L / 2 + 0.006, 0, 0]);
    b.add(cylX(0.016, 0.006, 16), 'black', [L / 2 + 0.015, 0, 0]);
    return b.build();
  },

  chassis_springSeat(L, D) {
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R0 * 0.3, L / 2], [R0 * 0.95, L / 2], [R0, L / 2 - 0.004], [R0 * 0.92, -L / 2], [R0 * 0.3, -L / 2 + 0.003]], 28), 'black');
    b.add(latheX([[R0 * 0.55, -L / 2], [R0 * 0.92, -L / 2], [R0 * 0.9, -L / 2 - 0.004], [R0 * 0.57, -L / 2 - 0.004]], 28), 'rubber');
    return b.build();
  },

  chassis_perch(L, D) {
    // ZL1 1LE threaded spring seat: collar with spanner notches on a threaded sleeve.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(tubeGeo(R0, R0 * 0.55, L * 0.55, 32), 'satin', [L * 0.2, 0, 0]);
    b.add(tubeGeo(R0 * 0.82, R0 * 0.5, L * 0.45, 28), 'satin', [-L * 0.25, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(box(L * 0.5, 0.008, 0.01, 0), 'black', [L * 0.2, Math.cos(a) * R0 * 0.98, Math.sin(a) * R0 * 0.98], [a, 0, 0]);
    }
    b.add(tubeGeo(R0 * 0.52, R0 * 0.48, L * 2.2, 24), 'machined');
    return b.build();
  },

  chassis_shockMount(L, D) {
    // Rear upper shock mount: rubber isolator, 3-stud stamped plate, rod nut.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R0 * 0.18, -L / 2], [R0 * 0.62, -L / 2], [R0 * 0.7, 0], [R0 * 0.62, L / 2 - 0.004], [R0 * 0.18, L / 2 - 0.004]], 24), 'rubber');
    b.add(cylX(R0 * 0.98, 0.004, 3), 'steel', [L / 2 - 0.002, 0, 0], [PI / 6, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * PI) / 3;
      b.add(cylX(0.005, 0.025, 8), 'chrome', [L / 2 + 0.01, Math.cos(a) * R0 * 0.62, Math.sin(a) * R0 * 0.62]);
    }
    b.add(hexX(0.011, 0.01), 'chrome', [L / 2 + 0.005, 0, 0]);
    return b.build();
  },

  chassis_epsRack(L, D) {
    // +X = world +z (driver side). ZF rack-mounted EPS: aluminium housing, belt/ball-nut housing on the
    // passenger end, pinion tower on the driver end angled up and rearward (rear = -Z here).
    const b = new PartBuilder();
    b.add(latheX([[0.019, -L / 2], [0.026, -L / 2 + 0.012], [0.026, L / 2 - 0.012], [0.019, L / 2]], 24), 'cast');
    b.add(latheX([[0.026, -L / 2 + 0.05], [0.047, -L / 2 + 0.075], [0.047, -L / 2 + 0.17], [0.026, -L / 2 + 0.2]], 28), 'cast');
    b.add(box(0.065, 0.07, 0.07, 0.012), 'cast', [L / 2 - 0.035, 0.008, 0]);
    const pt = V(L / 2 - 0.035, 0.035, -0.015), dir = V(0, 0.8, -0.6);
    rodAB(b, 'cast', pt, pt.clone().addScaledVector(dir, 0.06), 0.025, 18);
    rodAB(b, 'machined', pt.clone().addScaledVector(dir, 0.06), pt.clone().addScaledVector(dir, 0.088), 0.009, 12);
    for (const x of [0.22, -0.25]) {
      b.add(box(0.032, 0.05, 0.03, 0.006), 'cast', [x, 0, -0.035]);
      b.add(tubeGeo(0.012, 0.008, 0.032), 'cast', [x, 0, -0.05], [0, PI / 2, 0]);
    }
    for (const s of [-1, 1]) b.add(cylX(0.02, 0.01, 18), 'machined', [s * (L / 2 + 0.003), 0, 0]);
    return b.build();
  },

  chassis_bolt(L, D) {
    const b = new PartBuilder();
    const r = clamp(D / 2, 0.004, 0.009);
    b.add(cylX(r, L, 10), 'steel');
    b.add(hexX(r * 1.75, r * 1.2), 'chrome', [-L / 2, 0, 0]);
    b.add(hexX(r * 1.75, r * 1.5), 'chrome', [L / 2, 0, 0]);
    return b.build();
  },

  chassis_firewallSeal(L, D) {
    const R0 = D / 2;
    const prof = [[R0 * 0.25, L / 2 + 0.01]];
    for (let i = 0; i <= 4; i++) prof.push([R0 * (0.35 + 0.12 * (i % 2) + i * 0.1), L / 2 - (i / 4) * L]);
    prof.push([R0 * 0.25, -L / 2]);
    const b = new PartBuilder();
    b.add(latheX(prof, 20), 'rubber');
    b.add(ringX(R0, R0 * 0.55, 0.003, 24), 'black', [-L / 2, 0, 0]);
    return b.build();
  },

  chassis_clockspring(L, D) {
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R0 * 0.3, -L / 2], [R0 * 0.95, -L / 2], [R0, -L * 0.3], [R0, L / 2], [R0 * 0.3, L / 2]], 28), 'plastic');
    b.add(ringX(R0 * 0.5, R0 * 0.3, L * 0.3, 20), 'black', [L / 2, 0, 0]);
    b.add(box(L * 0.7, 0.022, 0.03, 0.003), 'plastic', [0, -R0 * 1.05, 0]);
    b.add(box(L * 0.5, 0.012, 0.016, 0.002), 'yellow', [0, -R0 * 1.18, 0]);
    return b.build();
  },

  chassis_hubAdapter(L, D) {
    // +X = toward the driver. Short boss kit: splined body, 6 x 70 mm flange.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.012, -L / 2], [R0 * 0.72, -L / 2], [R0 * 0.75, L / 2 - 0.008], [0.012, L / 2 - 0.008]], 24), 'satin');
    b.add(cylX(R0, 0.008, 28), 'satin', [L / 2 - 0.004, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(hexX(0.004, 0.006), 'chrome', [L / 2 + 0.002, Math.cos(a) * 0.035 * Math.min(1, R0 / 0.04), Math.sin(a) * 0.035 * Math.min(1, R0 / 0.04)]);
    }
    return b.build();
  },

  chassis_quickRelease(L, D) {
    // +X = toward the driver. Two-piece ball-lock quick release: hub half, wheel half, pull collar.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.01, -L / 2], [R0 * 0.8, -L / 2], [R0 * 0.8, -0.002], [0.01, -0.002]], 28), 'satin');
    b.add(latheX([[0.01, 0], [R0 * 0.92, 0], [R0, L * 0.18], [R0, L / 2 - 0.004], [R0 * 0.7, L / 2], [0.01, L / 2]], 28), 'machined');
    b.add(tubeGeo(R0 * 0.98, R0 * 0.82, L * 0.22, 28), 'red', [-L * 0.06, 0, 0]);
    b.add(cylX(0.004, 0.01, 8), 'chrome', [L * 0.2, R0 * 0.9, 0], [0, 0, PI / 2]);
    return b.build();
  },

  chassis_raceWheel(L, D) {
    // +X = toward the driver. 350 mm three-spoke dished race wheel, suede rim, 6 x 70 mm hub, 12 o'clock marker.
    const R0 = D / 2;
    const rt = 0.0145; // rim tube radius
    const dish = Math.max(0.04, L - 2 * rt);
    const xr = L / 2 - rt, xh = xr - dish;
    const b = new PartBuilder();
    b.add(torusX(R0 - rt, rt, 10, 64), 'seat', [xr, 0, 0]);
    b.add(cylX(0.04, 0.008, 28), 'satin', [xh, 0, 0]);
    b.add(cylX(0.022, 0.012, 20), 'black', [xh + 0.008, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(hexX(0.0045, 0.006), 'chrome', [xh + 0.006, Math.cos(a) * 0.035, Math.sin(a) * 0.035]);
    }
    for (const a of [0, PI / 2, PI]) {
      // spokes at 3, 6 and 9 o'clock (a=0 -> +Z, a=PI/2 -> -Y, a=PI -> -Z)
      const rad = V(0, -Math.sin(a), Math.cos(a));
      const tan = V(0, Math.cos(a), Math.sin(a));
      const p0 = V(xh, 0, 0).addScaledVector(rad, 0.03), p1 = V(xr - 0.004, 0, 0).addScaledVector(rad, R0 - rt * 1.6);
      barAB(b, 'satin', p0, p1, a === PI / 2 ? 0.07 : 0.05, 0.004, tan, 0.002);
      const mid = p0.clone().lerp(p1, 0.55);
      const nrm = V().crossVectors(V().subVectors(p1, p0).normalize(), tan).normalize();
      put(b, cylX(0.011, 0.0048, 14), 'black', frame(mid, nrm));
    }
    b.add(box(0.006, 0.03, 0.016, 0.002), 'yellow', [xr + 0.004, R0 - rt, 0]);
    return b.build();
  },

  chassis_cam(L, D) {
    // Eccentric cam bolt head + cam washer with index marks.
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R0, L * 0.45, 24), 'steel', [-L * 0.2, 0, R0 * 0.18]);
    b.add(hexX(R0 * 0.48, L * 0.5), 'chrome', [L * 0.25, 0, 0]);
    for (let i = -2; i <= 2; i++) b.add(box(L * 0.2, 0.002, 0.006, 0), 'yellow', [0.0, Math.cos(i * 0.25) * R0 * 0.95, Math.sin(i * 0.25) * R0 * 0.95 + R0 * 0.18], [i * 0.25, 0, 0]);
    return b.build();
  },

  chassis_rivnut(L, D) {
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R0, L * 0.18, 12), 'steel', [L / 2 - L * 0.09, 0, 0]);
    b.add(hexX(R0 * 0.62, L * 0.8), 'steel', [-L * 0.08, 0, 0]);
    b.add(cylX(R0 * 0.36, L * 0.2, 8), 'black', [L / 2, 0, 0]);
    return b.build();
  },

  chassis_towEye(L, D, D2, ctx) {
    // Tow-eye receptacle: threaded steel sleeve welded to the bumper beam, its open end flush with the fascia
    // opening (red marked ring). Front: sleeve ends on the beam face (backing plate). Rear (no factory point):
    // bolt-on receiver sleeve under the beam with a weld gusset up into it. The strap itself is a safety part.
    const s = ctx?.pos && ctx.pos[0] < 1.4 ? -1 : 1;
    const R0 = D / 2;
    const b = new PartBuilder();
    b.add(tubeGeo(R0, R0 * 0.55, L, 20), 'steel');
    b.add(cylX(R0 * 0.55, L * 0.96, 12), 'black');
    b.add(tubeGeo(R0 + 0.0015, R0 * 0.55, 0.006, 20), 'red', [s * (L / 2 - 0.003), 0, 0]);
    b.add(box(0.006, R0 * 3.4, R0 * 3.4, 0.004), 'steel', [-s * (L / 2 - 0.003), 0, 0]);
    if (s > 0) {
      b.add(box(L * 0.55, 0.035, 0.006, 0.002), 'steel', [-L * 0.2, R0 + 0.0175, 0]);
      b.add(box(L * 0.55, 0.006, R0 * 2.2, 0.002), 'steel', [-L * 0.2, R0 + 0.032, 0]);
    }
    return b.build();
  },

  chassis_tower(L, D) {
    // +X = up. Front strut tower: pressed shell rising from the rail top / wheelhouse to a flat cap with the
    // strut-mount centre hole and 3-stud pattern. The lower skirt is open on the outboard (wheel) side, where
    // the coil-over enters from the wheelhouse; weld flange round the base, stiffening ribs on the skirt.
    const b = new PartBuilder();
    towerShell(b, L, D / 2, { capR: 0.8, shoulder: 0.035, hole: 0.034, open: (60 * PI) / 180, split: 0.09, studR: 0.44, ribs: 6 });
    return b.build();
  },

  chassis_shockTower(L, D) {
    // +X = up. Rear shock tower pocket: pressed shell from the rear-rail top / wheelhouse inner to the upper
    // shock-mount pad, open toward the wheel below the pad.
    const b = new PartBuilder();
    towerShell(b, L, D / 2, { capR: 0.74, shoulder: 0.02, hole: 0.022, open: (62 * PI) / 180, split: 0.05, studR: 0.48, ribs: 0 });
    return b.build();
  },

};

// ======================================================================= BOXES (world aligned)
const boxes = {
  // ---------------------------------------------------------------- front cradle (aluminium)
  chassis_frontCradle(sx, sy, sz, ctx) {
    const p = ctx.pos;
    const W = (x, y, z) => V(x - p[0], y - p[1], z - p[2]);
    const b = new PartBuilder();
    // lateral extrusions: front (rack + lateral-link member) and rear
    // (tops at y 0.2225 / 0.205: clear of the dry-sump pan underside, 0.235-0.315 over x -0.2..0.4)
    extrusionZ(b, 'aluminum', -0.035 - p[0], 0.185 - p[1], 0.09, 0.075, -0.4 - p[2], 0.4 - p[2], 3);
    extrusionZ(b, 'aluminum', 0.31 - p[0], 0.175 - p[1], 0.065, 0.06, -0.36 - p[2], 0.36 - p[2], 2);
    for (let i = -3; i <= 3; i++) b.add(cylY(0.007, 0.002, 10), 'black', W(-0.035, 0.2235, i * 0.1).toArray());
    for (const s of [-1, 1]) {
      // cast side node (longitudinal) and corner nodes
      barAB(b, 'cast', W(-0.1, 0.192, s * 0.37), W(0.36, 0.185, s * 0.37), 0.08, 0.07, Y(), 0.014);
      b.add(box(0.13, 0.095, 0.1, 0.016), 'cast', W(-0.035, 0.19, s * 0.37).toArray());
      b.add(box(0.1, 0.085, 0.09, 0.014), 'cast', W(0.31, 0.18, s * 0.36).toArray());
      // engine mount pedestal with two studs
      b.add(box(0.1, 0.05, 0.075, 0.01), 'cast', W(0.02, 0.255, s * 0.315).toArray());
      for (const dx of [-0.03, 0.03]) b.add(cylY(0.006, 0.02, 8), 'chrome', W(0.02 + dx, 0.285, s * 0.315).toArray());
      // lateral link pivot: top bracket + two ears (bolt along x)
      b.add(box(0.075, 0.012, 0.07, 0.003), 'cast', W(0.045, 0.228, s * 0.33).toArray());
      for (const dx of [-0.03, 0.03]) b.add(box(0.008, 0.07, 0.06, 0.003), 'cast', W(0.045 + dx, 0.2, s * 0.33).toArray());
      boltAt(b, W(0.045, 0.19, s * 0.33), V(1, 0, 0), 0.09, 0.007);
      // forward arm to the tension-rod (radius-rod) hydraulic bushing pocket
      barAB(b, 'cast', W(-0.09, 0.2, s * 0.38), W(-0.335, 0.2, s * 0.38), 0.07, 0.06, Y(), 0.014);
      tubeAt(b, 'cast', W(-0.37, 0.2, s * 0.38), Y(), 0.053, 0.045, 0.075, 28);
      // front body-mount tower: housing top 4-5 mm under the frame-rail underside (y 0.398 at x -0.3),
      // bushing inside the housing, bolt up into the rail
      barAB(b, 'cast', W(-0.3, 0.215, s * 0.39), W(-0.3, 0.215, s * 0.445), 0.045, 0.05, Y(), 0.01);
      barAB(b, 'cast', W(-0.3, 0.2, s * 0.46), W(-0.3, 0.33, s * 0.46), 0.055, 0.055, V(1, 0, 0), 0.012);
      tubeAt(b, 'cast', W(-0.3, 0.358, s * 0.46), Y(), 0.04, 0.032, 0.07, 24);
      barAB(b, 'cast', W(-0.24, 0.225, s * 0.395), W(-0.3, 0.34, s * 0.45), 0.012, 0.03, V(1, 0, 0), 0.004);
      // rear body mount: housing + a cast pad sloped to the rail's 28.6 deg underside, 3.5 mm under it
      barAB(b, 'cast', W(0.31, 0.18, s * 0.36), W(0.38, 0.205, s * 0.445), 0.05, 0.05, Y(), 0.01);
      tubeAt(b, 'cast', W(0.38, 0.215, s * 0.45), Y(), 0.04, 0.032, 0.06, 24);
      barAB(b, 'cast', W(0.3405, 0.2674, s * 0.45), W(0.4205, 0.2237, s * 0.45), 0.06, 0.08, Y(), 0.008);
      // sway-bar bracket pad on the forward arm
      b.add(box(0.07, 0.008, 0.07, 0.002), 'cast', W(-0.3, 0.239, s * 0.37).toArray());
    }
    // EPS rack bosses on the transverse (front) face of the front extrusion
    for (const z of [0.22, -0.25]) cylAt(b, 'cast', W(-0.086, 0.22, z), V(1, 0, 0), 0.017, 0.012, 16);
    return b.build();
  },

  // ---------------------------------------------------------------- rear cradle (steel, e-coat)
  chassis_rearCradle(sx, sy, sz, ctx) {
    const p = ctx.pos;
    const W = (x, y, z) => V(x - p[0], y - p[1], z - p[2]);
    const b = new PartBuilder();
    const fin = 'black';
    const G = GEOM.rear;
    // cross members
    barAB(b, fin, W(2.52, 0.27, -0.45), W(2.52, 0.27, 0.45), 0.07, 0.075, Y(), 0.012);
    barAB(b, fin, W(3.045, 0.29, -0.44), W(3.045, 0.29, 0.44), 0.075, 0.07, Y(), 0.012);
    // differential mount brackets (2 front, 1 rear) with bushing eyes along x
    for (const s of [-1, 1]) {
      b.add(box(0.08, 0.07, 0.05, 0.006), fin, W(2.565, 0.315, s * 0.11).toArray());
      tubeAt(b, fin, W(2.605, 0.335, s * 0.11), V(1, 0, 0), 0.03, 0.022, 0.045, 18);
    }
    b.add(box(0.07, 0.08, 0.09, 0.006), fin, W(3.0, 0.325, 0).toArray());
    tubeAt(b, fin, W(2.975, 0.35, 0), V(1, 0, 0), 0.03, 0.022, 0.04, 18);
    for (const s of [-1, 1]) {
      const S = (q) => W(q[0], q[1], s * q[2]);
      // hydroformed side rail with body-mount housings at both ends
      const rail = [[2.36, 0.33, 0.47], [2.5, 0.29, 0.45], [3.02, 0.3, 0.44], [3.14, 0.34, 0.455]].map((q) => S(q));
      for (let i = 0; i < rail.length - 1; i++) barAB(b, fin, rail[i], rail[i + 1], 0.075, 0.065, Y(), 0.016, 0.05);
      tubeAt(b, fin, S([2.36, 0.36, 0.48]), Y(), 0.05, 0.043, 0.075, 28);
      tubeAt(b, fin, S([3.14, 0.37, 0.46]), Y(), 0.05, 0.043, 0.075, 28);
      // upper camber-link tower (two plates, bolt along x)
      const ui = G.ucaIn;
      for (const dx of [-0.028, 0.028]) {
        const sh = new THREE.Shape();
        const pts = [[0.47, 0.28], [0.36, 0.28], [ui[2] - 0.03, ui[1] + 0.035], [ui[2] + 0.035, ui[1] + 0.035]];
        pts.forEach(([zz, yy], k) => (k ? sh.lineTo(-s * zz, yy) : sh.moveTo(-s * zz, yy)));
        b.add(extrudeX(sh, 0.004, 4), fin, W(ui[0] + dx, 0, 0).toArray());
      }
      boltAt(b, S(ui), V(1, 0, 0), 0.085, 0.0065);
      // upper trailing-link tower (plates normal to z, bolt along z)
      const ti = G.utlIn;
      for (const dz of [-0.03, 0.03]) {
        const sh = new THREE.Shape();
        [[2.43, 0.28], [2.57, 0.28], [ti[0] + 0.035, ti[1] + 0.035], [ti[0] - 0.035, ti[1] + 0.035]].forEach(([xx, yy], k) => (k ? sh.lineTo(xx, yy) : sh.moveTo(xx, yy)));
        b.add(extrudeZ(sh, -0.002, 0.002, 4), fin, W(0, 0, s * (ti[2] + dz)).toArray());
      }
      boltAt(b, S(ti), V(0, 0, 1), 0.09, 0.0065);
      // lower control arm inner clevis (bolt along x; eccentric cam on the front face)
      const li = G.lcaIn;
      for (const x of [li[0] - 0.03, li[0] + 0.03]) b.add(box(0.005, 0.08, 0.065, 0.002), fin, W(x, 0.25, s * li[2]).toArray());
      b.add(box(0.11, 0.008, 0.07, 0.002), fin, W(li[0] + 0.035, 0.29, s * li[2]).toArray());
      boltAt(b, S(li), V(1, 0, 0), 0.08, 0.0075);
      // toe link inner clevis under the rear cross member
      const oi = G.toeIn;
      for (const x of [oi[0] - 0.03, oi[0] + 0.03]) b.add(box(0.005, 0.06, 0.06, 0.002), fin, W(x, 0.245, s * oi[2]).toArray());
      boltAt(b, S(oi), V(1, 0, 0), 0.08, 0.007);
      // lower trailing link front clevis under the rail (bolt along z)
      const lt = G.ltlIn;
      for (const dz of [-0.03, 0.03]) b.add(box(0.07, 0.07, 0.005, 0.002), fin, W(lt[0], 0.27, s * (lt[2] + dz)).toArray());
      boltAt(b, S(lt), V(0, 0, 1), 0.085, 0.007);
      // rear sway-bar pedestal on the rear cross member
      b.add(box(0.05, 0.02, 0.05, 0.003), fin, W(3.085, 0.335, s * 0.33).toArray());
      // shock-sensor / brake-line tab
      b.add(box(0.04, 0.03, 0.004, 0.001), fin, W(2.75, 0.31, s * 0.445).toArray());
    }
    return b.build();
  },

  // ---------------------------------------------------------------- front knuckle (cast aluminium)
  chassis_frontKnuckle(sx, sy, sz, ctx) {
    const p = ctx.pos;
    const W = (q) => V(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const G = GEOM.front;
    const b = new PartBuilder();
    const fin = 'cast';
    const hub = W(G.hub);
    // hub boss (3-bolt bearing flange face at z 0.68) and bolt bosses
    tubeAt(b, fin, hub, V(0, 0, 1), 0.085, 0.048, 0.04, 36);
    for (const a of [PI / 6, (5 * PI) / 6, (3 * PI) / 2]) cylAt(b, fin, hub.clone().add(V(Math.cos(a) * 0.076, Math.sin(a) * 0.076, -0.004)), V(0, 0, 1), 0.012, 0.042, 12);
    // upper blade into the strut clevis (follows the strut axis, offset outboard)
    const bl0 = _fsB.clone().addScaledVector(_fsD, -0.03).addScaledVector(_fsY, 0.025);
    const bl1 = _fsB.clone().addScaledVector(_fsD, 0.112).addScaledVector(_fsY, 0.024);
    barAB(b, fin, W(bl0.toArray()), W(bl1.toArray()), 0.04, 0.054, _fsY, 0.008);
    barAB(b, fin, W([0.0, 0.43, 0.652]), W(bl0.toArray()), 0.05, 0.05, V(0, 0, 1), 0.012);
    // lower arm to the two ball-joint bosses
    const bj1 = W(G.lbjLateral).add(V(0, 0.035, 0)), bj2 = W(G.lbjTension).add(V(0, 0.035, 0));
    barAB(b, fin, W([0.0, 0.3, 0.652]), bj1, 0.04, 0.035, V(0, 0, 1), 0.01);
    barAB(b, fin, W([-0.015, 0.3, 0.65]), bj2, 0.04, 0.035, V(0, 0, 1), 0.01);
    barAB(b, fin, bj1, bj2, 0.025, 0.03, Y(), 0.008);
    tubeAt(b, fin, bj1, Y(), 0.022, 0.009, 0.035, 18);
    tubeAt(b, fin, bj2, Y(), 0.022, 0.009, 0.035, 18);
    // steering arm forward to the tie-rod end boss
    const tr = W(G.tieRodBall).add(V(0, 0.035, 0));
    barAB(b, fin, W([-0.045, 0.31, 0.65]), tr, 0.03, 0.028, Y(), 0.008);
    tubeAt(b, fin, tr, Y(), 0.02, 0.008, 0.03, 16);
    // radial caliper mount ears (bolts along x) and webs
    for (const y of [0.28, 0.465]) {
      const e = W([0.12, y, 0.665]);
      barAB(b, fin, hub.clone().add(V(0.05, (y - 0.3715) * 0.6, -0.004)), e, 0.03, 0.03, V(0, 0, 1), 0.008);
      cylAt(b, fin, e, V(1, 0, 0), 0.016, 0.03, 14);
    }
    // ABS sensor boss and ribs
    cylAt(b, fin, W([-0.065, 0.43, 0.655]), V(0, 0, 1), 0.011, 0.03, 12);
    barAB(b, fin, W([-0.06, 0.34, 0.652]), W([-0.02, 0.47, 0.65]), 0.012, 0.03, V(0, 0, 1), 0.004);
    return b.build();
  },

  // ---------------------------------------------------------------- rear knuckle (cast)
  chassis_rearKnuckle(sx, sy, sz, ctx) {
    const p = ctx.pos;
    const W = (q) => V(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const G = GEOM.rear;
    const b = new PartBuilder();
    const fin = 'cast';
    // hub-face boss (bearing flange seat) stays just inboard of the hub flange at z 0.666; everything else is
    // pulled inboard of the wheel barrel
    const hub = W([G.hub[0], G.hub[1], G.hub[2] - 0.021]);
    tubeAt(b, fin, hub, V(0, 0, 1), 0.085, 0.045, 0.03, 28);
    for (const a of [PI / 4, (3 * PI) / 4, (5 * PI) / 4, (7 * PI) / 4]) cylAt(b, fin, hub.clone().add(V(Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0)), V(0, 0, 1), 0.011, 0.032, 10);
    // upper T: column from hub to cross bar carrying upper camber + upper trailing bushing eyes
    const uca = W(G.uca), utl = W(G.utl);
    barAB(b, fin, hub.clone().add(V(0, 0.07, -0.01)), W([2.81, 0.55, G.uca[2]]), 0.045, 0.04, V(0, 0, 1), 0.012);
    barAB(b, fin, utl, uca, 0.035, 0.04, Y(), 0.01);
    tubeAt(b, fin, uca, V(1, 0, 0), 0.03, 0.024, 0.05, 16);
    tubeAt(b, fin, utl, V(0, 0, 1), 0.03, 0.024, 0.05, 16);
    // lower arms: lower trailing bushing eye (axis z) and LCA clevis (axis x)
    const ltl = W(G.ltl), lca = W(G.lca);
    barAB(b, fin, hub.clone().add(V(-0.04, -0.06, -0.01)), ltl, 0.04, 0.035, V(0, 0, 1), 0.01);
    tubeAt(b, fin, ltl, V(0, 0, 1), 0.03, 0.024, 0.05, 16);
    barAB(b, fin, hub.clone().add(V(0.03, -0.07, -0.01)), lca.clone().add(V(0, 0.02, 0)), 0.04, 0.04, V(0, 0, 1), 0.01);
    for (const dx of [-0.03, 0.03]) b.add(box(0.006, 0.05, 0.05, 0.002), fin, lca.clone().add(V(dx, 0.01, 0)).toArray());
    boltAt(b, lca, V(1, 0, 0), 0.08, 0.007);
    // toe arm (rear) with clevis, shock tab and end-link tab
    const toe = W(G.toe);
    barAB(b, fin, hub.clone().add(V(0.07, -0.03, -0.012)), toe.clone().add(V(-0.025, 0.005, 0)), 0.035, 0.03, V(0, 0, 1), 0.008);
    for (const dx of [-0.028, 0.028]) b.add(box(0.006, 0.045, 0.045, 0.002), fin, toe.clone().add(V(dx, 0, 0)).toArray());
    boltAt(b, toe, V(1, 0, 0), 0.075, 0.0065);
    const sh = W(G.shockLow);
    barAB(b, fin, toe.clone().add(V(-0.03, -0.01, -0.01)), sh.clone().add(V(0, 0, 0.02)), 0.03, 0.025, V(0, 0, 1), 0.006);
    for (const dx of [-0.03, 0.03]) b.add(box(0.006, 0.045, 0.045, 0.002), fin, sh.clone().add(V(dx, 0, 0)).toArray());
    const el = W(G.endLink);
    barAB(b, fin, hub.clone().add(V(0.09, -0.02, -0.01)), el, 0.025, 0.02, V(0, 0, 1), 0.006);
    cylAt(b, fin, el, V(0, 0, 1), 0.012, 0.02, 12);
    // caliper ears
    for (const y of [0.29, 0.455]) {
      const e = W([2.915, y, 0.668]);
      barAB(b, fin, hub.clone().add(V(0.05, (y - 0.3715) * 0.6, 0)), e, 0.028, 0.028, V(0, 0, 1), 0.006);
      cylAt(b, fin, e, V(1, 0, 0), 0.015, 0.03, 12);
    }
    return b.build();
  },

  // ---------------------------------------------------------------- steering
  chassis_epsMotor(sx, sy, sz) {
    // Belt-drive EPS assist motor parallel to the rack, controller (ECU) on top with connectors, belt cover.
    const b = new PartBuilder();
    b.add(latheX([[0.001, -sz * 0.4], [0.04, -sz * 0.4], [0.042, -sz * 0.35], [0.042, sz * 0.45], [0.03, sz * 0.5], [0.001, sz * 0.5]], 28), 'satin', [0, -sy * 0.12, sz * 0.02], [0, -PI / 2, 0]);
    b.add(box(sx * 0.8, sy * 0.28, sz * 0.55, 0.008), 'cast', [0, sy * 0.33, sz * 0.12]);
    for (let i = 0; i < 6; i++) b.add(box(sx * 0.75, 0.006, 0.004, 0), 'cast', [0, sy * 0.48, sz * (-0.1 + i * 0.08)]);
    b.add(box(0.03, 0.025, 0.04, 0.003), 'plastic', [-sx * 0.42, sy * 0.33, sz * 0.25]);
    b.add(box(0.03, 0.025, 0.03, 0.003), 'plastic', [-sx * 0.42, sy * 0.33, sz * 0.05]);
    b.add(box(sx, sy * 0.75, 0.035, 0.01), 'cast', [sx * 0.02, -sy * 0.05, -sz * 0.43]);
    return b.build();
  },

  chassis_barClamp(sx, sy, sz) {
    // Sway-bar insulator (bar runs along z) with a formed U-clamp bolted to the pad below.
    const b = new PartBuilder();
    const r = Math.min(sx, sy) * 0.42;
    b.add(tubeGeo(r, r * 0.55, sz * 0.8, 20), 'rubber', [0, sy * 0.05, 0], [0, PI / 2, 0]);
    b.add(tubeGeo(r * 1.12, r * 0.99, sz * 0.55, 20), 'black', [0, sy * 0.08, 0], [0, PI / 2, 0]);
    for (const s of [-1, 1]) {
      b.add(box(sx * 0.32, 0.005, sz * 0.55, 0.001), 'black', [s * sx * 0.36, -sy * 0.45, 0]);
      b.add(hexX(0.008, 0.008), 'chrome', [s * sx * 0.38, -sy * 0.4, 0], [0, 0, PI / 2]);
    }
    return b.build();
  },

  chassis_camberPlate(sx, sy, sz) {
    // Race caster/camber plate: triangular billet plate, slotted centre with spherical bearing, 3 studs down.
    const b = new PartBuilder();
    const sh = new THREE.Shape();
    const rx = sx / 2, rz = sz / 2;
    sh.moveTo(-rx * 0.9, -rz * 0.85);
    sh.quadraticCurveTo(-rx, 0, -rx * 0.9, rz * 0.85);
    sh.quadraticCurveTo(0, rz * 1.05, rx * 0.95, rz * 0.1);
    sh.quadraticCurveTo(rx, -rz * 0.2, rx * 0.8, -rz * 0.45);
    sh.quadraticCurveTo(0, -rz * 1.05, -rx * 0.9, -rz * 0.85);
    sh.holes.push(roundRect(new THREE.Path(), -0.035, -0.02, 0.035, 0.02, 0.018));
    b.add(plateXZ(sh, sy * 0.6, 10), 'satin', [0, -sy / 2, 0]);
    b.add(box(0.06, sy * 0.4, 0.04, 0.004), 'satin', [0, sy * 0.3, 0]);
    b.add(cylY(0.017, sy * 0.8, 20), 'machined', [0, sy * 0.2, 0]);
    b.add(cylY(0.006, sy * 1.2, 10), 'chrome', [0, sy * 0.3, 0]);
    for (let i = 0; i < 3; i++) {
      const a = PI + (i * 2 * PI) / 3;
      const x = Math.cos(a) * sx * 0.32, z = Math.sin(a) * sz * 0.36;
      b.add(hexX(0.008, 0.008), 'chrome', [x, sy * 0.15, z], [0, 0, PI / 2]);
    }
    for (const dx of [-0.045, 0.045]) b.add(hexX(0.006, 0.006), 'blue', [dx, sy * 0.2, 0.03], [0, 0, PI / 2]);
    return b.build();
  },

  chassis_bumpTRE(sx, sy, sz) {
    // Bump-steer adjustable outer tie-rod end: rod end on a vertical stud with a spacer stack to the arm.
    const b = new PartBuilder();
    const yRe = -sy * 0.28;
    b.add(tubeGeo(0.018, 0.009, 0.016, 20), 'machined', [0, yRe, 0], [0, 0, PI / 2]);
    b.add(sphere(0.011, 12, 10), 'chrome', [0, yRe, 0]);
    b.add(cylZ(0.008, sz * 0.45, 12), 'machined', [0, yRe, -sz * 0.27]);
    b.add(hexX(0.011, 0.01), 'steel', [0, yRe, -sz * 0.38], [0, PI / 2, 0]);
    b.add(cylY(0.0065, sy * 0.95, 10), 'blue', [0, 0, 0]);
    b.add(cylY(0.011, 0.012, 14, 0.006), 'machined', [0, yRe + 0.014, 0]);
    b.add(cylY(0.006, 0.012, 14, 0.011), 'machined', [0, yRe - 0.014, 0]);
    for (let i = 0; i < 3; i++) b.add(cylY(0.012, 0.007, 16), 'blue', [0, yRe + 0.026 + i * 0.008, 0]);
    b.add(hexX(0.011, 0.009), 'chrome', [0, -sy * 0.47, 0], [0, 0, PI / 2]);
    return b.build();
  },

  chassis_heightSensor(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.7, sy * 0.6, sz * 0.8, 0.004), 'plastic', [0, sy * 0.15, 0]);
    b.add(box(sx * 0.3, sy * 0.25, sz * 0.4, 0.002), 'plastic', [-sx * 0.4, sy * 0.25, 0]);
    b.add(box(sx * 0.9, 0.004, 0.008, 0.001), 'satin', [sx * 0.05, -sy * 0.15, sz * 0.42]);
    b.add(cylY(0.0035, sy * 0.35, 8), 'black', [sx * 0.45, -sy * 0.32, sz * 0.42]);
    return b.build();
  },

  chassis_deflector(sx, sy, sz) {
    // ZL1 1LE loose-shipped "power steering deflector": curved black plastic scoop with two push-pin tabs.
    const b = new PartBuilder();
    const sh = new THREE.Shape();
    sh.moveTo(-sx / 2, -sz / 2);
    sh.lineTo(sx / 2, -sz * 0.3);
    sh.lineTo(sx / 2, sz * 0.3);
    sh.lineTo(-sx / 2, sz / 2);
    sh.lineTo(-sx / 2, -sz / 2);
    b.add(plateXZ(sh, 0.003, 4), 'plastic', [0, 0, 0]);
    for (const s of [-1, 1]) b.add(box(sx * 0.7, Math.max(0.015, sy), 0.003, 0.001), 'plastic', [0, -Math.max(0.015, sy) / 2, s * sz * 0.4]);
    for (const s of [-1, 1]) b.add(cylY(0.006, 0.006, 10), 'black', [-sx * 0.38, 0.004, s * sz * 0.3]);
    return b.build();
  },

  chassis_flatBar(sx, sy, sz) {
    // ZL1 front lower cradle brace: long flat aluminium bar across the cradle rear mounts, bolted each end.
    const b = new PartBuilder();
    const w = Math.min(sx, 0.06);
    const sh = roundRect(new THREE.Shape(), -w / 2, -sz / 2 + 0.01, w / 2, sz / 2 - 0.01, w * 0.45);
    for (const s of [-1, 1]) sh.holes.push(new THREE.Path().absarc(0, s * (sz / 2 - 0.04), 0.008, 0, PI * 2, true));
    for (let i = -2; i <= 2; i++) sh.holes.push(roundRect(new THREE.Path(), -w * 0.22, i * 0.16 - 0.05, w * 0.22, i * 0.16 + 0.05, w * 0.2));
    b.add(plateXZ(sh, Math.max(0.005, sy), 6), 'aluminum', [0, -sy / 2, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.012, 0.01), 'chrome', [0, -sy / 2 - 0.004, s * (sz / 2 - 0.04)], [0, 0, PI / 2]);
    return b.build();
  },

  // ---------------------------------------------------------------- body structure
  chassis_tunnel(sx, sy, sz) {
    // Pressed tunnel: inverted U with sloped walls, side flanges to the floor and stiffening beads.
    const b = new PartBuilder();
    const H = sy, Wd = sz, t = 0.004;
    const prof = [[-Wd / 2 - 0.03, -H / 2], [-Wd / 2, -H / 2], [-Wd * 0.36, H / 2 - 0.02], [-Wd * 0.3, H / 2], [Wd * 0.3, H / 2], [Wd * 0.36, H / 2 - 0.02], [Wd / 2, -H / 2], [Wd / 2 + 0.03, -H / 2]];
    const sh = new THREE.Shape();
    prof.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    for (let i = prof.length - 1; i >= 0; i--) sh.lineTo(prof[i][0], prof[i][1] - t);
    b.add(extrudeX(sh, sx, 2), 'chassis');
    for (let i = 0; i < 5; i++) b.add(box(0.02, 0.006, Wd * 0.58, 0.002), 'chassis', [-sx / 2 + sx * (0.12 + i * 0.19), H / 2 + 0.002, 0]);
    return b.build();
  },

  chassis_tunnelBrace(sx, sy, sz) {
    // Bolt-in driveshaft tunnel brace (GM / BMR DTB-type): one long, narrow laser-cut flat bar across the tunnel
    // opening. Flat feet at each end bolt to the floor pan outboard of the tunnel flanges (2 bolts each); the
    // centre span is joggled down to pass under the exhaust and carries a centre bolt + lightening slots.
    // Box: sx = fore-aft width, sy = joggle depth (feet top = +sy/2 = floor underside), sz = overall span.
    const b = new PartBuilder();
    const t = 0.006;
    const footIn = sz / 2 - 0.075; // feet run from |z| = footIn to sz/2
    const midHalf = footIn - 0.045; // joggle length 45 mm
    const yFoot = sy / 2 - t / 2, yMid = -sy / 2 + t / 2;
    const sh = roundRect(new THREE.Shape(), -sx / 2, -midHalf - 0.01, sx / 2, midHalf + 0.01, 0.01);
    sh.holes.push(new THREE.Path().absarc(0, 0, 0.0055, 0, PI * 2, true));
    for (const i of [-2, -1, 1, 2]) {
      const zc = i * midHalf * 0.42;
      sh.holes.push(roundRect(new THREE.Path(), -sx * 0.28, zc - midHalf * 0.14, sx * 0.28, zc + midHalf * 0.14, sx * 0.12));
    }
    b.add(plateXZ(sh, t, 8), 'red', [0, yMid - t / 2, 0]);
    for (const s of [-1, 1]) {
      const f = roundRect(new THREE.Shape(), -sx / 2, -0.04, sx / 2, 0.04, 0.012);
      for (const dx of [-sx * 0.27, sx * 0.27]) f.holes.push(new THREE.Path().absarc(dx, 0, 0.0055, 0, PI * 2, true));
      b.add(plateXZ(f, t, 8), 'red', [0, yFoot - t / 2, s * (footIn + 0.035)]);
      barAB(b, 'red', V(0, yMid, s * (midHalf + 0.004)), V(0, yFoot, s * (footIn + 0.004)), t, sx, V(0, 1, 0), 0.002, 0.004);
      for (const dx of [-sx * 0.27, sx * 0.27]) put(b, hexX(0.0075, 0.007), 'chrome', frame(V(dx, yFoot - t / 2 - 0.0035, s * (footIn + 0.035)), V(0, 1, 0)));
    }
    put(b, hexX(0.0075, 0.007), 'chrome', frame(V(0, yMid - t / 2 - 0.0035, 0), V(0, 1, 0)));
    return b.build();
  },

  chassis_safetyLoop(sx, sy, sz) {
    // Aftermarket driveshaft safety loop (BMR DSL-type): formed 30 x 6 mm steel strap. A U-hoop cradles the
    // shaft from below (open top, legs up to the shaft centre line, ~18 mm radial clearance); two drop legs
    // outboard of the exhaust carry it down to bolted feet on the tunnel-brace centre span.
    // Box: top face = driveshaft centre line, bottom face = brace top, sz = foot spacing, sx = strap width.
    const b = new PartBuilder();
    const t = 0.006, w = sx;
    const R = 0.0445 + 0.018 + t / 2;
    const yc = sy / 2;
    const zl = sz / 2 - 0.02;
    const yArm = yc - R * 0.55;
    const zArm = Math.sqrt(R * R - (yc - yArm) ** 2);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const a = PI + (i / 24) * PI;
      pts.push(V(0, yc + Math.sin(a) * R, Math.cos(a) * R));
    }
    for (let i = 0; i < pts.length - 1; i++) barAB(b, 'red', pts[i], pts[i + 1], t, w, V().subVectors(pts[i].clone().lerp(pts[i + 1], 0.5), V(0, yc, 0)).normalize(), 0.0015, 0.002);
    for (const s of [-1, 1]) {
      barAB(b, 'red', V(0, yArm, s * (zArm + 0.002)), V(0, yArm, s * (zl + t / 2)), t, w, V(0, 1, 0), 0.0015);
      barAB(b, 'red', V(0, yArm + t / 2, s * zl), V(0, -sy / 2 + t, s * zl), t, w, V(0, 0, 1), 0.0015);
      b.add(box(w, t, 0.045, 0.002), 'red', [0, -sy / 2 + t / 2, s * (zl + 0.0195)]);
      put(b, hexX(0.009, 0.008), 'chrome', frame(V(0, -sy / 2 + t + 0.004, s * (zl + 0.025)), V(0, 1, 0)));
    }
    return b.build();
  },

  chassis_heatShield(sx, sy, sz) {
    // Embossed aluminium heat shield following the tunnel roof.
    const b = new PartBuilder();
    const t = 0.0015;
    const prof = [[-sz / 2, -sy / 2], [-sz * 0.4, sy / 2 - 0.01], [-sz * 0.3, sy / 2], [sz * 0.3, sy / 2], [sz * 0.4, sy / 2 - 0.01], [sz / 2, -sy / 2]];
    const sh = new THREE.Shape();
    prof.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    for (let i = prof.length - 1; i >= 0; i--) sh.lineTo(prof[i][0], prof[i][1] - t);
    b.add(extrudeX(sh, sx, 2), 'aluminum');
    for (let i = 0; i < 14; i++) b.add(box(0.012, 0.004, sz * 0.55, 0.0015), 'aluminum', [-sx / 2 + sx * (0.04 + i * 0.07), sy / 2 - 0.003, 0]);
    return b.build();
  },

  chassis_floor(sx, sy, sz) {
    // Floor pan halves either side of the tunnel, stamped beads, two seat cross-members per side.
    const b = new PartBuilder();
    const tun = 0.16;
    for (const s of [-1, 1]) {
      const w = sz / 2 - tun;
      const zc = s * (tun + w / 2);
      b.add(box(sx, 0.0025, w, 0), 'chassis', [0, -sy / 2 + 0.002, zc]);
      for (let i = 0; i < 4; i++) b.add(box(sx * 0.82, 0.004, 0.025, 0.002), 'chassis', [0, -sy / 2 + 0.005, zc + (i - 1.5) * w * 0.22]);
      for (const xf of [-0.08, 0.2]) {
        b.add(box(0.07, sy * 0.85, w * 0.96, 0.004), 'chassis', [xf * sx, sy * 0.05, zc]);
        b.add(box(0.11, 0.003, w * 0.96, 0), 'chassis', [xf * sx, -sy / 2 + 0.006, zc]);
      }
    }
    return b.build();
  },

  chassis_rocker(sx, sy, sz) {
    // Rocker (sill): closed box section (inner + outer sill panels) standing on the floor-pan edge, with the
    // pinch-weld flange along its outboard lower edge carrying the lift-point notches.
    const b = new PartBuilder();
    const fl = 0.012;
    b.add(box(sx, sy - fl, sz, 0.015), 'chassis', [0, fl / 2, 0]);
    b.add(box(sx, fl + 0.004, 0.004, 0), 'chassis', [0, -sy / 2 + fl / 2, sz * 0.083]);
    for (const xf of [-0.42, 0.42]) b.add(box(0.03, fl * 0.5, 0.006, 0), 'yellow', [xf * sx, -sy / 2 + fl * 0.25, sz * 0.083]);
    for (let i = 0; i < 6; i++) b.add(box(0.008, sy * 0.6, 0.003, 0), 'chassis', [-sx * 0.45 + i * sx * 0.18, fl / 2, -sz / 2 - 0.001]);
    return b.build();
  },

  chassis_dash(sx, sy, sz, ctx) {
    // Dash panel (firewall) pieces. Thin along x = vertical dash panel: pressed sheet with the transmission
    // tunnel arch, steering-shaft and bulkhead pass-throughs, beads and a top lip where it meets the cowl /
    // plenum sheet. Thin along y = sloped toe board (box is rotated in the data), split by the tunnel opening.
    const p = ctx?.pos || [0, 0, 0];
    const b = new PartBuilder();
    const TUN = 0.215; // tunnel arch half-width at the dash (clears the tunnel wall + flange at x 0.655)
    if (sx <= sy) {
      // 3 mm pressed skin from the toe-board joint (y 0.43) up to the underside of the cowl / dash shelf
      // (y ~0.578), where a short flange turns forward under the cowl. No box section: the skin carries the
      // tunnel arch, the steering-shaft hole (firewall seal), clutch master-cylinder, brake-line and loom
      // pass-throughs.
      const t = 0.003;
      const hw = sz / 2, hh = sy / 2;
      const yl = (y) => y - p[1];
      const archTop = Math.min(hh - 0.008, yl(0.568));
      const sh = new THREE.Shape();
      // shape x -> world -z after extrudeX
      sh.moveTo(-hw, -hh);
      sh.lineTo(-TUN, -hh);
      sh.lineTo(-0.198, yl(0.52));
      sh.quadraticCurveTo(-0.185, archTop, -0.15, archTop);
      sh.lineTo(0.15, archTop);
      sh.quadraticCurveTo(0.185, archTop, 0.198, yl(0.52));
      sh.lineTo(TUN, -hh);
      sh.lineTo(hw, -hh);
      sh.lineTo(hw, hh);
      sh.lineTo(-hw, hh);
      sh.lineTo(-hw, -hh);
      const hole = (z, y, r) => { if (Math.abs(yl(y)) < hh - r - 0.004) sh.holes.push(new THREE.Path().absarc(-z, yl(y), r, 0, PI * 2, true)); };
      hole(0.371, 0.509, 0.04); // steering shaft (firewall seal)
      hole(0.44, 0.51, 0.02); // clutch master cylinder (pedal box pushrod)
      hole(0.3, 0.55, 0.016); // fuel / fire-system pass-through seal
      hole(-0.36, 0.53, 0.03); // race bulkhead connector / main positive cable
      hole(-0.26, 0.52, 0.018); // fuel / brake line grommet
      for (const z of [-0.403, -0.47]) hole(z, 0.45, 0.008); // front brake hard lines
      b.add(extrudeX(sh, t, 12), 'chassis');
      // stiffening beads either side of the arch, top flange turned forward under the cowl shelf
      for (const s of [-1, 1]) b.add(box(0.006, 0.012, Math.max(0.05, hw - 0.5), 0.002), 'chassis', [-0.004, yl(0.475), s * (0.49 + Math.max(0.05, hw - 0.5) / 2)]);
      b.add(box(0.015, t, sz, 0), 'chassis', [-0.0075, hh - t / 2, 0]);
      // arch flange
      b.add(box(0.02, t, 0.3, 0), 'chassis', [0.01, archTop + t / 2, 0]);
    } else {
      // toe board: two pressed halves either side of the tunnel opening, with a flanged edge and beads
      const t = 0.003;
      const zIn = 0.235, zOut = sz / 2;
      for (const s of [-1, 1]) {
        const w = zOut - zIn, zc = s * (zIn + w / 2);
        b.add(box(sx, t, w, 0), 'chassis', [0, 0, zc]);
        b.add(box(sx, 0.02, 0.003, 0), 'chassis', [0, -0.01, s * zIn]);
        for (let i = 0; i < 3; i++) b.add(box(sx * 0.8, 0.005, 0.02, 0.002), 'chassis', [0, t / 2 + 0.002, zc + (i - 1) * w * 0.28]);
      }
    }
    return b.build();
  },

  chassis_trunkFloor(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, Math.max(0.0025, sy * 0.15), sz, 0), 'chassis', [0, -sy / 2 + 0.002, 0]);
    for (let i = 0; i < 4; i++) b.add(box(sx * 0.85, 0.004, 0.03, 0.002), 'chassis', [0, -sy / 2 + 0.006, (i - 1.5) * sz * 0.22]);
    for (const xf of [-0.3, 0.3]) b.add(box(0.04, 0.004, sz * 0.9, 0.002), 'chassis', [xf * sx, -sy / 2 + 0.006, 0]);
    return b.build();
  },

  chassis_doubler(sx, sy, sz, ctx) {
    // Weld-in doubler / backing plate. variant 'tower' = strut-tower doubler (centre hole + 3 stud holes),
    // 'datum' = body datum hole (painted ring marker), default = plate with a bolt hole.
    const v = ctx?.variant;
    const dims = [sx, sy, sz];
    const thin = dims.indexOf(Math.min(...dims));
    const t = Math.max(0.002, dims[thin]);
    // plate built in XZ (thickness along Y) with extents (ex along X, ez along Z), then rotated so Y -> thin axis
    const [ex, ez, rot] = thin === 1 ? [sx, sz, [0, 0, 0]] : thin === 0 ? [sy, sz, [0, 0, -PI / 2]] : [sx, sy, [PI / 2, 0, 0]];
    const g = new PartBuilder();
    if (v === 'datum') {
      const rr = Math.min(ex, ez) / 2;
      g.add(ringX(rr * 0.95, rr * 0.55, t, 20), 'yellow', [0, 0, 0], [0, 0, PI / 2]);
      g.add(cylY(rr * 0.55, t * 0.6, 20), 'black');
    } else {
      const sh = roundRect(new THREE.Shape(), -ex / 2, -ez / 2, ex / 2, ez / 2, Math.min(ex, ez) * 0.15);
      if (v === 'tower') {
        sh.holes.push(new THREE.Path().absarc(0, 0, 0.035, 0, PI * 2, true));
        for (let i = 0; i < 3; i++) {
          const a = PI / 2 + (i * 2 * PI) / 3;
          sh.holes.push(new THREE.Path().absarc(Math.cos(a) * 0.055, Math.sin(a) * 0.055, 0.0075, 0, PI * 2, true));
        }
      } else sh.holes.push(new THREE.Path().absarc(0, 0, Math.min(ex, ez) * 0.12, 0, PI * 2, true));
      g.add(plateXZ(sh, t, 12), 'orange', [0, -t / 2, 0]);
    }
    const b = new PartBuilder();
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot));
    for (const mesh of g.build().children) b.addMatrix(mesh.geometry, mesh.userData.finish, m);
    return b.build();
  },

  chassis_weld(sx, sy, sz) {
    // MIG stitch welds: 25 mm beads with gaps along the two long edges of the seam zone.
    const b = new PartBuilder();
    const dims = [sx, sy, sz];
    const ax = dims.indexOf(Math.max(...dims));
    const len = dims[ax];
    const n = clamp(Math.floor(len / 0.06), 2, 40);
    const others = [0, 1, 2].filter((i) => i !== ax);
    const bead = sphere(1, 6, 4);
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const p = [0, 0, 0];
        p[ax] = -len / 2 + (i + 0.5) * (len / n);
        p[others[0]] = s * dims[others[0]] * 0.45;
        const sc = [0.004, 0.004, 0.004];
        sc[ax] = 0.0125;
        b.add(bead, 'steel', p, [0, 0, 0], sc);
      }
    }
    return b.build();
  },

  chassis_jackPad(sx, sy, sz) {
    // Pinch-weld lift point: slotted rubber jack pad on the sill flange.
    const b = new PartBuilder();
    b.add(box(sx * 0.9, sy * 0.35, 0.004, 0), 'chassis', [0, sy * 0.3, 0]);
    b.add(cylY(Math.min(sx, sz) * 0.5, sy * 0.55, 20), 'rubber', [0, -sy * 0.2, 0]);
    b.add(box(sx * 0.7, sy * 0.2, 0.006, 0), 'black', [0, sy * 0.02, 0]);
    return b.build();
  },
};

// ======================================================================= PATHS (world space)
const paths = {
  chassis_link(pts, r, ctx) {
    const v = ctx?.variant || 'stamped';
    const b = new PartBuilder();
    const n = pts.length;
    const a = pts[0], z = pts[n - 1];
    const dir = V().subVectors(z, a).normalize();
    const hz = horizPerp(dir);
    if (v === 'fLateral') {
      // Forged aluminium lateral link: ball joint (stud up) at the knuckle, bushed eye (bolt along x) at the cradle.
      ballJointAt(b, a, Y(), 0.019);
      tubeAt(b, 'cast', a.clone().add(V(0, 0.004, 0)), Y(), 0.034, 0.022, 0.03, 20);
      tubeAt(b, 'cast', z, V(1, 0, 0), 0.037, 0.029, 0.058, 22);
      const s = a.clone().addScaledVector(dir, 0.03), e = z.clone().addScaledVector(dir, -0.034);
      barAB(b, 'cast', s, e, 0.034, 0.009, Y(), 0.003);
      for (const dy of [-0.016, 0.016]) barAB(b, 'cast', s.clone().add(V(0, dy, 0)), e.clone().add(V(0, dy, 0)), 0.006, 0.032, Y(), 0.002);
      return b.build();
    }
    if (v === 'fTension') {
      // Curved forged aluminium tension rod: ball joint at the knuckle, large hydraulic-bushing eye at the front.
      const sm = curveSamples(pts, 10, 0.06, 0.9);
      for (let i = 0; i < sm.length - 1; i++) barAB(b, 'cast', sm[i], sm[i + 1], 0.036, 0.026, Y(), 0.009, 0.012);
      ballJointAt(b, a, Y(), 0.02);
      tubeAt(b, 'cast', a.clone().add(V(0, 0.004, 0)), Y(), 0.035, 0.023, 0.03, 20);
      tubeAt(b, 'cast', z, Y(), 0.053, 0.044, 0.07, 28);
      barAB(b, 'cast', sm[sm.length - 1], z.clone().addScaledVector(V().subVectors(sm[sm.length - 1], z).normalize(), 0.045), 0.036, 0.03, Y(), 0.008);
      return b.build();
    }
    if (v === 'rLCA') {
      // Rear lower control arm (spring link): wide stamped tray with the spring pocket, bushed eyes along x.
      const inner = a, outer = z;
      const pocket = n > 2 ? pts[1] : a.clone().lerp(z, 0.55);
      const L = inner.distanceTo(outer);
      const F = frame(inner, V().subVectors(outer, inner), Y());
      const pl = V().subVectors(pocket, inner).applyMatrix4(new THREE.Matrix4().copy(F).invert().setPosition(0, 0, 0));
      const xp = pl.x;
      const outline = [[0.03, 0.028], [xp - 0.09, 0.05], [xp, 0.085], [xp + 0.08, 0.06], [L - 0.03, 0.026]];
      const sh = new THREE.Shape();
      sh.moveTo(0.03, -0.028);
      for (const [x, w] of outline) sh.lineTo(x, w);
      for (let i = outline.length - 1; i >= 0; i--) sh.lineTo(outline[i][0], -outline[i][1]);
      sh.holes.push(new THREE.Path().absarc(xp, 0, 0.045, 0, PI * 2, true));
      sh.holes.push(new THREE.Path().absellipse((xp + L) / 2 + 0.03, 0, 0.03, 0.012, 0, PI * 2, true));
      put(b, plateXZ(sh, 0.004, 10), 'black', F, [0, -0.012, 0]);
      for (const sgn of [-1, 1]) {
        const sk = [];
        for (const [x, w] of outline) sk.push(V(x, -0.022, sgn * w));
        for (let i = 0; i < sk.length - 1; i++) put(b, box(sk[i].distanceTo(sk[i + 1]) + 0.01, 0.022, 0.003, 0), 'black', F.clone().multiply(frame(sk[i].clone().lerp(sk[i + 1], 0.5), V().subVectors(sk[i + 1], sk[i]), Y())));
      }
      put(b, latheX([[0.075, 0.004], [0.072, -0.004], [0.06, -0.02], [0.045, -0.024], [0.045, -0.02], [0.058, -0.016], [0.068, -0.002], [0.071, 0.004]], 28), 'black', F, [xp, -0.008, 0], [0, 0, PI / 2]);
      bushAt(b, inner, V(1, 0, 0), 0.03, 0.06, 'black');
      bushAt(b, outer, V(1, 0, 0), 0.026, 0.05, 'black');
      return b.build();
    }
    if (v === 'stamped') {
      // Stamped steel channel link with lightening holes: clevis at the knuckle bushing, bushed eye at the cradle.
      const L = a.distanceTo(z);
      const x0 = 0.05, x1 = L - 0.03;
      const Lb = x1 - x0;
      const F = frame(a, dir, Y());
      const w = 0.046;
      const sh = roundRect(new THREE.Shape(), 0, -w / 2, Lb, w / 2, 0.012);
      const nh = Math.max(1, Math.floor((Lb - 0.04) / 0.075));
      for (let i = 0; i < nh; i++) {
        const cx = 0.04 + (i + 0.5) * ((Lb - 0.08) / nh);
        sh.holes.push(new THREE.Path().absellipse(cx, 0, Math.min(0.028, (Lb - 0.08) / nh / 2 - 0.008), 0.011, 0, PI * 2, true));
      }
      put(b, plateXZ(sh, 0.003, 8), 'black', F, [x0, 0.008, 0]);
      for (const s of [-1, 1]) put(b, box(Lb, 0.024, 0.003, 0), 'black', F, [x0 + Lb / 2, -0.003, s * (w / 2 - 0.0015)]);
      clevisAt(b, 'black', a, dir, hz, 0.064);
      put(b, box(0.03, 0.03, 0.064, 0.004), 'black', F, [0.05, 0, 0]);
      bushAt(b, z, hz, 0.025, 0.052, 'black');
      return b.build();
    }
    if (v === 'toe') {
      // GM rear toe ("adjust") link: tube with threaded adjuster sleeve + jam nuts, bushed eyes both ends.
      bushAt(b, a, hz, 0.022, 0.044, 'black');
      bushAt(b, z, hz, 0.024, 0.05, 'black');
      const s = a.clone().addScaledVector(dir, 0.024), e = z.clone().addScaledVector(dir, -0.026);
      const m = s.clone().lerp(e, 0.45);
      rodAB(b, 'black', s, e, 0.0105, 12);
      put(b, hexX(0.015, 0.07), 'steel', frame(m, dir));
      for (const k of [-0.042, 0.042]) put(b, hexX(0.014, 0.01), 'chrome', frame(m.clone().addScaledVector(dir, k), dir));
      return b.build();
    }
    if (v === 'endlink') {
      // Stabilizer end link: steel rod, ball-stud sockets with boots at both ends, studs sideways.
      rodAB(b, 'black', a.clone().addScaledVector(dir, 0.012), z.clone().addScaledVector(dir, -0.012), 0.0072, 10);
      for (const p of [a, z]) {
        b.addMatrix(sphere(0.016, 12, 10), 'black', new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
        const sd = hz.clone().multiplyScalar(p === a ? 1 : -1);
        put(b, latheX([[0.013, 0.006], [0.011, 0.016], [0.007, 0.02]], 12), 'rubber', frame(p, sd));
        put(b, cylX(0.0065, 0.03, 10), 'machined', frame(p, sd), [0.03, 0, 0]);
        put(b, hexX(0.011, 0.008), 'chrome', frame(p, sd), [0.04, 0, 0]);
      }
      return b.build();
    }
    if (v === 'innerTie') {
      // Inner tie rod: axial ball socket at the rack end, plain rod, threaded end into the outer tie-rod end.
      put(b, latheX([[0.0001, -0.022], [0.02, -0.02], [0.024, -0.004], [0.021, 0.014], [0.013, 0.03], [0.009, 0.04]], 18), 'steel', frame(a, dir));
      put(b, hexX(0.019, 0.012), 'steel', frame(a.clone().addScaledVector(dir, 0.012), dir));
      rodAB(b, 'machined', a.clone().addScaledVector(dir, 0.035), z.clone().addScaledVector(dir, -0.045), 0.0085, 12);
      rodAB(b, 'steel', z.clone().addScaledVector(dir, -0.045), z, 0.0088, 12);
      return b.build();
    }
    if (v === 'outerTie') {
      // Forged outer tie-rod end: threaded socket boss, cranked neck, ball housing with the stud pointing up.
      rodAB(b, 'steel', a, a.clone().addScaledVector(dir, 0.035), 0.0145, 14);
      const h = z.clone().add(V(0, -0.002, 0));
      barAB(b, 'steel', a.clone().addScaledVector(dir, 0.03), h.clone().addScaledVector(dir, -0.012), 0.02, 0.024, Y(), 0.006);
      put(b, latheX([[0.0001, -0.02], [0.019, -0.018], [0.022, -0.004], [0.022, 0.008], [0.016, 0.012]], 18), 'steel', frame(h, Y()));
      put(b, latheX([[0.016, 0.01], [0.017, 0.02], [0.01, 0.028], [0.008, 0.03]], 14), 'rubber', frame(h, Y()));
      put(b, cylX(0.0095, 0.034, 12, 0.007), 'machined', frame(h, Y()), [0.045, 0, 0]);
      put(b, hexX(0.011, 0.01), 'chrome', frame(h, Y()), [0.068, 0, 0]);
      return b.build();
    }
    // fallback: plain rod with eyes
    rodAB(b, 'black', a, z, clamp(r, 0.008, 0.02), 12);
    bushAt(b, a, hz, 0.022, 0.045);
    bushAt(b, z, hz, 0.022, 0.045);
    return b.build();
  },

  chassis_swaybar(pts, r, ctx) {
    // Stabilizer bar: smooth bends through the given centreline; flattened, drilled end paddles at the end-link
    // pick-ups (variant 'adj3' = ZL1 1LE three-hole adjustable arms).
    const b = new PartBuilder();
    const rr = clamp(r, 0.009, 0.022);
    const curve = new THREE.CatmullRomCurve3(pts.map(vv), false, 'centripetal', 0.5);
    b.add(tubeAlong(curve, rr, Math.min(140, pts.length * 20), 12), 'black');
    const n = pts.length;
    const adj = ctx?.variant === 'adj3';
    for (const [p, q] of [[pts[0], pts[1]], [pts[n - 1], pts[n - 2]]]) {
      const d = V().subVectors(p, q).normalize();
      const F = frame(p, d, Y());
      const len = adj ? 0.085 : 0.045;
      put(b, box(len, 0.036, rr * 0.95, 0.008), 'black', F, [-len / 2 + 0.014, 0, 0]);
      const holes = adj ? [0, -0.025, -0.05] : [0];
      for (const hx of holes) put(b, tubeGeo(0.0095, 0.0058, rr * 1.0, 16), 'steel', F, [hx, 0, 0], [0, PI / 2, 0]);
    }
    return b.build();
  },

  chassis_strut(pts, r, ctx) {
    // MacPherson strut (ZL1 1LE Multimatic DSSV: aluminium monotube body): clevis bracket clamping the knuckle
    // (2 bolts fore-aft), end-link tab facing forward, brake-hose tab, chrome rod to the top mount.
    const B = pts[0], Tp = pts[pts.length - 1];
    const d = V().subVectors(Tp, B);
    const L = d.length();
    d.normalize();
    const F = frame(B, d, V(0, 0, 1));
    const b = new PartBuilder();
    const Lb = Math.min(0.24, L * 0.56);
    put(b, latheX([[0.0001, 0], [0.021, 0], [0.026, 0.006], [0.026, Lb - 0.01], [0.021, Lb], [0.013, Lb + 0.005], [0.0001, Lb + 0.005]], 28), 'aluminum', F);
    put(b, cylX(0.011, L - Lb - 0.01, 16), 'chrome', F, [Lb + (L - Lb - 0.01) / 2, 0, 0]);
    put(b, cylX(0.007, 0.03, 10), 'steel', F, [L + 0.005, 0, 0]);
    put(b, cylX(0.03, 0.09, 22), 'satin', F, [0.05, 0, 0]);
    for (const s of [-1, 1]) put(b, box(0.115, 0.06, 0.006, 0.004), 'satin', F, [0.055, 0.026, s * 0.032]);
    for (const x of [0.025, 0.085]) {
      put(b, cylZ(0.0075, 0.09, 10), 'steel', F, [x, 0.033, 0]);
      for (const s of [-1, 1]) put(b, hexX(0.013, 0.009), 'chrome', F, [x, 0.033, s * 0.042], [0, PI / 2, 0]);
    }
    const Xl = clamp((0.53 - B.y) / Math.max(0.3, d.y), 0.03, Lb - 0.03);
    put(b, box(0.035, 0.016, 0.05, 0.004), 'satin', F, [Xl, 0, -0.026]);
    put(b, tubeGeo(0.012, 0.0065, 0.018, 16), 'satin', F, [Xl, 0, -0.045], [0, 0, PI / 2]);
    put(b, box(0.025, 0.004, 0.03, 0.001), 'satin', F, [Lb * 0.78, -0.03, 0]);
    return b.build();
  },

  chassis_shock(pts, r, ctx) {
    // Rear monotube shock (1LE: aluminium-body DSSV): bushed lower eye, body, chrome rod, threaded top stud.
    const A = pts[0], Tp = pts[pts.length - 1];
    const d = V().subVectors(Tp, A);
    const L = d.length();
    d.normalize();
    const F = frame(A, d, V(0, 0, 1));
    const b = new PartBuilder();
    put(b, tubeGeo(0.022, 0.013, 0.045, 20), 'aluminum', F, [0, 0, 0], [0, PI / 2, 0]);
    put(b, tubeGeo(0.013, 0.0065, 0.05, 12), 'rubber', F, [0, 0, 0], [0, PI / 2, 0]);
    put(b, tubeGeo(0.0065, 0.004, 0.056, 8), 'chrome', F, [0, 0, 0], [0, PI / 2, 0]);
    const Lb = Math.min(0.3, L * 0.6);
    put(b, latheX([[0.012, 0.016], [0.025, 0.028], [0.025, Lb], [0.016, Lb + 0.008], [0.0001, Lb + 0.008]], 26), 'aluminum', F);
    put(b, tubeGeo(0.027, 0.024, 0.012, 24), 'satin', F, [Lb * 0.35, 0, 0]);
    put(b, cylX(0.0095, L - Lb - 0.008, 14), 'chrome', F, [Lb + (L - Lb) / 2, 0, 0]);
    put(b, cylX(0.006, 0.03, 10), 'steel', F, [L + 0.01, 0, 0]);
    return b.build();
  },

  chassis_column(pts, r) {
    // Tilt/telescope column: lower shaft stub, steel jacket, cast upper housing with lock, mounting bracket.
    const a = pts[0], z = pts[pts.length - 1];
    const d = V().subVectors(z, a);
    const L = d.length();
    d.normalize();
    const F = frame(a, d, Y());
    const b = new PartBuilder();
    // The path ends at the splined shaft tip inside the hub-adapter bore; the jacket and upper housing stop
    // 38 mm short of it, where the clockspring sits, and the upper shaft runs on through the clockspring.
    const Lh = Math.max(0.1, L - 0.038);
    put(b, cylX(0.011, 0.05, 12), 'steel', F, [0.025, 0, 0]);
    put(b, cylX(0.028, Lh * 0.6, 20), 'satin', F, [0.05 + Lh * 0.3, 0, 0]);
    put(b, box(Lh * 0.3, 0.085, 0.08, 0.018), 'black', F, [Lh * 0.8, 0.005, 0]);
    put(b, box(0.05, 0.035, 0.03, 0.006), 'black', F, [Lh * 0.72, -0.05, 0.03]);
    put(b, box(0.15, 0.01, 0.09, 0.003), 'satin', F, [Lh * 0.62, 0.05, 0]);
    for (const s of [-1, 1]) put(b, cylY(0.011, 0.012, 12), 'plastic', F, [Lh * 0.62, 0.058, s * 0.034]);
    put(b, cylX(0.0115, L - Lh + 0.04, 14), 'machined', F, [(Lh - 0.04 + L) / 2, 0, 0]);
    return b.build();
  },

  chassis_ishaft(pts, r) {
    // Intermediate shaft: needle-bearing U-joints at both ends (yokes + cross), telescoping slip section.
    const a = pts[0], z = pts[pts.length - 1];
    const d = V().subVectors(z, a);
    const L = d.length();
    d.normalize();
    const F = frame(a, d, Y());
    const b = new PartBuilder();
    const rr = clamp(r, 0.008, 0.013);
    for (const [x0, s] of [[0, 1], [L, -1]]) {
      put(b, sphere(0.012, 10, 8), 'steel', F, [x0, 0, 0]);
      put(b, cylY(0.006, 0.032, 8), 'steel', F, [x0, 0, 0]);
      put(b, cylZ(0.006, 0.032, 8), 'steel', F, [x0, 0, 0]);
      for (const k of [-1, 1]) {
        put(b, box(0.026, 0.008, 0.016, 0.002), 'steel', F, [x0 + s * 0.006, k * 0.016, 0]);
        put(b, box(0.026, 0.016, 0.008, 0.002), 'steel', F, [x0 - s * 0.006, 0, k * 0.016]);
      }
      put(b, cylX(0.017, 0.022, 16), 'steel', F, [x0 + s * 0.03, 0, 0]);
    }
    put(b, cylX(rr, L - 0.08, 12), 'machined', F, [L / 2, 0, 0]);
    put(b, cylX(rr * 1.45, (L - 0.08) * 0.45, 14), 'steel', F, [L * 0.62, 0, 0]);
    return b.build();
  },

  chassis_beam(pts, r, ctx) {
    // Closed box-section body member (rails, pillars) along the polyline, with spot-weld flanges.
    const b = new PartBuilder();
    const h = clamp(2 * r, 0.03, 0.16);
    const w = h * 0.7;
    const P = pts.map(vv);
    for (let i = 0; i < P.length - 1; i++) {
      barAB(b, 'chassis', P[i], P[i + 1], h, w, Y(), Math.min(0.012, w * 0.2), w * 0.9);
      if (ctx?.variant === 'rail') {
        const off = V(0, h / 2 + 0.006, 0);
        barAB(b, 'chassis', P[i].clone().add(off), P[i + 1].clone().add(off), 0.012, w + 0.03, Y(), 0.002, 0.01);
      }
    }
    return b.build();
  },

  chassis_weldPath(pts) {
    // MIG stitch welds along a seam polyline: 25 mm beads at ~60 mm pitch, laid on the joint.
    const b = new PartBuilder();
    const P = pts.map(vv);
    const bead = sphere(1, 6, 4);
    let carry = 0.03;
    for (let i = 0; i < P.length - 1; i++) {
      const d = V().subVectors(P[i + 1], P[i]);
      const L = d.length();
      if (L < 1e-5) continue;
      const F = frame(P[i], d);
      let u = carry;
      for (; u < L; u += 0.06) b.addMatrix(bead, 'steel', F.clone().multiply(T(u, 0, 0)).multiply(new THREE.Matrix4().makeScale(0.0125, 0.004, 0.004)));
      carry = u - L;
    }
    return b.build();
  },

  chassis_brace(pts, r, ctx) {
    // Bolt-in brace: tube with flattened, drilled end tabs (tower braces: 3-stud plates on the tower tops).
    const v = ctx?.variant || 'front';
    const fin = v === 'rear' ? 'cage' : 'red';
    const b = new PartBuilder();
    const rr = clamp(r, 0.012, 0.022);
    const P = pts.map(vv);
    const n = P.length;
    const tower = v === 'front' || v === 'rear';
    const ends = [[P[0], P[1]], [P[n - 1], P[n - 2]]];
    // front: low-profile bar for the ZL1 bay (supercharger lid ~0.92, hood underside ~0.93) — the tube starts
    // inboard of the towers (P[1] .. P[n-2]); flattened straps run from the tube ends down onto the end plates.
    const flat = v === 'front' && n >= 4;
    const inner = flat ? P.slice(1, n - 1) : P.slice();
    if (!flat) {
      inner[0] = P[0].clone().add(V(0, tower ? 0.02 : 0, 0));
      inner[n - 1] = P[n - 1].clone().add(V(0, tower ? 0.02 : 0, 0));
    }
    const c = curveFrom(inner);
    b.add(tubeAlong(c, rr, Math.min(160, Math.round(c.getLength() / 0.02)), 14), fin);
    if (flat) {
      for (const [p, q] of ends) {
        const tip = q.clone().addScaledVector(V().subVectors(q, p).normalize(), 0.01);
        barAB(b, fin, p.clone().add(V(0, 0.004, 0)), tip, 0.008, rr * 2.4, Y(), 0.003, 0.02);
        put(b, cylY(rr * 1.05, 0.02, 14), fin, frame(q, V().subVectors(q, p), Y()), [0, 0, 0], [0, 0, PI / 2]);
      }
    }
    for (const [p, q] of ends) {
      const d = V().subVectors(q, p);
      d.y = 0;
      if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
      const F = frame(p, d, Y());
      if (tower) {
        put(b, cylY(0.07, 0.008, 3), fin, F, [0.0, 0.0, 0], [0, PI / 6, 0]);
        if (!flat) put(b, box(0.05, 0.03, 0.03, 0.006), fin, F, [0.02, 0.012, 0]);
        for (let i = 0; i < 3; i++) {
          const a = (i * 2 * PI) / 3;
          put(b, hexX(0.008, 0.008), 'chrome', F, [Math.cos(a) * 0.05, 0.008, Math.sin(a) * 0.05], [0, 0, PI / 2]);
        }
      } else {
        put(b, box(0.05, 0.007, 0.04, 0.003), fin, F, [0.012, 0, 0]);
        put(b, hexX(0.012, 0.01), 'chrome', F, [0, -0.008, 0], [0, 0, PI / 2]);
      }
    }
    return b.build();
  },
};

// ======================================================================= WHOLE
const whole = {
  chassis_tunnelLoft(min, max, ctx) {
    // Pressed transmission / driveshaft tunnel: inverted U with sloped walls and side flanges, lofted through
    // the data sections (each box = x range, roof height = top face, base half-width = sz/2). The base follows
    // the measured floor-pan line beside the tunnel; roof and width blend over 0.14 m between sections.
    // Front hump over the bellhousing / gearbox, lower rear section over the driveshaft.
    const c = ctx.center;
    const secs = (ctx.comp.model || []).filter((m) => !m.path && m.pos && m.size)
      .map((m) => ({ x0: m.pos[0] - m.size[0] / 2, x1: m.pos[0] + m.size[0] / 2, roof: m.pos[1] + m.size[1] / 2, hw: m.size[2] / 2 }))
      .sort((a, b2) => a.x0 - b2.x0);
    const FLOOR = [[0.6, 0.1876], [0.8, 0.1906], [1.0, 0.1935], [1.25, 0.1973], [1.5, 0.2017], [1.8, 0.2068], [2.1, 0.2181], [2.3, 0.2198], [2.5, 0.221], [2.6, 0.2239], [2.7, 0.2268]];
    const floorAt = (x) => {
      if (x <= FLOOR[0][0]) return FLOOR[0][1];
      for (let i = 0; i < FLOOR.length - 1; i++) if (x <= FLOOR[i + 1][0]) {
        const [xa, ya] = FLOOR[i], [xb, yb] = FLOOR[i + 1];
        return ya + ((yb - ya) * (x - xa)) / (xb - xa);
      }
      return FLOOR[FLOOR.length - 1][1];
    };
    const blend = 0.07;
    const at = (x) => {
      let k = secs.findIndex((q) => x <= q.x1 + 1e-6);
      if (k < 0) k = secs.length - 1;
      const q = secs[k];
      const nb = x > q.x1 - blend && secs[k + 1] ? secs[k + 1] : x < q.x0 + blend && secs[k - 1] ? secs[k - 1] : null;
      if (!nb) return { roof: q.roof, hw: q.hw };
      const j = nb === secs[k + 1] ? q.x1 : q.x0;
      const f = 0.5 - (Math.abs(x - j) / blend) * 0.5; // 0.5 at the joint -> 0 at blend distance
      return { roof: q.roof + (nb.roof - q.roof) * f, hw: q.hw + (nb.hw - q.hw) * f };
    };
    const prof = (x) => {
      const { roof, hw } = at(x);
      const base = floorAt(x) - 0.002;
      const half = [[hw + 0.03, base], [hw, base], [hw * 0.97, base + 0.02], [hw * 0.78, roof - 0.04], [hw * 0.7, roof - 0.012], [hw * 0.6, roof]];
      return [...half.map(([z, y]) => [z, y]), ...half.slice().reverse().map(([z, y]) => [-z, y])];
    };
    const xs = [];
    const x0 = secs[0].x0, x1 = secs[secs.length - 1].x1;
    for (let x = x0; x < x1 - 1e-6; x += 0.04) xs.push(x);
    xs.push(x1);
    const pos = [];
    const W = (x, y, z) => [x - c.x, y - c.y, z - c.z];
    for (let i = 0; i < xs.length - 1; i++) {
      const A = prof(xs[i]), B = prof(xs[i + 1]);
      for (let k = 0; k < A.length - 1; k++) {
        const a0 = W(xs[i], A[k][1], A[k][0]), a1 = W(xs[i], A[k + 1][1], A[k + 1][0]);
        const b0 = W(xs[i + 1], B[k][1], B[k][0]), b1 = W(xs[i + 1], B[k + 1][1], B[k + 1][0]);
        pos.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const b = new PartBuilder();
    b.add(g, 'chassis');
    // transverse stiffening beads on the roof
    for (let x = x0 + 0.12; x < x1 - 0.08; x += 0.26) {
      const { roof, hw } = at(x);
      b.add(box(0.02, 0.005, hw * 1.15, 0.002), 'chassis', W(x, roof + 0.0025, 0));
    }
    // front lip flange where the tunnel meets the dash panel
    const f0 = at(x0);
    b.add(box(0.004, 0.02, f0.hw * 1.25, 0), 'chassis', W(x0 + 0.002, f0.roof - 0.01, 0));
    return b.build();
  },

  chassis_biw(min, max, ctx) {
    // Bare Gen 6 coupe shell skeleton: the structure NOT modeled by the other unibody components — front
    // bumper beam + crush cans, upper apron (shotgun) rails, front and rear wheelhouse arches, cowl top,
    // windshield header + roof bows + rear header, package shelf, rear seat riser, rear panel and bumper beam.
    // (The race car's cooler-stack frame, engine-support lane, stands in for the radiator support.)
    const c = ctx.center;
    const W = (x, y, z) => V(x - c.x, y - c.y, z - c.z);
    const b = new PartBuilder();
    const f = 'chassis';
    const span = (x, y, z, sy, sz, fin = f) => barAB(b, fin, W(x, y, -z), W(x, y, z), sy, sz, V(1, 0, 0), 0.008);
    // (front / rear bumper beams and crush cans are their own parts: chassis.mounting-points.*-bumper-beam)
    for (const s of [-1, 1]) {
      // upper apron (shotgun) rail from behind the headlamp to the A-pillar base
      const ap = [[-0.6, 0.7, 0.63], [-0.3, 0.75, 0.66], [0.1, 0.8, 0.67], [0.62, 0.87, 0.71]];
      for (let i = 0; i < ap.length - 1; i++) barAB(b, f, W(ap[i][0], ap[i][1], s * ap[i][2]), W(ap[i + 1][0], ap[i + 1][1], s * ap[i + 1][2]), 0.06, 0.05, Y(), 0.008, 0.04);
      // wheelhouse arches (front, rear): open cylindrical sheets around the tyres
      for (const [xc, z0, z1, R0] of [[0, 0.62, 0.86, 0.43], [2.811, 0.6, 0.88, 0.43]]) {
        const g = new THREE.CylinderGeometry(R0, R0, z1 - z0, 28, 1, true, -PI * 0.42, PI * 0.84);
        g.rotateX(-PI / 2);
        const zc = s * (z0 + z1) / 2;
        b.add(g, f, W(xc, 0.3715, zc).toArray(), [0, 0, 0]);
      }
      // rear wheelhouse inner wall
      const wh = new THREE.Shape();
      wh.moveTo(2.811 - 0.43, 0.37);
      wh.absarc(2.811, 0.3715, 0.43, PI, 0, true);
      wh.lineTo(2.811 + 0.43, 0.37);
      wh.lineTo(2.811 + 0.43, 0.9);
      wh.lineTo(2.811 - 0.43, 0.9);
      wh.lineTo(2.811 - 0.43, 0.37);
      b.add(extrudeZ(wh, -0.0015, 0.0015, 16), f, [-c.x, -c.y, s * 0.6 - c.z]);
      // quarter inner / C-pillar foot to rear rail
      barAB(b, f, W(2.4, 0.86, s * 0.68), W(2.3, 0.45, s * 0.66), 0.05, 0.05, V(1, 0, 0), 0.006);
    }
    // cowl top, windshield header, roof bows, rear header
    span(0.68, 0.88, 0.7, 0.08, 0.1);
    // Headers and bows follow the probed roof skin (crown + double-bubble), tops 8-10 mm under it.
    // [x, depth, height, [[z, centre y], ...] from the centre line out]
    const arches = [
      [1.27, 0.06, 0.04, [[0, 1.296], [0.3, 1.286], [0.45, 1.271], [0.55, 1.253], [0.58, 1.246]]], // windshield header
      [1.75, 0.025, 0.05, [[0, 1.322], [0.3, 1.328], [0.45, 1.324], [0.58, 1.3]]], // roof bow
      [2.2, 0.025, 0.05, [[0, 1.312], [0.3, 1.316], [0.45, 1.306], [0.58, 1.28]]], // roof bow
      [2.55, 0.05, 0.05, [[0, 1.275], [0.3, 1.269], [0.45, 1.258], [0.55, 1.246], [0.58, 1.232]]], // rear header
    ];
    for (const [x, dep, ht, half] of arches) {
      const pts = [...half.slice(1).reverse().map(([z, y]) => [x, y, -z]), ...half.map(([z, y]) => [x, y, z])];
      for (let i = 0; i < pts.length - 1; i++) barAB(b, f, W(...pts[i]), W(...pts[i + 1]), dep, ht, V(1, 0, 0), 0.004, 0.01);
    }
    // package shelf, rear seat riser
    b.add(box(0.4, 0.006, 1.2, 0), f, W(2.78, 0.95, 0).toArray());
    // rear seat riser: two panels beside the tunnel + a bridge over the tunnel roof
    for (const s of [-1, 1]) b.add(box(0.006, 0.3, 0.34, 0), f, W(2.45, 0.38, s * 0.43).toArray());
    b.add(box(0.006, 0.055, 0.52, 0), f, W(2.45, 0.5025, 0).toArray());
    // (no rear closing panel: the rear fascia comes in to x 3.61-3.64 above y 0.6 and the fuel surge tank
    //  fills the space below it; the rear bumper beam is chassis.mounting-points.rear-bumper-beam)
    return b.build();
  },
};

export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules: [
    // ---- suspension: cradles
    [/^suspension\.front-cradle\.cradle$/, 'chassis_frontCradle', { usesPos: true, perPart: true }],
    [/^suspension\.front-cradle\.cradle-mounts$/, 'chassis_cradleMount', { axis: 'y' }],
    [/^suspension\.front-cradle\.lower-cradle-brace$/, 'chassis_flatBar'],
    [/^suspension\.rear-cradle\.cradle$/, 'chassis_rearCradle', { usesPos: true, perPart: true }],
    [/^suspension\.rear-cradle\.cradle-bushings$/, 'chassis_rearCradleBushing', { axis: 'y' }],
    [/^suspension\.rear-cradle\.(front-cradle-braces|rear-cradle-brace)$/, 'chassis_brace', { variant: 'cradle' }],
    // ---- knuckles
    [/^suspension\.front-knuckles\.knuckle$/, 'chassis_frontKnuckle', { usesPos: true, perPart: true }],
    [/^suspension\.rear-knuckles\.knuckle$/, 'chassis_rearKnuckle', { usesPos: true, perPart: true }],
    [/^suspension\.rear-knuckles\.knuckle-bushings$/, 'chassis_bushing'],
    // ---- front links
    [/^suspension\.front-lower-links\.lower-control-arm$/, 'chassis_link', { variant: 'fLateral' }],
    [/^suspension\.front-lower-links\.radius-rod$/, 'chassis_link', { variant: 'fTension' }],
    [/^suspension\.front-lower-links\.lower-control-arm-bushing$/, 'chassis_bushing'],
    [/^suspension\.front-lower-links\.radius-rod-bushing$/, 'chassis_bushing', { variant: 'hydro' }],
    [/^suspension\.front-lower-links\.ball-joints$/, 'chassis_ballJoint', { axis: 'y' }],
    // ---- struts, springs, mounts
    [/^suspension\.front-struts-springs\.strut$/, 'chassis_strut'],
    [/^suspension\.(front-struts-springs|rear-dampers-springs)\.coil-spring$/, 'chassis_coil'],
    [/^suspension\.front-struts-springs\.strut-mount$/, 'chassis_strutMount'],
    [/^suspension\.front-struts-springs\.upper-spring-seat$/, 'chassis_springSeat'],
    [/^suspension\.front-struts-springs\.threaded-spring-perch$/, 'chassis_perch'],
    [/^suspension\.front-struts-springs\.camber-caster-plate$/, 'chassis_camberPlate'],
    [/^suspension\.bump-stops-and-limiters\.(front|rear)-jounce-bumper$/, 'chassis_jounce'],
    [/^suspension\.rear-dampers-springs\.shock$/, 'chassis_shock'],
    [/^suspension\.rear-dampers-springs\.upper-shock-mount$/, 'chassis_shockMount'],
    // ---- sway bars
    [/^suspension\.rear-sway-bar\.bar$/, 'chassis_swaybar', { variant: 'adj3' }],
    [/^suspension\.front-sway-bar\.bar$/, 'chassis_swaybar'],
    [/^suspension\.(front|rear)-sway-bar\.insulators-and-clamps$/, 'chassis_barClamp'],
    [/^suspension\.(front|rear)-sway-bar\.end-links$/, 'chassis_link', { variant: 'endlink' }],
    // ---- rear links
    [/^suspension\.rear-links\.lower-control-arm$/, 'chassis_link', { variant: 'rLCA' }],
    [/^suspension\.rear-links\.(upper-control-arm|upper-trailing-arm|lower-trailing-arm)$/, 'chassis_link', { variant: 'stamped' }],
    [/^suspension\.rear-links\.toe-link$/, 'chassis_link', { variant: 'toe' }],
    [/^suspension\.rear-links\.camber-and-toe-eccentrics$/, 'chassis_cam'],
    [/^suspension\.ride-height-sensors\.position-sensors$/, 'chassis_heightSensor'],
    // ---- steering
    [/^steering\.rack\.eps-gear$/, 'chassis_epsRack'],
    [/^steering\.rack\.eps-motor-and-controller$/, 'chassis_epsMotor'],
    [/^steering\.rack\.rack-mount-hardware$/, 'chassis_bolt'],
    [/^steering\.rack\.cooling-deflectors$/, 'chassis_deflector'],
    [/^steering\.tie-rods\.inner-tie-rod$/, 'chassis_link', { variant: 'innerTie' }],
    [/^steering\.tie-rods\.outer-tie-rod-end$/, 'chassis_link', { variant: 'outerTie' }],
    [/^steering\.bump-steer\.adjustable-tie-rod-ends$/, 'chassis_bumpTRE'],
    [/^steering\.column-and-shaft\.column$/, 'chassis_column'],
    [/^steering\.column-and-shaft\.(upper|lower)-intermediate-shaft$/, 'chassis_ishaft'],
    [/^steering\.column-and-shaft\.firewall-seal$/, 'chassis_firewallSeal'],
    [/^steering\.column-and-shaft\.steering-angle-sensor-and-clockspring$/, 'chassis_clockspring'],
    [/^steering\.wheel-and-quick-release\.steering-wheel$/, 'chassis_raceWheel', { axis: 'x' }],
    [/^steering\.wheel-and-quick-release\.quick-release$/, 'chassis_quickRelease', { axis: 'x' }],
    [/^steering\.wheel-and-quick-release\.hub-adapter$/, 'chassis_hubAdapter', { axis: 'x' }],
    // ---- chassis / body structure
    [/^chassis\.unibody\.body-in-white$/, 'chassis_biw', { whole: true }],
    [/^chassis\.unibody\.(front-frame-rails|rear-rails)$/, 'chassis_beam', { variant: 'rail' }],
    [/^chassis\.unibody\.pillars-and-roof-structure$/, 'chassis_beam', { shapes: ['tube'] }],
    [/^chassis\.unibody\.front-strut-towers$/, 'chassis_tower', { axis: 'y' }],
    [/^chassis\.unibody\.rear-shock-towers$/, 'chassis_shockTower', { axis: 'y' }],
    [/^chassis\.unibody\.dash-panel-and-cowl$/, 'chassis_dash'],
    [/^chassis\.unibody\.rocker-sills$/, 'chassis_rocker'],
    [/^chassis\.unibody\.floor-pan$/, 'chassis_floor'],
    [/^chassis\.unibody\.trunk-floor$/, 'chassis_trunkFloor'],
    [/^chassis\.unibody\.datum-holes$/, 'chassis_doubler', { variant: 'datum' }],
    [/^chassis\.floor-and-tunnel\.tunnel$/, 'chassis_tunnelLoft', { whole: true }],
    [/^chassis\.floor-and-tunnel\.tunnel-brace$/, 'chassis_tunnelBrace'],
    [/^chassis\.floor-and-tunnel\.driveshaft-safety-loop$/, 'chassis_safetyLoop'],
    [/^chassis\.floor-and-tunnel\.tunnel-heat-shielding$/, 'chassis_heatShield'],
    [/^chassis\.mounting-points\.lift-and-jack-points$/, 'chassis_jackPad'],
    [/^chassis\.mounting-points\.(front-tow-eye-receptacle|rear-tow-point)$/, 'chassis_towEye', { usesPos: true }],
    [/^chassis\.mounting-points\.rivnuts$/, 'chassis_rivnut'],
    [/^chassis\.seam-welding-and-reinforcement\.[a-z-]*stitch-welds$/, 'chassis_weld'],
    [/^chassis\.seam-welding-and-reinforcement\.[a-z-]*stitch-welds$/, 'chassis_weldPath'],
    [/^chassis\.seam-welding-and-reinforcement\.(cradle-mount-reinforcements|cage-mount-backing-plates)$/, 'chassis_doubler'],
    [/^chassis\.seam-welding-and-reinforcement\.strut-tower-gussets$/, 'chassis_doubler', { variant: 'tower' }],
    [/^chassis\.strut-tower-and-chassis-braces\.front-strut-tower-brace$/, 'chassis_brace', { variant: 'front' }],
    [/^chassis\.strut-tower-and-chassis-braces\.rear-shock-tower-brace$/, 'chassis_brace', { variant: 'rear' }],
  ],
  axial,
  boxes,
  paths,
  whole,
};
