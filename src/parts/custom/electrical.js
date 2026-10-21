// Precise part models for the "electrical" group. See data/MODELING.md.
// Owned by one modeling pass; generator names must be prefixed "electrical_".
//
// Reference parts (see each component's modelRef for links):
//   dash display  MoTeC C127/C187 196.2 x 122.5 x 24.9 mm, 7" TFT, 10 top LEDs + 3 per side, 79-pin Autosport rear
//   PDM           MoTeC PDM30 107.5 x 127.5 x 38.7 mm, 34 + 26 pin Superseal connectors, M6 battery stud
//   ECU           MoTeC M150 162 x 127.5 x 40.5 mm, 2 x 34 + 2 x 26 pin connectors on one long edge
//   keypad        MoTeC 15 button (5 x 3) 129.5 x 89.5 x 15.7 mm, rear DT04-4P connector
//   battery       Odyssey PC925 168.6 x 179 x 128 mm (148 mm over terminals)
//   master switch Longacre 4-terminal: 67 mm body, 107 mm overall, 86 x 92 mm panel, red removable key
import * as THREE from 'three';
// eslint-disable-next-line no-unused-vars
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, Helix, curveFrom, tubeAlong, ribbonAlong, alignX, V } from '../geo.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ helpers

/**
 * Local frame for flat electronics: local X = face normal (thickness T, front face at +T/2),
 * local Y = "up" on the face (H), local Z = width on the face (W). `face` picks which world
 * direction the front faces; default = the thinnest world axis, positive direction.
 */
function frame(sx, sy, sz, face) {
  let f = face;
  if (!f) {
    const d = [sx, sy, sz];
    f = ['+x', '+y', '+z'][d.indexOf(Math.min(...d))];
  }
  switch (f) {
    case '-x': return { T: sx, H: sy, W: sz, rot: [0, PI, 0] };
    case '+y': return { T: sy, H: sx, W: sz, rot: [0, 0, PI / 2] };
    case '-y': return { T: sy, H: sx, W: sz, rot: [0, 0, -PI / 2] };
    case '+z': return { T: sz, H: sy, W: sx, rot: [0, -PI / 2, 0] };
    case '-z': return { T: sz, H: sy, W: sx, rot: [0, PI / 2, 0] };
    default: return { T: sx, H: sy, W: sz, rot: [0, 0, 0] };
  }
}

function done(b, rot) {
  const g = b.build();
  if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
  return g;
}

/** Plain (unrounded) box — for small details, keeps the triangle count low. */
const pbox = (x, y, z) => box(x, y, z, 0);

/** Sealed rectangular connector + mating plug sticking out along +dir (axis 'y' or 'z' in the local frame). */
function rectConn(b, p, axis, sign, len, depthT, out = 0.012) {
  const [x, y, z] = p;
  if (axis === 'z') {
    b.add(pbox(depthT, len, out), 'plastic', [x, y, z + sign * out / 2]);
    b.add(pbox(depthT * 0.92, len * 0.94, out), 'black', [x, y, z + sign * out * 1.5]);
    b.add(cylZ(Math.min(depthT, len) * 0.28, out * 1.4, 10), 'harness', [x, y, z + sign * out * 2.7]);
  } else {
    b.add(pbox(depthT, out, len), 'plastic', [x, y + sign * out / 2, z]);
    b.add(pbox(depthT * 0.92, out, len * 0.94), 'black', [x, y + sign * out * 1.5, z]);
    b.add(cylY(Math.min(depthT, len) * 0.28, out * 1.4, 10), 'harness', [x, y + sign * out * 2.7, z]);
  }
}

/** Unit-X object placed from a to b with radius scale r (wraps alignX). */
function along(b, geo, finish, a, c, r) {
  b.addMatrix(geo, finish, alignX(a, c, r));
}

/** Any unit vector perpendicular to d. */
function perp(d) {
  const up = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  return V().crossVectors(d, up).normalize();
}

/** Ring terminal lug + heat-shrink boot at the end p of a cable whose last segment comes from q. */
function lug(b, p, q, rr, bootFinish) {
  const d = V().subVectors(p, q).normalize();
  const Rl = Math.max(0.007, rr * 1.5);
  // barrel overlapping the cable end
  along(b, cylX(1, 1, 12), 'stainless', p.clone().addScaledVector(d, -0.018), p.clone().addScaledVector(d, 0.004), rr * 1.12);
  // heat-shrink boot
  along(b, cylX(1, 1, 12), bootFinish, p.clone().addScaledVector(d, -0.04), p.clone().addScaledVector(d, -0.012), rr * 1.32);
  // flat ring tongue
  const n = perp(d);
  const c = p.clone().addScaledVector(d, Rl * 1.1);
  along(b, ringX(1, 0.42, 1, 16), 'stainless', c.clone().addScaledVector(n, -0.0015), c.clone().addScaledVector(n, 0.0015), Rl);
}

// ======================================================================= BOXES

const boxes = {
  // ---------------------------------------------------------------- dash display (MoTeC C127 / C187)
  electrical_display(sx, sy, sz, ctx) {
    const { T, H, W, rot } = frame(sx, sy, sz, '+x');
    const v = ctx?.variant || '';
    const b = new PartBuilder();
    const d = Math.min(0.025, T * 0.6);
    const xf = T / 2, xb = xf - d;
    if (!v) {
      b.add(box(d * 0.72, H, W, 0.008), 'black', [xb + d * 0.36, 0, 0]); // rear shell
      b.add(box(d * 0.3, H, W, 0.004), 'satin', [xf - d * 0.15, 0, 0]); // front bezel
      const sw = Math.min(W * 0.79, 0.155), sh = Math.min(H * 0.71, 0.087);
      b.add(pbox(0.0012, sh, sw), 'screen', [xf + 0.0005, -H * 0.06, 0]);
      b.add(pbox(0.0006, sh * 1.07, sw * 1.05), 'glass', [xf + 0.0013, -H * 0.06, 0]);
      for (const a of [-1, 1]) for (const c of [-1, 1]) b.add(cylX(0.0045, 0.006, 10), 'aluminum', [xb - 0.003, a * H * 0.33, c * W * 0.4]);
      // two side push-button cut-outs on the bezel corners (blank on C127)
      for (const c of [-1, 1]) b.add(pbox(0.0015, H * 0.08, W * 0.05), 'black', [xf + 0.0006, -H * 0.4, c * W * 0.44]);
    }
    if (v !== 'logger') {
      // 10 programmable shift LEDs across the top + 3 alarm LEDs down each side
      const p = v === 'leds' ? 0.0016 : 0.0008;
      const yT = H / 2 - H * 0.075, span = W * 0.62;
      for (let i = 0; i < 10; i++) {
        const fin = i < 4 ? 'screen' : i < 7 ? 'yellow' : 'lens';
        b.add(cylX(0.0032, 0.0016, 10), fin, [xf + p, yT, -span / 2 + (i * span) / 9]);
      }
      for (const s of [-1, 1]) for (let j = 0; j < 3; j++) b.add(cylX(0.0032, 0.0016, 10), 'lens', [xf + p, H * 0.2 - j * H * 0.2, s * W * 0.452]);
    }
    if (v !== 'leds') {
      // rear 79-pin Autosport connector + backshell boot + loom
      const L = Math.max(0.006, T - d);
      const r = v === 'logger' ? 0.0168 : 0.016;
      b.add(cylX(r, L * 0.5, 20), 'satin', [xb - L * 0.25, -H * 0.12, W * 0.18]);
      b.add(cylX(r * 0.95, L * 0.06, 20), 'machined', [xb - L * 0.5, -H * 0.12, W * 0.18]);
      b.add(cylX(r * 0.5, L * 0.44, 14, r * 0.85), 'rubber', [xb - L * 0.75, -H * 0.12, W * 0.18]);
      if (v === 'logger') {
        b.add(pbox(L * 0.3, 0.008, 0.014), 'black', [xb - L * 0.15, H * 0.2, -W * 0.25]); // USB port boss
        b.add(pbox(0.002, H * 0.5, W * 0.45), 'satin', [xb - 0.0012, H * 0.08, -W * 0.15]); // logger memory cover
      }
    }
    return done(b, rot);
  },

  // ---------------------------------------------------------------- PDM (MoTeC PDM30)
  electrical_pdm(sx, sy, sz) {
    const { T, H, W, rot } = frame(sx, sy, sz, '+x');
    const b = new PartBuilder();
    b.add(box(T * 0.86, H, W, 0.005), 'satin', [T * 0.07, 0, 0]);
    b.add(pbox(T * 0.14, H * 0.96, W * 0.96), 'black', [-T / 2 + T * 0.07, 0, 0]); // base
    b.add(pbox(0.0006, H * 0.55, W * 0.62), 'aluminum', [T / 2 + 0.0003, H * 0.1, -W * 0.05]); // label
    b.add(pbox(0.0007, H * 0.05, W * 0.3), 'red', [T / 2 + 0.0004, -H * 0.3, -W * 0.15]); // MoTeC logo bar
    // mounting ears top and bottom
    for (const a of [-1, 1]) for (const c of [-1, 1]) {
      b.add(pbox(0.004, 0.012, 0.016), 'satin', [-T / 2 + 0.002, a * (H / 2 + 0.005), c * W * 0.32]);
      b.add(cylX(0.0028, 0.0045, 8), 'chrome', [-T / 2 + 0.005, a * (H / 2 + 0.006), c * W * 0.32]);
    }
    // 34-pin and 26-pin sealed connectors on the +Z (inboard) edge
    rectConn(b, [T * 0.05, H * 0.2, W / 2], 'z', 1, 0.05, T * 0.55);
    rectConn(b, [T * 0.05, -H * 0.24, W / 2], 'z', 1, 0.04, T * 0.55);
    // M6 battery stud with red boot on the top edge
    b.add(cylY(0.003, 0.016, 8), 'gold', [T * 0.05, H / 2 + 0.008, -W * 0.25]);
    b.add(cylY(0.009, 0.014, 14, 0.006), 'red', [T * 0.05, H / 2 + 0.008, -W * 0.25]);
    return done(b, rot);
  },

  // ---------------------------------------------------------------- ECU (MoTeC M150) / Holley GDI driver
  electrical_ecu(sx, sy, sz, ctx) {
    const { T, H, W, rot } = frame(sx, sy, sz, '+x');
    const b = new PartBuilder();
    if (ctx?.variant === 'gdi') {
      // finned aluminium injector-driver box
      b.add(box(T * 0.45, H, W, 0.004), 'cast', [-T / 2 + T * 0.225, 0, 0]);
      const n = 9;
      for (let i = 0; i < n; i++) b.add(pbox(T * 0.55, H * 0.9, 0.0025), 'cast', [T * 0.225, 0, -W * 0.44 + (i * W * 0.88) / (n - 1)]);
      for (const a of [-1, 1]) for (const c of [-1, 1]) b.add(cylX(0.004, T * 0.2, 8), 'chrome', [-T / 2 + T * 0.1, a * H * 0.44, c * W * 0.47]);
      rectConn(b, [-T * 0.1, -H / 2, -W * 0.2], 'y', -1, 0.036, T * 0.5);
      rectConn(b, [-T * 0.1, -H / 2, W * 0.22], 'y', -1, 0.028, T * 0.5);
      return done(b, rot);
    }
    b.add(box(T * 0.82, H, W, 0.006), 'satin', [T * 0.09, 0, 0]);
    b.add(pbox(T * 0.18, H * 0.97, W * 0.97), 'black', [-T / 2 + T * 0.09, 0, 0]);
    b.add(pbox(0.0012, H * 0.62, W * 0.7), 'black', [T / 2 + 0.0006, H * 0.05, 0]); // recessed label panel
    b.add(pbox(0.0008, H * 0.06, W * 0.22), 'red', [T / 2 + 0.0012, H * 0.25, -W * 0.18]); // MoTeC logo bar
    for (const a of [-1, 1]) for (const c of [-1, 1]) b.add(cylX(0.0055, T * 0.24, 10), 'rubber', [-T / 2 + T * 0.12, a * H * 0.42, c * W * 0.45]);
    // A (34) B (26) C (34) D (26) connectors along the bottom long edge
    const widths = [0.034, 0.027, 0.034, 0.027];
    const gap = 0.006, tot = widths.reduce((s, w) => s + w, 0) + gap * 3;
    let z = -tot / 2;
    for (const w of widths) {
      rectConn(b, [T * 0.02, -H / 2, z + w / 2], 'y', -1, w, T * 0.6);
      z += w + gap;
    }
    return done(b, rot);
  },

  // ---------------------------------------------------------------- 15-button CAN keypad (MoTeC 5 x 3)
  electrical_keypad(sx, sy, sz) {
    const { T, H, W, rot } = frame(sx, sy, sz, '+x');
    const b = new PartBuilder();
    const t = Math.min(0.0157, T * 0.6);
    const xf = T / 2, xb = xf - t;
    b.add(box(t, H, W, 0.006), 'black', [xf - t / 2, 0, 0]);
    const cols = W >= H ? 5 : 3, rows = W >= H ? 3 : 5;
    const pz = (W * 0.88) / cols, py = (H * 0.84) / rows;
    const k = Math.min(pz, py) * 0.8;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const z = -W * 0.44 + pz * (i + 0.5), y = H * 0.42 - py * (j + 0.5);
      b.add(pbox(0.004, k, k), 'rubber', [xf + 0.002, y, z]);
      b.add(pbox(0.0008, k * 0.12, k * 0.62), (i + j) % 3 === 0 ? 'lens' : 'screen', [xf + 0.0042, y + k * 0.3, z]); // 3-LED bar
      b.add(pbox(0.0006, k * 0.3, k * 0.5), 'cage', [xf + 0.0042, y - k * 0.12, z]); // legend label
    }
    for (const a of [-1, 1]) for (const c of [-1, 1]) b.add(cylX(0.0024, 0.0012, 8), 'machined', [xf + 0.0005, a * H * 0.45, c * W * 0.47]);
    // moulded DT04-4P connector on the back
    const L = Math.max(0.004, T - t);
    b.add(pbox(L, 0.016, 0.021), 'plastic', [xb - L / 2, -H * 0.1, 0]);
    b.add(pbox(L * 0.4, 0.004, 0.012), 'orange', [xb - L * 0.6, -H * 0.1 + 0.0095, 0]); // wedge lock
    return done(b, rot);
  },

  // ---------------------------------------------------------------- battery (Odyssey PC925 AGM)
  electrical_battery(sx, sy, sz) {
    const b = new PartBuilder();
    const hc = sy * 0.865; // case height (128 of 148 mm)
    const y0 = -sy / 2;
    b.add(box(sx, hc - 0.01, sz, 0.006), 'black', [0, y0 + (hc - 0.01) / 2, 0]);
    b.add(box(sx * 0.995, 0.012, sz * 0.995, 0.004), 'plastic', [0, y0 + hc - 0.006, 0]); // lid
    // moulded carry-handle recesses
    for (const s of [-1, 1]) b.add(pbox(sx * 0.4, 0.004, 0.02), 'rubber', [sx * 0.1, y0 + hc + 0.0005, s * sz * 0.2]);
    // label bands on the long faces
    for (const s of [-1, 1]) {
      b.add(pbox(sx * 0.86, hc * 0.5, 0.001), 'satin', [0, y0 + hc * 0.48, s * (sz / 2 + 0.0005)]);
      b.add(pbox(sx * 0.6, hc * 0.1, 0.0012), 'yellow', [0, y0 + hc * 0.58, s * (sz / 2 + 0.0008)]);
      b.add(pbox(sx * 0.86, hc * 0.035, 0.0012), 'red', [0, y0 + hc * 0.3, s * (sz / 2 + 0.0008)]);
    }
    // terminals at the front (-x) corners: + toward +z
    const xt = -sx * 0.35;
    for (const s of [-1, 1]) {
      const z = s * sz * 0.36;
      b.add(pbox(0.04, 0.012, 0.04), 'black', [xt, y0 + hc + 0.004, z]); // terminal shroud
      b.add(cylY(0.0085, 0.014, 14), 'gold', [xt, y0 + hc + 0.016, z]); // brass M6 post
      b.add(cylY(0.0075, 0.012, 14, 0.0068), 'machined', [xt, sy / 2 - 0.007, z]); // SAE post
      if (s > 0) b.add(cylY(0.012, 0.004, 14), 'red', [xt, y0 + hc + 0.011, z]);
    }
    return b.build();
  },

  // ---------------------------------------------------------------- generic small modules / switches / lamps
  electrical_module(sx, sy, sz, ctx) {
    const v = ctx?.variant || 'box';
    const FACE = { irsensor: '-y', beacon: '-z', camera: '-x', lampHead: '-x', killPlate: '+y', gps: '+y', fuseblock: '+y', anl: '+y', isolator: '+y', resistor: '+y', tmap: '+y', cooler: '+y', pedal: '+x' };
    if (v === 'sharkFin' || v === 'marker' || v === 'strapBox' || v === 'lampTail') return moduleWorld(sx, sy, sz, ctx);
    const { T, H, W, rot } = frame(sx, sy, sz, FACE[v]);
    const b = new PartBuilder();
    const xf = T / 2;
    switch (v) {
      case 'isolator': { // Cartek XR solid-state isolator on the battery negative
        b.add(box(T * 0.62, H, W, 0.004), 'black', [-T / 2 + T * 0.31, 0, 0]);
        b.add(pbox(0.0006, H * 0.5, W * 0.6), 'red', [-T / 2 + T * 0.62 + 0.0003, H * 0.1, 0]);
        for (const s of [-1, 1]) {
          b.add(cylX(0.004, T * 0.36, 10), 'gold', [-T / 2 + T * 0.8, -H * 0.2, s * W * 0.28]);
          b.add(hexX(0.0068, T * 0.1), 'chrome', [-T / 2 + T * 0.7, -H * 0.2, s * W * 0.28]);
        }
        b.add(pbox(T * 0.25, 0.012, 0.016), 'plastic', [-T / 2 + T * 0.3, H / 2 + 0.006, 0]);
        b.add(cylX(0.0018, 0.001, 8), 'lens', [-T / 2 + T * 0.62 + 0.0005, H * 0.35, W * 0.3]);
        break;
      }
      case 'expander': { // MoTeC E888/E816
        b.add(box(T * 0.85, H, W * 0.9, 0.005), 'satin', [T * 0.075, 0, -W * 0.05]);
        b.add(pbox(T * 0.15, H * 0.96, W * 0.88), 'black', [-T / 2 + T * 0.075, 0, -W * 0.05]);
        b.add(pbox(0.0006, H * 0.5, W * 0.55), 'aluminum', [xf + 0.0003, 0, -W * 0.1]);
        rectConn(b, [T * 0.05, H * 0.2, W * 0.4], 'z', 1, H * 0.34, T * 0.6, 0.008);
        rectConn(b, [T * 0.05, -H * 0.2, W * 0.4], 'z', 1, H * 0.34, T * 0.6, 0.008);
        break;
      }
      case 'beacon': { // MoTeC BR2 IR beacon receiver
        b.add(box(T, H, W * 0.85, 0.004), 'black', [0, 0, -W * 0.075]);
        b.add(pbox(0.0015, H * 0.6, W * 0.35), 'glass', [xf + 0.0006, 0, -W * 0.2]);
        b.add(pbox(0.001, H * 0.5, W * 0.3), 'lens', [xf - 0.0002, 0, -W * 0.2]);
        b.add(cylZ(Math.min(T, H) * 0.32, W * 0.15, 14), 'satin', [0, 0, W * 0.425]);
        break;
      }
      case 'transponder': { // MyLaps TR2 car transponder
        b.add(box(T, H * 0.8, W * 0.8, 0.005), 'black', [0, 0, 0]);
        for (const s of [-1, 1]) b.add(pbox(T * 0.35, H * 0.4, W * 0.1), 'black', [-T * 0.32, 0, s * W * 0.45]);
        for (const s of [-1, 1]) b.add(cylX(0.0025, T * 0.4, 8), 'chrome', [-T * 0.1, 0, s * W * 0.45]);
        b.add(pbox(0.0008, H * 0.45, W * 0.55), 'yellow', [xf + 0.0004, H * 0.05, 0]);
        b.add(cylY(0.004, H * 0.1, 10), 'rubber', [0, H * 0.45, W * 0.25]);
        break;
      }
      case 'irsensor':
      case 'irside': { // Izze-style IR tyre / brake temperature sensor
        b.add(box(T, H, W * 0.82, 0.003), 'satin', [0, 0, -W * 0.09]);
        b.add(pbox(0.0012, H * 0.45, W * 0.25), 'glass', [xf + 0.0005, 0, -W * 0.2]);
        b.add(cylX(Math.min(H, W) * 0.12, 0.0015, 12), 'screen', [xf + 0.0002, 0, -W * 0.2]);
        b.add(cylZ(Math.min(T, H) * 0.3, W * 0.18, 10), 'rubber', [0, 0, W * 0.41]);
        break;
      }
      case 'gps': { // AiM GPS09c puck
        b.add(box(T, H, W, Math.min(H, W) * 0.2), 'black', [0, 0, 0]);
        b.add(pbox(0.0006, H * 0.35, W * 0.5), 'cage', [xf + 0.0003, H * 0.15, 0]);
        b.add(cylZ(0.004, 0.012, 10), 'rubber', [-T * 0.1, 0, W / 2 + 0.005]);
        break;
      }
      case 'fpcm': { // fuel pump / fan control module
        b.add(box(T * 0.55, H, W, 0.004), 'cast', [-T / 2 + T * 0.275, 0, 0]);
        for (let i = 0; i < 8; i++) b.add(pbox(T * 0.45, H * 0.85, 0.0025), 'cast', [T * 0.275, 0, -W * 0.42 + (i * W * 0.84) / 7]);
        rectConn(b, [-T * 0.15, H / 2, -W * 0.2], 'y', 1, W * 0.28, T * 0.5, 0.008);
        rectConn(b, [-T * 0.15, H / 2, W * 0.2], 'y', 1, W * 0.22, T * 0.5, 0.008);
        break;
      }
      case 'relay': { // Bussmann RTMR sealed fuse/relay module
        b.add(pbox(T * 0.35, H, W), 'black', [-T / 2 + T * 0.175, 0, 0]);
        b.add(box(T * 0.65, H * 0.94, W * 0.94, 0.004), 'plastic', [T * 0.175, 0, 0]);
        for (const s of [-1, 1]) b.add(pbox(T * 0.4, H * 0.3, 0.006), 'black', [T * 0.05, 0, s * W * 0.49]); // latches
        for (const a of [-1, 1]) b.add(pbox(T * 0.15, 0.01, W * 0.3), 'black', [-T / 2 + T * 0.075, a * (H / 2 + 0.004), 0]);
        rectConn(b, [-T * 0.25, -H / 2, 0], 'y', -1, W * 0.4, T * 0.3, 0.008);
        break;
      }
      case 'fuseblock': { // Blue Sea ST Blade 6-circuit with cover
        b.add(pbox(T * 0.45, H, W), 'black', [-T / 2 + T * 0.225, 0, 0]);
        const cols = ['red', 'blue', 'yellow', 'orange', 'blue', 'red'];
        for (let i = 0; i < 6; i++) b.add(pbox(T * 0.3, H * 0.28, W * 0.08), cols[i], [-T * 0.05, H * 0.05, -W * 0.36 + (i * W * 0.72) / 5]);
        for (let i = 0; i < 6; i++) b.add(cylX(0.003, T * 0.2, 8), 'chrome', [-T * 0.05, -H * 0.32, -W * 0.36 + (i * W * 0.72) / 5]);
        b.add(box(T * 0.55, H * 0.98, W * 0.98, 0.004), 'glass', [T * 0.22, 0, 0]);
        for (const s of [-1, 1]) b.add(cylX(0.004, T * 0.4, 8), 'gold', [-T * 0.1, H * 0.4, s * W * 0.44]);
        break;
      }
      case 'anl': { // ANL fuse holder (main fuse)
        b.add(pbox(T * 0.4, H, W), 'black', [-T / 2 + T * 0.2, 0, 0]);
        b.add(pbox(T * 0.15, H * 0.5, W * 0.75), 'chrome', [-T * 0.1, 0, 0]);
        b.add(pbox(T * 0.12, H * 0.35, W * 0.3), 'red', [-T * 0.05, 0, 0]);
        for (const s of [-1, 1]) {
          b.add(cylX(0.004, T * 0.45, 8), 'gold', [-T * 0.05, 0, s * W * 0.36]);
          b.add(hexX(0.0068, T * 0.1), 'chrome', [T * 0.05, 0, s * W * 0.36]);
        }
        b.add(box(T * 0.35, H * 0.95, W * 0.6, 0.004), 'glass', [T * 0.3, 0, 0]);
        break;
      }
      case 'anderson': { // Anderson SB50 charge / jump connector
        b.add(box(T, H, W * 0.6, 0.003), 'red', [0, 0, W * 0.2]);
        for (const s of [-1, 1]) b.add(pbox(T * 0.15, H * 0.2, W * 0.3), 'copper', [xf - T * 0.1, s * H * 0.22, W * 0.3]);
        for (const s of [-1, 1]) b.add(cylZ(H * 0.2, W * 0.4, 10), 'rubber', [0, s * H * 0.22, -W * 0.3]);
        break;
      }
      case 'busbar':
      case 'junction': { // ground star bus bar / front power junction stud
        const fin = v === 'junction' ? 'red' : 'black';
        b.add(pbox(T * 0.35, H, W), 'black', [-T / 2 + T * 0.175, 0, 0]);
        b.add(pbox(T * 0.2, H * 0.6, W * 0.92), 'copper', [-T / 2 + T * 0.45, 0, 0]);
        const n = v === 'junction' ? 2 : 5;
        for (let i = 0; i < n; i++) {
          const z = n === 1 ? 0 : -W * 0.38 + (i * W * 0.76) / (n - 1);
          b.add(cylX(0.0035, T * 0.4, 8), 'gold', [T * 0.1, 0, z]);
          b.add(hexX(0.006, T * 0.08), 'chrome', [T * 0.05, 0, z]);
        }
        if (v === 'junction') b.add(box(T * 0.45, H * 0.8, W * 0.5, 0.006), fin, [T * 0.25, 0, -W * 0.2]);
        break;
      }
      case 'dtm': { // Deutsch DT/DTM connector pair
        b.add(pbox(T * 0.5, H * 0.8, W * 0.55), 'plastic', [-T * 0.25, 0, 0]);
        b.add(pbox(T * 0.5, H * 0.75, W * 0.5), 'black', [T * 0.25, 0, 0]);
        b.add(pbox(T * 0.15, H * 0.2, W * 0.4), 'orange', [T * 0.2, H * 0.45, 0]);
        b.add(pbox(T * 0.4, H * 0.12, W * 0.12), 'plastic', [-T * 0.1, H * 0.46, 0]); // latch
        b.add(cylZ(Math.min(T, H) * 0.25, W * 0.2, 10), 'harness', [T * 0.25, 0, W * 0.35]);
        b.add(cylZ(Math.min(T, H) * 0.25, W * 0.2, 10), 'harness', [-T * 0.25, 0, -W * 0.35]);
        break;
      }
      case 'tmap': { // GM TMAP sensor
        b.add(pbox(T * 0.4, H * 0.6, W * 0.6), 'plastic', [-T / 2 + T * 0.2, 0, 0]);
        b.add(cylX(Math.min(H, W) * 0.18, T * 0.4, 12), 'plastic', [-T * 0.1, 0, 0]);
        b.add(pbox(T * 0.5, H * 0.35, W * 0.5), 'black', [T * 0.25, -H * 0.15, W * 0.15]);
        b.add(pbox(T * 0.15, H * 0.25, W * 0.25), 'plastic', [-T / 2 + 0.002, H * 0.38, -W * 0.3]); // tab
        break;
      }
      case 'relaySmall': {
        b.add(pbox(T * 0.85, H * 0.85, W * 0.85), 'black', [T * 0.075, 0, 0]);
        b.add(pbox(T * 0.15, H * 0.3, W), 'black', [-T / 2 + T * 0.075, -H * 0.35, 0]);
        b.add(pbox(0.0006, H * 0.4, W * 0.5), 'cage', [xf + 0.0003, H * 0.1, 0]);
        break;
      }
      case 'flexfuel': { // GM/Continental flex-fuel sensor with 3/8 quick connects
        b.add(box(T * 0.7, H * 0.55, W * 0.85, 0.004), 'black', [-T * 0.1, 0, 0]);
        for (const s of [-1, 1]) b.add(cylY(Math.min(T, W) * 0.2, H * 0.22, 14), 'aluminum', [-T * 0.1, s * H * 0.38, 0]);
        for (const s of [-1, 1]) b.add(cylY(Math.min(T, W) * 0.27, H * 0.05, 14), 'black', [-T * 0.1, s * H * 0.28, 0]);
        b.add(pbox(T * 0.3, H * 0.25, W * 0.5), 'plastic', [T * 0.35, 0, 0]);
        break;
      }
      case 'pedal': { // GM drive-by-wire accelerator pedal (hanging)
        b.add(box(T * 0.7, H * 0.26, W * 0.9, 0.004), 'black', [-T * 0.15, H * 0.37, 0]); // sensor housing / bracket
        b.add(pbox(T * 0.2, H * 0.5, W * 0.3), 'black', [0, H * 0.02, 0]); // arm
        b.add(box(T * 0.25, H * 0.32, W * 0.9, 0.003), 'rubber', [T * 0.32, -H * 0.32, 0]); // pad
        b.add(pbox(T * 0.3, H * 0.1, W * 0.35), 'plastic', [-T * 0.2, H * 0.47, W * 0.2]); // connector
        break;
      }
      case 'breakers': { // panel-mount push-reset breakers
        b.add(pbox(0.003, H, W), 'black', [xf - T * 0.35, 0, 0]);
        const n = 4;
        for (let i = 0; i < n; i++) {
          const z = -W * 0.375 + (i * W * 0.75) / (n - 1);
          b.add(cylX(Math.min(H, W / n) * 0.32, T * 0.5, 12), 'black', [-T * 0.2, 0, z]);
          b.add(hexX(Math.min(H, W / n) * 0.33, 0.003), 'chrome', [xf - T * 0.25, 0, z]);
          b.add(cylX(Math.min(H, W / n) * 0.16, T * 0.2, 10), 'cage', [xf - T * 0.1, 0, z]);
          for (const s of [-1, 1]) b.add(cylX(0.002, T * 0.3, 6), 'gold', [-T / 2 + T * 0.15, s * H * 0.15, z]);
        }
        break;
      }
      case 'switches': { // switch plate: guarded ignition toggle + start button
        b.add(box(0.003, H, W, 0.002), 'aluminum', [xf - T * 0.5, 0, 0]);
        b.add(cylX(H * 0.07, T * 0.3, 10), 'chrome', [xf - T * 0.3, 0, -W * 0.22]);
        b.add(pbox(T * 0.4, H * 0.42, W * 0.32), 'red', [xf - T * 0.15, H * 0.05, -W * 0.22]); // flip guard
        b.add(cylX(H * 0.17, T * 0.15, 16), 'chrome', [xf - T * 0.42, 0, W * 0.22]);
        b.add(cylX(H * 0.13, T * 0.25, 16), 'black', [xf - T * 0.25, 0, W * 0.22]);
        b.add(cylX(H * 0.13, 0.001, 16), 'screen', [xf - T * 0.12, 0, W * 0.22]);
        b.add(cylX(H * 0.15, T * 0.45, 12), 'black', [-T * 0.25, 0, W * 0.22]);
        break;
      }
      case 'wheelButtons': { // Cartek-style 8-button steering wheel panel
        b.add(box(T * 0.4, H, W, 0.01), 'carbon', [xf - T * 0.2, 0, 0]);
        const fins = ['yellow', 'red', 'blue', 'cage'];
        for (const s of [-1, 1]) for (let j = 0; j < 4; j++) {
          b.add(cylX(H * 0.07, T * 0.18, 12), 'chrome', [xf - 0.002, H * 0.33 - j * H * 0.22, s * W * 0.36]);
          b.add(cylX(H * 0.055, T * 0.25, 12), fins[j], [xf + 0.001, H * 0.33 - j * H * 0.22, s * W * 0.36]);
        }
        b.add(pbox(T * 0.5, H * 0.3, W * 0.25), 'black', [-T * 0.2, -H * 0.2, 0]); // IR transmitter pod
        b.add(cylX(H * 0.05, 0.001, 10), 'lens', [-T * 0.45, -H * 0.2, 0]);
        break;
      }
      case 'radio': { // handheld UHF radio (Kenwood NX class) in a dash mount
        const hb = H * 0.62;
        b.add(box(T * 0.85, hb, W * 0.95, 0.006), 'black', [T * 0.075, -H / 2 + hb / 2, 0]);
        b.add(pbox(T * 0.15, hb * 0.9, W * 0.5), 'black', [-T / 2 + T * 0.075, -H / 2 + hb / 2, 0]); // belt clip
        b.add(pbox(0.001, hb * 0.35, W * 0.7), 'satin', [xf + 0.0005, -H / 2 + hb * 0.4, 0]); // speaker grille
        b.add(cylY(W * 0.12, H * 0.06, 12), 'black', [T * 0.1, -H / 2 + hb + H * 0.03, -W * 0.22]); // knob
        b.add(cylY(W * 0.1, H * 0.34, 10, W * 0.06), 'rubber', [T * 0.1, -H / 2 + hb + H * 0.17, W * 0.2]); // antenna
        b.add(pbox(T * 0.4, hb * 0.2, 0.004), 'black', [T * 0.1, -H / 2 + hb * 0.7, W / 2]); // PTT
        b.add(cylX(W * 0.06, 0.001, 8), 'lens', [xf + 0.0005, -H / 2 + hb * 0.92, W * 0.25]);
        break;
      }
      case 'camera': { // AiM SmartyCam 3 Sport (lens toward the front face)
        b.add(box(T, H, W, 0.008), 'black', [0, 0, 0]);
        b.add(cylX(H * 0.3, T * 0.18, 20), 'black', [xf + T * 0.06, H * 0.02, -W * 0.12]);
        b.add(cylX(H * 0.2, T * 0.05, 20), 'glass', [xf + T * 0.16, H * 0.02, -W * 0.12]);
        b.add(cylX(H * 0.04, 0.002, 8), 'lens', [xf + 0.001, H * 0.32, W * 0.32]);
        b.add(pbox(T * 0.6, 0.004, W * 0.5), 'aluminum', [0, -H / 2 - 0.002, 0]); // mount plate
        b.add(cylZ(0.0045, W * 0.12, 10), 'satin', [-T * 0.2, -H * 0.15, W / 2 + W * 0.04]); // power/CAN connector
        break;
      }
      case 'cooler': { // cool-suit cooler box with pump
        b.add(box(T * 0.82, H, W, 0.015), 'cage', [-T * 0.09, 0, 0]);
        b.add(box(T * 0.18, H * 1.0, W * 1.0, 0.01), 'blue', [T * 0.41, 0, 0]);
        for (const s of [-1, 1]) b.add(cylY(0.007, 0.03, 10), 'blue', [T * 0.1, H / 2 + 0.01, s * W * 0.15]);
        b.add(pbox(0.02, H * 0.6, 0.01), 'black', [T * 0.2, 0, W / 2 + 0.004]);
        break;
      }
      case 'lampRain': { // FIA 8874-2019 LED rain light (Cartek rectangular)
        b.add(box(T * 0.7, H, W, 0.005), 'black', [-T * 0.15, 0, 0]);
        b.add(box(T * 0.35, H * 0.86, W * 0.9, 0.004), 'lens', [T * 0.32, 0, 0]);
        for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) b.add(cylX(H * 0.07, 0.001, 8), 'cage', [xf + 0.0003, -H * 0.18 + j * H * 0.36, -W * 0.38 + (i * W * 0.76) / 7]);
        for (const s of [-1, 1]) b.add(cylX(0.003, 0.012, 8), 'chrome', [-T / 2 - 0.006, 0, s * W * 0.3]);
        break;
      }
      case 'lampHead': { // Gen 6 headlamp module (projector + LED signature)
        b.add(box(T * 0.75, H, W, 0.01), 'black', [-T * 0.125, 0, 0]);
        b.add(cylX(H * 0.3, T * 0.25, 20), 'chrome', [T * 0.12, H * 0.05, -W * 0.18]);
        b.add(cylX(H * 0.22, 0.003, 20), 'glass', [T * 0.25, H * 0.05, -W * 0.18]);
        b.add(pbox(T * 0.08, H * 0.12, W * 0.7), 'screen', [T * 0.3, -H * 0.32, W * 0.05]);
        b.add(box(T * 0.1, H * 0.98, W * 0.98, 0.006), 'glass', [T * 0.45, 0, 0]);
        break;
      }
      case 'resistor': { // aluminium-housed alternator dump resistor
        b.add(pbox(T * 0.25, H, W * 0.75), 'gold', [-T / 2 + T * 0.125, 0, 0]);
        b.add(pbox(T * 0.6, H * 0.6, W * 0.55), 'gold', [0, 0, 0]);
        for (let i = 0; i < 4; i++) b.add(pbox(T * 0.65, 0.002, W * 0.55), 'gold', [0, -H * 0.25 + (i * H * 0.5) / 3, 0]);
        for (const s of [-1, 1]) b.add(pbox(T * 0.15, H * 0.15, W * 0.15), 'chrome', [T * 0.1, 0, s * W * 0.42]);
        break;
      }
      case 'killPlate': { // FIA external cut-off: blue triangle with white border, red spark, red button
        const tri = (s) => {
          const sh = new THREE.Shape();
          // extrudeX: shape x -> local -Z, shape y -> local Y
          sh.moveTo(-W * 0.48 * s, -H * 0.42 * s);
          sh.lineTo(W * 0.48 * s, -H * 0.42 * s);
          sh.lineTo(0, H * 0.48 * s);
          sh.closePath();
          return sh;
        };
        b.add(extrudeX(tri(1), T * 0.2), 'cage', [-T / 2 + T * 0.1, 0, 0]);
        b.add(extrudeX(tri(0.85), T * 0.1), 'blue', [-T / 2 + T * 0.25, 0, 0]);
        const sp = new THREE.Shape();
        const k = Math.min(H, W) * 0.12;
        sp.moveTo(k * 2.2, -k * 0.2); sp.lineTo(k * 0.2, k * 0.8); sp.lineTo(k * 0.4, -k * 0.1);
        sp.lineTo(-k * 1.6, k * 0.3); sp.lineTo(-k * 0.2, -k * 0.9); sp.lineTo(-k * 0.3, 0); sp.closePath();
        b.add(extrudeX(sp, T * 0.1), 'lens', [-T / 2 + T * 0.32, H * 0.08, 0]);
        b.add(cylX(Math.min(H, W) * 0.1, T * 0.45, 16), 'red', [T * 0.05, -H * 0.18, 0]);
        b.add(cylX(Math.min(H, W) * 0.13, T * 0.12, 16), 'chrome', [-T * 0.15, -H * 0.18, 0]);
        break;
      }
      default:
        b.add(box(T, H, W), 'satin');
        rectConn(b, [0, H / 2, 0], 'y', 1, W * 0.4, T * 0.5, 0.008);
    }
    return done(b, rot);
  },

  // ---------------------------------------------------------------- aluminium battery box (whole) helper kept out of boxes
};

/** World-aligned small parts that depend on direction (shark fin, markers, straps, tail lamps). */
function moduleWorld(sx, sy, sz, ctx) {
  const v = ctx?.variant;
  const b = new PartBuilder();
  if (v === 'sharkFin') {
    // OE roof antenna: fin profile in XY (front low, rear tall), extruded across Z
    const sh = new THREE.Shape();
    sh.moveTo(-sx / 2, -sy / 2);
    sh.quadraticCurveTo(-sx * 0.1, -sy / 2 + sy * 0.25, sx * 0.32, sy / 2);
    sh.quadraticCurveTo(sx * 0.46, sy / 2, sx / 2, sy * 0.1);
    sh.lineTo(sx / 2, -sy / 2);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: sz * 0.7, bevelEnabled: true, bevelThickness: sz * 0.15, bevelSize: sz * 0.1, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -sz * 0.35);
    b.add(g, 'paint');
    b.add(pbox(sx * 1.02, 0.003, sz * 1.02), 'rubber', [0, -sy / 2 + 0.0015, 0]);
  } else if (v === 'marker') {
    const rear = (ctx?.pos?.[0] ?? 0) > 1.4;
    b.add(box(sx, sy, sz, Math.min(sy, sz) * 0.3), rear ? 'lens' : 'orange');
    b.add(pbox(sx * 1.05, sy * 1.1, sz * 0.4), 'chrome', [0, 0, 0]);
  } else if (v === 'strapBox') {
    b.add(pbox(sx * 0.72, Math.min(sy, 0.004), sz * 0.85), 'braided');
    for (const s of [-1, 1]) {
      b.add(pbox(sx * 0.16, Math.min(sy, 0.004) * 1.2, sz * 0.9), 'stainless', [s * sx * 0.38, 0, 0]);
      b.add(hexX(Math.min(sz * 0.3, 0.007), sy * 0.6), 'chrome', [s * sx * 0.4, sy * 0.25, 0], [0, 0, PI / 2]);
    }
  } else if (v === 'lampTail') {
    // Gen 6 tail lamp: dark housing with two rectangular LED lens elements facing rearward (+x)
    b.add(box(sx * 0.8, sy, sz, 0.008), 'black', [-sx * 0.1, 0, 0]);
    for (const s of [-1, 1]) {
      b.add(box(sx * 0.18, sy * 0.78, sz * 0.42, 0.005), 'lens', [sx * 0.38, 0, s * sz * 0.235]);
      b.add(pbox(sx * 0.02, sy * 0.1, sz * 0.36), 'screen', [sx * 0.48, sy * 0.22, s * sz * 0.235]);
    }
    b.add(pbox(sx * 0.2, sy * 0.86, sz * 0.03), 'chrome', [sx * 0.36, 0, 0]);
  }
  return b.build();
}

// ======================================================================= WHOLE

const whole = {
  // aluminium battery box: floor tray + walls, clamp bar across the top on 2 J-rods
  electrical_batteryBox(min, max) {
    const s = V().subVectors(max, min);
    const b = new PartBuilder();
    const t = 0.0025, hw = Math.min(0.07, s.y * 0.45);
    b.add(pbox(s.x, 0.004, s.z), 'aluminum', [0, min.y + 0.002, 0]);
    for (const k of [-1, 1]) {
      b.add(pbox(t, hw, s.z), 'aluminum', [k * (s.x / 2 - t / 2), min.y + hw / 2, 0]);
      b.add(pbox(s.x, hw, t), 'aluminum', [0, min.y + hw / 2, k * (s.z / 2 - t / 2)]);
    }
    // floor bolts with backing plates
    for (const a of [-1, 1]) for (const c of [-1, 1]) b.add(hexX(0.007, 0.006), 'chrome', [a * s.x * 0.36, min.y + 0.006, c * s.z * 0.36], [0, 0, PI / 2]);
    // clamp bar + rubber pad across Z at the top
    const yb = max.y - 0.005;
    b.add(pbox(0.03, 0.006, s.z), 'aluminum', [0, yb, 0]);
    b.add(pbox(0.028, 0.004, s.z * 0.8), 'rubber', [0, yb - 0.005, 0]);
    for (const c of [-1, 1]) {
      const z = c * (s.z / 2 - 0.007);
      b.add(cylY(0.004, s.y - 0.006, 8), 'steel', [0, min.y + (s.y - 0.006) / 2 + 0.003, z]);
      b.add(hexX(0.008, 0.008), 'chrome', [0, max.y - 0.001, z], [0, 0, PI / 2]); // wing nut base
      b.add(pbox(0.004, 0.012, 0.03), 'chrome', [0, max.y + 0.006, z]);
    }
    // vent tube stub
    b.add(cylX(0.004, 0.03, 8), 'rubber', [-s.x / 2 - 0.012, min.y + hw * 0.7, s.z * 0.3]);
    return b.build();
  },
};

// ======================================================================= AXIAL

const axial = {
  // ---------------------------------------------------------------- GM 170 A alternator (pulley at -X / front)
  electrical_alternator(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    const x0 = -L / 2;
    const wP = Math.min(0.026, L * 0.14), rP = Math.min(R * 0.42, 0.03);
    // 6-rib serpentine pulley
    const prof = [[0.006, x0]];
    for (let i = 0; i <= 12; i++) prof.push([i % 2 ? rP * 0.93 : rP, x0 + (i / 12) * wP]);
    prof.push([0.006, x0 + wP]);
    b.add(latheX(prof, 28), 'machined');
    b.add(hexX(0.0095, 0.008), 'chrome', [x0 + 0.002, 0, 0]);
    b.add(cylX(0.006, 0.012, 10), 'steel', [x0 + wP + 0.004, 0, 0]);
    // front housing (cast) with vent windows
    const xs = x0 + wP + 0.04; // stator start
    b.add(latheX([[R * 0.3, x0 + wP + 0.008], [R * 0.55, x0 + wP + 0.012], [R * 0.86, x0 + wP + 0.022], [R * 0.95, xs - 0.006], [R * 0.97, xs]], 36), 'cast');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + 0.2;
      b.add(pbox(0.004, R * 0.18, R * 0.3), 'black', [x0 + wP + 0.016, Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62], [a, 0, 0]);
    }
    // stator laminations
    const st = [[R * 0.97, xs]];
    for (let i = 0; i <= 8; i++) st.push([i % 2 ? R * 0.98 : R, xs + (i / 8) * 0.03]);
    b.add(latheX(st, 36), 'steel');
    // rear housing + black plastic rear cover
    const xr = xs + 0.03, xc = L / 2 - 0.028;
    b.add(latheX([[R * 0.97, xr], [R * 0.95, xc - 0.01], [R * 0.84, xc]], 36), 'cast');
    b.add(latheX([[R * 0.84, xc], [R * 0.8, xc + 0.015], [R * 0.6, L / 2 - 0.002], [0.01, L / 2]], 28), 'black');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      b.add(pbox((xc - xr) * 0.45, 0.003, R * 0.12), 'black', [xr + (xc - xr) * 0.3, Math.cos(a) * R * 0.955, Math.sin(a) * R * 0.955], [a, 0, 0]);
    }
    // mounting ears (bolt bosses) top and bottom, on the -Z side
    for (const [y, z] of [[R * 0.92, -R * 0.45], [-R * 0.92, -R * 0.45], [R * 0.25, R * 0.95]]) {
      b.add(ringX(0.012, 0.005, 0.028, 16), 'cast', [xs - 0.022, y, z]);
      b.add(ringX(0.012, 0.005, 0.02, 16), 'cast', [xr + 0.015, y, z]);
    }
    // B+ stud with red boot and regulator socket on the rear cover
    b.add(cylX(0.004, 0.02, 8), 'gold', [L / 2 + 0.002, -0.015, -0.02]);
    b.add(cylX(0.009, 0.016, 12, 0.006), 'red', [L / 2 - 0.004, -0.015, -0.02]);
    b.add(pbox(0.012, 0.018, 0.022), 'black', [L / 2 - 0.006, R * 0.45, 0.012]);
    return b.build();
  },

  // ---------------------------------------------------------------- Gen V gear-reduction starter (pinion at +X / rear)
  electrical_starter(L, D1, D2) {
    const b = new PartBuilder();
    const Rm = Math.min(D2 / 2, D1 * 0.34);
    const ym = -(D1 / 2 - Rm);
    const xA = -L / 2, xB = -L / 2 + L * 0.45, xC = L * 0.16;
    // motor can with brush end cap and through bolts
    b.add(latheX([[0.01, xA], [Rm * 0.75, xA], [Rm * 0.95, xA + 0.008], [Rm, xA + 0.016], [Rm, xB], [0.01, xB]], 28), 'black', [0, ym, 0]);
    for (const s of [-1, 1]) b.add(cylX(0.0028, xB - xA + 0.01, 8), 'chrome', [(xA + xB) / 2, ym + s * Rm * 0.82, Rm * 0.45 * s]);
    // planetary gear-reduction housing
    b.add(latheX([[0.01, xB], [Rm * 1.04, xB], [Rm * 1.06, xB + 0.01], [Rm * 1.0, xC], [0.01, xC]], 28), 'cast', [0, ym, 0]);
    // mounting flange with 2 bolt ears
    const fl = new THREE.Shape();
    fl.absarc(0, 0, Rm * 1.12, 0, PI * 2);
    b.add(extrudeX(fl, 0.014, 24), 'cast', [xC + 0.007, ym, 0]);
    for (const [y, z] of [[ym + Rm * 1.05, -Rm * 0.75], [ym - Rm * 0.95, -Rm * 0.8]]) {
      b.add(ringX(0.013, 0.0055, 0.014, 16), 'cast', [xC + 0.007, y, z]);
      b.add(hexX(0.008, 0.008), 'chrome', [xC - 0.004, y, z]);
    }
    // nose housing + pinion
    const xn = xC + 0.014;
    b.add(latheX([[0.01, xn], [Rm * 0.75, xn], [Rm * 0.62, L / 2 - 0.024], [0.01, L / 2 - 0.024]], 24), 'cast', [0, ym, 0]);
    b.add(cylX(0.016, 0.022, 11), 'steel', [L / 2 - 0.013, ym, 0]);
    b.add(cylX(0.007, 0.006, 10), 'machined', [L / 2 - 0.001, ym, 0]);
    // solenoid on top (+Y) with battery stud and S terminal at its rear cap (-X end)
    const Rs = clamp(D1 / 2 - (ym + Rm) - 0.003, 0.016, 0.026);
    const ys = ym + Rm + Rs * 0.55;
    const s0 = -L * 0.16, s1 = L * 0.28;
    b.add(cylX(Rs, s1 - s0, 22), 'stainless', [(s0 + s1) / 2, ys, 0]);
    b.add(cylX(Rs * 1.02, 0.018, 22), 'black', [s0 + 0.009, ys, 0]);
    b.add(cylX(0.0045, 0.022, 8), 'gold', [s0 - 0.008, ys + Rs * 0.35, 0.004]);
    b.add(hexX(0.0075, 0.006), 'chrome', [s0 - 0.004, ys + Rs * 0.35, 0.004]);
    b.add(pbox(0.012, 0.004, 0.008), 'gold', [s0 - 0.006, ys - Rs * 0.4, -0.006]);
    b.add(cylX(0.005, 0.02, 10), 'black', [s0 - 0.012, ys - Rs * 0.4, -0.006]); // trigger connector
    return b.build();
  },

  // ---------------------------------------------------------------- Longacre 4-terminal battery disconnect (key at +X)
  electrical_masterSwitch(L, D1, D2) {
    const b = new PartBuilder();
    const k = Math.min(0.03, L * 0.28);
    const xp = L / 2 - k;
    b.add(box(0.003, D1, D2, 0.006), 'aluminum', [xp - 0.0015, 0, 0]);
    for (const a of [-1, 1]) for (const c of [-1, 1]) b.add(cylX(0.003, 0.004, 8), 'chrome', [xp + 0.001, a * D1 * 0.4, c * D2 * 0.4]);
    b.add(cylX(0.022, 0.006, 24), 'black', [xp + 0.003, 0, 0]);
    b.add(cylX(0.018, 0.0012, 24), 'cage', [xp + 0.0062, 0, 0]); // ON/OFF ring
    // red removable key: stem + flat handle
    b.add(pbox(k * 0.55, 0.011, 0.006), 'red', [xp + k * 0.3, 0, 0]);
    b.add(box(k * 0.42, 0.034, 0.012, 0.004), 'red', [L / 2 - k * 0.21, 0, 0]);
    // body behind the panel
    const Rb = Math.min(0.0335, Math.min(D1, D2) * 0.39);
    const xbEnd = -L / 2 + 0.022;
    b.add(cylX(Rb * 0.8, 0.012, 24), 'chrome', [xp - 0.009, 0, 0]); // jam nut
    b.add(cylX(Rb, xp - 0.015 - xbEnd, 28), 'black', [(xp - 0.015 + xbEnd) / 2, 0, 0]);
    // 2 main 3/8" studs + 2 aux studs out the back
    for (const s of [-1, 1]) {
      b.add(cylX(0.0048, 0.022, 10), 'gold', [-L / 2 + 0.011, s * Rb * 0.45, 0]);
      b.add(hexX(0.0085, 0.006), 'chrome', [-L / 2 + 0.016, s * Rb * 0.45, 0]);
      b.add(cylX(0.0025, 0.016, 8), 'gold', [-L / 2 + 0.014, 0, s * Rb * 0.55]);
    }
    return b.build();
  },

  // ---------------------------------------------------------------- sensors: thread / hex at -X, connector at +X
  electrical_sensor(L, D1, D2, ctx) {
    const v = ctx?.variant || 'pressure';
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    const x0 = -L / 2;
    if (v === 'pressure' || v === 'temp' || v === 'hswitch') {
      const met = v === 'pressure' ? 'stainless' : 'gold';
      b.add(cylX(R * 0.45, L * 0.18, 12), met, [x0 + L * 0.09, 0, 0]); // thread
      b.add(hexX(R, L * 0.14), met, [x0 + L * 0.25, 0, 0]);
      if (v === 'pressure') {
        b.add(cylX(R * 0.8, L * 0.36, 18), 'stainless', [x0 + L * 0.5, 0, 0]);
        b.add(cylX(R * 0.72, L * 0.3, 14), 'plastic', [x0 + L * 0.83, 0, 0]);
        b.add(pbox(L * 0.2, R * 0.3, R * 0.5), 'black', [x0 + L * 0.85, R * 0.75, 0]);
      } else if (v === 'temp') {
        b.add(cylX(R * 0.7, L * 0.55, 14), 'plastic', [x0 + L * 0.6, 0, 0]);
        b.add(pbox(L * 0.25, R * 0.3, R * 0.6), 'black', [x0 + L * 0.8, R * 0.7, 0]);
      } else {
        b.add(cylX(R * 0.7, L * 0.35, 14), 'plastic', [x0 + L * 0.5, 0, 0]);
        for (const s of [-1, 1]) b.add(pbox(L * 0.25, R * 0.12, R * 0.5), 'chrome', [x0 + L * 0.8, s * R * 0.3, 0]);
      }
    } else if (v === 'lambda') {
      // Bosch LSU 4.9: slotted double protection tube, M18x1.5, 22 mm hex, crimped body, grommet + lead
      b.add(cylX(R * 0.5, L * 0.28, 16), 'stainless', [x0 + L * 0.14, 0, 0]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        b.add(pbox(L * 0.08, R * 0.1, R * 0.25), 'black', [x0 + L * 0.12, Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48], [a, 0, 0]);
      }
      b.add(cylX(R * 0.7, L * 0.12, 16), 'stainless', [x0 + L * 0.34, 0, 0]);
      b.add(hexX(R, L * 0.13), 'stainless', [x0 + L * 0.465, 0, 0]);
      b.add(latheX([[R * 0.6, x0 + L * 0.53], [R * 0.52, x0 + L * 0.7], [R * 0.4, x0 + L * 0.82]], 16), 'stainless');
      b.add(cylX(R * 0.36, L * 0.1, 12), 'rubber', [x0 + L * 0.87, 0, 0]);
      b.add(cylX(R * 0.25, L * 0.08, 8), 'rubber', [x0 + L * 0.96, 0, 0]);
    } else if (v === 'egt') {
      b.add(cylX(R * 0.25, L * 0.5, 8), 'stainless', [x0 + L * 0.25, 0, 0]);
      b.add(hexX(R * 0.95, L * 0.1), 'gold', [x0 + L * 0.53, 0, 0]);
      b.add(hexX(R * 0.75, L * 0.09), 'gold', [x0 + L * 0.63, 0, 0]);
      b.add(cylX(R * 0.42, L * 0.16, 10), 'stainless', [x0 + L * 0.76, 0, 0]);
      b.add(cylX(R * 0.3, L * 0.16, 8), 'braided', [x0 + L * 0.92, 0, 0]);
    } else if (v === 'speed') {
      b.add(cylX(R * 0.55, L * 0.6, 14), 'plastic', [x0 + L * 0.3, 0, 0]);
      b.add(pbox(L * 0.12, R * 0.6, R * 1.9), 'black', [x0 + L * 0.62, 0, 0]);
      b.add(cylX(R * 0.6, L * 0.3, 12), 'plastic', [x0 + L * 0.84, 0, 0]);
    } else if (v === 'stud') {
      b.add(cylX(R * 0.5, L, 10), 'stainless', [0, 0, 0]);
      b.add(ringX(R * 0.95, R * 0.5, L * 0.08, 14), 'copper', [L * 0.05, 0, 0]);
      b.add(hexX(R * 0.85, L * 0.2), 'chrome', [L * 0.22, 0, 0]);
      b.add(cylX(R, L * 0.06, 14), 'steel', [-L * 0.2, 0, 0]);
    } else if (v === 'level') {
      // capacitive fuel-cell level sender: long probe below a bolted flange, connector on top
      b.add(cylX(R * 0.32, L * 0.84, 12), 'aluminum', [x0 + L * 0.42, 0, 0]);
      b.add(cylX(R * 0.98, L * 0.04, 20), 'aluminum', [x0 + L * 0.86, 0, 0]);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        b.add(cylX(R * 0.08, L * 0.05, 6), 'chrome', [x0 + L * 0.88, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8]);
      }
      b.add(cylX(R * 0.4, L * 0.1, 12), 'plastic', [x0 + L * 0.95, 0, 0]);
    }
    return b.build();
  },

  // ---------------------------------------------------------------- dash controls (front at +X)
  electrical_panelControl(L, D1, D2, ctx) {
    const v = ctx?.variant || 'lamp';
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    const xf = L / 2;
    if (v === 'lamp') {
      b.add(cylX(R * 0.95, L * 0.1, 18), 'chrome', [xf - L * 0.2, 0, 0]);
      b.add(latheX([[R * 0.75, xf - L * 0.15], [R * 0.72, xf - L * 0.06], [R * 0.45, xf - 0.001], [0.0005, xf]], 16), 'lens');
      b.add(cylX(R * 0.6, L * 0.55, 14), 'black', [xf - L * 0.25 - L * 0.275, 0, 0]);
      b.add(hexX(R * 0.85, L * 0.06), 'chrome', [xf - L * 0.32, 0, 0]);
      for (const s of [-1, 1]) b.add(pbox(L * 0.15, R * 0.12, R * 0.4), 'chrome', [-L / 2 + L * 0.075, s * R * 0.3, 0]);
    } else if (v === 'rotary') {
      b.add(cylX(R * 0.92, L * 0.3, 14), 'black', [xf - L * 0.15, 0, 0]);
      b.add(cylX(R * 0.8, 0.002, 14), 'satin', [xf + 0.001, 0, 0]);
      b.add(pbox(0.0015, R * 0.7, R * 0.12), 'cage', [xf + 0.0022, R * 0.35, 0]); // pointer
      b.add(hexX(R * 0.6, L * 0.05), 'chrome', [xf - L * 0.33, 0, 0]);
      b.add(cylX(R * 0.85, L * 0.45, 16), 'black', [-L / 2 + L * 0.27, 0, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        b.add(cylX(R * 0.06, L * 0.08, 6), 'gold', [-L / 2 + L * 0.03, Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5]);
      }
    } else if (v === 'push') {
      b.add(cylX(R * 0.95, L * 0.12, 18), 'yellow', [xf - L * 0.3, 0, 0]);
      b.add(latheX([[R * 0.7, xf - L * 0.25], [R * 0.72, xf - L * 0.1], [R * 0.5, xf - 0.001], [0.0005, xf]], 16), 'red');
      b.add(cylX(R * 0.55, L * 0.45, 14), 'black', [-L / 2 + L * 0.225, 0, 0]);
      b.add(hexX(R * 0.75, L * 0.06), 'chrome', [xf - L * 0.4, 0, 0]);
    } else { // ptt
      b.add(cylX(R * 0.95, L * 0.3, 16), 'black', [xf - L * 0.5, 0, 0]);
      b.add(cylX(R * 0.7, L * 0.4, 16), 'yellow', [xf - L * 0.2, 0, 0]);
      b.add(cylX(R * 0.3, L * 0.3, 8), 'harness', [-L / 2 + L * 0.15, 0, 0]);
    }
    return b.build();
  },

  // ---------------------------------------------------------------- Deutsch Autosport bulkhead (cabin side +X)
  electrical_bulkhead(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.95, L * 0.05, 24), 'satin', [-L * 0.02, 0, 0]); // flange
    b.add(cylX(R, L * 0.06, 16), 'satin', [-L * 0.1, 0, 0]); // jam nut
    b.add(torusX(R * 0.85, R * 0.12, 8, 24), 'rubber', [-L * 0.055, 0, 0]); // panel O-ring
    b.add(cylX(R * 0.68, L * 0.16, 20), 'satin', [L * 0.09, 0, 0]); // receptacle
    b.add(cylX(R * 0.8, L * 0.12, 22), 'satin', [L * 0.2, 0, 0]); // plug coupling ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      b.add(pbox(L * 0.1, R * 0.08, R * 0.08), 'machined', [L * 0.2, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8]);
    }
    b.add(latheX([[R * 0.62, L * 0.26], [R * 0.58, L * 0.36], [R * 0.4, L * 0.48], [R * 0.36, L / 2]], 18), 'rubber'); // cabin boot
    b.add(latheX([[R * 0.62, -L * 0.13], [R * 0.6, -L * 0.25], [R * 0.4, -L * 0.42], [R * 0.36, -L / 2]], 18), 'rubber'); // engine-side boot
    return b.build();
  },

  // ---------------------------------------------------------------- linear damper potentiometer (rod at -X)
  electrical_linearPot(L, D1, D2) {
    const b = new PartBuilder();
    const Rb = Math.min(0.0095, Math.min(D1, D2) / 2);
    const eyeR = 0.0075;
    for (const s of [-1, 1]) {
      const x = s * (L / 2 - eyeR);
      b.add(new THREE.TorusGeometry(eyeR * 0.75, eyeR * 0.3, 8, 18), 'chrome', [x, 0, 0]);
      b.add(sphere(eyeR * 0.45, 10, 8), 'machined', [x, 0, 0]);
    }
    const xr0 = -L / 2 + eyeR * 1.8;
    const xbody = -L / 2 + L * 0.38;
    b.add(cylX(0.004, xbody - xr0, 10), 'chrome', [(xr0 + xbody) / 2, 0, 0]); // shaft
    b.add(cylX(Rb, L / 2 - eyeR * 1.8 - xbody, 18), 'satin', [(xbody + L / 2 - eyeR * 1.8) / 2, 0, 0]); // body
    b.add(cylX(Rb * 1.05, 0.008, 18), 'black', [xbody + 0.004, 0, 0]); // wiper seal cap
    b.add(cylX(Rb * 1.05, 0.008, 18), 'black', [L / 2 - eyeR * 1.8 - 0.004, 0, 0]);
    b.add(cylY(0.003, Rb * 1.6, 8), 'rubber', [L / 2 - eyeR * 1.8 - 0.012, Rb, 0]); // cable exit
    return b.build();
  },

  // ---------------------------------------------------------------- steering angle sensor ring around the column
  electrical_sas(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    b.add(ringX(R * 0.7, R * 0.4, L * 0.8, 28), 'black');
    b.add(pbox(L * 0.8, R * 0.5, R * 0.7), 'black', [0, -R * 0.6, R * 0.3]);
    b.add(pbox(L * 0.5, R * 0.3, R * 0.4), 'plastic', [0, -R * 0.85, R * 0.55]);
    return b.build();
  },
};

// ======================================================================== PATH

const paths = {
  // motorsport harness: DR-25 jacket, Adel clamps, Autosport connector + boot at each end
  electrical_harness(pts, r, ctx) {
    const v = ctx?.variant || 'main';
    const b = new PartBuilder();
    const curve = curveFrom(pts);
    const len = curve.getLength();
    if (v === 'can') {
      const rr = Math.max(0.0028, r * 0.7);
      b.add(tubeAlong(curve, rr, null, 6), 'blue');
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[i === 0 ? 1 : i - 1];
        const d = V().subVectors(p, q).normalize();
        along(b, pbox(1, 1, 1), 'cage', p.clone().addScaledVector(d, -0.012), p.clone().addScaledVector(d, 0.012), 0.012);
      }
      return b.build();
    }
    const rr = v === 'sub' ? Math.max(0.004, r) : Math.max(0.006, r);
    b.add(tubeAlong(curve, rr, null, v === 'sub' ? 8 : 10), 'harness');
    // Adel (P) clamps every ~0.25 m
    const step = v === 'sub' ? 0.12 : 0.25;
    for (let dd = step; dd < len - 0.05; dd += step) {
      const t = dd / len;
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      along(b, ringX(1, 0.8, 1, 14), v === 'sub' ? 'plastic' : 'aluminum', p.clone().addScaledVector(tan, -0.005), p.clone().addScaledVector(tan, 0.005), rr * 1.35);
    }
    // ends
    const n = pts.length;
    for (const [p, q] of [[pts[0], pts[1]], [pts[n - 1], pts[n - 2]]]) {
      const d = V().subVectors(p, q).normalize();
      if (v === 'sub') {
        along(b, pbox(1, 1, 1), 'plastic', p.clone().addScaledVector(d, -0.01), p.clone().addScaledVector(d, 0.014), rr * 2.6);
      } else {
        along(b, cylX(1, 1, 12, 0.6), 'rubber', p.clone().addScaledVector(d, -0.05), p.clone().addScaledVector(d, -0.018), rr * 1.5); // Raychem boot
        along(b, cylX(1, 1, 18), 'satin', p.clone().addScaledVector(d, -0.018), p.clone().addScaledVector(d, 0.01), rr * 1.9); // AS backshell/plug
        along(b, cylX(1, 1, 18), 'machined', p.clone().addScaledVector(d, -0.004), p.clone().addScaledVector(d, 0.004), rr * 2.05); // coupling ring
      }
    }
    // breakout connectors along injector/coil sub-harnesses
    if (v === 'sub') {
      const k = Math.max(1, Math.round(len / 0.12));
      for (let i = 1; i < k; i++) {
        const t = i / k;
        const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
        const off = V(0, -1, 0).addScaledVector(tan, -tan.y).normalize().multiplyScalar(rr * 3);
        const c = p.clone().add(off);
        along(b, pbox(1, 1, 1), 'plastic', c.clone().addScaledVector(tan, -0.008), c.clone().addScaledVector(tan, 0.008), rr * 2.2);
      }
    }
    return b.build();
  },

  // battery / starter / alternator cables: fine-strand welding cable with tinned ring lugs and boots
  electrical_cable(pts, r, ctx) {
    const neg = ctx?.variant === 'neg';
    const b = new PartBuilder();
    const rr = Math.max(0.004, r);
    b.add(tubeAlong(curveFrom(pts), rr, null, 10), neg ? 'rubber' : 'wire');
    const n = pts.length;
    lug(b, pts[0], pts[1], rr, neg ? 'black' : 'red');
    lug(b, pts[n - 1], pts[n - 2], rr, neg ? 'black' : 'red');
    return b.build();
  },

  // tinned braided ground strap with ring lugs
  electrical_strap(pts, r) {
    const b = new PartBuilder();
    const curve = curveFrom(pts.length === 2 ? [pts[0], pts[0].clone().lerp(pts[1], 0.5), pts[1]] : pts);
    const w = Math.max(0.014, r * 3.2);
    b.add(ribbonAlong(curve, w, 0.004), 'braided');
    const n = pts.length;
    for (const [p, q] of [[pts[0], pts[1]], [pts[n - 1], pts[n - 2]]]) {
      const d = V().subVectors(p, q).normalize();
      along(b, cylX(1, 1, 10), 'stainless', p.clone().addScaledVector(d, -0.02), p.clone(), w * 0.45);
      const nrm = perp(d);
      const c = p.clone().addScaledVector(d, 0.008);
      along(b, ringX(1, 0.42, 1, 14), 'stainless', c.clone().addScaledVector(nrm, -0.0015), c.clone().addScaledVector(nrm, 0.0015), 0.01);
    }
    return b.build();
  },
};

// ======================================================================= RULES

const E = (s) => new RegExp(`^electrical\\.${s}$`);

export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules: [
    [E('dash-and-controls\\.dash-display'), 'electrical_display'],
    [E('dash-and-controls\\.shift-lights'), 'electrical_display', { variant: 'leds' }],
    [E('data-acquisition\\.logger'), 'electrical_display', { variant: 'logger' }],
    [E('dash-and-controls\\.keypad'), 'electrical_keypad'],
    [E('dash-and-controls\\.ignition-start-buttons'), 'electrical_module', { variant: 'switches' }],
    [E('dash-and-controls\\.steering-wheel-controls'), 'electrical_module', { variant: 'wheelButtons' }],
    [E('dash-and-controls\\.warning-lamps'), 'electrical_panelControl', { variant: 'lamp' }],
    [E('dash-and-controls\\.rotary-switches'), 'electrical_panelControl', { variant: 'rotary' }],
    [E('power-distribution\\.pdm'), 'electrical_pdm'],
    [E('power-distribution\\.aux-fuse-block'), 'electrical_module', { variant: 'fuseblock' }],
    [E('power-distribution\\.circuit-breakers'), 'electrical_module', { variant: 'breakers' }],
    [E('power-distribution\\.relay-panel'), 'electrical_module', { variant: 'relay' }],
    [E('power-distribution\\.pdm-power-feed'), 'electrical_cable', { variant: 'pos' }],
    [E('engine-management\\.ecu'), 'electrical_ecu'],
    [E('engine-management\\.gdi-controller'), 'electrical_ecu', { variant: 'gdi' }],
    [E('engine-management\\.(engine-harness)'), 'electrical_harness', { variant: 'main' }],
    [E('engine-management\\.(injector-subharness|ignition-coil-subharness)'), 'electrical_harness', { variant: 'sub' }],
    [E('engine-management\\.accelerator-pedal'), 'electrical_module', { variant: 'pedal' }],
    [E('engine-management\\.wideband-lambda'), 'electrical_sensor', { variant: 'lambda' }],
    [E('engine-management\\.flex-fuel-sensor'), 'electrical_module', { variant: 'flexfuel' }],
    [E('engine-management\\.tuning-port'), 'electrical_module', { variant: 'dtm' }],
    [E('battery-and-cutoff\\.battery'), 'electrical_battery'],
    [E('battery-and-cutoff\\.battery-box'), 'electrical_batteryBox', { whole: true }],
    [E('battery-and-cutoff\\.solid-state-isolator'), 'electrical_module', { variant: 'isolator' }],
    [E('battery-and-cutoff\\.master-switch'), 'electrical_masterSwitch'],
    [E('battery-and-cutoff\\.alternator-dump-resistor'), 'electrical_module', { variant: 'resistor' }],
    [E('battery-and-cutoff\\.external-kill-switch'), 'electrical_module', { variant: 'killPlate' }],
    [E('battery-and-cutoff\\.internal-kill-switch'), 'electrical_panelControl', { variant: 'push' }],
    [E('battery-and-cutoff\\.main-fuse'), 'electrical_module', { variant: 'anl' }],
    [E('battery-and-cutoff\\.charge-jump-post'), 'electrical_module', { variant: 'anderson' }],
    [E('charging-starting\\.alternator'), 'electrical_alternator', { axis: 'x' }],
    [E('charging-starting\\.alternator-control-connector'), 'electrical_module', { variant: 'dtm' }],
    [E('charging-starting\\.(alternator-charge-cable|main-positive-cable|starter-cable)'), 'electrical_cable', { variant: 'pos' }],
    [E('charging-starting\\.starter-motor'), 'electrical_starter', { axis: 'x' }],
    [E('charging-starting\\.starter-trigger'), 'electrical_module', { variant: 'relaySmall' }],
    [E('charging-starting\\.front-power-junction'), 'electrical_module', { variant: 'junction' }],
    [E('comms-video-timing\\.radio'), 'electrical_module', { variant: 'radio' }],
    [E('comms-video-timing\\.helmet-kit'), 'electrical_module', { variant: 'dtm' }],
    [E('comms-video-timing\\.ptt-button'), 'electrical_panelControl', { variant: 'ptt' }],
    [E('comms-video-timing\\.antenna'), 'electrical_module', { variant: 'sharkFin' }],
    [E('comms-video-timing\\.in-car-camera'), 'electrical_module', { variant: 'camera' }],
    [E('comms-video-timing\\.transponder'), 'electrical_module', { variant: 'transponder' }],
    [E('data-acquisition\\.gps-imu'), 'electrical_module', { variant: 'gps' }],
    [E('data-acquisition\\.io-expander'), 'electrical_module', { variant: 'expander' }],
    [E('data-acquisition\\.damper-pots'), 'electrical_linearPot'],
    [E('data-acquisition\\.ir-tire-temp'), 'electrical_module', { variant: 'irsensor' }],
    [E('data-acquisition\\.brake-temp-sensors'), 'electrical_module', { variant: 'irside' }],
    [E('data-acquisition\\.brake-pressure-sensors'), 'electrical_sensor', { variant: 'pressure' }],
    [E('data-acquisition\\.steering-angle-sensor'), 'electrical_sas', { axis: 'x' }],
    [E('data-acquisition\\.wheel-speed-interface'), 'electrical_sensor', { variant: 'speed' }],
    [E('data-acquisition\\.lap-beacon-receiver'), 'electrical_module', { variant: 'beacon' }],
    [E('fans-and-pumps-control\\.fuel-pump-control'), 'electrical_module', { variant: 'fpcm' }],
    [E('fans-and-pumps-control\\.fuel-pump-harness'), 'electrical_harness', { variant: 'sub' }],
    [E('fans-and-pumps-control\\.cool-suit-pump'), 'canister', { variant: 'pump' }], // small pump on the Coolshirt cooler (interior system draws the cooler)
    [E('grounding\\.battery-negative-cable'), 'electrical_cable', { variant: 'neg' }],
    [E('grounding\\.(rear-ground-stud|front-ground-stud)'), 'electrical_sensor', { variant: 'stud' }],
    [E('grounding\\.(engine-to-chassis-strap|transmission-ground)'), 'electrical_strap'],
    [E('grounding\\.electronics-star-ground'), 'electrical_module', { variant: 'busbar' }],
    [E('grounding\\.body-bonding-straps'), 'electrical_module', { variant: 'strapBox' }],
    [E('grounding\\.body-bonding-straps'), 'electrical_strap'], // path models: braided cradle-to-rail straps
    [E('lighting\\.rain-light'), 'electrical_module', { variant: 'lampRain' }],
    [E('lighting\\.brake-lights'), 'electrical_module', { variant: 'lampTail' }],
    [E('lighting\\.brake-pressure-switch'), 'electrical_sensor', { variant: 'hswitch' }],
    [E('lighting\\.headlights'), 'electrical_module', { variant: 'lampHead' }],
    [E('lighting\\.position-marker-lights'), 'electrical_module', { variant: 'marker', usesPos: true }],
    [E('main-harness\\.(firewall-bulkhead|rear-bulkhead)'), 'electrical_bulkhead', { axis: 'x' }],
    [E('main-harness\\.(dash-harness|chassis-trunk|rear-harness|front-harness)'), 'electrical_harness', { variant: 'main' }],
    [E('main-harness\\.can-bus-backbone'), 'electrical_harness', { variant: 'can' }],
    [E('main-harness\\.connectors-and-grommets'), 'electrical_module', { variant: 'dtm' }],
    [E('sensors\\.(oil-pressure-sensor-race|fuel-pressure-sensor-low|coolant-pressure-sensor|crankcase-pressure-sensor)'), 'electrical_sensor', { variant: 'pressure' }],
    [E('sensors\\.(oil-temperature-sensor|driveline-temp-sensors)'), 'electrical_sensor', { variant: 'temp' }],
    [E('sensors\\.egt-probes'), 'electrical_sensor', { variant: 'egt' }],
    [E('sensors\\.charge-air-temp-sensor'), 'electrical_module', { variant: 'tmap' }],
    [E('sensors\\.fuel-level-sender'), 'electrical_sensor', { variant: 'level' }],
  ],
  axial,
  boxes,
  paths,
  whole,
};
