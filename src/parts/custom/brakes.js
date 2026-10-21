// Precise part models for the "brakes" group (brakes + wheels systems). See data/MODELING.md.
// Owned by one modeling pass; generator names must be prefixed "brakes_".
//
// Baseline: 2017-2024 Camaro ZL1 1LE corner —
//   front: 19x11 ET11 forged wheel, 390 x 36 mm two-piece rotor (black anodised hat, 10 floating bolts),
//          Brembo red 6-piston monobloc (2x30/2x34/2x38 mm) mounted TRAILING, ~20 deg above the axle line;
//   rear:  19x11 ET54.5 race wheel (305 tyre, see GEOM.rear), 365 x 28 mm one-piece rotor with drum-in-hat park brake,
//          Brembo red 4-piston fixed caliper, trailing.
// Calipers / pads / pins / bleeders / banjo bolts are drawn at ABSOLUTE car coordinates from GEOM below
// (generator output does not depend on the declared box), so they always straddle the rotor exactly.
// eslint-disable-next-line no-unused-vars
import * as THREE from 'three';
// eslint-disable-next-line no-unused-vars
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, Helix, curveFrom, tubeAlong, ribbonAlong, alignX, V } from '../geo.js';

const PI = Math.PI;
const D2R = PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ corner geometry (metres, left side)
export const GEOM = {
  wheelY: 0.3715,
  front: {
    wx: 0, wz: 0.776, et: 0.011, rimW: 11 * 0.0254, mount: 0.787, hubFace: 0.780,
    ringC: 0.733, ringT: 0.036, rotorR: 0.195, ringRi: 0.112, plateT: 0.011, bolts: 10,
    // rout 0.219: outer arc + 4.8 mm bevel stays >= 10 mm inside the 19 in barrel (inner r 0.2348)
    cal: { th: 20 * D2R, a: 0.70, rin: 0.118, rout: 0.2175, rb: 0.199, halfT: 0.030, padT: 0.0158, bpT: 0.006,
      padRi: 0.126, padRo: 0.194, padA: 0.50, pistons: [0.030, 0.034, 0.038], windows: 2 },
    wellX: [0.049, 0.104],
  },
  rear: {
    // race fitment: 19x11 ET54.5 with 305/30-19 (square to the front) so the tyre's outer face sits at
    // z 0.915, inside the rear quarter lip; the mounting face (0.817) and hub/rotor/caliper are unchanged
    wx: 2.811, wz: 0.7625, et: 0.0545, rimW: 11 * 0.0254, mount: 0.817, hubFace: 0.808,
    ringC: 0.759, ringT: 0.028, rotorR: 0.1825, ringRi: 0.106, plateT: 0.0085, bolts: 0,
    cal: { th: 20 * D2R, a: 0.55, rin: 0.112, rout: 0.207, rb: 0.186, halfT: 0.0265, padT: 0.014, bpT: 0.005,
      padRi: 0.120, padRo: 0.181, padA: 0.36, pistons: [0.028, 0.032], windows: 1 },
    wellX: [0.075, 0.096], // drop well kept outboard of the caliper's outer face (z 0.819)
    // caliper mounting bracket (adapter plate) between the knuckle's outboard face and the caliper lugs
    bracket: { z0: 0.681, rin: 0.090, rout: 0.119, ext: 0.17, pad: 0.019, lowZ: 0.6575 },
  },
};
// derived caliper z planes
for (const k of ['front', 'rear']) {
  const g = GEOM[k], c = g.cal;
  c.zPadIn = [g.ringC - g.ringT / 2 - c.padT - c.bpT, g.ringC - g.ringT / 2];
  c.zPadOut = [g.ringC + g.ringT / 2, g.ringC + g.ringT / 2 + c.padT + c.bpT];
  c.zIn = [c.zPadIn[0] - 0.0008 - c.halfT, c.zPadIn[0] - 0.0008];
  c.zOut = [c.zPadOut[1] + 0.0008, c.zPadOut[1] + 0.0008 + c.halfT];
}
/** World position of a point on the caliper arc (left side). */
export function cornerPoint(which, r, ang, z) {
  const g = GEOM[which];
  return [g.wx + r * Math.cos(ang), GEOM.wheelY + r * Math.sin(ang), z];
}
const cornerOf = (x) => (Math.abs(x - GEOM.rear.wx) < Math.abs(x - GEOM.front.wx) ? 'rear' : 'front');
const LUG_ANG = (k) => (90 + 72 * k) * D2R; // stud #1 at 12 o'clock

// canonical-frame helpers for axial parts whose axis is world z (canonical +X = outboard):
// a world direction at angle t (from +x rearward toward +y up) is canonical (Y = sin t, Z = -cos t)
const cyz = (r, t) => [r * Math.sin(t), -r * Math.cos(t)];
const P = (X, r, t) => { const [y, z] = cyz(r, t); return [X, y, z]; };
const radRot = (t) => [t - PI / 2, 0, 0]; // rotates a box's +Y onto the radial direction t

// ------------------------------------------------------------------ 2D shapes
/** Arc band (annulus sector) around (cx, cy) with optional round end caps. Angles in radians. */
function band(cx, cy, rin, rout, a0, a1, caps = true) {
  const s = new THREE.Shape();
  const rm = (rin + rout) / 2, rc = (rout - rin) / 2;
  s.moveTo(cx + rout * Math.cos(a0), cy + rout * Math.sin(a0));
  s.absarc(cx, cy, rout, a0, a1, false);
  if (caps) s.absarc(cx + rm * Math.cos(a1), cy + rm * Math.sin(a1), rc, a1, a1 + PI, false);
  else s.lineTo(cx + rin * Math.cos(a1), cy + rin * Math.sin(a1));
  s.absarc(cx, cy, rin, a1, a0, true);
  if (caps) s.absarc(cx + rm * Math.cos(a0), cy + rm * Math.sin(a0), rc, a0 + PI, a0 + 2 * PI, false);
  else s.lineTo(cx + rout * Math.cos(a0), cy + rout * Math.sin(a0));
  return s;
}
/** Extrude a world-XY shape between z0 and z1 (world-aligned parts). */
function extZ(shape, z0, z1, bevel = 0, seg = 18) {
  const bv = Math.min(bevel, (z1 - z0) * 0.3);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, z1 - z0 - 2 * bv), bevelEnabled: bv > 0, bevelThickness: bv, bevelSize: bv * 0.8,
    bevelSegments: 1, curveSegments: seg,
  });
  g.translate(0, 0, z0 + bv);
  return g;
}
function rrect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
const hexZ = (r, len) => { const g = cylY(r, len, 6); g.rotateX(PI / 2); return g; };

// ------------------------------------------------------------------ caliper (world frame, absolute)
function caliperBody(b, which, c0) {
  // c0 = world centre of the part (ctx.pos) — everything is drawn at world coords minus c0
  const g = GEOM[which], c = g.cal;
  const cx = g.wx - c0[0], cy = GEOM.wheelY - c0[1], dz = -c0[2];
  const th = c.th, a = c.a;
  // piston housings (inboard and outboard halves) — monobloc halves with rounded ends
  b.add(extZ(band(cx, cy, c.rin, c.rout, th - a, th + a), c.zIn[0] + dz, c.zIn[1] + dz, 0.006, 20), 'red');
  b.add(extZ(band(cx, cy, c.rin + 0.004, c.rout, th - a * 0.97, th + a * 0.97), c.zOut[0] + dz, c.zOut[1] + dz, 0.006, 20), 'red');
  // outer bridge over the rotor: two end bridges + centre bridge, leaving pad windows
  const zb0 = c.zIn[0] + 0.006 + dz, zb1 = c.zOut[1] - 0.006 + dz;
  b.add(extZ(band(cx, cy, c.rb, c.rout, th + a * 0.45, th + a * 0.98), zb0, zb1, 0.004, 14), 'red');
  b.add(extZ(band(cx, cy, c.rb, c.rout, th - a * 0.98, th - a * 0.45), zb0, zb1, 0.004, 14), 'red');
  if (c.windows === 2) b.add(extZ(band(cx, cy, c.rb + 0.004, c.rout - 0.002, th - a * 0.07, th + a * 0.07, false), zb0, zb1, 0.003, 6), 'red');
  // piston bores show as round bosses on the inboard face (small leading -> large trailing)
  const rm = (c.rin + c.rb) / 2 - 0.004;
  const n = c.pistons.length;
  for (let i = 0; i < n; i++) {
    const t = th + (n === 1 ? 0 : (-1 + (2 * i) / (n - 1)) * a * 0.6);
    const R = c.pistons[i] / 2 + 0.006;
    b.add(cylZ(R, 0.008, 28), 'red', [cx + rm * Math.cos(t), cy + rm * Math.sin(t), c.zIn[0] - 0.003 + dz]);
    if (which === 'front') b.add(cylZ(R * 0.92, 0.006, 28), 'red', [cx + rm * Math.cos(t), cy + rm * Math.sin(t), c.zOut[1] + 0.002 + dz]);
  }
  // mounting lugs + bolts (axial mount into the knuckle ears, bolt heads on the knuckle side)
  for (const s of [-1, 1]) {
    const t = th + s * (a + 0.08), r = c.rin + 0.016;
    const p = [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    b.add(cylZ(0.017, c.halfT * 0.9, 20), 'red', [p[0], p[1], (c.zIn[0] + c.zIn[1]) / 2 + dz]);
    b.add(hexZ(0.0115, 0.009), 'steel', [p[0], p[1], c.zIn[0] - 0.006 + dz]);
    b.add(cylZ(0.0145, 0.002, 20), 'steel', [p[0], p[1], c.zIn[0] - 0.0012 + dz]);
  }
  // rear: caliper bracket plate bolted to the knuckle's outboard face, the caliper lugs bolt onto it
  if (g.bracket) {
    const k = g.bracket;
    // an arc web under the piston bosses (seats on the knuckle's hub-ring face) and a round pad at each caliper lug
    const z0 = k.z0 + dz, z1 = c.zIn[0] - 0.0004 + dz;
    b.add(extZ(band(cx, cy, k.rin, k.rout, th - a - k.ext, th + a + k.ext), z0, z1, 0.0015, 20), 'black');
    for (const s of [-1, 1]) {
      // the lower (trailing) lug sits over a lower knuckle boss, so its pad carries a spacer down onto it
      const t = th + s * (a + 0.08), r = c.rin + 0.016, zb = s < 0 ? k.lowZ + dz : z0;
      b.add(cylZ(k.pad, z1 - zb, 24), 'black', [cx + r * Math.cos(t), cy + r * Math.sin(t), (zb + z1) / 2]);
    }
    // (knuckle bolts enter from the knuckle side; the caliper lug bolts thread into the plate)
  }
  // brake hose inlet boss (inboard face, upper/trailing end)
  const ti = th + a * 0.55, ri = which === 'front' ? 0.185 : 0.172;
  b.add(cylZ(0.012, 0.008, 18), 'red', [cx + ri * Math.cos(ti), cy + ri * Math.sin(ti), c.zIn[0] - 0.003 + dz]);
  // logo plate on the outboard face (Brembo / 1LE script)
  const tl = th, rl = (c.rin + c.rout) / 2 + 0.006;
  const lg = box(0.0018, which === 'front' ? 0.13 : 0.085, 0.022, 0);
  lg.rotateY(PI / 2);
  b.add(lg, 'machined', [cx + rl * Math.cos(tl), cy + rl * Math.sin(tl), c.zOut[1] + 0.0012 + dz], [0, 0, tl]);
}

function padShape(which, c0, inboard, b) {
  const g = GEOM[which], c = g.cal;
  const cx = g.wx - c0[0], cy = GEOM.wheelY - c0[1], dz = -c0[2];
  const z = inboard ? c.zPadIn : c.zPadOut;
  const zf = inboard ? [z[0] + c.bpT, z[1]] : [z[0], z[1] - c.bpT];
  const zp = inboard ? [z[0], z[0] + c.bpT] : [z[1] - c.bpT, z[1]];
  b.add(extZ(band(cx, cy, c.padRi, c.padRo, c.th - c.padA, c.th + c.padA), zf[0] + dz, zf[1] + dz, 0.0008, 16), 'black');
  // steel backing plate with pin ears at the ends
  b.add(extZ(band(cx, cy, c.padRi - 0.004, c.padRo + 0.004, c.th - c.padA - 0.02, c.th + c.padA + 0.02), zp[0] + dz, zp[1] + dz, 0, 16), 'steel');
  for (const s of [-1, 1]) {
    const t = c.th + s * (c.padA + 0.07), r = c.padRo - 0.006;
    b.add(cylZ(0.009, c.bpT, 14), 'steel', [cx + r * Math.cos(t), cy + r * Math.sin(t), (zp[0] + zp[1]) / 2 + dz]);
  }
  // noise shim on the back of the backing plate
  b.add(extZ(band(cx, cy, c.padRi, c.padRo, c.th - c.padA * 0.9, c.th + c.padA * 0.9), (inboard ? zp[0] - 0.0008 : zp[1]) + dz, (inboard ? zp[0] : zp[1] + 0.0008) + dz, 0, 12), 'stainless');
}

// ------------------------------------------------------------------ generators
const axial = {
  // ---------------- ZL1 1LE forged wheel: 5 twin-spoke pairs, deep concave, satin black
  brakes_wheel(L, D, D2, ctx) {
    const g = GEOM[ctx.variant === 'rear' ? 'rear' : 'front'];
    const b = new PartBuilder();
    const w = L / 2, Rf = D / 2, Rbs = 0.2413, t = 0.0065;
    const bh = g.rimW / 2; // bead seat half width
    const Rw = Rbs - (g.wellD || 0.022), [w0, w1] = g.wellX;
    const outer = [
      [Rf - 0.005, -w], [Rf, -w + 0.004], [Rf, -w + 0.009], [Rbs + 0.004, -bh + 0.003], [Rbs, -bh + 0.012],
      [Rbs + 0.003, -bh + 0.03], [Rbs, -bh + 0.036], [Rbs, w0 - 0.014], [Rw, w0], [Rw, w1], [Rbs, w1 + 0.014],
      [Rbs + 0.003, bh - 0.03], [Rbs, bh - 0.036], [Rbs, bh - 0.012], [Rbs + 0.004, bh - 0.003], [Rf, w - 0.009], [Rf, w - 0.004], [Rf - 0.005, w],
    ];
    const inner = [
      [Rf - 0.013, w], [Rbs - 0.004, w - 0.012], [Rbs - t, bh - 0.03], [Rbs - t, w1 + 0.014], [Rw - t, w1], [Rw - t, w0],
      [Rbs - t, w0 - 0.014], [Rbs - t, -bh + 0.02], [Rbs - 0.002, -w + 0.01], [Rf - 0.013, -w],
    ];
    b.add(latheX([...outer, ...inner, outer[0]], 80), 'wheel');
    // machined lip highlight on the outer flange
    b.add(ringX(Rf, Rf - 0.009, 0.0015, 80), 'machined', [w + 0.0005, 0, 0]);
    // centre pad: mounting face at X = ET, lug face 40 mm outboard
    const X0 = g.et, X1 = g.et + (g.padT || 0.04);
    b.add(latheX([[0.0335, X0], [0.084, X0], [0.096, X0 + 0.012], [0.092, X1 - 0.006], [0.082, X1], [0.040, X1], [0.034, X1 - 0.004], [0.0335, X0]], 64), 'wheel');
    for (let k = 0; k < 5; k++) {
      b.add(cylX(0.0145, 0.003, 16), 'black', P(X1 + 0.0002, 0.06, LUG_ANG(k)));
    }
    b.add(cylX(0.034, 0.002, 24), 'black', [X0 + 0.004, 0, 0]);
    // twin spokes, one pair straddling each lug
    const r0 = 0.08, r1 = Rbs - 0.003;
    const Xh = g.et + 0.022, Xo = w - 0.024;
    for (let k = 0; k < 5; k++) {
      const phi = LUG_ANG(k);
      const er = [Math.sin(phi), -Math.cos(phi)], et = [Math.cos(phi), Math.sin(phi)];
      for (const side of [-1, 1]) {
        const geo = new THREE.BoxGeometry(1, 1, 1, 10, 1, 1);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const s = pos.getX(i) + 0.5, v = pos.getY(i), q = pos.getZ(i);
          const r = r0 + s * (r1 - r0);
          const tang = side * (0.013 + 0.021 * s) + q * (0.024 - 0.007 * s);
          const X = Xh + (Xo - Xh) * (1 - Math.pow(1 - s, 1.6)) + v * (0.036 - 0.015 * s);
          pos.setXYZ(i, X, er[0] * r + et[0] * tang, er[1] * r + et[1] * tang);
        }
        geo.computeVertexNormals();
        b.add(geo, 'wheel');
      }
    }
    return b.build();
  },

  // ---------------- tyre (body-matched 743 x 337), Goodyear Eagle F1 Supercar 3R-style crown with 2 grooves
  brakes_tire(L, D, D2, ctx) {
    const g = GEOM[ctx.variant === 'rear' ? 'rear' : 'front'];
    const W = L / 2, Ro = D / 2, Rb = 0.2413, bx = g.rimW / 2 + 0.004;
    const sh = 0.028;
    const prof = [];
    prof.push([Rb, -bx], [Rb + 0.012, -bx - 0.004], [Rb + 0.026, -bx - 0.010], [Rb + 0.032, -bx - 0.006]);
    // sidewall bulge
    for (let i = 0; i <= 6; i++) {
      const f = i / 6, r = Rb + 0.04 + f * (Ro - sh - Rb - 0.04);
      prof.push([r, -W + 0.004 + (1 - Math.sin(f * PI)) * (W - bx) * 0.25 * (1 - f) - Math.sin(f * PI) * 0.004]);
    }
    for (let i = 1; i <= 5; i++) { const a = (i / 5) * (PI / 2); prof.push([Ro - sh + Math.sin(a) * sh, -W + sh - Math.cos(a) * sh]); }
    const crown = (x) => Ro - 0.004 * (x / W) ** 2;
    for (const gx of [-W * 0.3, W * 0.3]) {
      prof.push([crown(gx - 0.008), gx - 0.008], [crown(gx) - 0.007, gx - 0.0055], [crown(gx) - 0.007, gx + 0.0055], [crown(gx + 0.008), gx + 0.008]);
      if (gx < 0) prof.push([crown(0), 0]);
    }
    for (let i = 0; i <= 4; i++) { const a = PI / 2 - (i / 5) * (PI / 2); prof.push([Ro - sh + Math.sin(a) * sh, W - sh + Math.cos(a) * sh]); }
    for (let i = 6; i >= 0; i--) {
      const f = i / 6, r = Rb + 0.04 + f * (Ro - sh - Rb - 0.04);
      prof.push([r, W - 0.004 - (1 - Math.sin(f * PI)) * (W - bx) * 0.25 * (1 - f) + Math.sin(f * PI) * 0.004]);
    }
    prof.push([Rb + 0.032, bx + 0.006], [Rb + 0.026, bx + 0.010], [Rb + 0.012, bx + 0.004], [Rb, bx]);
    const b = new PartBuilder().add(latheX(prof, 112), 'rubber');
    return b.build();
  },

  // ---------------- front rotor friction ring (390 x 36, ID 224, 10 drive lugs, straight non-directional vanes)
  brakes_rotorRing(L, D, D2, ctx) {
    const g = GEOM[ctx.variant === 'rear' ? 'rear' : 'front'];
    const b = new PartBuilder();
    const ro = D / 2, ri = g.ringRi, T = L, tp = g.plateT;
    for (const s of [-1, 1]) {
      const x0 = s * (T / 2 - tp), x1 = s * T / 2;
      const a = Math.min(x0, x1), c = Math.max(x0, x1);
      b.add(latheX([[ri, a], [ro - 0.0012, a], [ro, a + 0.0012], [ro, c - 0.0012], [ro - 0.0012, c], [ri + 0.0015, c], [ri, c - 0.0015], [ri, a]], 96), 'iron');
    }
    const gap = T - 2 * tp + 0.001, n = ctx.variant === 'rear' ? 40 : 48;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 2 * PI;
      b.add(box(gap, ro - ri - 0.003, 0.0055, 0), 'iron', P(0, (ro + ri) / 2, t), radRot(t));
    }
    if (g.bolts) {
      for (let i = 0; i < g.bolts; i++) {
        const t = (i / g.bolts) * 2 * PI + PI / 10;
        b.add(box(T * 0.5, 0.016, 0.026, 0.003), 'iron', P(T * 0.12, ri - 0.006, t), radRot(t));
      }
    }
    return b.build();
  },

  // ---------------- front two-piece hat: black anodised aluminium, 10-lobe bolt flange, 5 x 120 lug holes
  brakes_frontHat(L, D) {
    const b = new PartBuilder();
    const h = L / 2, rf = Math.min(D / 2 - 0.012, 0.106);
    b.add(latheX([[0.0345, h], [0.088, h], [0.093, h - 0.004], [0.094, -h + 0.009], [rf - 0.002, -h + 0.009], [rf - 0.002, -h], [0.086, -h], [0.086, h - 0.008], [0.0345, h - 0.008], [0.0345, h]], 64), 'satin');
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * 2 * PI + PI / 10;
      b.add(cylX(0.0115, 0.009, 16), 'satin', P(-h + 0.0045, rf, t));
    }
    for (let k = 0; k < 5; k++) b.add(cylX(0.0075, 0.0095, 14), 'black', P(h - 0.004, 0.06, LUG_ANG(k)));
    b.add(cylX(0.0035, 0.0095, 10), 'black', P(h - 0.004, 0.045, LUG_ANG(0) + 36 * D2R));
    b.add(ringX(0.072, 0.066, 0.0008, 48), 'machined', [h + 0.0002, 0, 0]);
    return b.build();
  },

  // ---------------- 10 floating hat bolts with bobbins and spring clips
  brakes_hatBolts(L, D) {
    const b = new PartBuilder();
    const r = D / 2 - 0.01;
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * 2 * PI + PI / 10;
      b.add(cylX(0.0042, L, 10), 'steel', P(0, r, t));
      b.add(hexX(0.0058, 0.005), 'chrome', P(L / 2 - 0.0025, r, t));
      b.add(cylX(0.0085, 0.004, 14), 'machined', P(-L / 2 + 0.002, r, t));
      b.add(box(0.0018, 0.024, 0.013, 0), 'stainless', P(L / 2 - 0.006, r, t), radRot(t + PI / 2));
    }
    return b.build();
  },

  // ---------------- rear one-piece rotor hat with drum-in-hat park-brake bore
  brakes_rearHat(L, D) {
    const b = new PartBuilder();
    const h = L / 2;
    b.add(latheX([[0.0345, h], [0.093, h], [0.097, h - 0.004], [0.097, -h + 0.022], [0.106, -h + 0.012], [0.106, -h], [0.0855, -h], [0.0855, h - 0.009], [0.0345, h - 0.009], [0.0345, h]], 64), 'cast');
    b.add(ringX(0.088, 0.082, 0.0012, 48), 'iron', [h + 0.0004, 0, 0]);
    for (let k = 0; k < 5; k++) b.add(cylX(0.0075, 0.0095, 14), 'black', P(h - 0.004, 0.06, LUG_ANG(k)));
    b.add(cylX(0.0035, 0.0095, 10), 'black', P(h - 0.004, 0.045, LUG_ANG(0) + 36 * D2R));
    return b.build();
  },

  // ---------------- splash / dust shield: stamped steel with turned lip, cut-out at the caliper
  brakes_dustShield(L, D, D2, ctx) {
    const g = GEOM[ctx.variant === 'rear' ? 'rear' : 'front'];
    const b = new PartBuilder();
    const R = D / 2, ri = 0.074, c = g.cal;
    const s = new THREE.Shape();
    const a0 = c.th + c.a + 0.25, a1 = c.th - c.a - 0.25 + 2 * PI;
    s.absarc(0, 0, R, a0, a1, false);
    s.absarc(0, 0, ri, a1, a0, true);
    // shape is drawn in world (x, y); map to canonical (Y = y, Z = -x)
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(L, 0.0015), bevelEnabled: false, curveSegments: 48 });
    geo.translate(0, 0, -Math.max(L, 0.0015) / 2);
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    b.add(geo, ctx.variant === 'rear' ? 'black' : 'steel');
    // turned outer lip
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = a0 + (i / n) * (a1 - a0);
      if (i % 2) continue;
      b.add(box(0.012, 0.004, ((a1 - a0) / n) * R * 2.05, 0), ctx.variant === 'rear' ? 'black' : 'steel', P(-0.006, R - 0.002, t), radRot(t));
    }
    // knuckle bolt holes
    for (let k = 0; k < 3; k++) b.add(cylX(0.007, L + 0.001, 10), 'black', P(0, 0.083, (210 + k * 120) * D2R));
    return b.build();
  },

  // ---------------- hub & bearing unit (bolt-on, 5 pressed M14 studs not included — separate part)
  brakes_hubBearing(L, D, D2, ctx) {
    const rear = ctx.variant === 'rear';
    const b = new PartBuilder();
    const h = L / 2;
    const xFace = h - 0.015; // flange outboard face; pilot protrudes 15 mm
    // pilot spigot (66.9 mm) + flange
    b.add(latheX([[rear ? 0.026 : 0.0001, h], [0.0322, h], [0.0334, h - 0.002], [0.0334, xFace]], 40), 'machined');
    const fl = new THREE.Shape();
    for (let i = 0; i <= 60; i++) {
      const t = (i / 60) * 2 * PI;
      const lobe = Math.max(0, Math.cos(5 * (t - PI / 2)));
      const r = 0.058 + 0.016 * Math.pow(lobe, 3);
      const x = r * Math.cos(t), y = r * Math.sin(t);
      if (i === 0) fl.moveTo(x, y); else fl.lineTo(x, y);
    }
    const flg = new THREE.ExtrudeGeometry(fl, { depth: 0.010, bevelEnabled: false });
    flg.translate(0, 0, xFace - 0.010);
    flg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    b.add(flg, 'steel');
    // bearing body + knuckle mounting flange (3 ears) + seal
    b.add(latheX([[0.034, xFace - 0.010], [0.046, xFace - 0.012], [0.048, -h + 0.03], [0.044, -h + 0.008], [0.036, -h], [0.0001, -h]], 40), 'cast');
    b.add(cylX(0.052, 0.003, 36), 'black', [xFace - 0.013, 0, 0]);
    const ear = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * 2 * PI;
      const lobe = Math.max(0, Math.cos(3 * (t - 210 * D2R)));
      const r = 0.055 + 0.03 * Math.pow(lobe, 4);
      if (i === 0) ear.moveTo(r * Math.cos(t), r * Math.sin(t)); else ear.lineTo(r * Math.cos(t), r * Math.sin(t));
    }
    // the mounting ears seat on the knuckle's outboard face (front: duct plate sandwiched between),
    // measured from the wheel-flange face so the barrel length can change without moving them
    const earIn = xFace - (rear ? 0.120 : 0.097);
    const eg = new THREE.ExtrudeGeometry(ear, { depth: 0.012, bevelEnabled: false });
    eg.translate(0, 0, earIn);
    eg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    b.add(eg, 'cast');
    // 3 hub bolts: heads on the knuckle's inboard face (bolts pass through the knuckle into the ears)
    const boltX = xFace - (rear ? 0.163 : 0.140) - 0.004;
    for (let k = 0; k < 3; k++) {
      const t = (210 + k * 120) * D2R;
      b.add(hexX(0.009, 0.008), 'steel', P(boltX, 0.075, t));
      b.add(cylX(0.0055, earIn - boltX + 0.012, 10), 'steel', P((boltX + earIn + 0.012) / 2, 0.075, t));
    }
    // stud holes in flange
    for (let k = 0; k < 5; k++) b.add(cylX(0.0075, 0.0105, 12), 'black', P(xFace - 0.005, 0.06, LUG_ANG(k)));
    // rear: drive hub with an open female-splined bore through its full length for the CV stub
    if (rear) {
      b.add(cylX(0.016, L + 0.002, 24), 'black');
      for (let k = 0; k < 12; k++) { const t = (k / 12) * 2 * PI; b.add(box(L + 0.0015, 0.003, 0.0035, 0), 'steel', P(0, 0.0165, t), radRot(t)); }
    }
    return b.build();
  },

  // ---------------- M14x1.5 knurled wheel stud
  brakes_stud(L) {
    const b = new PartBuilder();
    const h = L / 2;
    b.add(latheX([[0.0001, -h], [0.0095, -h], [0.0095, -h + 0.004], [0.0078, -h + 0.005], [0.0078, -h + 0.016], [0.0070, -h + 0.017], [0.0070, h - 0.003], [0.0055, h], [0.0001, h]], 12), 'chrome');
    return b.build();
  },

  // ---------------- M14x1.5 60 deg conical-seat lug nut, 22 mm hex, capped
  brakes_lugNut(L) {
    const b = new PartBuilder();
    const h = L / 2;
    b.add(latheX([[0.0075, -h], [0.0115, -h + 0.0002], [0.0127, -h + 0.006]], 18), 'chrome');
    b.add(hexX(0.0127, L * 0.62), 'chrome', [-h + 0.006 + L * 0.31, 0, 0]);
    b.add(latheX([[0.0115, h - L * 0.32], [0.0112, h - 0.005], [0.008, h - 0.0005], [0.0001, h]], 18), 'chrome');
    return b.build();
  },

  // ---------------- centre cap with bowtie
  brakes_centerCap(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(latheX([[0.0001, L / 2], [R * 0.8, L / 2 - 0.0005], [R, L / 2 - 0.003], [R, -L / 2], [R * 0.85, -L / 2]], 32), 'black');
    const bt = new THREE.Shape();
    const k = R / 0.03;
    [[-0.026, -0.006], [-0.022, 0.006], [-0.008, 0.006], [-0.006, 0.010], [0.006, 0.010], [0.008, 0.006], [0.026, 0.006], [0.022, -0.006],
      [0.008, -0.006], [0.006, -0.010], [-0.006, -0.010], [-0.008, -0.006]].forEach(([x, y], i) => (i ? bt.lineTo(x * k, y * k) : bt.moveTo(x * k, y * k)));
    const bg = new THREE.ExtrudeGeometry(bt, { depth: 0.0012, bevelEnabled: false });
    bg.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    b.add(bg, 'gold', [L / 2 - 0.0002, 0, 0]);
    return b.build();
  },

  // ---------------- hub-centric spacer (5 x 120, M14 stud holes, hub lip)
  brakes_spacer(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(ringX(R, 0.0336, L, 48), 'aluminum');
    b.add(ringX(0.0334, 0.03, 0.006, 32), 'aluminum', [L / 2 + 0.003, 0, 0]);
    for (let k = 0; k < 5; k++) b.add(cylX(0.0085, L + 0.001, 12), 'black', P(0, 0.06, LUG_ANG(k)));
    return b.build();
  },

  // ---------------- simple thin ring (hub-centric rings, O-rings)
  brakes_ring(L, D) {
    return new PartBuilder().add(ringX(D / 2, D / 2 - Math.max(0.003, D * 0.045), Math.max(L, 0.002), 40), 'plastic').build();
  },

  // ---------------- split rubber cable grommet (6 mm cable): waisted core + two sealing lips, axis canonical X
  brakes_grommet(L, D) {
    const b = new PartBuilder();
    const ri = 0.0032, lip = Math.min(0.0015, L * 0.25);
    b.add(ringX(D * 0.36, ri, L, 24), 'rubber');
    for (const s of [-1, 1]) b.add(ringX(D / 2, ri, lip, 24), 'rubber', [s * (L / 2 - lip / 2), 0, 0]);
    return b.build();
  },

  // ---------------- clamp-in TPMS valve stem (aluminium stem, nut, cap) — axis canonical X
  brakes_valveStem(L, D) {
    const b = new PartBuilder();
    const h = L / 2;
    b.add(latheX([[0.0001, -h], [0.0062, -h], [0.0062, -h + 0.004], [0.0042, -h + 0.005], [0.0042, h - 0.010], [0.0038, h - 0.009], [0.0038, h], [0.0001, h]], 14), 'aluminum');
    b.add(hexX(0.0068, 0.004), 'aluminum', [-h + 0.010, 0, 0]);
    b.add(cylX(0.0042, 0.009, 12), 'black', [h - 0.0045, 0, 0]);
    return b.build();
  },

  // ---------------- caliper pad retaining pin with spring clip
  brakes_padPin(L) {
    const b = new PartBuilder();
    const h = L / 2;
    b.add(cylX(0.0028, L * 0.96, 10), 'stainless');
    b.add(cylX(0.0045, 0.004, 12), 'stainless', [h - 0.002, 0, 0]);
    b.add(torusX(0.004, 0.0009, 6, 14), 'stainless', [-h + 0.004, 0, 0]);
    return b.build();
  },

  // ---------------- bleeder screw (M10) with rubber cap
  brakes_bleeder(L) {
    const b = new PartBuilder();
    const h = L / 2;
    b.add(cylX(0.004, L * 0.45, 10), 'steel', [-h + L * 0.225, 0, 0]);
    b.add(hexX(0.0058, L * 0.25), 'steel', [0, 0, 0]);
    b.add(latheX([[0.0001, h], [0.0042, h - 0.001], [0.0048, h - L * 0.35], [0.0001, h - L * 0.35]], 12), 'rubber');
    return b.build();
  },

  // ---------------- banjo bolt + copper crush washers + banjo eye
  brakes_banjo(L) {
    // head on the inboard (-X) side, threads into the caliper inlet (+X)
    const b = new PartBuilder();
    const h = L / 2;
    b.add(cylX(0.0062, 0.004, 14), 'copper', [h - 0.002, 0, 0]);
    b.add(cylX(0.0085, 0.008, 16), 'stainless', [h - 0.008, 0, 0]);
    b.add(cylY(0.0028, 0.03, 8), 'stainless', [h - 0.008, 0.017, 0]);
    b.add(cylX(0.0062, 0.0035, 14), 'copper', [h - 0.0137, 0, 0]);
    b.add(hexX(0.0072, 0.006), 'steel', [-h + 0.003, 0, 0]);
    return b.build();
  },

  // ---------------- AN / metric fitting (hex body, two threaded ends)
  brakes_fitting(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(hexX(R, L * 0.4), 'blue');
    b.add(cylX(R * 0.55, L, 12), 'blue');
    b.add(hexX(R * 0.8, L * 0.2), 'blue', [L * 0.38, 0, 0]);
    return b.build();
  },

  // ---------------- wheel-speed sensor: active 2-wire, plastic body with mounting ear
  brakes_wss(L, D) {
    // sensing tip toward +X (outboard, into the bearing encoder), connector at -X
    // Layout from the inboard end: connector head (proud of the knuckle), mounting ear that bolts to the
    // knuckle's inboard face 16.5 mm in, then the sensing body through the knuckle bore to the encoder.
    const b = new PartBuilder();
    const h = L / 2, R = D / 2;
    const xe = -h + 0.0165; // ear centre
    b.add(cylX(R * 0.55, h - xe, 14), 'plastic', [(h + xe) / 2, 0, 0]);
    b.add(cylX(R * 0.62, 0.004, 14), 'black', [h - 0.002, 0, 0]);
    b.add(box(0.004, R * 3.2, R * 1.6, 0.002), 'plastic', [xe, R * 0.9, 0]);
    b.add(cylX(0.003, 0.006, 8), 'steel', [xe - 0.004, R * 1.9, 0]);
    b.add(box(0.0125, R * 1.2, R * 1.4, 0.002), 'plastic', [-h + 0.00625, 0, 0]);
    b.add(cylX(R * 0.3, 0.012, 8), 'black', [-h - 0.006, 0, 0]);
    return b.build();
  },

  // ---------------- brake line pressure sensor (M10x1 / 1/8 NPT, hex, Bosch-style connector)
  brakes_pressureSensor(L, D) {
    const b = new PartBuilder();
    const h = L / 2, R = D / 2;
    b.add(cylX(R * 0.35, L * 0.2, 10), 'stainless', [-h + L * 0.1, 0, 0]);
    b.add(hexX(R * 0.95, L * 0.18), 'stainless', [-h + L * 0.29, 0, 0]);
    b.add(cylX(R * 0.8, L * 0.32, 16), 'stainless', [-h + L * 0.54, 0, 0]);
    b.add(cylX(R * 0.85, L * 0.3, 16), 'plastic', [h - L * 0.15, 0, 0]);
    return b.build();
  },

  // ---------------- hydraulic brake-light pressure switch
  brakes_pressureSwitch(L, D) {
    const b = new PartBuilder();
    const h = L / 2, R = D / 2;
    b.add(cylX(R * 0.35, L * 0.25, 10), 'steel', [-h + L * 0.125, 0, 0]);
    b.add(hexX(R, L * 0.3), 'steel', [-h + L * 0.4, 0, 0]);
    b.add(cylX(R * 0.75, L * 0.35, 14), 'plastic', [h - L * 0.175, 0, 0]);
    for (const s of [-1, 1]) b.add(box(0.008, 0.0015, 0.004, 0), 'copper', [h + 0.003, s * R * 0.3, 0]);
    return b.build();
  },

  // ---------------- Tilton 78-series style master cylinder: body, 2-bolt flange, AN3 outlet, AN6 inlet, pushrod/clevis
  // canonical +X = world +x (rearward, toward the balance bar)
  brakes_masterCyl(L, D) {
    const b = new PartBuilder();
    const h = L / 2, R = Math.min(D / 2, 0.022);
    const bodyL = 0.086, xb0 = -h + 0.012, xb1 = xb0 + bodyL;
    b.add(latheX([[0.0001, xb0], [R * 0.72, xb0], [R * 0.75, xb0 + 0.004], [R * 0.75, xb1 - 0.02], [R * 0.85, xb1 - 0.012], [R * 0.85, xb1], [0.0001, xb1]], 24), 'machined');
    // mounting flange (2 bolts, 2.25 in centres) + pivot trunnion at rear
    b.add(box(0.008, R * 1.6, 0.075, 0.004), 'machined', [xb1 - 0.004, 0, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.0065, 0.006), 'steel', [xb1 - 0.004 - 0.007, 0, s * 0.0286]);
    // inlet boss with AN6 fitting on top, outlet AN3 at the front
    b.add(cylY(0.009, R * 1.0, 14), 'machined', [xb1 - 0.03, R * 0.7, 0]);
    b.add(hexX(0.0095, 0.008), 'blue', [xb1 - 0.03, R * 1.25, 0], [0, 0, PI / 2]);
    b.add(hexX(0.0068, 0.012), 'blue', [-h + 0.006, 0, 0]);
    // pushrod (3/8-24) + jam nut + clevis
    b.add(cylX(0.0048, h - 0.012 - xb1 + h - 0.006, 10), 'chrome', [(xb1 + h - 0.012) / 2, 0, 0]);
    b.add(hexX(0.0075, 0.006), 'chrome', [h - 0.026, 0, 0]);
    b.add(box(0.022, 0.016, 0.018, 0.003), 'chrome', [h - 0.011, 0, 0]);
    return b.build();
  },

  // ---------------- Tilton-style remote reservoir: translucent body, black cap, outlet fitting, bracket
  brakes_reservoir(L, D) {
    // canonical X = world up (axis y)
    const b = new PartBuilder();
    const h = L / 2, R = D / 2;
    b.add(latheX([[0.0001, -h + 0.012], [R * 0.9, -h + 0.012], [R * 0.95, -h + 0.016], [R * 0.95, h - 0.022], [R * 0.85, h - 0.018], [0.0001, h - 0.018]], 24), 'cage');
    b.add(latheX([[0.0001, h - 0.018], [R * 0.98, h - 0.018], [R, h - 0.012], [R * 0.95, h], [0.0001, h]], 24), 'black');
    for (let i = 0; i < 12; i++) { const t = (i / 12) * 2 * PI; b.add(box(0.014, 0.003, 0.003, 0), 'black', [h - 0.010, Math.cos(t) * R, Math.sin(t) * R]); }
    b.add(cylX(R * 0.3, 0.012, 12), 'black', [-h + 0.006, 0, 0]);
    b.add(hexX(0.008, 0.008), 'blue', [-h + 0.002, 0, 0]);
    b.add(box(0.04, 0.004, R * 1.5, 0.001), 'black', [0, -R * 0.98, 0]);
    // fluid level line
    b.add(cylX(R * 0.952, 0.002, 24), 'gold', [h * 0.25, 0, 0]);
    return b.build();
  },

  // ---------------- brake balance bar (3/8-24 threaded bar, two clevises, spherical bearing tube)
  brakes_balanceBar(L, D) {
    // canonical X = world z (lateral)
    const b = new PartBuilder();
    const h = L / 2;
    b.add(cylX(0.0048, L, 10), 'chrome');
    b.add(cylX(0.0115, 0.032, 18), 'machined');
    b.add(sphere(0.0105, 14, 10), 'chrome');
    for (const s of [-1, 1]) {
      b.add(box(0.016, 0.022, 0.02, 0.003), 'chrome', [s * (h - 0.032), 0, -0.006]);
      b.add(hexX(0.0075, 0.006), 'chrome', [s * (h - 0.016), 0, 0]);
    }
    b.add(hexX(0.008, 0.008), 'steel', [h - 0.004, 0, 0]);
    return b.build();
  },

  // ---------------- remote bias adjuster knob (knurled)
  brakes_biasKnob(L, D) {
    const b = new PartBuilder();
    const R = Math.min(D / 2, 0.018);
    b.add(cylX(R, L * 0.55, 24), 'red', [L * 0.2, 0, 0]);
    for (let i = 0; i < 16; i++) { const t = (i / 16) * 2 * PI; b.add(box(L * 0.5, 0.002, 0.003, 0), 'red', [L * 0.2, Math.cos(t) * R, Math.sin(t) * R], [t, 0, 0]); }
    b.add(cylX(R * 0.55, L * 0.45, 16), 'machined', [-L * 0.25, 0, 0]);
    b.add(hexX(R * 0.6, 0.004), 'chrome', [-L / 2 + 0.002, 0, 0]);
    return b.build();
  },

  // ---------------- 12-position rotary map switch
  brakes_rotarySwitch(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(cylX(R * 0.9, L * 0.45, 20), 'plastic', [-L * 0.25, 0, 0]);
    b.add(cylX(R * 1.05, 0.0025, 24), 'satin', [0, 0, 0]);
    b.add(cylX(R * 0.6, L * 0.4, 20), 'black', [L * 0.28, 0, 0]);
    b.add(box(0.004, R * 1.1, 0.003, 0), 'yellow', [L / 2, 0, 0]);
    return b.build();
  },

  // ---------------- brake-duct inlet: oval carbon bell-mouth with mounting flange, drawn inside its box
  // (L along x, D1 tall, D2 wide), necking down to a round 39 mm spigot at the rear for the 40 mm hose
  brakes_ductInlet(L, D1, D2) {
    // canonical +X = world +x (rearward into the duct)
    const b = new PartBuilder();
    const h = L / 2, m = Math.min(D1, D2);
    const fl = rrect(D2, D1, m * 0.3);
    fl.holes.push(new THREE.Path().absellipse(0, 0, D2 * 0.40, D1 * 0.38, 0, 2 * PI, true));
    const g = new THREE.ExtrudeGeometry(fl, { depth: 0.003, bevelEnabled: false, curveSegments: 16 });
    g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    b.add(g, 'carbon', [-h, 0, 0]);
    // oval funnel: front opening = 0.84 x the flange, rear = the spigot diameter
    const rs = Math.min(0.0195, m * 0.44), r0 = m * 0.42, xm = -h + L * 0.55;
    b.add(latheX([[r0, -h + 0.003], [r0 * 0.97, -h + 0.008], [rs + 0.002, xm], [rs, xm], [rs - 0.0025, xm], [r0 * 0.97 - 0.0025, -h + 0.008], [r0 - 0.0025, -h + 0.003]], 32), 'carbon', [0, 0, 0], [0, 0, 0], [1, 1, D2 / D1 > 1 ? Math.min(D2 / D1, 1.4) : 1]);
    // round spigot with a bead, to the back of the box
    b.add(cylX(rs, h - xm, 24), 'carbon', [(xm + h) / 2, 0, 0]);
    b.add(cylX(rs + 0.0012, 0.003, 24), 'carbon', [h - 0.006, 0, 0]);
    for (const s of [-1, 1]) b.add(cylX(0.0025, 0.004, 8), 'chrome', [-h - 0.001, 0, s * D2 * 0.42]);
    return b.build();
  },

  // ---------------- duct backing plate (aluminium plate behind the rotor eye)
  brakes_ductPlate(L, D, D2, ctx) {
    // Keyhole plate clamped between knuckle and hub ears: a disc that stays inside the pad inner radius,
    // a forward lobe (150-210 deg) that carries the duct spigot, a hole for the hub barrel and the air port.
    const b = new PartBuilder();
    const R = D / 2, t = Math.max(L, 0.003), RL = 0.16, a0 = 150 * D2R, a1 = 210 * D2R;
    const s = new THREE.Shape();
    s.absarc(0, 0, R, a1, a0 + 2 * PI, false); // the round part (trailing side, around the caliper)
    // lobe: straight flanks out to RL, rounded nose
    s.lineTo(RL * 0.8 * Math.cos(a0), RL * 0.8 * Math.sin(a0));
    s.absarc(0, 0, RL, a0 + 0.08, a1 - 0.08, false);
    s.lineTo(R * Math.cos(a1), R * Math.sin(a1));
    s.holes.push(new THREE.Path().absarc(0, 0, 0.06, 0, 2 * PI, true));
    const rp = 0.1186, ap = 174.4 * D2R; // duct port under the spigot
    s.holes.push(new THREE.Path().absarc(rp * Math.cos(ap), rp * Math.sin(ap), 0.028, 0, 2 * PI, true));
    const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 40 });
    geo.translate(0, 0, -t / 2);
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    b.add(geo, 'aluminum');
    // turned stiffening lip on the round part (outboard, 8 mm), kept inside the pad inner radius
    const n = 28;
    for (let i = 0; i < n; i++) {
      const q = a1 + ((i + 0.5) / n) * (a0 + 2 * PI - a1);
      b.add(box(0.008, 0.002, ((a0 + 2 * PI - a1) / n) * R * 1.05, 0), 'aluminum', P(t / 2 + 0.004, R - 0.001, q), radRot(q));
    }
    return b.build();
  },

  // ---------------- duct spigot (3 in hose barb + flange)
  brakes_ductSpigot(L, D) {
    const b = new PartBuilder();
    const h = L / 2, R = D / 2;
    b.add(latheX([[R * 0.94, -h], [R, -h + 0.004], [R * 0.96, -h + 0.02], [R, -h + 0.024], [R * 0.96, h - 0.012], [R * 1.25, h - 0.008], [R * 1.25, h], [R * 0.9, h], [R * 0.9, -h]], 32), 'aluminum');
    b.add(cylX(R * 1.02, 0.012, 32), 'stainless', [-h + 0.016, 0, 0]);
    return b.build();
  },

  // ---------------- drum-in-hat park brake shoes (two arcs, linings, adjuster, springs)
  brakes_pbShoes(L, D) {
    const b = new PartBuilder();
    const Ro = D / 2 - 0.001, w = Math.max(L * 0.7, 0.02);
    for (const s of [0, 1]) {
      const a0 = s * PI + 0.25, a1 = s * PI + PI - 0.25;
      const sh = new THREE.Shape();
      sh.absarc(0, 0, Ro, a0, a1, false);
      sh.absarc(0, 0, Ro - 0.005, a1, a0, true);
      const lin = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false, curveSegments: 18 });
      lin.translate(0, 0, -w / 2);
      lin.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
      b.add(lin, 'black');
      const tb = new THREE.Shape();
      tb.absarc(0, 0, Ro - 0.005, a0 - 0.05, a1 + 0.05, false);
      tb.absarc(0, 0, Ro - 0.025, a1 + 0.05, a0 - 0.05, true);
      const web = new THREE.ExtrudeGeometry(tb, { depth: 0.004, bevelEnabled: false, curveSegments: 18 });
      web.translate(0, 0, -0.002);
      web.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
      b.add(web, 'steel');
    }
    // adjuster (star wheel) at the bottom, anchor at the top, return springs
    b.add(cylZ(0.004, Ro * 1.1, 10), 'steel', P(0, Ro - 0.02, -PI / 2).map((v, i) => (i === 2 ? 0 : v)));
    b.add(cylX(0.009, 0.005, 14), 'stainless', P(0, Ro - 0.02, -PI / 2));
    b.add(cylX(0.008, 0.012, 12), 'steel', P(0, Ro - 0.015, PI / 2));
    b.add(cylZ(0.003, Ro * 0.9, 8), 'blue', P(0.004, Ro - 0.03, PI / 2).map((v, i) => (i === 2 ? 0 : v)));
    return b.build();
  },

  // ---------------- thermal-paint indicator stripes on the rotor's outer edge (3 temperature grades)
  brakes_paintBands(L, D) {
    const b = new PartBuilder();
    const R = D / 2, w = Math.min(0.0045, L * 0.14);
    [['yellow', -0.3], ['orange', 0], ['red', 0.3]].forEach(([fin, f]) => b.add(ringX(R + 0.0007, R - 0.0015, w, 72), fin, [f * L, 0, 0]));
    return b.build();
  },

  // ---------------- IR rotor-temperature sensor on a stand-off bracket (aims along canonical +X)
  brakes_irSensor(L, D) {
    const b = new PartBuilder();
    const h = L / 2, R = Math.min(D / 2, 0.009);
    b.add(cylX(R, L * 0.7, 14), 'stainless', [-h + L * 0.35, 0, 0]);
    b.add(hexX(R * 1.15, 0.005), 'stainless', [h - L * 0.25, 0, 0]);
    b.add(cylX(R * 0.6, L * 0.2, 12), 'black', [h - L * 0.1, 0, 0]);
    b.add(cylX(R * 0.55, 0.02, 10), 'harness', [-h - 0.008, 0, 0]);
    b.add(box(0.003, 0.03, 0.02, 0), 'aluminum', [-h + 0.004, -0.012, 0]);
    return b.build();
  },
};

const boxes = {
  // ---------------- calipers
  brakes_caliper(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    caliperBody(b, cornerOf(ctx.pos[0]), ctx.pos);
    return b.build();
  },
  // ---------------- pads (each instance = one pad; inboard/outboard decided by z)
  brakes_pad(sx, sy, sz, ctx) {
    const which = cornerOf(ctx.pos[0]);
    const b = new PartBuilder();
    padShape(which, ctx.pos, ctx.pos[2] < GEOM[which].ringC, b);
    return b.build();
  },

  // ---------------- Bosch Motorsport ABS M5 hydraulic unit (122 x 110 x 122 mm)
  brakes_boschM5(sx, sy, sz) {
    const b = new PartBuilder();
    const bx = sx * 0.62;
    b.add(box(bx, sy * 0.78, sz * 0.82, 0.004), 'aluminum', [-sx / 2 + bx / 2, -sy * 0.06, 0]);
    // pump motor (black can) on the front face, ECU cover + 38-pin connector on the back
    b.add(cylX(sy * 0.3, sx * 0.3, 24), 'black', [-sx / 2 + bx + sx * 0.15, -sy * 0.08, 0]);
    b.add(box(sx * 0.1, sy * 0.85, sz * 0.95, 0.006), 'plastic', [-sx / 2 + sx * 0.05, 0, 0]);
    b.add(box(sx * 0.06, sy * 0.25, sz * 0.4, 0.003), 'black', [-sx / 2, sy * 0.25, 0]);
    // ports on top: 2 MC inlets + 4 wheel outlets
    const top = sy * 0.33;
    for (let i = 0; i < 6; i++) {
      const xx = -sx / 2 + bx * (i < 2 ? 0.3 : 0.7), zz = i < 2 ? (i ? 1 : -1) * sz * 0.18 : (-1.5 + (i - 2)) * sz * 0.17;
      b.add(cylY(0.0055, 0.008, 6), 'blue', [xx, top + 0.004, zz]);
    }
    // vibration mounts
    for (const s of [-1, 1]) b.add(cylY(0.01, 0.012, 12), 'rubber', [-sx / 2 + bx / 2, -sy / 2 + 0.006, s * sz * 0.3]);
    return b.build();
  },

  // ---------------- small sensor / module box with connector (yaw sensor, TPMS receiver, EPB switch)
  brakes_module(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const fin = ctx.variant === 'blue' ? 'blue' : 'plastic';
    b.add(box(sx, sy * 0.85, sz, Math.min(sx, sy, sz) * 0.2), fin, [0, -sy * 0.075, 0]);
    b.add(box(sx * 0.35, sy * 0.4, sz * 0.3, 0.002), 'black', [sx * 0.2, sy * 0.25, 0]);
    for (const s of [-1, 1]) b.add(box(sx * 0.12, sy * 0.15, sz * 0.25, 0.001), 'steel', [s * (sx / 2 - sx * 0.04), -sy * 0.42, s * sz * 0.3]);
    return b.build();
  },

  // ---------------- TPMS sensor (GM clamp-in): body hugging the drop well
  brakes_tpms(sx, sy, sz) {
    const b = new PartBuilder();
    const L = Math.max(sx, sz), H = sy;
    b.add(box(sx, H * 0.8, sz, Math.min(H, 0.006) * 0.4), 'satin', [0, -H * 0.1, 0]);
    b.add(box(sx * 0.3, H * 0.4, sz * 0.4, 0.002), 'satin', [0, H * 0.3, 0]);
    void L;
    return b.build();
  },

  // ---------------- IR rotor-temperature sensor (left side; aims along +z at the rotor's inboard face)
  // Box = sensor body. A 3 mm bracket tab runs from the body toward the wheel centre and lies on the
  // backing plate: front = under the body (body stands outboard of the duct plate), rear = on the body's
  // outboard face (body sits behind the dust shield, looking through a hole in it).
  brakes_irTempSensor(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const rear = cornerOf(ctx.pos[0]) === 'rear';
    b.add(box(sx, sy, sz, 0.002), 'black');
    b.add(cylZ(0.0055, 0.002, 16), 'steel', [0, 0, sz / 2 + 0.001]);
    b.add(cylZ(0.0042, 0.0016, 16), 'glass', [0, 0, sz / 2 + 0.0022]);
    const dx = ctx.wheelOffset.x, dy = ctx.wheelOffset.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    const ang = Math.atan2(uy, ux);
    const t = 0.003, len = 0.045;
    // tab starts under the body (front) or just inside the body's inner edge (rear, clear of the lens)
    const s0 = rear ? Math.abs(ux) * sx / 2 + Math.abs(uy) * sy / 2 - 0.004 : 0;
    const zc = rear ? sz / 2 + t / 2 : -sz / 2 - t / 2;
    b.add(box(len, 0.016, t, 0.0008), 'aluminum', [ux * (s0 + len / 2), uy * (s0 + len / 2), zc], [0, 0, ang]);
    b.add(cylZ(0.0065, 0.003, 6), 'steel', [ux * (s0 + len - 0.009), uy * (s0 + len - 0.009), zc + (rear ? -0.003 : 0.003)]);
    // cable gland on the outer edge
    b.add(cylX(0.003, 0.008, 10), 'black', [-(Math.sign(ux) || 1) * (sx / 2 + 0.004), 0, 0]);
    return b.build();
  },

  // ---------------- ABS delete / distribution tee (billet block + 3 AN fittings)
  brakes_teeBlock(sx, sy, sz) {
    // billet tee: inlet port on the front (-x) face, outlet ports on both side (+/-z) faces, mounting bolt
    const b = new PartBuilder();
    b.add(box(sx * 0.7, sy * 0.7, sz * 0.7, 0.002), 'red');
    b.add(hexX(sy * 0.22, sx * 0.15), 'blue', [-sx / 2 + sx * 0.075, 0, 0]);
    for (const s of [-1, 1]) {
      const g = hexX(sy * 0.22, sz * 0.15); g.rotateY(PI / 2);
      b.add(g, 'blue', [0, 0, s * (sz / 2 - sz * 0.075)]);
    }
    b.add(cylY(0.003, sy, 8), 'steel', [sx * 0.2, 0, 0]);
    b.add(cylY(0.0055, 0.003, 6), 'steel', [sx * 0.2, sy * 0.35 + 0.0015, 0]);
    return b.build();
  },


  // ---------------- GM EPB cable-puller actuator (motor + gearbox + cable outlet)
  brakes_epb(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.6, sy * 0.9, sz * 0.9, 0.008), 'black', [sx * 0.1, 0, 0]);
    b.add(cylX(sy * 0.38, sx * 0.4, 20), 'satin', [-sx * 0.3, -sy * 0.05, 0]);
    b.add(box(sx * 0.15, sy * 0.35, sz * 0.4, 0.002), 'plastic', [sx * 0.2, sy * 0.5, 0]);
    b.add(cylX(0.008, sx * 0.12, 12), 'steel', [sx / 2 - sx * 0.06, -sy * 0.15, 0]);
    for (const s of [-1, 1]) b.add(box(sx * 0.12, 0.004, sz * 0.3, 0), 'steel', [s * sx * 0.32, -sy / 2 + 0.006, s * sz * 0.45]);
    // fabricated mounting bracket: base plate bolted to the panel below (4 bolts) under the actuator feet
    b.add(box(sx * 1.08, 0.004, sz * 1.25, 0.001), 'steel', [0, -sy / 2 + 0.002, 0]);
    for (const i of [-1, 1]) for (const k of [-1, 1]) b.add(cylY(0.0065, 0.004, 6), 'chrome', [i * sx * 0.48, -sy / 2 + 0.006, k * sz * 0.54]);
    return b.build();
  },

  // ---------------- Wilwood-style hydraulic handbrake (vertical lever, integral MC, base)
  brakes_handbrake(sx, sy, sz) {
    const b = new PartBuilder();
    const base = 0.03;
    b.add(box(sx * 0.6, base, sz, 0.004), 'satin', [-sx * 0.1, -sy / 2 + base / 2, 0]);
    b.add(cylX(0.012, sx * 0.45, 16), 'machined', [-sx * 0.15, -sy / 2 + base + 0.012, 0]);
    b.add(hexX(0.0068, 0.012), 'blue', [-sx * 0.4, -sy / 2 + base + 0.012, 0]);
    // lever from pivot near the front of the base, raked rearward
    const p0 = V(-sx * 0.05, -sy / 2 + base + 0.02, 0), p1 = V(sx * 0.42, sy / 2 - 0.03, 0);
    b.addMatrix(box(1, 1, 1, 0), 'satin', alignX(p0, p1, 1).multiply(new THREE.Matrix4().makeScale(1, 0.022, 0.016)));
    b.add(cylX(0.016, 0.1, 16), 'black', [p1.x - 0.02, p1.y - 0.02, 0], [0, 0, Math.atan2(p1.y - p0.y, p1.x - p0.x)]);
    b.add(cylZ(0.01, sz * 0.9, 14), 'steel', [p0.x, p0.y, 0]);
    return b.build();
  },

  // ---------------- electric vacuum pump for the booster
  brakes_vacPump(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(cylX(Math.min(sy, sz) * 0.4, sx * 0.6, 24), 'black', [-sx * 0.15, 0, 0]);
    b.add(box(sx * 0.32, sy * 0.85, sz * 0.85, 0.006), 'cast', [sx * 0.32, 0, 0]);
    b.add(cylY(0.007, sy * 0.3, 12), 'black', [sx * 0.32, sy * 0.5, 0]);
    b.add(box(sx * 0.15, sy * 0.25, sz * 0.3, 0.002), 'plastic', [-sx * 0.3, sy * 0.4, 0]);
    for (const s of [-1, 1]) b.add(cylZ(0.009, 0.01, 12), 'rubber', [s * sx * 0.25, -sy * 0.45, 0]);
    return b.build();
  },

  // ---------------- stamped hose bracket tab on the wheelhouse wall (normal = thinnest axis):
  // one bolt, keyed U-clip slot for the hose end fitting, folded stiffening edge
  brakes_hoseBracket(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const dims = [sx, sy, sz], n = dims.indexOf(Math.min(...dims));
    const out = n === 2 ? ctx.side : 1; // wheel-well side of the plate
    const t = dims[n];
    b.add(box(sx, sy, sz, Math.min(0.001, t * 0.3)), 'steel');
    if (n === 2) {
      b.add(box(sx * 0.9, 0.003, 0.008, 0), 'steel', [0, sy / 2 - 0.0015, out * (t / 2 + 0.004)]);
      const bolt = hexX(0.0065, 0.005); bolt.rotateY(PI / 2);
      b.add(bolt, 'chrome', [-sx * 0.28, -sy * 0.15, out * (t / 2 + 0.0025)]);
      b.add(box(0.008, sy * 0.45, t + 0.0006, 0), 'black', [sx * 0.18, sy * 0.1, 0]);
      b.add(box(0.012, 0.0025, 0.002, 0), 'stainless', [sx * 0.18, sy * 0.1, out * (t / 2 + 0.001)]);
    } else {
      b.add(cylY(0.0065, 0.005, 6), 'chrome', [-sx * 0.28, sy / 2 + 0.0025, 0]);
    }
    return b.build();
  },

  // ---------------- factory BPMV bracket: level isolator plate on two legs down to the sloping frame-rail top
  brakes_bpmvBracket(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    const [px, py] = ctx.pos;
    // front frame-rail centreline (chassis.unibody.front-frame-rails); its box section tops out 0.078 above it (probed)
    const railTop = (x) => {
      const P = [[-0.85, 0.47], [-0.45, 0.46], [0.2, 0.45], [0.42, 0.33], [0.62, 0.255], [0.95, 0.24]];
      for (let i = 0; i < P.length - 1; i++) if (x <= P[i + 1][0]) { const f = (x - P[i][0]) / (P[i + 1][0] - P[i][0]); return P[i][1] + f * (P[i + 1][1] - P[i][1]) + 0.078; }
      return 0.3;
    };
    b.add(box(sx, sy, sz, 0.002), 'steel');
    for (const s of [-1, 1]) {
      const lx = s * (sx / 2 - 0.012), top = -sy / 2, bot = railTop(px + lx) - py;
      const hgt = top - bot;
      if (hgt > 0.004) b.add(box(0.024, hgt, sz * 0.7, 0.001), 'steel', [lx, (top + bot) / 2, 0]);
      b.add(box(0.03, 0.004, sz * 0.7, 0.001), 'steel', [lx, bot + 0.002, 0]);
      b.add(cylY(0.007, 0.005, 6), 'chrome', [lx, bot + 0.0065, 0]);
    }
    for (const i of [-1, 1]) b.add(cylY(0.012, 0.012, 12), 'rubber', [i * sx * 0.3, sy / 2 + 0.006, 0]);
    b.add(cylY(0.012, 0.012, 12), 'rubber', [0, sy / 2 + 0.006, sz * 0.32]);
    return b.build();
  },

  // ---------------- bolted plate (pedal-box floor plate, BPMV bracket) — corner bolts
  brakes_plate(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, Math.min(0.002, sy * 0.3)), ctx.variant === 'alu' ? 'aluminum' : 'steel');
    for (const i of [-1, 1]) for (const k of [-1, 1]) b.add(cylY(0.007, 0.004, 6), 'chrome', [i * (sx / 2 - 0.02), sy / 2 + 0.002, k * (sz / 2 - 0.02)]);
    if (ctx.variant === 'bracket') for (const i of [-1, 1]) b.add(cylY(0.012, 0.012, 12), 'rubber', [i * sx * 0.3, sy / 2 + 0.006, 0]);
    return b.build();
  },
};

// ------------------------------------------------------------------ path generators
function tubeNut(b, p, q, r, fin = 'steel') {
  const dir = V().subVectors(q, p).normalize();
  b.addMatrix(hexX(0.5, 1), fin, alignX(p.clone().addScaledVector(dir, 0.002), p.clone().addScaledVector(dir, 0.014), Math.max(r * 2.6, 0.0075) * 2));
}
const paths = {
  // CuNi / coated steel hard line with tube nuts both ends
  brakes_hardLine(pts, r) {
    const rr = Math.max(0.0024, Math.min(r, 0.0032));
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 8), 'copper');
    tubeNut(b, pts[0], pts[1], rr);
    tubeNut(b, pts[pts.length - 1], pts[pts.length - 2], rr);
    return b.build();
  },
  // OE rubber brake hose with crimped steel ends
  brakes_flexHose(pts, r) {
    const rr = Math.max(0.0045, r);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 10), 'rubber');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const dir = V().subVectors(q, p).normalize();
      b.addMatrix(cylX(0.5, 1, 14), 'steel', alignX(p, p.clone().addScaledVector(dir, 0.028), rr * 2.6));
    }
    tubeNut(b, pts[0], pts[1], rr * 0.6, 'steel');
    // mid-length bracket tab
    const c = curveFrom(pts), m = c.getPointAt(0.45), tn = c.getTangentAt(0.45);
    b.addMatrix(cylX(0.5, 1, 14), 'steel', alignX(m.clone().addScaledVector(tn, -0.006), m.clone().addScaledVector(tn, 0.006), rr * 3));
    b.add(box(0.025, 0.003, 0.018, 0), 'steel', [m.x + 0.012, m.y, m.z]);
    return b.build();
  },
  // corrugated high-temp duct hose with wire helix ribs
  brakes_ductHose(pts, r) {
    const curve = curveFrom(pts);
    const b = new PartBuilder().add(tubeAlong(curve, r * 0.96, null, 14), 'red');
    const len = curve.getLength();
    for (let d = 0.02; d < len - 0.01; d += 0.045) {
      const t = d / len, p = curve.getPointAt(t), tn = curve.getTangentAt(t);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tn));
      m.setPosition(p);
      b.addMatrix(new THREE.TorusGeometry(r, r * 0.08, 5, 14), 'red', m);
    }
    for (const t of [0, 1]) {
      const p = curve.getPointAt(t), tn = curve.getTangentAt(t);
      const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tn));
      m.setPosition(p.clone().addScaledVector(tn, t ? -0.015 : 0.015));
      b.addMatrix(new THREE.TorusGeometry(r * 1.02, r * 0.1, 5, 18), 'stainless', m);
    }
    return b.build();
  },
  // park-brake / bias cable: black sheath, ferrules
  brakes_cable(pts, r) {
    const rr = Math.max(0.003, r);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 8), 'black');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const dir = V().subVectors(q, p).normalize();
      b.addMatrix(cylX(0.5, 1, 10), 'steel', alignX(p, p.clone().addScaledVector(dir, 0.03), rr * 3));
    }
    return b.build();
  },
  // reservoir feed hose (clear PVC/EPDM) with hose clamps
  brakes_feedHose(pts, r) {
    const rr = Math.max(0.004, r);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 10), 'rubber');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const dir = V().subVectors(q, p).normalize();
      b.addMatrix(cylX(0.5, 1, 12), 'stainless', alignX(p.clone().addScaledVector(dir, 0.008), p.clone().addScaledVector(dir, 0.014), rr * 2.5));
    }
    return b.build();
  },
};

// ------------------------------------------------------------------ whole-component generators (absolute coords)
const whole = {
  // Tilton 600-series style floor-mount 3-pedal box with balance-bar brake pedal
  brakes_pedalBox(min, max, ctx) {
    const c = ctx.center;
    const W = (x, y, z) => [x - c.x, y - c.y, z - c.z];
    const b = new PartBuilder();
    const yb = 0.215; // top of floor plate
    // base channel + front master-cylinder bulkhead
    b.add(box(0.20, 0.012, 0.27, 0.003), 'aluminum', W(0.90, yb + 0.006, 0.37));
    b.add(box(0.012, 0.11, 0.25, 0.003), 'aluminum', W(0.805, yb + 0.055, 0.37));
    for (const z of [0.255, 0.485]) b.add(box(0.11, 0.05, 0.008, 0.002), 'aluminum', W(0.865, yb + 0.03, z));
    // pivot shaft
    b.add(cylZ(0.008, 0.25, 14), 'chrome', W(0.87, 0.24, 0.37));
    // pedals: clutch (z 0.47), brake (z 0.37), throttle (z 0.28)
    const pedal = (z, pad, top, finish = 'aluminum') => {
      const p0 = V(...W(0.87, 0.24, z)), p1 = V(...W(top[0], top[1], z));
      b.addMatrix(box(1, 1, 1, 0), finish, alignX(p0, p1, 1).multiply(new THREE.Matrix4().makeScale(1, 0.024, 0.014)));
      b.add(cylZ(0.016, 0.03, 18), finish, W(0.87, 0.24, z));
      const ang = Math.atan2(top[1] - 0.24, top[0] - 0.87);
      b.add(box(0.008, pad[1], pad[0], 0.003), 'satin', W(top[0] + 0.005, top[1] - 0.01, z), [0, 0, ang - PI / 2 + 0.25]);
      for (let i = -1; i <= 1; i++) b.add(box(0.002, 0.004, pad[0] * 0.8, 0), 'black', W(top[0] + 0.01, top[1] - 0.01 + i * 0.02, z), [0, 0, ang - PI / 2 + 0.25]);
    };
    pedal(0.47, [0.06, 0.07], [0.96, 0.45]);
    pedal(0.37, [0.08, 0.075], [0.975, 0.46]);
    pedal(0.28, [0.045, 0.11], [0.97, 0.42]);
    // balance-bar tube in the brake pedal
    b.add(cylZ(0.012, 0.035, 16), 'machined', W(0.855, 0.272, 0.37));
    // clutch master pushrod stub / pedal stops
    b.add(cylX(0.005, 0.05, 10), 'chrome', W(0.83, 0.265, 0.47));
    return b.build();
  },

  // factory tandem master cylinder with integral translucent reservoir + level sensor
  brakes_tandemMC(min, max, ctx) {
    const c = ctx.center;
    const W = (x, y, z) => [x - c.x, y - c.y, z - c.z];
    const b = new PartBuilder();
    const y = 0.74, z = 0.42;
    b.add(latheX([[0.0001, 0.31], [0.022, 0.31], [0.024, 0.315], [0.024, 0.44], [0.027, 0.45], [0.027, 0.465], [0.0001, 0.465]], 24), 'cast', W(0, y, z));
    b.add(box(0.012, 0.08, 0.11, 0.004), 'cast', W(0.47, y, z));
    for (const s of [-1, 1]) b.add(hexX(0.009, 0.01), 'steel', W(0.462, y, z + s * 0.042));
    for (const x of [0.345, 0.405]) b.add(hexX(0.007, 0.012), 'steel', W(x, y - 0.012, z - 0.026), [0, PI / 2, 0]);
    // reservoir
    b.add(box(0.12, 0.05, 0.095, 0.01), 'cage', W(0.39, y + 0.052, z));
    b.add(cylY(0.022, 0.016, 20), 'black', W(0.37, y + 0.083, z));
    b.add(box(0.025, 0.016, 0.012, 0.002), 'black', W(0.43, y + 0.04, z + 0.05));
    for (const x of [0.36, 0.42]) b.add(cylY(0.009, 0.03, 12), 'cage', W(x, y + 0.025, z));
    return b.build();
  },

  // factory tandem-diaphragm vacuum booster
  brakes_booster(min, max, ctx) {
    const c = ctx.center;
    const sx = max.x - min.x, R = Math.min(max.y - min.y, max.z - min.z) / 2;
    const b = new PartBuilder();
    const h = sx / 2;
    b.add(latheX([[0.03, -h], [R * 0.8, -h], [R * 0.97, -h + sx * 0.18], [R, -sx * 0.02], [R * 1.01, 0], [R, sx * 0.02], [R * 0.97, h - sx * 0.18], [R * 0.8, h], [0.03, h]], 48), 'satin');
    b.add(torusX(R, 0.004, 6, 48), 'satin');
    for (let k = 0; k < 4; k++) { const t = (k / 4) * 2 * PI + PI / 4; b.add(cylX(0.005, 0.03, 8), 'steel', [h + 0.015, Math.cos(t) * 0.05, Math.sin(t) * 0.05]); }
    b.add(cylX(0.012, 0.03, 12), 'black', [h + 0.015, 0, 0]);
    b.add(cylY(0.012, 0.03, 14), 'black', [-h * 0.3, R * 0.95, R * 0.25]);
    void c;
    return b.build();
  },

  // GM EBCM + BPMV (Bosch ESP-style): aluminium valve block, pump motor, black EBCM cover
  brakes_bpmv(min, max, ctx) {
    // drawn from the data primitives: [0] valve block, [1] EBCM cover (rear face), [2] pump motor (axis x, forward)
    const c = ctx.center;
    const W = (x, y, z) => [x - c.x, y - c.y, z - c.z];
    const b = new PartBuilder();
    const [mB, mE, mP] = ctx.comp.model;
    const [x, y, z] = mB.pos, [bx, by, bz] = mB.size;
    b.add(box(bx, by, bz, 0.004), 'aluminum', W(x, y, z));
    const [ex, ey, ez] = mE.pos, [ew, eh, ed] = mE.size;
    b.add(box(ew, eh, ed, 0.006), 'black', W(ex, ey, ez));
    b.add(box(0.02, 0.028, 0.045, 0.003), 'black', W(ex + ew / 2 + 0.008, ey + eh * 0.25, ez)); // 46-pin connector
    const [px, py, pz] = mP.pos, pl = mP.size[0], pr = mP.size[1] / 2;
    const xa = px + pl / 2, xb = px - pl / 2; // xa on the block face, xb motor end cap
    b.add(latheX([[0.0001, 0], [pr - 0.002, 0], [pr, 0.01], [pr, pl - 0.007], [pr - 0.006, pl], [0.0001, pl]], 24), 'black', W(xa, py, pz), [0, PI, 0]);
    void xb;
    // 2 MC inlets (rear row) + 4 wheel outlets (front row) on top
    for (let i = 0; i < 6; i++) {
      const front = i >= 2, k = front ? i - 2 : i;
      const xx = x + (front ? -bx * 0.25 : bx * 0.25), zz = front ? z + (-1.5 + k) * bz * 0.2 : z + (k ? 1 : -1) * bz * 0.18;
      b.add(cylY(0.0055, 0.008, 6), 'steel', W(xx, y + by / 2 + 0.004, zz));
    }
    void min; void max;
    return b.build();
  },

};

export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules: [
    // wheels & tyres
    [/^wheels\.wheels\.front-wheel$/, 'brakes_wheel', { variant: 'front' }],
    [/^wheels\.wheels\.rear-wheel$/, 'brakes_wheel', { variant: 'rear' }],
    [/^wheels\.tires\.front-tire$/, 'brakes_tire', { variant: 'front' }],
    [/^wheels\.tires\.rear-tire$/, 'brakes_tire', { variant: 'rear' }],
    [/^wheels\.wheels\.center-caps$/, 'brakes_centerCap'],
    [/^wheels\.wheels\.valve-stems$/, 'brakes_valveStem'],
    [/^wheels\.wheels\.hub-centric-rings$/, 'brakes_ring'],
    [/^wheels\.tpms\.tpms-sensors$/, 'brakes_tpms', { usesPos: true }],
    [/^wheels\.tpms\.tpms-receiver$/, 'brakes_module'],
    [/^wheels\.spacers\.(front|rear)-spacers$/, 'brakes_spacer'],
    [/^wheels\.front-hubs-bearings\.hub-bearing$/, 'brakes_hubBearing', { variant: 'front' }],
    [/^wheels\.rear-hubs-bearings\.hub-bearing$/, 'brakes_hubBearing', { variant: 'rear' }],
    [/^wheels\.rear-hubs-bearings\.axle-nut$/, 'nut'],
    [/^wheels\.studs-and-lug-nuts\.wheel-studs$/, 'brakes_stud'],
    [/^wheels\.studs-and-lug-nuts\.lug-nuts$/, 'brakes_lugNut'],
    // rotors
    [/^brakes\.front-rotors\.rotor$/, 'brakes_rotorRing', { variant: 'front' }],
    [/^brakes\.front-rotors\.hat$/, 'brakes_frontHat'],
    [/^brakes\.front-rotors\.ring-hardware$/, 'brakes_hatBolts'],
    [/^brakes\.front-rotors\.dust-shield$/, 'brakes_dustShield', { variant: 'front' }],
    [/^brakes\.rear-rotors\.rotor$/, 'brakes_rotorRing', { variant: 'rear', shapes: ['disc'] }],
    [/^brakes\.rear-rotors\.rotor$/, 'brakes_rearHat', { shapes: ['cylinder'] }],
    [/^brakes\.rear-rotors\.dust-shield-backing-plate$/, 'brakes_dustShield', { variant: 'rear' }],
    // calipers & pads
    [/^brakes\.(front|rear)-calipers\.caliper$/, 'brakes_caliper', { usesPos: true }],
    [/^brakes\.(front|rear)-pads\.pads$/, 'brakes_pad', { usesPos: true }],
    [/^brakes\.(front-calipers\.pad-retaining-pins|rear-calipers\.pad-hardware)$/, 'brakes_padPin'],
    [/^brakes\.(front|rear)-calipers\.bleeder-screws$/, 'brakes_bleeder'],
    [/^brakes\.lines\.banjo-bolts-crush-washers$/, 'brakes_banjo'],
    // lines
    [/^brakes\.lines\.(mc-to-abs-lines|front-hard-lines|rear-hard-lines|rear-axle-lines)$/, 'brakes_hardLine'],
    [/^brakes\.lines\.(front|rear)-flex-hoses$/, 'brakes_flexHose'],
    [/^brakes\.lines\.rear-tee$/, 'brakes_teeBlock'],
    [/^brakes\.abs\.abs-delete-block$/, 'brakes_teeBlock'],
    [/^brakes\.lines\.hose-brackets$/, 'brakes_hoseBracket'],
    [/^brakes\.lines\.(bulkhead-fittings|adaptors)$/, 'brakes_fitting'],
    // pedal box & masters
    [/^brakes\.pedal-box\.pedal-assembly$/, 'brakes_pedalBox', { whole: true }],
    [/^brakes\.pedal-box\.floor-mount-plate$/, 'brakes_plate'],
    [/^brakes\.pedal-box\.balance-bar$/, 'brakes_balanceBar'],
    [/^brakes\.pedal-box\.bias-adjuster-cable$/, 'brakes_cable', { shapes: ['tube'] }],
    [/^brakes\.pedal-box\.bias-adjuster-cable$/, 'brakes_biasKnob', { shapes: ['cylinder'] }],
    [/^brakes\.pedal-box\.brake-light-switch$/, 'brakes_pressureSwitch'],
    [/^brakes\.master-cylinders\.(front|rear)-mc$/, 'brakes_masterCyl', { axis: 'x' }],
    [/^brakes\.master-cylinders\.factory-tandem-mc$/, 'brakes_tandemMC', { whole: true }],
    [/^brakes\.master-cylinders\.factory-booster$/, 'brakes_booster', { whole: true }],
    [/^brakes\.master-cylinders\.booster-vacuum-pump$/, 'brakes_vacPump'],
    [/^brakes\.master-cylinders\.remote-reservoirs$/, 'brakes_reservoir', { axis: 'y' }],
    [/^brakes\.master-cylinders\.reservoir-feed-hoses$/, 'brakes_feedHose'],
    [/^brakes\.master-cylinders\.brake-pressure-sensors$/, 'brakes_pressureSensor'],
    // ABS
    [/^brakes\.abs\.factory-bpmv-ebcm$/, 'brakes_bpmv', { whole: true }],
    [/^brakes\.abs\.bpmv-bracket$/, 'brakes_bpmvBracket', { usesPos: true }],
    [/^brakes\.abs\.bosch-motorsport-abs$/, 'brakes_boschM5'],
    [/^brakes\.abs\.abs-map-switch$/, 'brakes_rotarySwitch'],
    [/^brakes\.abs\.wheel-speed-sensors-(front|rear)$/, 'brakes_wss'],
    [/^brakes\.abs\.yaw-rate-sensor$/, 'brakes_module', { variant: 'blue' }],
    // cooling
    [/^brakes\.cooling\.inlets$/, 'brakes_ductInlet', { axis: 'x' }],
    [/^brakes\.cooling\.(duct-hose|rear-ducts)$/, 'brakes_ductHose'],
    [/^brakes\.cooling\.backing-plates$/, 'brakes_ductPlate', { shapes: ['disc'] }],
    [/^brakes\.cooling\.backing-plates$/, 'brakes_ductSpigot', { shapes: ['cylinder'] }],
    [/^brakes\.cooling\.temperature-indicators$/, 'brakes_irTempSensor', { usesPos: true }],
    // parking brake
    [/^brakes\.parking-brake\.epb-actuator-module$/, 'brakes_epb'],
    [/^brakes\.parking-brake\.(intermediate-cable|rear-cables)$/, 'brakes_cable'],
    [/^brakes\.parking-brake\.shoes$/, 'brakes_pbShoes'],
    [/^brakes\.parking-brake\.cable-grommets$/, 'brakes_grommet'],
    [/^brakes\.parking-brake\.epb-switch$/, 'brakes_module'],
    [/^brakes\.parking-brake\.hydraulic-handbrake$/, 'brakes_handbrake'],
  ],
  axial,
  boxes,
  paths,
  whole,
};
