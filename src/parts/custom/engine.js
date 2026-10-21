// Precise part models for the "engine" group (GM Gen V LT4 / LT1 6.2L as fitted to the 2017-24 Camaro ZL1).
// See data/MODELING.md. Generator names are prefixed "engine_".
//
// All engine parts share one layout (car coordinates, metres) so the heads sit on the 45-degree decks,
// rods hang from the right crankpins, valvetrain lines up with the cam, etc.:
//   crank centreline y = 0.40, z = 0; cam centreline y = 0.515 (4.52 in above the crank)
//   deck height 9.240 in (0.2347 m) along each 45-degree bore axis; bore spacing 4.400 in (0.1118 m)
//   left bank (cyl 1-3-5-7, +z) is 0.94 in (24 mm) forward of the right bank (2-4-6-8)
//   block front face x = -0.21, bellhousing face x = 0.38
//   accessory-belt plane x = -0.311, supercharger-belt plane x = -0.343
import * as THREE from 'three';
// eslint-disable-next-line no-unused-vars
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, Helix, curveFrom, tubeAlong, ribbonAlong, alignX, V } from '../geo.js';

const PI = Math.PI;
const S2 = Math.SQRT1_2;
const D2R = PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const LT = {
  crankY: 0.4,
  camY: 0.515,
  deck: 0.2347,
  throw: 0.046, // 3.622 in stroke / 2
  cylL: [-0.135, -0.0232, 0.0886, 0.2004],
  cylR: [-0.111, 0.0008, 0.1126, 0.2244],
  pins: [-0.123, -0.0112, 0.1006, 0.2124],
  mains: [-0.179, -0.0672, 0.0446, 0.1564, 0.2682],
  pinAng: [45, 135, 315, 225], // display pose: cyl 1 at TDC, cross-plane 0/90/270/180
};
// valve / lifter / pushrod x positions per bank (intake 20 mm ahead, exhaust 25 mm behind the bore centre)
const valveXs = (cyls) => cyls.flatMap((c) => [c - 0.02, c + 0.025]);

// ------------------------------------------------------------------ helpers
const HEX = hexX(0.5, 1);
const ROD8 = cylX(0.5, 1, 8);
const ROD12 = cylX(0.5, 1, 12);
const ROD16 = cylX(0.5, 1, 16);
const CUBE = new THREE.BoxGeometry(1, 1, 1);

function shapeOf(pts) {
  const s = new THREE.Shape();
  pts.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  s.closePath();
  return s;
}
function rrectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function rrectPath(w, h, r, cx = 0, cy = 0) {
  const p = new THREE.Path();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  p.moveTo(x0 + r, y0);
  p.quadraticCurveTo(x0, y0, x0, y0 + r); p.lineTo(x0, y0 + h - r);
  p.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h); p.lineTo(x0 + w - r, y0 + h);
  p.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h - r); p.lineTo(x0 + w, y0 + r);
  p.quadraticCurveTo(x0 + w, y0, x0 + w - r, y0); p.lineTo(x0 + r, y0);
  return p;
}
const circlePath = (r, cx = 0, cy = 0, seg) => new THREE.Path().absarc(cx, cy, r, 0, PI * 2, true);

/** Profile given as [z, y] points (car frame), extruded along x (thickness t, centred). */
function extYZ(pts, t, seg = 16) {
  return extrudeX(shapeOf(pts.map(([z, y]) => [-z, y])), t, seg);
}
/** THREE.Shape drawn as (x, -z) extruded along y (thickness t, centred). Use shapeXZ() to build it. */
function extY(shape, t, seg = 16, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: seg });
  g.translate(0, 0, -(t - 2 * bevel) / 2);
  g.rotateX(-PI / 2);
  return g;
}
/** Shape in the (x, y) plane extruded along z (thickness t, centred), optional rounded bevel. */
function extZ(shape, t, seg = 16, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: seg });
  g.translate(0, 0, -(t - 2 * bevel) / 2);
  return g;
}
/** Unit-X geometry placed from a to b with diameter d. */
function rodBetween(b, geo, finish, a, c, d) {
  b.addMatrix(geo, finish, alignX(a, c, d));
}
/** Hex bolt head of radius r and height h starting at p, pointing along dir. */
function hexHead(b, p, dir, r = 0.006, h = 0.007, finish = 'chrome') {
  const a = V(p[0], p[1], p[2]);
  const n = V(dir[0], dir[1], dir[2]).normalize();
  rodBetween(b, HEX, finish, a, a.clone().addScaledVector(n, h), 2 * r);
}
/** Box between two points (square section s). */
function barBetween(b, a, c, s, finish) {
  b.addMatrix(CUBE, finish, alignX(a, c, s));
}
/** Multi-V ribbed pulley, axis X, centred. */
function ribbedPulley(R, W, ribs = 6, hub = 0.55) {
  const prof = [[R * hub, -W / 2], [R, -W / 2], [R, -W / 2 + 0.0015]];
  const pitch = (W - 0.003) / ribs;
  for (let i = 0; i < ribs; i++) {
    const x0 = -W / 2 + 0.0015 + i * pitch;
    prof.push([R - 0.0028, x0 + pitch * 0.5], [R, x0 + pitch]);
  }
  prof.push([R, W / 2], [R * hub, W / 2]);
  return latheX(prof, 40);
}
/** Smooth flanged idler/tensioner pulley, axis X, centred. */
function smoothPulley(R, W) {
  return latheX([[R * 0.3, -W / 2], [R * 1.04, -W / 2], [R * 1.04, -W / 2 + 0.002], [R, -W / 2 + 0.003], [R, W / 2 - 0.003], [R * 1.04, W / 2 - 0.002], [R * 1.04, W / 2], [R * 0.3, W / 2]], 36);
}
/** Spur/sprocket outline, extruded along X. */
function gearX(R, teeth, t, rHole = 0, depth = 0.004) {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * PI * 2;
    const k = i % 4;
    const r = k === 1 || k === 2 ? R : R - depth;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  if (rHole > 0) s.holes.push(circlePath(rHole));
  return extrudeX(s, t, 8);
}

/** Belt / chain wrap around circles. pulleys: [{c:[u,v], r, s}] in travel order (s = +1 wraps CCW, -1 backside).
 *  Returns dense closed list of [u, v]. */
function wrapLoop(pul, step = 0.15) {
  const n = pul.length;
  const spans = [];
  for (let i = 0; i < n; i++) {
    const A = pul[i], B = pul[(i + 1) % n];
    const du = B.c[0] - A.c[0], dv = B.c[1] - A.c[1];
    const D = Math.hypot(du, dv) || 1e-6;
    const ra = A.s * A.r, rb = B.s * B.r;
    const phi = Math.atan2(dv, du) - Math.asin(clamp((rb - ra) / D, -1, 1));
    const lu = -Math.sin(phi), lv = Math.cos(phi);
    spans.push([[A.c[0] - ra * lu, A.c[1] - ra * lv], [B.c[0] - rb * lu, B.c[1] - rb * lv]]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const [p0, p1] = spans[i];
    out.push(p0, p1);
    const P = pul[(i + 1) % n];
    const q = spans[(i + 1) % n][0];
    let a0 = Math.atan2(p1[1] - P.c[1], p1[0] - P.c[0]);
    let a1 = Math.atan2(q[1] - P.c[1], q[0] - P.c[0]);
    if (P.s > 0) { while (a1 < a0) a1 += PI * 2; } else { while (a1 > a0) a1 -= PI * 2; }
    const k = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
    for (let j = 1; j < k; j++) {
      const a = a0 + ((a1 - a0) * j) / k;
      out.push([P.c[0] + Math.cos(a) * P.r, P.c[1] + Math.sin(a) * P.r]);
    }
  }
  return out;
}

/** Closed band (belt) through points in a plane x = const; width along x. */
function bandGeo(points3, width, thick) {
  const curve = new THREE.CatmullRomCurve3(points3, true, 'centripetal', 0.5);
  const sh = new THREE.Shape();
  sh.moveTo(-thick / 2, -width / 2); sh.lineTo(thick / 2, -width / 2); sh.lineTo(thick / 2, width / 2); sh.lineTo(-thick / 2, width / 2); sh.closePath();
  const steps = Math.min(320, Math.max(40, Math.round(curve.getLength() / 0.008)));
  return new THREE.ExtrudeGeometry(sh, { steps, bevelEnabled: false, extrudePath: curve });
}

/** Beehive-style coil (radius tapers in the top half), along X. */
class Beehive extends THREE.Curve {
  constructor(r0, r1, len, turns) { super(); this.r0 = r0; this.r1 = r1; this.l = len; this.n = turns; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.n * PI * 2;
    const r = t < 0.45 ? this.r0 : this.r0 + (this.r1 - this.r0) * ((t - 0.45) / 0.55);
    return target.set(-this.l / 2 + t * this.l, Math.cos(a) * r, Math.sin(a) * r);
  }
}

// bank helpers: point at height h along the bore axis and w across the deck (+w = exhaust side) -> [y, z]
const bankYZ = (h, w, side = 1) => [LT.crankY + S2 * h - S2 * w, side * (S2 * h + S2 * w)];

// ====================================================================== AXIAL
const axial = {
  // ---------------------------------------------------------------- rotating assembly
  engine_crank(L, D, D2, ctx) {
    const b = new PartBuilder();
    const px = ctx.pos[0];
    const r = LT.throw;
    const x0 = -L / 2, x1 = L / 2;
    // main journals (2.559 in) with thrust flanges on #3
    LT.mains.forEach((m, i) => {
      b.add(cylX(0.0325, 0.024, 28), 'machined', [m - px, 0, 0]);
      if (i === 2) for (const dx of [-0.0125, 0.0125]) b.add(cylX(0.045, 0.002, 28), 'machined', [m - px + dx, 0, 0]);
    });
    // throws: crankpin (2.100 in) + two cheeks with counterweights
    const cheek = new THREE.Shape();
    cheek.moveTo(-0.037, 0.046);
    cheek.absarc(0, r, 0.037, PI, 0, true);
    cheek.lineTo(0.05, -0.012);
    cheek.absarc(0, 0, 0.0915, -28 * D2R, -152 * D2R, true);
    cheek.lineTo(-0.05, -0.012);
    cheek.closePath();
    const cheekGeo = extrudeX(cheek, 0.018, 14);
    LT.pins.forEach((pin, i) => {
      const a = LT.pinAng[i] * D2R;
      const x = pin - px;
      b.add(cylX(0.0267, 0.046, 24), 'machined', [x, Math.cos(a) * r, Math.sin(a) * r]);
      for (const dx of [-0.032, 0.032]) b.add(cheekGeo, 'steel', [x + dx, 0, 0], [a, 0, 0]);
    });
    // nose: sprocket seat, oil-pump drive flats, balancer snout (balancer hub covers it)
    const front = LT.mains[0] - px - 0.012;
    b.add(latheX([[0.0001, x0], [0.0195, x0], [0.0195, front - 0.034], [0.023, front - 0.032], [0.023, front], [0.026, front]], 24), 'machined');
    // rear: seal journal and 8-bolt flange
    const rear = LT.mains[4] - px + 0.012;
    b.add(latheX([[0.03, rear], [0.042, rear + 0.004], [0.042, x1 - 0.013], [0.05, x1 - 0.012], [0.05, x1], [0.012, x1]], 32), 'machined');
    return b.build();
  },

  engine_piston(L, D) {
    // canonical +X = crown (along bore axis); canonical Y = car x (pin axis)
    const R = D / 2, t = L / 2;
    const b = new PartBuilder();
    b.add(latheX([
      [R - 0.004, -t], [R - 0.0006, -t + 0.004], [R - 0.0006, t - 0.024],
      [R - 0.003, t - 0.024], [R - 0.003, t - 0.019], [R, t - 0.019], [R, t - 0.0165],
      [R - 0.0022, t - 0.0165], [R - 0.0022, t - 0.0135], [R, t - 0.0135], [R, t - 0.0105],
      [R - 0.0022, t - 0.0105], [R - 0.0022, t - 0.0078], [R, t - 0.0078], [R, t - 0.0018],
      [R - 0.0018, t], [0.0001, t],
    ], 40), 'aluminum');
    // wrist-pin bores (dark), valve eyebrows + DI relief on the flat top
    b.add(cylY(0.0124, D * 1.002, 18), 'black', [-0.003, 0, 0]);
    for (const [dy, rr] of [[-0.02, 0.026], [0.025, 0.021]]) b.add(cylX(rr, 0.0016, 24), 'machined', [t - 0.0003, dy, 0.012]);
    b.add(cylX(0.012, 0.0016, 16), 'machined', [t - 0.0003, 0, -0.03]);
    return b.build();
  },

  engine_rings(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R - 0.0038, 0.0012, 30), 'steel', [0.0055, 0, 0]);
    b.add(ringX(R, R - 0.0040, 0.0015, 30), 'black', [0.0025, 0, 0]);
    b.add(ringX(R, R - 0.0032, 0.0030, 30), 'steel', [-0.0012, 0, 0]);
    return b.build();
  },

  engine_wristPin(L, D) {
    const b = new PartBuilder();
    b.add(ringX(D / 2, D / 2 - 0.0045, L, 16), 'machined');
    for (const x of [-L / 2 - 0.001, L / 2 + 0.001]) b.add(torusX(D / 2 - 0.002, 0.0008, 4, 14), 'spring', [x, 0, 0]);
    return b.build();
  },

  engine_bearingShell(L, D, D2, ctx) {
    const R = D / 2;
    const b = new PartBuilder();
    const rod = ctx?.variant === 'rod';
    const parts = rod ? [[-L / 4, L / 2 - 0.002], [L / 4, L / 2 - 0.002]] : [[0, L]];
    for (const [x, w] of parts) {
      b.add(ringX(R, R - 0.0022, w, 40), 'copper', [x, 0, 0]);
      for (const s of [-1, 1]) b.add(box(w * 1.01, 0.0008, 0.0024, 0), 'steel', [x, 0, s * (R - 0.0011)]);
    }
    return b.build();
  },

  engine_camBearing(L, D) {
    const b = new PartBuilder();
    b.add(ringX(D / 2, D / 2 - 0.002, L, 36), 'copper');
    b.add(cylY(0.002, 0.003, 8), 'black', [0, D / 2 - 0.001, 0]);
    return b.build();
  },

  engine_liner(L, D) {
    const b = new PartBuilder();
    b.add(ringX(D / 2, 0.0516, L, 48), 'iron');
    return b.build();
  },

  engine_reluctor(L, D) {
    const R = D / 2;
    const s = new THREE.Shape();
    const n = 60;
    let first = true;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * PI * 2, a1 = ((i + 0.5) / n) * PI * 2, a2 = ((i + 1) / n) * PI * 2;
      const tooth = i < n - 2; // 60-2 pattern
      const pts = tooth ? [[R - 0.006, a0], [R, a0 + 0.003], [R, a1], [R - 0.006, a1 + 0.003], [R - 0.006, a2]] : [[R - 0.006, a0], [R - 0.006, a2]];
      for (const [r, a] of pts) {
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (first) { s.moveTo(x, y); first = false; } else s.lineTo(x, y);
      }
    }
    s.holes.push(circlePath(0.034));
    const b = new PartBuilder().add(extrudeX(s, Math.min(L, 0.004), 8), 'steel');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(cylX(0.006, Math.min(L, 0.004) * 1.1, 12), 'black', [0, Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6]);
    }
    return b.build();
  },

  engine_sprocket(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(gearX(R, 19, L * 0.6, 0.0195, 0.0045), 'steel');
    b.add(ringX(R * 0.62, 0.0195, L, 28), 'machined');
    b.add(box(L * 1.02, 0.004, 0.006, 0), 'black', [0, 0.019, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- block small parts
  engine_dowel(L, D) {
    const b = new PartBuilder();
    b.add(ringX(D / 2, D / 2 * 0.62, L, 18), 'steel');
    return b.build();
  },

  engine_galleyPlug(L, D) {
    const b = new PartBuilder();
    b.add(cylX(D / 2, L, 20), 'steel');
    b.add(cylX(D / 2 * 0.45, 0.0012, 6), 'black', [-L / 2 - 0.0004, 0, 0]);
    return b.build();
  },

  engine_corePlug(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, -L / 2 + L * 0.4], [R * 0.8, -L / 2 + L * 0.4], [R * 0.95, -L / 2], [R, -L / 2], [R, L / 2], [0.0001, L / 2]], 24), 'steel');
    b.add(hexX(R * 0.45, L * 0.6), 'steel', [-L / 2, 0, 0]);
    return b.build();
  },

  engine_headBolt(L, D) {
    // canonical +X = outward along the bolt
    const b = new PartBuilder();
    b.add(cylX(D / 2, 0.0025, 20), 'black', [L / 2 - 0.0105, 0, 0]);
    b.add(hexX(D / 2 * 0.78, 0.009), 'black', [L / 2 - 0.0045, 0, 0]);
    b.add(cylX(0.0055, L - 0.012, 10), 'steel', [-0.006, 0, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- valvetrain
  engine_valve(L, D, D2, ctx) {
    const R = D / 2, t = L / 2;
    const fin = ctx?.variant === 'exhaust' ? 'steel' : 'machined';
    const b = new PartBuilder();
    b.add(latheX([
      [0.0001, -t], [R, -t], [R, -t + 0.0016], [R * 0.86, -t + 0.004], [R * 0.35, -t + 0.012], [0.0056, -t + 0.022],
      [0.004, -t + 0.032], [0.004, t - 0.0065], [0.0033, t - 0.0055], [0.0033, t - 0.0035], [0.004, t - 0.0025], [0.004, t], [0.0001, t],
    ], 28), fin);
    return b.build();
  },

  engine_valveSpring(L, D) {
    const R = D / 2;
    const wire = 0.0019;
    const b = new PartBuilder();
    b.add(tubeAlong(new Beehive(R - wire, R * 0.72 - wire, L - 0.006, 5.5), wire, 44, 4), 'steel', [-0.002, 0, 0]);
    // seat washer, retainer and keepers
    b.add(ringX(R + 0.0005, 0.0045, 0.0012, 14), 'steel', [-L / 2 + 0.0006, 0, 0]);
    b.add(latheX([[0.0048, L / 2 - 0.007], [R * 0.72, L / 2 - 0.004], [R * 0.78, L / 2 - 0.002], [R * 0.78, L / 2], [0.0048, L / 2]], 14), 'machined');
    b.add(latheX([[0.0042, L / 2 - 0.006], [0.0055, L / 2 + 0.0015], [0.0042, L / 2 + 0.0015]], 8), 'steel');
    return b.build();
  },

  engine_stemSeal(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0042, -L / 2], [R, -L / 2], [R, L * 0.1], [R * 0.75, L / 2], [0.0042, L / 2]], 12), 'rubber');
    b.add(ringX(R * 1.05, R * 0.8, L * 0.35, 12), 'steel', [-L * 0.3, 0, 0]);
    return b.build();
  },

  engine_lifter(L, D) {
    // canonical +X = towards the pushrod; roller at -X, roller axle along canonical Y (car x)
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, L / 2 - 0.002], [R * 0.55, L / 2], [R * 0.95, L / 2], [R, L / 2 - 0.002], [R, -L / 2 + 0.016], [R * 0.93, -L / 2 + 0.014], [R * 0.93, -L / 2 + 0.01], [R, -L / 2 + 0.008], [R, -L / 2 + 0.004], [R * 0.6, -L / 2 + 0.004]], 24), 'machined');
    b.add(cylY(0.0085, 0.011, 18), 'steel', [-L / 2 + 0.0085, 0, 0]);
    b.add(box(0.012, 0.004, R * 1.9, 0), 'steel', [-L / 2 + 0.01, 0.0075, 0]);
    b.add(box(0.012, 0.004, R * 1.9, 0), 'steel', [-L / 2 + 0.01, -0.0075, 0]);
    return b.build();
  },

  engine_pushrod(L, D) {
    const b = new PartBuilder();
    b.add(cylX(D / 2, L - 0.006, 10), 'steel');
    for (const x of [-L / 2 + 0.003, L / 2 - 0.003]) b.add(sphere(D / 2 * 1.05, 10, 8), 'machined', [x, 0, 0]);
    return b.build();
  },

  engine_camshaft(L, D, D2, ctx) {
    const b = new PartBuilder();
    const px = ctx.pos[0];
    b.add(cylX(0.0135, L - 0.01, 16), 'machined');
    // 5 bearing journals at the bulkheads
    for (const m of LT.mains) b.add(cylX(0.0272, 0.02, 32), 'machined', [m - px, 0, 0]);
    // 16 lobes (base circle 19 mm, ~13 mm lobe lift)
    const lobe = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * PI * 2;
      const c = Math.cos(a);
      const r = 0.019 + (c > 0 ? 0.0115 * Math.pow(c, 2.2) : 0);
      if (i === 0) lobe.moveTo(-Math.sin(a) * r, c * r); else lobe.lineTo(-Math.sin(a) * r, c * r);
    }
    const lobeGeo = extrudeX(lobe, 0.0155, 10);
    const xs = [...valveXs(LT.cylL), ...valveXs(LT.cylR)].sort((a, c) => a - c);
    xs.forEach((x, i) => b.add(lobeGeo, 'machined', [x - px, 0, 0], [(i * 67) * D2R, 0, 0]));
    // 4-lobe HPFP drive lobe at the rear
    const q = new THREE.Shape();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * PI * 2;
      const r = 0.021 + 0.004 * Math.cos(4 * a);
      if (i === 0) q.moveTo(Math.cos(a) * r, Math.sin(a) * r); else q.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    b.add(extrudeX(q, 0.014, 8), 'machined', [0.3 - px, 0, 0]);
    // front nose (dowel + bolt flange for the phaser)
    b.add(cylX(0.022, 0.012, 24), 'machined', [-L / 2 + 0.006, 0, 0]);
    b.add(cylX(0.0035, 0.008, 8), 'steel', [-L / 2 - 0.003, 0.012, 0]);
    return b.build();
  },

  engine_phaser(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    // 38-tooth sprocket at the rear, vane-type phaser body, 4X reluctor target in front
    b.add(gearX(R, 38, L * 0.35, 0.02, 0.0045), 'steel', [L * 0.3, 0, 0]);
    b.add(latheX([[0.012, -L / 2 + 0.004], [R * 0.78, -L / 2 + 0.004], [R * 0.8, -L / 2 + 0.008], [R * 0.8, L * 0.12], [0.012, L * 0.12]], 40), 'machined');
    const tgt = new THREE.Shape();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * PI * 2;
      const r = Math.floor((i / 64) * 8) % 2 ? R * 0.62 : R * 0.72;
      if (i === 0) tgt.moveTo(Math.cos(a) * r, Math.sin(a) * r); else tgt.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    tgt.holes.push(circlePath(0.014));
    b.add(extrudeX(tgt, 0.002, 8), 'steel', [-L / 2 + 0.001, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      b.add(hexX(0.004, 0.004), 'chrome', [-L / 2 + 0.006, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5]);
    }
    return b.build();
  },

  engine_phaserBolt(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(hexX(R * 0.95, L * 0.35), 'machined', [-L / 2 + L * 0.175, 0, 0]);
    b.add(cylX(R * 0.85, 0.002, 20), 'steel', [-L / 2 + L * 0.36, 0, 0]);
    b.add(cylX(R * 0.55, L * 0.62, 16), 'machined', [L * 0.18, 0, 0]);
    return b.build();
  },

  engine_vvtSolenoid(L, D) {
    // canonical -X = front (connector), +X = plunger into the cover
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.85, L * 0.55, 24), 'black', [-L * 0.1, 0, 0]);
    b.add(box(0.004, D * 1.45, D * 0.55, 0.003), 'steel', [L * 0.2, 0, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.004, 0.004), 'chrome', [L * 0.2 - 0.004, s * D * 0.6, 0]);
    b.add(cylX(R * 0.45, L * 0.3, 16), 'machined', [L * 0.38, 0, 0]);
    b.add(box(L * 0.35, R * 0.9, R * 0.7, 0.002), 'plastic', [-L * 0.36, R * 0.55, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- front of engine
  engine_balancer(L, D) {
    // canonical -X = front. 8-rib supercharger groove (front), 6-rib accessory groove, iron inertia ring, anodised hub.
    const R = D / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(ribbedPulley(R, 0.028, 8, 0.72), 'machined', [x0 + 0.014, 0, 0]);
    b.add(ribbedPulley(R * 0.927, 0.022, 6, 0.72), 'machined', [x0 + 0.046, 0, 0]);
    b.add(ringX(R * 0.927, R * 0.7, 0.03, 48), 'steel', [x0 + 0.075, 0, 0]);
    b.add(ringX(R * 0.7, R * 0.66, 0.03, 40), 'rubber', [x0 + 0.075, 0, 0]);
    b.add(latheX([[0.012, x0], [R * 0.74, x0], [R * 0.74, x0 + 0.004], [R * 0.66, x0 + 0.01], [R * 0.66, x0 + 0.09], [0.033, x0 + 0.094], [0.033, L / 2], [0.021, L / 2]], 40), 'satin');
    // 3 puller holes and the timing notch
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + PI / 2;
      b.add(cylX(0.005, 0.0015, 10), 'black', [x0 - 0.0006, Math.cos(a) * 0.045, Math.sin(a) * 0.045]);
    }
    b.add(box(0.0015, 0.008, 0.003, 0), 'yellow', [x0 - 0.0006, R * 0.8, 0]);
    return b.build();
  },

  engine_balancerBolt(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(hexX(R * 0.62, L * 0.5), 'black', [-L / 2 + L * 0.25, 0, 0]);
    b.add(cylX(R, L * 0.15, 28), 'steel', [-L / 2 + L * 0.57, 0, 0]);
    b.add(cylX(R * 0.42, L * 0.3, 12), 'steel', [L / 2 - L * 0.15, 0, 0]);
    return b.build();
  },

  engine_lipSeal(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.86, L, 40), 'steel');
    b.add(latheX([[R * 0.86, L / 2], [R * 0.7, L * 0.2], [R * 0.66, -L / 2], [R * 0.86, -L / 2]], 40), 'rubber');
    b.add(torusX(R * 0.72, 0.0008, 6, 30), 'spring', [-L * 0.1, 0, 0]);
    return b.build();
  },

  engine_waterPump(L, D) {
    // canonical -X = front (pulley). Gen V: cast housing with integral thermostat neck and inlet pipe.
    const R = D / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(ribbedPulley(0.072, 0.024, 6, 0.55), 'machined', [x0 + 0.012, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      b.add(hexX(0.005, 0.005), 'chrome', [x0 - 0.0015, Math.cos(a) * 0.02, Math.sin(a) * 0.02]);
    }
    b.add(cylX(0.022, 0.03, 20), 'steel', [x0 + 0.035, 0, 0]);
    b.add(latheX([[0.022, x0 + 0.03], [0.04, x0 + 0.036], [0.062, x0 + 0.048], [0.066, x0 + 0.06], [0.066, L / 2 - 0.006], [0.07, L / 2 - 0.006], [0.07, L / 2], [0.02, L / 2]], 36), 'cast');
    b.add(box(0.05, 0.05, 0.05, 0.016), 'cast', [0.012, -0.035, 0.04]);
    // inlet (lower hose) and thermostat outlet (upper hose)
    const inA = V(0.012, -0.045, 0.05), inB = V(-0.012, -0.072, 0.074);
    rodBetween(b, ROD16, 'cast', inA, inB, 0.04);
    b.add(torusX(0.02, 0.0025, 6, 20), 'cast', [inB.x, inB.y, inB.z], [0, 0, 0.9]);
    rodBetween(b, ROD16, 'cast', V(0.0, 0.045, -0.02), V(-0.022, 0.074, -0.05), 0.038);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      b.add(hexX(0.0055, 0.006), 'chrome', [L / 2 - 0.009, Math.cos(a) * 0.075, Math.sin(a) * 0.075 * 0.9]);
    }
    return b.build();
  },

  engine_alternator(L, D) {
    // canonical -X = front (pulley). Gen V: 4-ear cast case, rear cover with B+ stud and connector.
    const R = D / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(ribbedPulley(0.029, 0.024, 6, 0.4), 'machined', [x0 + 0.012, 0, 0]);
    b.add(hexX(0.009, 0.008), 'chrome', [x0 - 0.002, 0, 0]);
    const prof = [[0.016, x0 + 0.024], [R * 0.75, x0 + 0.028], [R * 0.95, x0 + 0.04]];
    for (let i = 0; i < 9; i++) prof.push([i % 2 ? R * 0.94 : R, x0 + 0.045 + i * 0.008]);
    prof.push([R, L / 2 - 0.03], [R * 0.9, L / 2 - 0.012], [R * 0.7, L / 2], [0.0001, L / 2]);
    b.add(latheX(prof, 36), 'cast');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(box(0.012, 0.004, 0.012, 0), 'black', [x0 + 0.032, Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7], [a, 0, 0]);
    }
    for (const a of [PI / 2, -PI / 2]) {
      for (const x of [x0 + 0.035, L / 2 - 0.035]) b.add(box(0.018, 0.03, 0.024, 0.006), 'cast', [x, Math.sin(a) * (R + 0.008), 0]);
    }
    b.add(cylX(0.004, 0.02, 8), 'chrome', [L / 2 + 0.008, R * 0.35, R * 0.2]);
    b.add(box(0.016, 0.022, 0.018, 0.003), 'plastic', [L / 2 + 0.006, -R * 0.3, R * 0.3]);
    return b.build();
  },

  engine_acCompressor(L, D) {
    const R = D / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(ribbedPulley(R * 0.98, 0.026, 6, 0.6), 'machined', [x0 + 0.013, 0, 0]);
    b.add(cylX(R * 0.62, 0.004, 28), 'steel', [x0 - 0.001, 0, 0]);
    b.add(latheX([[R * 0.45, x0 + 0.027], [R * 0.9, x0 + 0.03], [R * 0.95, x0 + 0.05], [R * 0.95, L / 2 - 0.02], [R * 0.8, L / 2], [0.0001, L / 2]], 32), 'cast');
    b.add(box(0.05, 0.028, 0.045, 0.006), 'cast', [0.03, R * 0.95, 0]);
    for (const z of [-0.012, 0.012]) b.add(cylY(0.007, 0.014, 12), 'steel', [0.03, R * 0.95 + 0.018, z]);
    for (const s of [-1, 1]) for (const x of [x0 + 0.04, L / 2 - 0.02]) b.add(box(0.016, 0.026, 0.026, 0.005), 'cast', [x, s * R * 0.8, -R * 0.8]);
    b.add(box(0.02, 0.016, 0.014, 0.003), 'plastic', [x0 + 0.04, -R * 0.95, R * 0.2]);
    return b.build();
  },

  engine_tensioner(L, D) {
    // pulley on an arm, spring can and pivot behind it (canonical +X = towards the engine)
    const R = D / 2;
    const b = new PartBuilder();
    b.add(smoothPulley(R * 0.96, L * 0.95), 'steel');
    b.add(cylX(R * 0.4, L * 1.05, 20), 'black', [-0.001, 0, 0]);
    b.add(hexX(R * 0.2, 0.006), 'chrome', [-L / 2 - 0.003, 0, 0]);
    const piv = V(L / 2 + 0.012, -0.045, -0.035);
    barBetween(b, V(L / 2 + 0.004, 0, 0), V(L / 2 + 0.004, piv.y, piv.z), 0.016, 'cast');
    b.add(cylX(0.034, 0.03, 28), 'cast', [piv.x + 0.008, piv.y, piv.z]);
    b.add(box(0.005, 0.006, 0.02, 0), 'yellow', [piv.x - 0.009, piv.y + 0.022, piv.z]);
    b.add(hexX(0.008, 0.006), 'chrome', [piv.x - 0.01, piv.y, piv.z]);
    return b.build();
  },

  engine_idler(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(smoothPulley(R * 0.96, L * 0.95), 'steel');
    b.add(cylX(R * 0.42, L * 1.04, 20), 'black', [-0.001, 0, 0]);
    b.add(hexX(R * 0.2, 0.006), 'chrome', [-L / 2 - 0.003, 0, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- mounts & flexplate interface
  engine_mount(L, D) {
    // canonical +X = up. Hydraulic mount: steel base cup, rubber body, aluminium top cap and stud.
    const R = D / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(box(0.006, D * 1.5, D * 0.7, 0.003), 'black', [x0 + 0.003, 0, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.007, 0.008), 'chrome', [x0 - 0.002, s * D * 0.6, 0]);
    b.add(latheX([[R * 0.95, x0 + 0.006], [R, x0 + 0.01], [R, x0 + L * 0.42], [R * 0.9, x0 + L * 0.48], [R * 0.8, x0 + L * 0.5]], 32), 'black');
    b.add(latheX([[R * 0.8, x0 + L * 0.5], [R * 0.86, x0 + L * 0.62], [R * 0.78, x0 + L * 0.72]], 28), 'rubber');
    b.add(latheX([[R * 0.78, x0 + L * 0.72], [R * 0.8, L / 2 - 0.012], [R * 0.6, L / 2 - 0.004], [0.0001, L / 2 - 0.004]], 28), 'aluminum');
    b.add(cylX(0.006, 0.02, 10), 'chrome', [L / 2 + 0.004, 0, 0]);
    return b.build();
  },

  engine_crankFlange(L, D) {
    // flywheel bolts (8) on the 8-bolt crank flange; canonical +X = rearward
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, 0.012, L * 0.6, 40), 'machined', [-L * 0.2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 16;
      b.add(hexX(0.0058, 0.0055), 'chrome', [L / 2 - 0.0028, Math.cos(a) * 0.038, Math.sin(a) * 0.038]);
    }
    b.add(cylX(0.0045, L * 0.8, 10), 'steel', [L * 0.1, 0.03, -0.02]);
    return b.build();
  },

  engine_pilotBearing(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.8, L, 32), 'steel');
    b.add(ringX(R * 0.8, R * 0.62, L * 0.9, 28), 'black');
    b.add(ringX(R * 0.62, R * 0.45, L, 28), 'machined');
    return b.build();
  },

  // ---------------------------------------------------------------- sensors
  engine_ckp(L, D) {
    // canonical +X = sensing tip (into the block)
    const R = Math.min(L, D) / 2;
    const b = new PartBuilder();
    b.add(cylX(0.0085, 0.022, 16), 'black', [L / 2 - 0.011, 0, 0]);
    b.add(rrectBox(0.004, 0.034, 0.02), 'black', [L / 2 - 0.022, 0.006, 0]);
    b.add(hexX(0.0045, 0.004), 'chrome', [L / 2 - 0.026, 0.017, 0]);
    b.add(box(0.016, 0.018, 0.016, 0.003), 'plastic', [-L / 2 + 0.01, 0, 0]);
    b.add(rubberRing(0.0087), 'rubber', [L / 2 - 0.02, 0, 0]);
    return b.build();
  },

  engine_cmp(L, D) {
    return axial.engine_ckp(L, D);
  },

  engine_knock(L, D) {
    // donut piezo sensor with a centre bolt; canonical +X = into the block
    const R = Math.max(D, L * 0.9) / 2;
    const b = new PartBuilder();
    b.add(ringX(0.013, 0.0045, 0.012, 24), 'black', [0.002, 0, 0]);
    b.add(hexX(0.0065, 0.006), 'chrome', [-0.007, 0, 0]);
    b.add(box(0.008, 0.012, 0.02, 0.003), 'black', [0.002, -0.017, 0]);
    b.add(box(0.012, 0.012, 0.012, 0.002), 'plastic', [-0.002, -0.026, 0]);
    return b.build();
  },

  engine_oilPressure(L, D) {
    // canonical +X = up (connector), -X = thread
    const b = new PartBuilder();
    b.add(cylX(0.006, 0.012, 12), 'gold', [-L / 2 + 0.006, 0, 0]);
    b.add(hexX(0.0125, 0.008), 'steel', [-L / 2 + 0.016, 0, 0]);
    b.add(cylX(0.011, 0.012, 20), 'steel', [-L / 2 + 0.026, 0, 0]);
    b.add(cylX(0.0105, L - 0.034, 20), 'plastic', [0.015, 0, 0]);
    b.add(box(0.008, 0.012, 0.016, 0.002), 'plastic', [L / 2 - 0.004, 0, 0.008]);
    return b.build();
  },

  engine_oilLevel(L, D) {
    // canonical +X = up into the pan; flange + connector below
    const b = new PartBuilder();
    b.add(rrectBox(0.004, 0.03, 0.022), 'steel', [-L / 2 + 0.008, 0, 0]);
    b.add(hexX(0.004, 0.004), 'chrome', [-L / 2 + 0.004, 0.012, 0]);
    b.add(cylX(0.009, L * 0.55, 16), 'black', [L * 0.1, 0, 0]);
    b.add(box(0.012, 0.016, 0.014, 0.002), 'plastic', [-L / 2 + 0.0, -0.002, 0]);
    return b.build();
  },

  engine_ect(L, D) {
    // canonical +X = thread end (into the head), -X connector
    const b = new PartBuilder();
    b.add(cylX(0.005, 0.012, 12), 'gold', [L / 2 - 0.006, 0, 0]);
    b.add(hexX(0.0095, 0.007), 'gold', [L / 2 - 0.016, 0, 0]);
    b.add(cylX(0.008, 0.012, 16), 'plastic', [-L / 2 + 0.008, 0, 0]);
    b.add(box(0.01, 0.012, 0.014, 0.002), 'plastic', [-L / 2 + 0.002, 0.008, 0]);
    return b.build();
  },

  engine_railSensor(L, D) {
    // canonical +X = up (connector)
    const b = new PartBuilder();
    b.add(cylX(0.005, 0.01, 12), 'steel', [-L / 2 + 0.005, 0, 0]);
    b.add(hexX(0.0115, 0.008), 'steel', [-L / 2 + 0.014, 0, 0]);
    b.add(cylX(0.009, L - 0.026, 20), 'stainless', [0.004, 0, 0]);
    b.add(cylX(0.0095, 0.01, 16), 'plastic', [L / 2 - 0.005, 0, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- fuel
  engine_hpfp(L, D) {
    // canonical +X = up. Cam-driven single-piston pump: flange, body, damper dome, solenoid, fittings.
    const R = Math.min(D, 0.07) / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(rrectBox(0.008, 0.032, 0.105), 'aluminum', [x0 + 0.004, 0, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.006, 0.006), 'chrome', [x0 + 0.011, 0, s * 0.043]);
    b.add(cylX(0.016, 0.02, 20), 'aluminum', [x0 - 0.008, 0, 0]);
    b.add(latheX([[0.0001, x0 + 0.008], [R * 0.85, x0 + 0.008], [R * 0.85, x0 + L * 0.58], [R, x0 + L * 0.62], [R, x0 + L * 0.82], [R * 0.75, L / 2 - 0.004], [0.0001, L / 2]], 28), 'aluminum');
    b.add(box(0.03, 0.028, 0.022, 0.004), 'black', [x0 + L * 0.42, 0, R * 0.95]);
    b.add(box(0.016, 0.016, 0.014, 0.002), 'plastic', [x0 + L * 0.48, 0, R * 1.35]);
    b.add(cylY(0.0055, 0.03, 12), 'steel', [x0 + L * 0.7, R + 0.01, 0]);
    b.add(hexY(0.008, 0.008), 'steel', [x0 + L * 0.7, R + 0.022, 0]);
    b.add(cylY(0.0055, 0.03, 12), 'steel', [x0 + L * 0.55, -R - 0.01, 0]);
    return b.build();
  },

  engine_hpfpFollower(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.5, -L / 2 + 0.008], [R, -L / 2 + 0.008], [R, L / 2], [R * 0.4, L / 2]], 24), 'machined');
    b.add(cylY(0.0085, 0.011, 16), 'steel', [-L / 2 + 0.0085, 0, 0]);
    return b.build();
  },

  engine_diInjector(L, D) {
    // canonical +X = up towards the rail; tip at -X
    const R = D / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(cylX(0.0038, 0.02, 12), 'stainless', [x0 + 0.01, 0, 0]);
    b.add(latheX([[0.0038, x0 + 0.02], [R * 0.8, x0 + 0.024], [R * 0.8, x0 + 0.04], [R, x0 + 0.044], [R, L / 2 - 0.012], [R * 0.75, L / 2 - 0.008], [R * 0.75, L / 2], [0.0001, L / 2]], 14), 'black');
    b.add(torusX(R * 0.75, 0.0012, 4, 14), 'rubber', [L / 2 - 0.004, 0, 0]);
    b.add(box(0.016, 0.012, 0.014, 0.002), 'plastic', [L / 2 - 0.022, 0, R + 0.006]);
    return b.build();
  },

  engine_injSeal(L, D) {
    const R = Math.max(L, D) / 2;
    const b = new PartBuilder();
    b.add(ringX(R * 0.62, R * 0.45, 0.003, 12), 'cage', [-0.002, 0, 0]);
    b.add(torusX(R * 0.9, 0.0011, 4, 14), 'rubber', [0.004, 0, 0]);
    b.add(ringX(R * 0.95, R * 0.8, 0.0015, 12), 'black', [0.0065, 0, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- ignition
  engine_sparkPlug(L, D) {
    // canonical -X = electrode (in the chamber), +X = terminal
    const x0 = -L / 2;
    const b = new PartBuilder();
    b.add(box(0.002, 0.003, 0.0015, 0), 'steel', [x0 + 0.001, 0.0012, 0]);
    b.add(cylX(0.007, 0.0195, 14), 'steel', [x0 + 0.0115, 0, 0]);
    b.add(hexX(0.0094, 0.012), 'chrome', [x0 + 0.028, 0, 0]);
    b.add(latheX([[0.0075, x0 + 0.034], [0.0065, x0 + 0.04], [0.0058, L / 2 - 0.008], [0.0045, L / 2 - 0.006], [0.0045, L / 2 - 0.003]], 18), 'cage');
    b.add(cylX(0.0035, 0.006, 10), 'steel', [L / 2 - 0.003, 0, 0]);
    return b.build();
  },

  engine_plugLead(L, D, D2, ctx) {
    // canonical +X = up the bank towards the coil; boots angle in towards the head at both ends
    const inward = -(ctx?.side || 1); // canonical Z sign that points at the head
    const b = new PartBuilder();
    const r = 0.0046;
    rodBetween(b, ROD12, 'black', V(-L / 2 + 0.014, 0, 0), V(L / 2 - 0.012, 0, 0), r * 2);
    rodBetween(b, ROD12, 'heatwrap', V(-L / 2 + 0.014, 0, 0), V(-L / 2 + 0.06, 0, 0), r * 2.9);
    // plug boot (long, into the plug tube) and coil boot
    rodBetween(b, ROD16, 'black', V(-L / 2 + 0.016, 0, 0), V(-L / 2 - 0.004, 0, inward * 0.045), 0.0145);
    rodBetween(b, ROD16, 'black', V(L / 2 - 0.014, 0, 0), V(L / 2 + 0.006, 0, inward * 0.05), 0.013);
    return b.build();
  },

  // ---------------------------------------------------------------- intake / misc
  engine_throttleBody(L, D) {
    // canonical -X = front (air inlet), +X = supercharger inlet flange. 87 mm bore, DBW motor on +Z side.
    const R = D / 2;
    const bore = 0.0435;
    const b = new PartBuilder();
    b.add(ringX(0.052, bore, L * 0.82, 44), 'machined', [-L * 0.06, 0, 0]);
    const fl = rrectShape(R * 1.8, R * 1.8, 0.012);
    fl.holes.push(circlePath(bore));
    b.add(extrudeX(fl, 0.01, 12), 'machined', [L / 2 - 0.005, 0, 0]);
    for (const [y, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) b.add(hexX(0.0055, 0.006), 'chrome', [L / 2 - 0.012, y * R * 0.74, z * R * 0.74]);
    b.add(ringX(0.0485, bore, 0.008, 40), 'machined', [-L / 2 + 0.004, 0, 0]);
    b.add(cylX(bore * 0.98, 0.0016, 36), 'machined', [0, 0, 0], [0, 0.35, 0]);
    b.add(cylY(0.004, bore * 2.2, 10), 'steel');
    b.add(box(L * 0.75, R * 1.15, 0.045, 0.012), 'black', [0, -R * 0.05, 0.052 + 0.02]);
    b.add(box(0.016, 0.022, 0.016, 0.003), 'plastic', [-L * 0.2, R * 0.45, 0.052 + 0.044]);
    return b.build();
  },

  engine_oilFilter(L, D) {
    // canonical +X = up (adapter boss on the pan), filter can hangs below
    const R = Math.min(D, 0.07) / 2, x0 = -L / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, x0], [R * 0.6, x0], [R * 0.95, x0 + 0.008], [R, x0 + 0.015], [R, L / 2 - 0.032], [R * 0.96, L / 2 - 0.028], [0.0001, L / 2 - 0.028]], 32), 'blue');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * PI * 2;
      b.add(box(0.012, 0.003, 0.003, 0), 'blue', [x0 + 0.008, Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86]);
    }
    b.add(cylX(R * 0.98, 0.004, 32), 'rubber', [L / 2 - 0.026, 0, 0]);
    b.add(latheX([[0.0001, L / 2 - 0.024], [R * 1.04, L / 2 - 0.024], [R * 1.04, L / 2 - 0.006], [R * 0.9, L / 2], [0.0001, L / 2]], 32), 'cast');
    // cooler-line port on the adapter, on the canonical +Z side (forward when the filter is mounted sideways on the pan)
    b.add(box(0.012, 0.03, 0.02, 0.004), 'cast', [L / 2 - 0.012, 0, R * 1.05]);
    return b.build();
  },

  engine_oilCap(L, D) {
    // canonical +X = up/out. Twist cap with grip ribs and oil-can symbol.
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.62, L * 0.5, 24), 'black', [-L * 0.25, 0, 0]);
    b.add(latheX([[0.0001, -L * 0.05], [R * 0.95, -L * 0.05], [R, L * 0.05], [R, L * 0.38], [R * 0.9, L / 2], [0.0001, L / 2]], 32), 'black');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      b.add(box(L * 0.4, 0.004, 0.004, 0), 'black', [L * 0.22, Math.cos(a) * R, Math.sin(a) * R]);
    }
    b.add(cylX(R * 0.45, 0.0015, 20), 'yellow', [L / 2 + 0.0005, 0, 0]);
    return b.build();
  },
};

/** Rounded rectangular plate in the YZ plane (thickness along X). */
function rrectBox(t, h, w) {
  return extrudeX(rrectShape(w, h, Math.min(w, h) * 0.3), t, 8);
}
function rubberRing(r) {
  return torusX(r, 0.0012, 6, 18);
}
function hexY(r, h) {
  return cylY(r, h, 6);
}

// ====================================================================== BOXES (world-aligned or in the primitive's rotated frame)
const boxes = {
  // ---------------------------------------------------------------- cylinder block
  engine_block(sx, sy, sz, ctx) {
    const [px, py] = ctx.pos;
    const cy = LT.crankY - py; // crank centre in local frame
    const rail = -sy / 2, W = sz / 2;
    const b = new PartBuilder();
    const bp = (h, w) => { const [y, z] = bankYZ(h, w); return [z, y - py]; };
    const dOut = bp(LT.deck, 0.075), dIn = bp(LT.deck, -0.075);
    const vy = cy + 0.185;
    const half = [[W - 0.06, rail], [W - 0.055, cy + 0.04], dOut, dIn, [0.079, vy]];
    const prof = [...half, ...half.slice().reverse().map(([z, y]) => [-z, y])];
    const L = sx - 0.02;
    b.add(extYZ(prof, L), 'cast', [-0.01, 0, 0]);
    // machined decks
    for (const s of [-1, 1]) {
      const [yy, zz] = bankYZ(LT.deck - 0.001, 0, s);
      b.add(box(L, 0.002, 0.15, 0), 'machined', [-0.01, yy - py, zz], [s * PI / 4, 0, 0]);
    }
    // pan rail flange
    b.add(box(L, 0.012, 2 * (W - 0.05), 0.003), 'cast', [-0.01, rail + 0.006, 0]);
    const mx = LT.mains.map((m) => m - px);
    for (const s of [-1, 1]) {
      // bulkhead ribs on the outside of the cylinder barrels
      for (const x of mx) rodBetween(b, ROD8, 'cast', V(x, cy + 0.03, s * (W - 0.052)), V(x, dOut[1] - 0.012, s * (dOut[0] - 0.006)), 0.02);
      // 6-bolt mains: cross (side) bolts through the skirt
      for (const x of mx) hexHead(b, [x, cy - 0.03, s * (W - 0.057)], [0, 0, s], 0.009, 0.009, 'chrome');
      // engine-mount bracket pads (3 bosses)
      for (const [dx, dy] of [[-0.035, 0.0], [0.035, 0.0], [0, -0.04]]) b.add(cylZ(0.012, 0.012, 16), 'cast', [0.02 - px + dx, cy + dy - 0.005, s * (W - 0.052)]);
      // knock-sensor bosses
      b.add(cylZ(0.016, 0.01, 18), 'cast', [0.05 - px + (s < 0 ? 0.025 : 0), 0.45 - py, s * (W - 0.035)]);
    }
    // valley cover with ribs, bolts and the DI pump boss at the rear
    b.add(box(L * 0.9, 0.012, 0.2, 0.004), 'cast', [-0.02, cy + 0.21, 0]);
    for (const z of [-0.05, 0, 0.05]) b.add(box(L * 0.82, 0.008, 0.008, 0.002), 'cast', [-0.03, cy + 0.218, z]);
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) hexHead(b, [-L * 0.42 + i * L * 0.16, cy + 0.216, s * 0.09], [0, 1, 0], 0.005, 0.005);
    b.add(cylY(0.04, 0.026, 28), 'cast', [0.3 - px, cy + 0.222, 0]);
    // bellhousing flange at the rear face (bolt ears)
    const fl = [[0.19, rail], [W, cy - 0.01], [W, cy + 0.12], [0.205, cy + 0.2], [0.11, cy + 0.235]];
    b.add(extYZ([...fl, ...fl.slice().reverse().map(([z, y]) => [-z, y])], 0.018), 'cast', [sx / 2 - 0.009, 0, 0]);
    for (const [z, y] of [[W - 0.012, cy - 0.005], [W - 0.012, cy + 0.115], [0.17, cy + 0.205], [0.165, rail + 0.012]]) {
      for (const s of [-1, 1]) b.add(cylX(0.012, 0.03, 16), 'cast', [sx / 2 - 0.015, y, s * z]);
    }
    // front face: timing-cover / water-pump bosses
    for (const [z, y] of [[0.15, cy + 0.15], [-0.15, cy + 0.15], [0.16, cy - 0.06], [-0.16, cy - 0.06]]) b.add(cylX(0.012, 0.012, 14), 'cast', [-sx / 2 + 0.004, y, z]);
    return b.build();
  },

  engine_mainCap(sx, sy, sz) {
    // nodular-iron 6-bolt main cap; journal half-bore at the top edge
    const W = sz / 2, H = sy / 2;
    const s = new THREE.Shape();
    s.moveTo(-W, H);
    s.lineTo(-W, -H + 0.012); s.lineTo(-W + 0.02, -H); s.lineTo(W - 0.02, -H); s.lineTo(W, -H + 0.012); s.lineTo(W, H);
    s.lineTo(0.0353, H);
    s.absarc(0, H, 0.0353, 0, -PI, true);
    s.closePath();
    const b = new PartBuilder().add(extrudeX(s, sx, 16), 'iron');
    for (const z of [-0.06, -0.03, 0.03, 0.06]) hexHead(b, [0, -H, z], [0, -1, 0], 0.0075, 0.009, 'chrome');
    return b.build();
  },

  engine_oilSquirter(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.4, sz, 0.002), 'steel', [0, -sy * 0.3, 0]);
    b.add(cylY(0.0018, sy * 0.9, 8), 'stainless', [0, sy * 0.1, 0], [0.4, 0, 0]);
    return b.build();
  },

  engine_rearCover(sx, sy, sz, ctx) {
    // cast rear cover with the rear main seal around the crank flange journal
    const cy = LT.crankY - ctx.pos[1];
    const sh = rrectShape(sz, sy, 0.05);
    sh.holes.push(circlePath(0.048, 0, cy));
    const b = new PartBuilder().add(extrudeX(sh, sx, 16), 'cast');
    b.add(ringX(0.05, 0.042, sx * 1.15, 36), 'rubber', [0.001, cy, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      hexHead(b, [sx / 2, cy + Math.sin(a) * sy * 0.42, Math.cos(a) * sz * 0.42], [1, 0, 0], 0.005, 0.005);
    }
    return b.build();
  },

  // ---------------------------------------------------------------- cylinder head (rotated frame: y = bore axis, z*side = exhaust)
  engine_head(sx, sy, sz, ctx) {
    const ex = ctx.side;
    const cyl = (ex > 0 ? LT.cylL : LT.cylR).map((x) => x - ctx.pos[0]);
    const y0 = -sy / 2;
    const b = new PartBuilder();
    b.add(box(sx, 0.016, sz * 0.74, 0.003), 'cast', [0, y0 + 0.008, 0]);
    b.add(box(sx - 0.006, sy - 0.024, 0.152, 0.008), 'cast', [0, y0 + 0.014 + (sy - 0.024) / 2, 0]);
    // machined intake flange face (valley side) with tall rectangular-oval ports
    b.add(box(sx * 0.9, 0.092, 0.012, 0.003), 'cast', [0, y0 + 0.068, -ex * (sz / 2 - 0.006)]);
    for (const c of cyl) {
      b.add(box(0.058, 0.082, 0.04, 0.01), 'cast', [c, y0 + 0.068, -ex * 0.094]);
      b.add(box(0.042, 0.058, 0.003, 0.008), 'black', [c, y0 + 0.072, -ex * (sz / 2 + 0.0004)]);
      // DI injector boss under the intake port
      rodBetween(b, ROD16, 'cast', V(c, y0 + 0.017, -ex * 0.07), V(c, y0 + 0.017, -ex * 0.122), 0.022);
      b.add(cylZ(0.0075, 0.002, 12), 'black', [c, y0 + 0.017, -ex * 0.1225]);
      // exhaust port boss + flange with 2 studs
      b.add(box(0.062, 0.05, 0.05, 0.008), 'cast', [c, y0 + 0.05, ex * 0.097]);
      b.add(box(0.074, 0.062, 0.006, 0.006), 'cast', [c, y0 + 0.05, ex * (sz / 2 - 0.003)]);
      b.add(cylZ(0.0165, 0.003, 18), 'black', [c, y0 + 0.05, ex * (sz / 2 + 0.0004)], [0, 0, 0], [1, 1.22, 1]);
      for (const dx of [-0.031, 0.031]) b.add(cylZ(0.004, 0.016, 8), 'chrome', [c + dx, y0 + 0.05 + (dx > 0 ? 0.02 : -0.02), ex * (sz / 2 + 0.006)]);
      // spark-plug tube boss between exhaust ports
      const pa = V(c - 0.042, y0 + 0.012, ex * 0.03), pb = V(c - 0.042, y0 + 0.012 + 0.044, ex * (0.03 + 0.076));
      rodBetween(b, ROD16, 'cast', pa, pb, 0.026);
      rodBetween(b, ROD12, 'black', pb.clone().lerp(pa, 0.04), pb.clone().lerp(pa, -0.02), 0.016);
    }
    // valve-cover rail
    b.add(box(sx - 0.01, 0.008, 0.012, 0.002), 'machined', [0, sy / 2 - 0.004, 0.094]);
    b.add(box(sx - 0.01, 0.008, 0.012, 0.002), 'machined', [0, sy / 2 - 0.004, -0.094]);
    for (const s of [-1, 1]) b.add(box(0.012, 0.008, 0.2, 0.002), 'machined', [s * (sx / 2 - 0.011), sy / 2 - 0.004, 0]);
    // rocker pedestal rail and head-bolt bosses (inside the rocker cover)
    b.add(box(sx * 0.86, 0.012, 0.028, 0.003), 'cast', [0, sy / 2 - 0.012, -ex * 0.035]);
    // end bosses: coolant ports and lift points
    for (const s of [-1, 1]) {
      b.add(cylX(0.014, 0.012, 16), 'cast', [s * (sx / 2 + 0.004), y0 + 0.045, -ex * 0.03]);
      b.add(box(0.014, 0.03, 0.03, 0.004), 'cast', [s * (sx / 2 + 0.005), sy / 2 - 0.03, ex * 0.04]);
    }
    return b.build();
  },

  engine_headGasket(sx, sy, sz, ctx) {
    const cyl = (ctx.side > 0 ? LT.cylL : LT.cylR).map((x) => x - ctx.pos[0]);
    const sh = rrectShape(sx, sz, 0.01);
    for (const c of cyl) sh.holes.push(circlePath(0.053, c, 0));
    for (const c of [...cyl.map((v) => v - 0.056), cyl[3] + 0.056]) for (const z of [-0.07, 0.07]) sh.holes.push(circlePath(0.006, c, z));
    const b = new PartBuilder().add(extY(sh, Math.max(sy, 0.0015), 14), 'steel');
    for (const c of cyl) b.add(ringX(0.0555, 0.053, Math.max(sy, 0.0015) * 1.4, 36), 'black', [c, 0, 0], [0, 0, PI / 2]);
    return b.build();
  },

  // ---------------------------------------------------------------- valve covers (rotated frame like the head)
  engine_valveCover(sx, sy, sz, ctx) {
    const ex = ctx.side;
    const cyl = (ex > 0 ? LT.cylL : LT.cylR).map((x) => x - ctx.pos[0]);
    const b = new PartBuilder();
    const y0 = -sy / 2;
    b.add(box(sx + 0.006, 0.008, sz + 0.006, 0.004), 'black', [0, y0 + 0.004, 0]);
    b.add(box(sx - 0.01, sy * 0.5, sz * 0.9, 0.02), 'black', [0, y0 + 0.008 + sy * 0.25, 0]);
    const ry = sy * 0.42, cyy = sy / 2 - ry;
    b.add(cylX(0.5, sx - 0.06, 32), 'black', [0, cyy, 0], [0, 0, 0], [1, ry * 2, sz * 0.86]);
    for (const s of [-1, 1]) b.add(sphere(0.5, 18, 10), 'black', [s * (sx - 0.06) / 2, cyy, 0], [0, 0, 0], [0.06, ry * 2, sz * 0.86]);
    // coil mounting pads along the outer side
    for (const c of cyl) b.add(box(0.05, 0.01, 0.05, 0.003), 'black', [c, sy / 2 - 0.002, ex * 0.055]);
    // perimeter bolts
    for (let i = 0; i < 5; i++) {
      const x = -sx / 2 + 0.03 + (i * (sx - 0.06)) / 4;
      for (const s of [-1, 1]) hexHead(b, [x, y0 + 0.008, s * (sz / 2 - 0.004)], [0, 1, 0], 0.0055, 0.006);
    }
    if (ex > 0) b.add(cylY(0.027, 0.018, 28), 'black', [-sx / 2 + 0.07, sy / 2 + 0.002, -ex * 0.04]);
    else rodBetween(b, ROD12, 'black', V(sx / 2 - 0.08, sy / 2 - 0.004, -0.02), V(sx / 2 - 0.08, sy / 2 + 0.018, -0.03), 0.014);
    return b.build();
  },

  engine_vcGasket(sx, sy, sz) {
    const t = Math.max(sy, 0.003);
    const sh = rrectShape(sx, sz, 0.03);
    sh.holes.push(rrectPath(sx - 0.012, sz - 0.012, 0.026));
    return new PartBuilder().add(extY(sh, t, 12), 'rubber').build();
  },

  // ---------------------------------------------------------------- rotating assembly
  engine_rod(sx, sy, sz) {
    // rotated frame: local y = rod axis (big end at -y). 6.098 in c-c, 2.225 in big-end bore.
    const yb = -sy / 2 + 0.035, ys = yb + 0.1549;
    const t = Math.min(sx, 0.024);
    const b = new PartBuilder();
    b.add(ringX(0.035, 0.0283, t, 32), 'steel', [0, yb, 0]);
    b.add(ringX(0.017, 0.0122, t * 0.92, 24), 'steel', [0, ys, 0]);
    b.add(extYZ([[0.024, yb + 0.026], [0.011, ys - 0.013], [-0.011, ys - 0.013], [-0.024, yb + 0.026]], t * 0.4), 'steel');
    for (const s of [-1, 1]) {
      rodBetween(b, ROD8, 'steel', V(0, yb + 0.03, s * 0.02), V(0, ys - 0.015, s * 0.0095), t);
      rodBetween(b, ROD12, 'steel', V(0, yb - 0.034, s * 0.0275), V(0, yb + 0.004, s * 0.0275), 0.009);
      hexHead(b, [0, yb - 0.034, s * 0.0275], [0, -1, 0], 0.0055, 0.006, 'black');
    }
    b.add(box(t * 1.02, 0.0012, 0.072, 0), 'black', [0, yb, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- valvetrain
  engine_camRetainer(sx, sy, sz) {
    const sh = rrectShape(sz, sy, 0.012);
    sh.holes.push(circlePath(0.024));
    const b = new PartBuilder().add(extrudeX(sh, Math.max(sx, 0.003), 16), 'steel');
    for (const [y, z] of [[0.028, 0.038], [0.028, -0.038], [-0.028, 0.038], [-0.028, -0.038]]) hexHead(b, [-sx / 2, y, z], [-1, 0, 0], 0.005, 0.005, 'chrome');
    return b.build();
  },

  engine_phaserLimiter(sx, sy, sz) {
    const b = new PartBuilder().add(box(sx, sy, sz, 0.002), 'gold');
    hexHead(b, [-sx / 2, 0, 0], [-1, 0, 0], 0.004, 0.003);
    return b.build();
  },

  engine_timingChain(sx, sy, sz, ctx) {
    const py = ctx.pos[1];
    const cam = { c: [0, LT.camY - py], r: 0.0577, s: 1 };
    const crank = { c: [0, LT.crankY - py], r: 0.029, s: 1 };
    const loop = wrapLoop([crank, cam], 0.08).map(([u, v]) => V(0, v, u));
    const curve = new THREE.CatmullRomCurve3(loop, true, 'centripetal', 0.5);
    const len = curve.getLength(), pitch = 0.009525;
    const n = Math.round(len / pitch);
    const b = new PartBuilder();
    for (let i = 0; i < n; i++) {
      const p0 = curve.getPointAt(i / n), p1 = curve.getPointAt((i + 1) / n);
      for (const dx of [-0.0045, 0.0045]) barBetween(b, V(dx, p0.y, p0.z), V(dx, p1.y, p1.z), 0.0013, i % 2 ? 'steel' : 'machined');
      rodBetween(b, ROD8, 'machined', V(-0.004, p0.y, p0.z), V(0.004, p0.y, p0.z), 0.0063);
    }
    return b.build();
  },

  engine_chainTensioner(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    b.add(box(sx * 0.35, sy * 0.95, sz * 0.4, 0.002), 'steel', [sx * 0.3, 0, -sz * 0.25]);
    b.add(box(sx * 0.65, sy, sz * 0.3, 0.003), 'black', [-sx * 0.1, 0, sz * 0.32]);
    b.add(tubeAlong(new Helix(0.004, sy * 0.4, 5), 0.0008, 50, 5), 'spring', [-sx * 0.1, 0, -sz * 0.05], [0, 0, PI / 2]);
    for (const y of [-sy * 0.35, sy * 0.35]) hexHead(b, [-sx / 2, y, -sz * 0.25], [-1, 0, 0], 0.005, 0.005);
    return b.build();
  },

  engine_chainGuide(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.6, sy, sz * 0.5, 0.003), 'black', [0, 0, -sz * 0.2]);
    b.add(box(sx * 0.4, sy * 0.9, sz * 0.4, 0.002), 'steel', [sx * 0.3, 0, sz * 0.2]);
    for (const y of [-sy * 0.35, sy * 0.35]) hexHead(b, [-sx / 2, y, 0], [-1, 0, 0], 0.005, 0.005);
    return b.build();
  },

  engine_lifterTray(sx, sy, sz, ctx) {
    // holds 4 lifters; rotated so local y = lifter axis
    const xs = valveXs(ctx.side > 0 ? LT.cylL : LT.cylR).map((x) => x - ctx.pos[0]).filter((x) => Math.abs(x) < sx / 2 + 0.01);
    const b = new PartBuilder();
    for (const x of xs) b.add(ringX(0.0128, 0.0108, sy, 20), 'black', [x, 0, 0], [0, 0, PI / 2]);
    for (const s of [-1, 1]) b.add(box(sx, sy * 0.7, 0.003, 0), 'black', [0, 0, s * 0.0125]);
    hexHead(b, [0, sy / 2, 0], [0, 1, 0], 0.005, 0.004);
    return b.build();
  },

  engine_vlom(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.6, sz * 0.7, 0.004), 'cast', [0, -sy * 0.2, 0]);
    for (let i = 0; i < 4; i++) {
      const x = -sx * 0.36 + i * sx * 0.24;
      b.add(cylY(0.011, sy * 1.6, 16), 'black', [x, sy * 0.3, (i % 2 ? 1 : -1) * sz * 0.18]);
    }
    b.add(box(sx * 0.9, 0.006, 0.01, 0), 'harness', [0, sy * 0.7, 0]);
    return b.build();
  },

  engine_rocker(sx, sy, sz, ctx) {
    // rotated frame: local y = bore axis, local z*side = towards the valve; pivot 1.8:1
    const s = ctx.side;
    const zp = -s * (sz / 2 - 0.002), zv = s * (sz / 2 - 0.002), zpiv = s * -0.011;
    const t = Math.min(sx, 0.014);
    const b = new PartBuilder();
    b.add(extYZ([[zp, -0.003], [zp, 0.004], [zpiv, 0.0105], [zv, 0.004], [zv, -0.004], [zpiv, -0.0095]], t), 'steel');
    b.add(cylX(0.0052, t * 0.7, 14), 'machined', [0, -0.006, zv - s * 0.003]);
    b.add(cylX(0.0085, sx, 16), 'machined', [0, 0, zpiv]);
    b.add(sphere(0.0045, 10, 8), 'machined', [0, -0.004, zp + s * 0.004]);
    b.add(box(sx * 1.4, 0.014, 0.02, 0.003), 'cast', [0, -sy / 2 - 0.004, zpiv]);
    hexHead(b, [0, 0.009, zpiv], [0, 1, 0], 0.0055, 0.006);
    return b.build();
  },

  // ---------------------------------------------------------------- mounts
  engine_mountBracket(sx, sy, sz, ctx) {
    const s = ctx.side;
    const b = new PartBuilder();
    b.add(box(sx, sy, 0.012, 0.004), 'cast', [0, 0, -s * (sz / 2 - 0.006)]);
    b.add(box(sx * 0.7, 0.012, sz * 0.6, 0.004), 'cast', [0, -sy / 2 + 0.006, s * (sz / 2 - sz * 0.3)]);
    for (const dx of [-sx * 0.35, sx * 0.35]) b.add(extYZ([[-s * (sz / 2 - 0.012), sy / 2 - 0.01], [-s * (sz / 2 - 0.012), -sy / 2], [s * sz / 2, -sy / 2], [s * sz / 2, -sy / 2 + 0.012]], 0.01), 'cast', [dx, 0, 0]);
    for (const [dx, dy] of [[-0.035, 0.0], [0.035, 0.0], [0, -0.04]]) hexHead(b, [dx, dy + 0.01, -s * (sz / 2 - 0.012)], [0, 0, s], 0.0075, 0.008);
    hexHead(b, [0, -sy / 2 + 0.012, s * (sz / 2 - sz * 0.3)], [0, 1, 0], 0.008, 0.008);
    return b.build();
  },

  // ---------------------------------------------------------------- ignition
  engine_coil(sx, sy, sz, ctx) {
    // GM D510C coil-near-plug on the valve cover: rectangular body, connector at the front end, tower down/outboard
    const ex = ctx.side;
    const b = new PartBuilder();
    b.add(box(sx * 0.9, sy * 0.72, sz * 0.82, 0.005), 'black', [0, sy * 0.1, 0]);
    b.add(box(sx * 0.18, sy * 0.4, sz * 0.5, 0.003), 'plastic', [-sx * 0.48, sy * 0.15, 0]);
    b.add(box(sx * 0.3, 0.004, sz * 0.32, 0.001), 'black', [sx * 0.33, -sy * 0.3, -ex * sz * 0.38]);
    hexHead(b, [sx * 0.33, -sy * 0.28, -ex * sz * 0.38], [0, 1, 0], 0.0045, 0.004);
    b.add(cylY(0.0105, sy * 0.38, 16), 'black', [sx * 0.15, -sy * 0.3, ex * sz * 0.22]);
    return b.build();
  },

  // ---------------------------------------------------------------- LT4 supercharger & intake
  engine_supercharger(sx, sy, sz, ctx) {
    const [px, py] = ctx.pos;
    const P = (x, y, z) => [x - px, y - py, z];
    const b = new PartBuilder();
    // intercooler tub / blower case (charge-air cooler cavities each side, lid seat on top)
    // open-topped so the two bricks show when the lid is hidden
    const tub = [[0.235, 0.766], [0.19, 0.752], [0.1, 0.725], [-0.1, 0.725], [-0.19, 0.752], [-0.235, 0.766]].map(([z, y]) => [z, y - py]);
    b.add(extYZ(tub, 0.51), 'cast', P(0.04, py, 0));
    for (const s of [-1, 1]) b.add(box(0.51, 0.112, 0.012, 0.003), 'cast', P(0.04, 0.819, s * 0.229));
    for (const x of [-0.209, 0.289]) b.add(box(0.012, 0.112, 0.47, 0.003), 'cast', P(x, 0.819, 0));
    b.add(box(0.5, 0.11, 0.058, 0.006), 'cast', P(0.04, 0.82, 0));
    for (const s of [-1, 1]) b.add(box(0.516, 0.006, 0.02, 0.002), 'machined', P(0.04, 0.872, s * 0.228));
    for (const s of [-1, 1]) {
      // longitudinal ribs on the tub sides
      for (const y of [0.81, 0.845]) b.add(box(0.48, 0.006, 0.006, 0.002), 'cast', P(0.04, y, s * 0.238));
      // runner wedge down to the head intake faces + per-runner bulges and port flanges
      const cyl = s > 0 ? LT.cylL : LT.cylR;
      const x0 = cyl[0] - 0.06, x1 = cyl[3] + 0.06;
      const wedge = [[0.088, 0.662], [0.168, 0.742], [0.125, 0.758], [0.05, 0.728]].map(([z, y]) => [s * z, y - py]);
      b.add(extYZ(wedge, x1 - x0), 'cast', P((x0 + x1) / 2, py, 0));
      for (const c of cyl) {
        rodBetween(b, ROD16, 'cast', V(...P(c, 0.75, s * 0.06)), V(...P(c, 0.702, s * 0.118)), 0.05);
        const [fy, fz] = bankYZ(0.3, -0.126, s);
        b.add(box(0.068, 0.01, 0.092, 0.004), 'cast', P(c, fy, fz), [s * 3 * PI / 4, 0, 0]);
      }
    }
    // rotor case nose + bearing snout on the drive-rotor axis, 8-rib pulley in the SC belt plane
    const ry = 0.775, rz = -0.045;
    for (const z of [-0.048, 0.048]) b.add(cylX(0.058, 0.08, 32), 'cast', P(-0.2, ry, z));
    b.add(latheX([[0.012, -0.322 - px], [0.03, -0.322 - px], [0.032, -0.3 - px], [0.05, -0.275 - px], [0.07, -0.25 - px], [0.075, -0.235 - px]], 28), 'cast', [0, ry - py, rz]);
    b.add(ribbedPulley(0.033, 0.03, 8, 0.5), 'machined', P(-0.343, ry, rz));
    b.add(hexX(0.012, 0.012), 'chrome', P(-0.362, ry, rz));
    // inlet elbow from the throttle-body flange (driver side) into the rotor inlet
    b.add(tubeAlong(curveFrom([V(...P(-0.268, 0.8, 0.1)), V(...P(-0.245, 0.795, 0.085)), V(...P(-0.215, 0.785, 0.04))]), 0.05, 16, 20), 'cast');
    b.add(rrectBox(0.012, 0.118, 0.118), 'cast', P(-0.266, 0.8, 0.1));
    // charge-air-cooler coolant ports at the front of the tub
    for (const s of [-1, 1]) {
      rodBetween(b, ROD16, 'cast', V(...P(-0.21, 0.85, s * 0.17)), V(...P(-0.245, 0.85, s * 0.17)), 0.02);
      b.add(torusX(0.0105, 0.002, 6, 16), 'cast', P(-0.24, 0.85, s * 0.17));
    }
    return b.build();
  },

  engine_icBrick(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx - 0.04, sy * 0.98, sz * 0.94, 0), 'core');
    for (const s of [-1, 1]) b.add(box(0.02, sy, sz, 0.004), 'aluminum', [s * (sx / 2 - 0.01), 0, 0]);
    for (const z of [-sz * 0.25, sz * 0.25]) rodBetween(b, ROD16, 'aluminum', V(-sx / 2, sy * 0.3, z), V(-sx / 2 - 0.03, sy * 0.3, z), 0.016);
    return b.build();
  },

  engine_scLid(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, 0.012, sz, 0.01), 'black', [0, -sy / 2 + 0.006, 0]);
    for (const s of [-1, 1]) b.add(box(sx * 0.86, sy - 0.012, 0.16, 0.022), 'black', [0, 0.006, s * 0.135]);
    b.add(box(sx * 0.8, 0.02, 0.06, 0.006), 'black', [0, -sy / 2 + 0.022, 0]);
    b.add(box(0.12, 0.003, 0.04, 0.001), 'machined', [-sx * 0.25, -sy / 2 + 0.033, 0]);
    for (let i = 0; i < 6; i++) {
      const x = -sx / 2 + 0.03 + (i * (sx - 0.06)) / 5;
      for (const s of [-1, 1]) hexHead(b, [x, -sy / 2 + 0.012, s * (sz / 2 - 0.012)], [0, 1, 0], 0.006, 0.006);
    }
    for (const s of [-1, 1]) for (const z of [-0.1, 0, 0.1]) hexHead(b, [s * (sx / 2 - 0.012), -sy / 2 + 0.012, z], [0, 1, 0], 0.006, 0.006);
    return b.build();
  },

  engine_portGasket(sx, sy, sz) {
    const t = Math.max(sy, 0.003);
    const sh = rrectShape(sx, sz, 0.012);
    sh.holes.push(rrectPath(sx - 0.016, sz - 0.016, 0.01));
    return new PartBuilder().add(extY(sh, t, 10), 'blue').build();
  },

  engine_bypass(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(cylZ(sx * 0.42, sz * 0.5, 28), 'black', [0, sy * 0.1, sz * 0.2]);
    b.add(cylZ(sx * 0.44, 0.004, 28), 'steel', [0, sy * 0.1, -sz * 0.05]);
    b.add(cylY(0.0025, sy * 0.6, 8), 'chrome', [0, -sy * 0.2, 0]);
    b.add(box(sx * 0.6, 0.004, sz * 0.4, 0), 'steel', [0, -sy * 0.45, 0]);
    rodBetween(b, ROD8, 'black', V(0, sy * 0.4, sz * 0.2), V(0.02, sy * 0.5, sz * 0.2), 0.008);
    return b.build();
  },

  engine_lt1Intake(sx, sy, sz, ctx) {
    // Gen V LT1 composite manifold: central plenum, front 87 mm throttle inlet, 8 runners to the heads
    const [px, py] = ctx.pos;
    const P = (x, y, z) => [x - px, y - py, z];
    const b = new PartBuilder();
    b.add(box(0.42, 0.085, 0.15, 0.03), 'black', P(0.04, 0.805, 0));
    for (const z of [-0.035, 0, 0.035]) b.add(box(0.36, 0.008, 0.008, 0.002), 'black', P(0.04, 0.85, z));
    b.add(cylX(0.052, 0.07, 32), 'black', P(-0.205, 0.795, 0));
    b.add(rrectBox(0.01, 0.12, 0.12), 'black', P(-0.235, 0.795, 0));
    b.add(box(0.03, 0.02, 0.024, 0.004), 'plastic', P(0.22, 0.855, 0.03));
    for (const s of [-1, 1]) {
      const cyl = s > 0 ? LT.cylL : LT.cylR;
      const wedge = [[0.088, 0.662], [0.168, 0.742], [0.13, 0.758], [0.07, 0.73]].map(([z, y]) => [s * z, y - py]);
      b.add(extYZ(wedge, cyl[3] - cyl[0] + 0.12), 'black', P((cyl[0] + cyl[3]) / 2, py, 0));
      for (const c of cyl) {
        const pts = [V(...P(c, 0.81, s * 0.06)), V(...P(c, 0.845, s * 0.115)), V(...P(c, 0.8, s * 0.16)), V(...P(c, 0.735, s * 0.135))];
        b.add(tubeAlong(curveFrom(pts), 0.024, 18, 12), 'black');
        const [fy, fz] = bankYZ(0.3, -0.126, s);
        b.add(box(0.066, 0.01, 0.09, 0.004), 'black', P(c, fy, fz), [s * 3 * PI / 4, 0, 0]);
      }
    }
    return b.build();
  },

  engine_pcv(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, 0.004), 'black');
    rodBetween(b, ROD12, 'black', V(sx * 0.3, sy * 0.4, 0), V(sx * 0.3, sy * 0.4 + 0.02, 0.012), 0.012);
    b.add(cylY(0.007, sy * 0.4, 12), 'blue', [-sx * 0.25, sy * 0.6, 0]);
    return b.build();
  },

  // ---------------------------------------------------------------- front cover / oil system
  engine_frontCover(sx, sy, sz, ctx) {
    const [px, py] = ctx.pos;
    const out = [[0.125, 0.315], [0.145, 0.36], [0.142, 0.44], [0.112, 0.53], [0.088, 0.598], [0.045, 0.634], [-0.03, 0.64], [-0.078, 0.622], [-0.112, 0.578], [-0.136, 0.5], [-0.146, 0.4], [-0.132, 0.34], [-0.112, 0.315]].map(([z, y]) => [z, y - py]);
    const b = new PartBuilder();
    b.add(extYZ(out, sx * 0.75, 12), 'cast', [sx * 0.125, 0, 0]);
    // front face: slightly smaller raised panel
    const inner = out.map(([z, y]) => [z * 0.9, (y - (0.475 - py)) * 0.9 + (0.475 - py)]);
    b.add(extYZ(inner, sx * 0.25, 12), 'cast', [-sx * 0.375, 0, 0]);
    const cyC = LT.crankY - py, cyM = LT.camY - py;
    b.add(ringX(0.05, 0.036, 0.016, 36), 'cast', [-sx / 2 - 0.002, cyC, 0]);
    b.add(cylX(0.026, 0.012, 24), 'cast', [-sx / 2 - 0.002, cyM, 0]);
    // radial ribs
    for (const [z, y] of [[0.12, cyC + 0.07], [-0.12, cyC + 0.07], [0.1, cyC - 0.06], [-0.1, cyC - 0.06]]) rodBetween(b, ROD8, 'cast', V(-sx / 2 + 0.002, cyC + Math.sign(y - cyC) * 0.04, Math.sign(z) * 0.03), V(-sx / 2 + 0.002, y, z), 0.01);
    // CMP sensor boss (passenger side, above the phaser)
    b.add(cylX(0.016, 0.014, 16), 'cast', [-sx / 2 - 0.004, 0.58 - py, -0.06]);
    // perimeter bolts
    out.forEach(([z, y], i) => { if (i % 2 === 0) hexHead(b, [-sx / 2 + 0.006, y + (y > 0 ? -0.012 : 0.012), z * 0.9], [-1, 0, 0], 0.0055, 0.006); });
    return b.build();
  },

  engine_oilPump(sx, sy, sz, ctx) {
    const cy = LT.crankY - ctx.pos[1];
    const sh = new THREE.Shape();
    sh.absarc(0, cy, 0.068, PI * 0.15, PI * 0.85, false);
    sh.lineTo(-0.05, -sy / 2);
    sh.lineTo(0.03, -sy / 2);
    sh.closePath();
    sh.holes.push(circlePath(0.026, 0, cy));
    const b = new PartBuilder().add(extrudeX(sh, sx, 24), 'cast');
    b.add(cylY(0.02, 0.03, 16), 'cast', [0, -sy / 2 + 0.01, -0.01]);
    for (const a of [0.3, 1.2, 1.95, 2.85]) hexHead(b, [-sx / 2, cy + Math.sin(a) * 0.052, Math.cos(a) * 0.052], [-1, 0, 0], 0.005, 0.005);
    b.add(box(sx * 0.5, 0.03, 0.02, 0.003), 'machined', [0, cy - 0.06, 0.06]);
    return b.build();
  },

  engine_windage(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, Math.max(sy * 0.4, 0.002), sz, 0.002), 'steel');
    for (let i = 0; i < 9; i++) for (const z of [-sz * 0.3, 0, sz * 0.3]) b.add(box(0.03, 0.004, 0.012, 0), 'black', [-sx * 0.4 + i * sx * 0.1, 0.0015, z], [0, 0, 0.5]);
    for (const s of [-1, 1]) b.add(box(sx * 0.95, sy, 0.004, 0), 'steel', [0, sy * 0.3, s * sz / 2]);
    return b.build();
  },

  engine_oilPan(sx, sy, sz, ctx) {
    // ZL1 wet-sump pan: cast aluminium, shallow front over the steering rack, deep centre sump with ribs,
    // rear stepped up over the cradle rear crossmember (x 0.29-0.35, top y 0.215)
    const [px, py] = ctx.pos;
    const top = sy / 2, bot = -sy / 2, yf = top - 0.035;
    const x1 = 0.0 - px, x2 = 0.07 - px, x3 = 0.255 - px, x4 = 0.28 - px, yr = 0.226 - py;
    const prof = new THREE.Shape();
    [[-sx / 2, top - 0.01], [-sx / 2, yf + 0.012], [-sx / 2 + 0.014, yf], [x1, yf], [x2, bot + 0.004], [x3, bot], [x4, yr], [sx / 2 - 0.02, yr], [sx / 2 - 0.004, yr + 0.02], [sx / 2 - 0.004, top - 0.01]].forEach(([x, y], i) => (i ? prof.lineTo(x, y) : prof.moveTo(x, y)));
    prof.closePath();
    const b = new PartBuilder();
    b.add(extZ(prof, sz - 0.03, 8, 0.008), 'cast');
    b.add(box(sx, 0.012, sz, 0.004), 'cast', [0, top - 0.006, 0]);
    for (const z of [-0.1, -0.05, 0, 0.05, 0.1]) b.add(box(x3 - x2 - 0.02, 0.006, 0.006, 0.002), 'cast', [(x2 + x3) / 2, bot + 0.002, z]);
    hexHead(b, [0.2 - px, bot + 0.004, -0.05], [0, -1, 0], 0.009, 0.006);
    // driver-side wall: oil filter adapter pad (x 0.14) and oil level/temp sensor boss (x 0.25)
    b.add(cylZ(0.03, 0.008, 24), 'cast', [0.14 - px, 0.229 - py, sz / 2 - 0.011]);
    b.add(cylZ(0.016, 0.008, 18), 'cast', [0.25 - px, 0.228 - py, sz / 2 - 0.019]);
    for (let i = 0; i < 8; i++) {
      const x = -sx / 2 + 0.02 + (i * (sx - 0.04)) / 7;
      for (const s of [-1, 1]) hexHead(b, [x, top - 0.012, s * (sz / 2 - 0.008)], [0, -1, 0], 0.0055, 0.006);
    }
    return b.build();
  },

  engine_tmap(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.9, sy * 0.5, sz * 0.75, 0.003), 'black', [0, sy * 0.1, 0]);
    b.add(box(sx * 0.4, sy * 0.45, sz * 0.5, 0.002), 'plastic', [-sx * 0.35, sy * 0.25, 0]);
    b.add(cylY(0.006, sy * 0.4, 12), 'black', [sx * 0.15, -sy * 0.3, 0]);
    hexHead(b, [sx * 0.35, sy * 0.35, sz * 0.3], [0, 1, 0], 0.004, 0.003);
    return b.build();
  },
};

// ====================================================================== PATHS
const paths = {
  engine_belt(pts, r, ctx) {
    const m = ctx?.m || {};
    const sc = ctx?.variant === 'sc';
    const width = sc ? 0.028 : 0.021;
    const b = new PartBuilder();
    if (Array.isArray(m.pulleys) && m.pulleys.length >= 2) {
      const x = pts[0].x;
      const pul = m.pulleys.map(([y, z, rr, s]) => ({ c: [z, y], r: rr + 0.0025, s }));
      const loop = wrapLoop(pul, 0.1).map(([u, v]) => V(x, v, u));
      b.add(bandGeo(loop, width, 0.005), 'rubber');
      // supercharger belt carries its own spring tensioner (backside pulleys drawn here)
      if (sc) for (const [y, z, rr, s] of m.pulleys) if (s < 0) {
        b.add(smoothPulley(rr, 0.03), 'steel', [x, y, z]);
        b.add(cylX(rr * 0.42, 0.032, 18), 'black', [x, y, z]);
        b.add(hexX(rr * 0.22, 0.006), 'chrome', [x - 0.018, y, z]);
        barBetween(b, V(x + 0.018, y, z), V(x + 0.018, y - 0.05, z + 0.04), 0.016, 'cast');
        b.add(cylX(0.03, 0.03, 24), 'cast', [x + 0.03, y - 0.05, z + 0.04]);
      }
    } else {
      b.add(ribbonAlong(curveFrom(pts), width, 0.005), 'rubber');
    }
    return b.build();
  },

  engine_fuelRail(pts, r, ctx) {
    const pi = ctx?.variant === 'pi';
    const s = Math.sign(pts[0].z) || 1;
    const cyl = s > 0 ? LT.cylL : LT.cylR;
    const b = new PartBuilder();
    const rr = pi ? 0.009 : 0.0105;
    b.add(tubeAlong(curveFrom(pts), rr, pts.length > 2 ? 64 : null, 14), pi ? 'red' : 'stainless');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const d = V().subVectors(p, q).normalize();
      b.addMatrix(HEX, pi ? 'blue' : 'steel', alignX(p, p.clone().addScaledVector(d, 0.012), rr * 2.4));
    }
    // injectors sit along the straight run; with 4+ points the first/last legs are end fittings turning into their bosses
    const a = pts.length >= 4 ? pts[1] : pts[0], z = pts.length >= 4 ? pts[pts.length - 2] : pts[pts.length - 1];
    const at = (x) => { const t = clamp((x - a.x) / (z.x - a.x || 1e-6), 0, 1); return a.clone().lerp(z, t); };
    for (const c of cyl) {
      const p = at(c);
      if (pi) {
        // port injector (EV14 compact) angled 25 deg down/in from the rail into its boss on the blower-case
        // runner flank. The flank (runner wedge + runner bulges, see engine_supercharger) is the 45-degree
        // plane s*z = y - 0.571, so the nozzle runs on until its tip sits on that face.
        const th = 25 * D2R, d = V(0, -Math.sin(th), -s * Math.cos(th));
        const at2 = (t) => p.clone().addScaledVector(d, t);
        const tip = clamp((s * p.z - p.y + 0.571) / (Math.cos(th) - Math.sin(th)), 0.04, 0.08);
        rodBetween(b, ROD16, 'red', at2(0.004), at2(0.016), 0.016);
        rodBetween(b, ROD16, 'black', at2(0.016), at2(0.034), 0.0135);
        rodBetween(b, ROD12, 'blue', at2(0.03), at2(0.034), 0.0155);
        rodBetween(b, ROD12, 'steel', at2(0.034), at2(tip), 0.008);
      } else {
        // injector cup angled down/out towards the head, plus a hold-down boss
        const d = V(0, -S2, s * S2);
        rodBetween(b, ROD16, 'stainless', p, p.clone().addScaledVector(d, 0.022), 0.019);
        b.add(box(0.02, 0.012, 0.022, 0.003), 'stainless', [p.x + 0.03, p.y + 0.008, p.z]);
        hexHead(b, [p.x + 0.03, p.y + 0.014, p.z], [0, 1, 0], 0.0055, 0.006);
      }
    }
    return b.build();
  },

  engine_hpLine(pts, r) {
    const b = new PartBuilder();
    b.add(tubeAlong(curveFrom(pts), Math.max(0.0032, r * 0.8), null, 10), 'stainless');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const d = V().subVectors(q, p).normalize();
      b.addMatrix(HEX, 'steel', alignX(p, p.clone().addScaledVector(d, 0.014), 0.017));
    }
    return b.build();
  },

  engine_fuelHose(pts, r) {
    const b = new PartBuilder();
    b.add(tubeAlong(curveFrom(pts), Math.max(0.005, r), null, 10), 'black');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const d = V().subVectors(q, p).normalize();
      b.addMatrix(ROD16, 'cage', alignX(p, p.clone().addScaledVector(d, 0.03), 0.02));
      b.addMatrix(ROD16, 'plastic', alignX(p.clone().addScaledVector(d, 0.012), p.clone().addScaledVector(d, 0.02), 0.024));
    }
    return b.build();
  },

  engine_pickup(pts, r) {
    const b = new PartBuilder();
    const rr = Math.max(0.011, r * 0.8);
    b.add(tubeAlong(curveFrom(pts), rr, null, 12), 'steel');
    const p0 = pts[0];
    b.add(box(0.008, 0.05, 0.026, 0.004), 'steel', [p0.x, p0.y, p0.z]);
    for (const s of [-1, 1]) hexHead(b, [p0.x - 0.004, p0.y + s * 0.018, p0.z], [-1, 0, 0], 0.005, 0.005);
    // the path ends at the screen: the tube drops into the top of the oval screen housing, whose
    // mesh face sits ~2 mm under the path end (so the end point is the pickup's foot above the pan floor)
    const pe = pts[pts.length - 1];
    b.add(cylY(0.5, 0.012, 28), 'steel', [pe.x, pe.y + 0.006, pe.z], [0, 0, 0], [0.11, 1, 0.08]);
    b.add(cylY(0.5, 0.002, 28), 'black', [pe.x, pe.y - 0.001, pe.z], [0, 0, 0], [0.1, 1, 0.07]);
    return b.build();
  },

  engine_dipstick(pts, r) {
    const b = new PartBuilder();
    b.add(tubeAlong(curveFrom(pts), Math.max(0.005, r * 0.75), null, 10), 'black');
    const pe = pts[pts.length - 1], pq = pts[pts.length - 2];
    const d = V().subVectors(pe, pq).normalize();
    const top = pe.clone().addScaledVector(d, 0.012);
    b.addMatrix(ROD16, 'black', alignX(pe, top, 0.016));
    b.add(torusX(0.016, 0.004, 8, 24), 'yellow', [top.x, top.y + 0.018, top.z], [0, PI / 2, 0]);
    return b.build();
  },
};

export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules: [
    [/^engine\.block\.cylinder-block$/, 'engine_block', { usesPos: true }],
    [/^engine\.block\.main-caps$/, 'engine_mainCap'],
    [/^engine\.block\.main-bearings$/, 'engine_bearingShell', { variant: 'main' }],
    [/^engine\.block\.cam-bearings$/, 'engine_camBearing'],
    [/^engine\.block\.head-dowels$/, 'engine_dowel'],
    [/^engine\.block\.oil-galley-plugs$/, 'engine_galleyPlug'],
    [/^engine\.block\.coolant-plugs$/, 'engine_corePlug'],
    [/^engine\.block\.piston-oil-squirters$/, 'engine_oilSquirter'],
    [/^engine\.block\.rear-cover-and-seal$/, 'engine_rearCover', { usesPos: true }],
    [/^engine\.block\.cylinder-liners$/, 'engine_liner'],
    [/^engine\.cylinder-heads\.cylinder-head$/, 'engine_head', { usesPos: true }],
    [/^engine\.cylinder-heads\.head-gasket$/, 'engine_headGasket', { usesPos: true }],
    [/^engine\.cylinder-heads\.head-fasteners$/, 'engine_headBolt'],
    [/^engine\.cylinder-heads\.intake-valves$/, 'engine_valve', { variant: 'intake' }],
    [/^engine\.cylinder-heads\.exhaust-valves$/, 'engine_valve', { variant: 'exhaust' }],
    [/^engine\.cylinder-heads\.valve-springs$/, 'engine_valveSpring'],
    [/^engine\.cylinder-heads\.valve-stem-seals$/, 'engine_stemSeal'],
    [/^engine\.engine-mounts\.engine-mount$/, 'engine_mount'],
    [/^engine\.engine-mounts\.block-brackets$/, 'engine_mountBracket'],
    [/^engine\.engine-sensors\.crank-position-sensor$/, 'engine_ckp'],
    [/^engine\.engine-sensors\.cam-position-sensor$/, 'engine_cmp'],
    [/^engine\.engine-sensors\.knock-sensors$/, 'engine_knock'],
    [/^engine\.engine-sensors\.oil-pressure-sensor$/, 'engine_oilPressure'],
    [/^engine\.engine-sensors\.oil-level-temp-sensor$/, 'engine_oilLevel'],
    [/^engine\.engine-sensors\.coolant-temp-sensor$/, 'engine_ect'],
    [/^engine\.engine-sensors\.boost-tmap-sensors$/, 'engine_tmap'],
    [/^engine\.engine-sensors\.fuel-rail-pressure-sensor$/, 'engine_railSensor'],
    [/^engine\.flexplate-flywheel-interface\.crank-flange$/, 'engine_crankFlange'],
    [/^engine\.flexplate-flywheel-interface\.pilot-bearing$/, 'engine_pilotBearing'],
    [/^engine\.flexplate-flywheel-interface\.bellhousing-dowels$/, 'engine_dowel'],
    [/^engine\.front-cover-and-balancer\.front-cover$/, 'engine_frontCover', { usesPos: true }],
    [/^engine\.front-cover-and-balancer\.front-crank-seal$/, 'engine_lipSeal'],
    [/^engine\.front-cover-and-balancer\.harmonic-balancer$/, 'engine_balancer'],
    [/^engine\.front-cover-and-balancer\.balancer-bolt$/, 'engine_balancerBolt'],
    [/^engine\.fuel-injection\.hp-fuel-pump$/, 'engine_hpfp'],
    [/^engine\.fuel-injection\.hpfp-follower$/, 'engine_hpfpFollower'],
    [/^engine\.fuel-injection\.lp-feed-connection$/, 'engine_fuelHose'],
    [/^engine\.fuel-injection\.hp-feed-line$/, 'engine_hpLine'],
    [/^engine\.fuel-injection\.di-fuel-rails$/, 'engine_fuelRail'],
    [/^engine\.fuel-injection\.di-injectors$/, 'engine_diInjector'],
    [/^engine\.fuel-injection\.injector-seals$/, 'engine_injSeal'],
    [/^engine\.fuel-injection\.port-injection-kit$/, 'engine_fuelRail', { variant: 'pi' }],
    [/^engine\.ignition\.ignition-coils$/, 'engine_coil'],
    [/^engine\.ignition\.spark-plugs$/, 'engine_sparkPlug'],
    [/^engine\.ignition\.plug-wires$/, 'engine_plugLead', { usesPos: true }],
    [/^engine\.intake-manifold\.supercharger-assembly$/, 'engine_supercharger', { usesPos: true }],
    [/^engine\.intake-manifold\.port-gaskets$/, 'engine_portGasket'],
    [/^engine\.intake-manifold\.intercooler-bricks$/, 'engine_icBrick'],
    [/^engine\.intake-manifold\.supercharger-lid$/, 'engine_scLid'],
    [/^engine\.intake-manifold\.bypass-actuator$/, 'engine_bypass'],
    [/^engine\.intake-manifold\.throttle-body$/, 'engine_throttleBody'],
    [/^engine\.intake-manifold\.na-intake-manifold$/, 'engine_lt1Intake', { usesPos: true }],
    [/^engine\.intake-manifold\.pcv-system$/, 'engine_pcv'],
    [/^engine\.oil-pan-and-pickup\.oil-pump$/, 'engine_oilPump', { usesPos: true }],
    [/^engine\.oil-pan-and-pickup\.oil-pickup$/, 'engine_pickup'],
    [/^engine\.oil-pan-and-pickup\.windage-tray$/, 'engine_windage'],
    [/^engine\.oil-pan-and-pickup\.wet-sump-oil-pan$/, 'engine_oilPan', { usesPos: true }],
    [/^engine\.oil-pan-and-pickup\.oil-filter-adapter$/, 'engine_oilFilter'],
    [/^engine\.oil-pan-and-pickup\.dipstick-and-fill$/, 'engine_dipstick'],
    [/^engine\.rotating-assembly\.crankshaft$/, 'engine_crank', { usesPos: true }],
    [/^engine\.rotating-assembly\.connecting-rods$/, 'engine_rod'],
    [/^engine\.rotating-assembly\.pistons$/, 'engine_piston'],
    [/^engine\.rotating-assembly\.piston-rings$/, 'engine_rings'],
    [/^engine\.rotating-assembly\.wrist-pins$/, 'engine_wristPin'],
    [/^engine\.rotating-assembly\.rod-bearings$/, 'engine_bearingShell', { variant: 'rod' }],
    [/^engine\.rotating-assembly\.reluctor-wheel$/, 'engine_reluctor'],
    [/^engine\.rotating-assembly\.crank-sprocket$/, 'engine_sprocket'],
    [/^engine\.valve-covers\.valve-cover$/, 'engine_valveCover', { usesPos: true }],
    [/^engine\.valve-covers\.valve-cover-gasket$/, 'engine_vcGasket'],
    [/^engine\.valve-covers\.oil-fill-cap-and-breathers$/, 'engine_oilCap'],
    [/^engine\.valvetrain\.camshaft$/, 'engine_camshaft', { usesPos: true }],
    [/^engine\.valvetrain\.cam-retainer-plate$/, 'engine_camRetainer'],
    [/^engine\.valvetrain\.cam-phaser$/, 'engine_phaser'],
    [/^engine\.valvetrain\.phaser-center-bolt$/, 'engine_phaserBolt'],
    [/^engine\.valvetrain\.vvt-solenoid$/, 'engine_vvtSolenoid'],
    [/^engine\.valvetrain\.phaser-limiter$/, 'engine_phaserLimiter'],
    [/^engine\.valvetrain\.timing-chain$/, 'engine_timingChain', { usesPos: true }],
    [/^engine\.valvetrain\.chain-tensioner$/, 'engine_chainTensioner'],
    [/^engine\.valvetrain\.chain-guide$/, 'engine_chainGuide'],
    [/^engine\.valvetrain\.lifters$/, 'engine_lifter'],
    [/^engine\.valvetrain\.lifter-trays$/, 'engine_lifterTray', { usesPos: true }],
    [/^engine\.valvetrain\.afm-oil-manifold$/, 'engine_vlom'],
    [/^engine\.valvetrain\.pushrods$/, 'engine_pushrod'],
    [/^engine\.valvetrain\.rocker-arms$/, 'engine_rocker'],
    [/^engine\.accessory-drive\.water-pump$/, 'engine_waterPump'],
    [/^engine\.accessory-drive\.serpentine-belt$/, 'engine_belt'],
    [/^engine\.accessory-drive\.belt-tensioner$/, 'engine_tensioner'],
    [/^engine\.accessory-drive\.idler-pulleys$/, 'engine_idler'],
    [/^engine\.accessory-drive\.alternator-mount$/, 'engine_alternator'],
    [/^engine\.accessory-drive\.ac-compressor-delete$/, 'engine_acCompressor'],
    [/^engine\.accessory-drive\.supercharger-belt$/, 'engine_belt', { variant: 'sc' }],
  ],
  axial,
  boxes,
  paths,
  whole: {},
};
