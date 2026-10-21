// Precise part models for the "engine-support" group. See data/MODELING.md.
// Owned by one modeling pass; generator names must be prefixed "engine_support_".
//
// Reference parts (see each component's modelRef in data/systems/engine-support):
//  - Gen 6 Camaro V8/ZL1 cross-flow radiator 28.5 x 21 in, single 19 in 850 W brushless fan in full shroud (GM 84100128)
//  - ZL1 intercooler heat exchanger ahead of the radiator; Setrab Series 6 25-row oil cooler (330 x 194 x 50 mm)
//  - Kooks 2260H430 1-7/8 x 3 in long tubes, green-cat connection pipes, 3 in X, Kooks oval mufflers, quad 4 in tips
//  - Fuel Safe ED122B 22 gal Enduro cell (25.5 x 17.13 x 13.75 in) with 6 x 10 in fill plate
//  - Radium MPFST surge tank (6 x 7.8 in) with Walbro F90000267 pumps, Bosch 044-style lift pump
//  - Fluidworks Gen V LT 5-stage pan/pump, HTD 18T/36T drive, Peterson 08-0007 6 x 24 in tank, Canton Accusump
import * as THREE from 'three';
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, curveFrom, tubeAlong, ribbonAlong, alignX, V } from '../geo.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const UCYL = cylX(0.5, 1, 16); // unit cylinder along X, diameter 1
const UCYL24 = cylX(0.5, 1, 24);
const UHEX = hexX(0.5, 1);
const UBOX = new THREE.BoxGeometry(1, 1, 1);

/** Add a unit-X geometry stretched from a to c with diameter d. */
function seg(b, geo, fin, a, c, d) {
  b.addMatrix(geo, fin, alignX(a, c, d));
}
const dirAt = (pts, end) => (end ? V().subVectors(pts[pts.length - 2], pts[pts.length - 1]) : V().subVectors(pts[1], pts[0])).normalize();

/** AN hose end at p, dir pointing into the hose. Two-tone (Earl's / XRP style) or black (PTFE). */
function anEnd(b, p, dir, r, black = false) {
  const nut = black ? 'satin' : 'blue';
  const sock = black ? 'black' : 'red';
  const a = p.clone(), m1 = p.clone().addScaledVector(dir, r * 1.4), m2 = p.clone().addScaledVector(dir, r * 4.2);
  seg(b, UHEX, nut, a, m1, r * 3.0);
  seg(b, UCYL, sock, m1, m2, r * 2.55);
  seg(b, UCYL, sock, m2, m2.clone().addScaledVector(dir, r * 0.6), r * 2.25);
}

/** Band / worm clamp ring around a hose or pipe at p (dir = axis). */
function bandClamp(b, p, dir, r, fin = 'stainless', w = 0.012) {
  seg(b, UCYL24, fin, p.clone().addScaledVector(dir, -w / 2), p.clone().addScaledVector(dir, w / 2), r * 2 + 0.004);
}

/** Axis-aligned cross-flow core with side tanks (in z), used by radiator / heat exchanger. */
function crossflow(b, sx, sy, sz, tw, coreT, tankFin, opts = {}) {
  const coreW = sz - 2 * tw;
  b.add(box(coreT, sy - 0.02, coreW, 0.001), 'core');
  // header rails top/bottom
  for (const s of [-1, 1]) b.add(box(coreT * 1.1, 0.01, coreW, 0.002), 'aluminum', [0, s * (sy / 2 - 0.005), 0]);
  // side tanks: rounded boxes, slightly deeper than core
  for (const s of [-1, 1]) {
    b.add(box(sx, sy, tw, Math.min(0.012, tw * 0.3)), tankFin, [0, 0, s * (sz / 2 - tw / 2)]);
    // tank seam flange where it meets the core header
    b.add(box(sx * 1.08, sy * 1.0, 0.006, 0.002), opts.seamFin || 'aluminum', [0, 0, s * (coreW / 2 + 0.003)]);
  }
}

/** Hose neck (bead + barb) on a tank, pointing +x. */
function neckX(b, p, r, len, fin) {
  b.add(cylX(r, len, 20), fin, [p[0] + len / 2, p[1], p[2]]);
  b.add(cylX(r * 1.18, 0.006, 20), fin, [p[0] + len - 0.012, p[1], p[2]]);
}

/** Slash-cut tube geometry along +X (cut plane tilted about Y). */
function slashTube(r, len, slant, seg = 24) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setY(i, pos.getY(i) + pos.getX(i) * slant);
  }
  g.computeVertexNormals();
  g.rotateZ(-PI / 2);
  return g;
}

// ============================================================================== AXIAL
const axial = {
  // Single 19 in brushless fan: swept 7-blade rotor with tip ring, motor can behind, stator struts.
  engine_support_fan(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const xb = -L / 2 + 0.022; // blade plane (towards the radiator)
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const s = new THREE.Shape();
      const r0 = R * 0.2, r1 = R * 0.95;
      // swept blade outline in (u -> -z, v -> radial y)
      s.moveTo(-0.028, r0);
      s.bezierCurveTo(-0.04, R * 0.5, -0.07, R * 0.8, -0.05, r1);
      s.lineTo(0.06, r1);
      s.bezierCurveTo(0.075, R * 0.75, 0.05, R * 0.45, 0.03, r0);
      s.lineTo(-0.028, r0);
      const g = extrudeX(s, 0.003, 6);
      g.rotateY(0.42); // blade pitch about its radial axis
      g.rotateX((i / blades) * PI * 2);
      b.add(g, 'plastic', [xb, 0, 0]);
    }
    b.add(latheX([[R * 0.94, xb - 0.014], [R * 0.995, xb - 0.014], [R * 0.995, xb + 0.014], [R * 0.94, xb + 0.014], [R * 0.94, xb - 0.014]], 64), 'plastic');
    // hub
    b.add(latheX([[0.0001, xb - 0.03], [R * 0.12, xb - 0.026], [R * 0.2, xb - 0.01], [R * 0.21, xb + 0.02], [0.0001, xb + 0.02]], 28), 'plastic');
    // brushless motor can with cooling slots
    const mx0 = xb + 0.018, mx1 = L / 2;
    b.add(cylX(0.068, mx1 - mx0, 28), 'black', [(mx0 + mx1) / 2, 0, 0]);
    for (let k = 0; k < 3; k++) b.add(cylX(0.071, 0.004, 28), 'satin', [mx0 + 0.012 + k * 0.016, 0, 0]);
    // stator struts to the shroud ring
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2 + 0.3;
      const rm = (0.068 + R * 0.98) / 2;
      b.add(box(0.012, R * 0.98 - 0.068, 0.014, 0.002), 'plastic', [L / 2 - 0.012, Math.cos(a) * rm, Math.sin(a) * rm], [a, 0, 0]);
    }
    // connector pigtail
    b.add(box(0.03, 0.025, 0.04, 0.004), 'plastic', [L / 2 - 0.02, 0.09, 0]);
    return b.build();
  },

  // Fluidworks 5-stage spur-gear dry-sump pump (front = -X / pulley end).
  engine_support_dryPump(L, D1, D2, ctx) {
    const R = Math.min(D1, D2) / 2;
    const side = ctx?.side || 1; // outboard = side * z
    const b = new PartBuilder();
    const n = 5;
    const endCap = L * 0.06;
    const secL = (L - 2 * endCap) / n;
    let x = -L / 2;
    // front end cap with shaft & key
    b.add(box(endCap, R * 1.75, R * 1.75, 0.008), 'machined', [x + endCap / 2, 0, 0]);
    b.add(cylX(0.008, 0.03, 16), 'steel', [x - 0.015, 0, 0]);
    b.add(box(0.02, 0.004, 0.004, 0), 'steel', [x - 0.015, 0.008, 0]);
    x += endCap;
    for (let i = 0; i < n; i++) {
      const cx = x + secL / 2;
      // section body: rounded square with gear-pocket bulges
      b.add(box(secL - 0.004, R * 1.9, R * 1.7, 0.01), i === 0 ? 'blue' : 'machined', [cx, 0, 0]);
      b.add(box(0.004, R * 1.95, R * 1.75, 0.006), 'satin', [x + secL - 0.002, 0, 0]);
      // through bolts
      for (const [yy, zz] of [[R * 0.85, R * 0.75], [-R * 0.85, R * 0.75], [R * 0.85, -R * 0.75], [-R * 0.85, -R * 0.75]]) {
        b.add(cylX(0.004, secL, 6), 'steel', [cx, yy, zz]);
      }
      if (i === 0) {
        // pressure stage: -16 inlet (outboard, low) and -12 outlet (top)
        b.add(hexX(0.017, 0.02), 'blue', [cx, -R * 0.35, side * (R * 0.85 + 0.01)], [0, PI / 2, 0]);
        b.add(cylX(0.013, 0.03, 16), 'red', [cx, -R * 0.35, side * (R * 0.85 + 0.03)], [0, PI / 2, 0]);
        b.add(hexX(0.014, 0.02), 'blue', [cx, R * 0.95 + 0.01, 0], [0, 0, PI / 2]);
        b.add(cylX(0.011, 0.028, 16), 'red', [cx, R * 0.95 + 0.03, 0], [0, 0, PI / 2]);
      } else {
        // scavenge stages: -12 inlets outboard
        b.add(hexX(0.014, 0.02), 'blue', [cx, -R * 0.1, side * (R * 0.85 + 0.01)], [0, PI / 2, 0]);
        b.add(cylX(0.011, 0.025, 16), 'red', [cx, -R * 0.1, side * (R * 0.85 + 0.03)], [0, PI / 2, 0]);
      }
      x += secL;
    }
    // rear cap with -16 scavenge outlet (top) and built-in bypass adjuster
    b.add(box(endCap, R * 1.75, R * 1.75, 0.008), 'machined', [x + endCap / 2, 0, 0]);
    b.add(hexX(0.018, 0.02), 'blue', [x - secL / 2, R * 0.95 + 0.01, 0], [0, 0, PI / 2]);
    b.add(cylX(0.014, 0.03, 16), 'red', [x - secL / 2, R * 0.95 + 0.03, 0], [0, 0, PI / 2]);
    b.add(cylX(0.012, 0.016, 16), 'machined', [L / 2 + 0.006, R * 0.3, 0]);
    b.add(hexX(0.008, 0.008), 'chrome', [L / 2 + 0.017, R * 0.3, 0]);
    return b.build();
  },

  // HTD 8M toothed pulley with flanges (teeth from diameter: 18T / 36T).
  engine_support_htdPulley(L, D) {
    const R = D / 2;
    const teeth = R > 0.04 ? 36 : 18;
    const pr = (teeth * 0.008) / (2 * PI); // pitch radius
    const ro = pr - 0.0007, rr = ro - 0.0034;
    const s = new THREE.Shape();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * PI * 2, da = (PI * 2) / teeth;
      const pts = [[ro, a0], [ro, a0 + da * 0.35], [rr, a0 + da * 0.45], [rr, a0 + da * 0.9], [ro, a0 + da]];
      pts.forEach(([r, a], k) => (i === 0 && k === 0 ? s.moveTo(Math.cos(a) * r, Math.sin(a) * r) : s.lineTo(Math.cos(a) * r, Math.sin(a) * r)));
    }
    s.holes.push(new THREE.Path().absarc(0, 0, 0.008, 0, PI * 2, true));
    const b = new PartBuilder();
    const tw = L * 0.72;
    b.add(extrudeX(s, tw, 4), 'machined');
    b.add(ringX(Math.min(R, ro + 0.006), 0.008, 0.002, 40), 'machined', [-tw / 2 - 0.001, 0, 0]);
    if (teeth === 18) b.add(ringX(Math.min(R, ro + 0.006), 0.008, 0.002, 40), 'machined', [tw / 2 + 0.001, 0, 0]);
    b.add(ringX(Math.min(rr * 0.75, 0.03), 0.008, L - tw, 28), 'machined', [tw / 2 + (L - tw) / 2, 0, 0]);
    // set screws / bolts on the hub face
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      b.add(cylX(0.0035, 0.004, 8), 'chrome', [-tw / 2 - 0.003, Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55]);
    }
    return b.build();
  },

  // 3-bolt crank drive mandrel: flange to balancer (+X), drive spigot forward (-X).
  engine_support_mandrel(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, L / 2], [R, L / 2], [R, L / 2 - 0.01], [R * 0.45, L / 2 - 0.016], [R * 0.4, -L / 2], [0.0001, -L / 2]], 32), 'machined');
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + PI / 2;
      b.add(hexX(0.0065, 0.007), 'chrome', [L / 2 - 0.013, Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72]);
    }
    b.add(box(L * 0.6, 0.004, 0.004, 0), 'steel', [-L * 0.15, R * 0.4, 0]);
    return b.build();
  },

  // Peterson 6 x 24 in round dry-sump tank (axis = vertical; -X = bottom).
  engine_support_oilTank(L, D1, D2, ctx) {
    const R = Math.min(D1, D2) / 2;
    const side = ctx?.side || 1;
    const b = new PartBuilder();
    const d = R * 0.22; // dished head depth
    const prof = [[0.0001, -L / 2]];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (PI / 2); prof.push([R * 0.25 + Math.sin(a) * R * 0.75, -L / 2 + d - Math.cos(a) * d]); }
    prof.push([R, -L / 2 + d + 0.01]);
    prof.push([R, L / 2 - d - 0.01]);
    for (let i = 0; i <= 6; i++) { const a = (PI / 2) - (i / 6) * (PI / 2); prof.push([R * 0.25 + Math.sin(a) * R * 0.75, L / 2 - d + Math.cos(a) * d]); }
    prof.push([0.0001, L / 2]);
    b.add(latheX(prof, 40), 'aluminum');
    // weld beads at the heads
    for (const s of [-1, 1]) b.add(torusX(R * 1.0, 0.0025, 6, 40), 'machined', [s * (L / 2 - d - 0.01), 0, 0]);
    // bottom outlet -12 (along -X)
    b.add(hexX(0.016, 0.02), 'blue', [-L / 2 - 0.006, 0, 0]);
    b.add(cylX(0.012, 0.03, 16), 'red', [-L / 2 - 0.025, 0, 0]);
    // tangential scavenge inlet near the top, facing the engine (inboard)
    const zi = -side * R * 0.75;
    b.add(cylZ(0.016, 0.05, 16), 'machined', [L / 2 - 0.08, R * 0.55, zi]);
    b.add(hexX(0.016, 0.02), 'blue', [L / 2 - 0.08, R * 0.55, zi - side * 0.03], [0, PI / 2, 0]);
    // top breather boss (cap is a separate component)
    b.add(cylX(0.022, 0.012, 20), 'machined', [L / 2 + 0.002, 0, 0]);
    b.add(hexX(0.013, 0.018), 'blue', [L / 2 - 0.004, R * 0.55, 0]);
    // label band
    b.add(cylX(R * 1.004, 0.08, 40), 'satin', [L * 0.05, 0, 0]);
    return b.build();
  },

  // Spin-on filter (ACDelco PF64 style): dome at -X, base/threaded end at +X.
  engine_support_spinOn(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const prof = [[0.0001, -L / 2], [R * 0.7, -L / 2], [R * 0.93, -L / 2 + 0.006], [R, -L / 2 + 0.016], [R, L / 2 - 0.008], [R * 0.97, L / 2 - 0.004], [R * 0.85, L / 2], [0.0001, L / 2]];
    b.add(latheX(prof, 32), 'blue');
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * PI * 2;
      b.add(box(0.016, 0.003, 0.003, 0), 'blue', [-L / 2 + 0.014, Math.cos(a) * R, Math.sin(a) * R]);
    }
    b.add(cylX(R * 0.98, 0.004, 32), 'steel', [L / 2 - 0.002, 0, 0]);
    b.add(ringX(R * 0.85, R * 0.7, 0.004, 28), 'rubber', [L / 2 + 0.002, 0, 0]);
    return b.build();
  },

  // Billet inline AN filter / scavenge screen (hex ends, knurled bands, AN male ends).
  engine_support_anFilter(L, D, D2, ctx) {
    const R = Math.min(D, D2) / 2;
    const fin = ctx?.variant === 'screen' ? 'satin' : 'blue';
    const b = new PartBuilder();
    const end = Math.min(0.022, L * 0.18);
    b.add(cylX(R, L - 2 * end - 0.02, 28), fin);
    for (const s of [-1, 1]) {
      b.add(hexX(R * 1.08, end), fin, [s * (L / 2 - end / 2 - 0.01), 0, 0]);
      b.add(cylX(R * 0.42, 0.014, 16), 'red', [s * (L / 2 - 0.005), 0, 0]);
    }
    for (const x of [-L * 0.12, L * 0.12]) b.add(cylX(R * 1.03, 0.006, 28), 'machined', [x, 0, 0]);
    return b.build();
  },

  // Bosch 044-style inline pump: crimped metal can, black outlet cap with banjo stub & terminals.
  engine_support_pump044(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, -L / 2 + 0.012], [R * 0.95, -L / 2 + 0.014], [R, -L / 2 + 0.024], [R, L / 2 - 0.05], [R * 0.95, L / 2 - 0.045], [0.0001, L / 2 - 0.045]], 32), 'machined');
    for (const x of [-L / 2 + 0.03, L / 2 - 0.06]) b.add(cylX(R * 1.02, 0.005, 32), 'steel', [x, 0, 0]);
    // M18 inlet end
    b.add(cylX(R * 0.42, 0.014, 20), 'machined', [-L / 2 + 0.006, 0, 0]);
    b.add(hexX(R * 0.45, 0.01), 'steel', [-L / 2 + 0.002, 0, 0]);
    // black outlet cap + M12 stub + terminals
    b.add(latheX([[R * 0.97, L / 2 - 0.05], [R * 0.95, L / 2 - 0.02], [R * 0.6, L / 2 - 0.012], [0.0001, L / 2 - 0.012]], 28), 'plastic');
    b.add(cylX(0.007, 0.02, 12), 'machined', [L / 2 - 0.002, 0, 0]);
    b.add(hexX(0.009, 0.006), 'steel', [L / 2 - 0.008, 0, 0]);
    b.add(cylX(0.004, 0.014, 8), 'red', [L / 2 - 0.012, R * 0.55, R * 0.25]);
    b.add(cylX(0.004, 0.014, 8), 'black', [L / 2 - 0.012, R * 0.55, -R * 0.25]);
    // rubber-isolated clamp + foot
    b.add(cylX(R * 1.12, 0.022, 32), 'rubber', [0, 0, 0]);
    b.add(box(0.022, 0.012, R * 2.4, 0.003), 'satin', [0, -R - 0.006, 0]);
    return b.build();
  },

  // Walbro F90000267: 39 mm body, 50 mm base, outlet nipple.
  engine_support_walbro(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R, L * 0.75, 24), 'machined', [L * 0.08, 0, 0]);
    b.add(cylX(R * 1.25, L * 0.2, 24), 'black', [-L / 2 + L * 0.1, 0, 0]);
    b.add(cylX(R * 0.3, L * 0.08, 12), 'black', [L / 2 - L * 0.04, R * 0.3, 0]);
    return b.build();
  },

  // Radium MPFST: machined canister, mounting feet, top cap with pump outlets and ORB ports (axis vertical, +X = top).
  engine_support_surgeTank(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, -L / 2 + 0.012], [R * 0.97, -L / 2 + 0.012], [R, -L / 2 + 0.02], [R, L / 2 - 0.03], [0.0001, L / 2 - 0.03]], 40), 'satin');
    for (const x of [-L * 0.15, L * 0.1]) b.add(cylX(R * 1.01, 0.004, 40), 'machined', [x, 0, 0]);
    // top cap
    b.add(cylX(R * 1.02, 0.026, 40), 'machined', [L / 2 - 0.017, 0, 0]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; b.add(cylX(0.004, 0.006, 6), 'chrome', [L / 2 - 0.002, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9]); }
    // 2 pump outlets (-6) + feed/return/overflow (-8 ORB)
    const ports = [[0.03, 0.025, 'red'], [-0.03, 0.025, 'red'], [0.0, -0.045, 'blue'], [0.045, -0.02, 'blue'], [-0.045, -0.02, 'blue']];
    for (const [yy, zz, f] of ports) {
      b.add(hexX(0.011, 0.012), f, [L / 2 + 0.006, yy, zz]);
      b.add(cylX(0.007, 0.016, 12), f === 'red' ? 'blue' : 'red', [L / 2 + 0.02, yy, zz]);
    }
    // mounting feet
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      b.add(box(0.012, 0.03, 0.025, 0.003), 'machined', [-L / 2 + 0.006, Math.cos(a) * (R + 0.008), Math.sin(a) * (R + 0.008)], [a, 0, 0]);
    }
    return b.build();
  },

  // Canton Accusump: anodised cylinder, gauge + air valve (-X), EPC valve and -10 fitting (+X), clamps.
  engine_support_accusump(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const body = L * 0.83;
    const x0 = -L / 2 + (L - body) * 0.45;
    b.add(cylX(R * 0.96, body, 32), 'red', [x0 + body / 2, 0, 0]);
    for (const s of [0, 1]) b.add(latheX([[R * 0.6, 0], [R, 0.004], [R, 0.022], [R * 0.6, 0.026]].map(([r, x]) => [r, s ? x0 + body - x : x0 + x]), 32), 'machined');
    // gauge
    b.add(cylX(R * 0.42, 0.012, 24), 'chrome', [x0 - 0.03, R * 0.25, 0]);
    b.add(cylX(R * 0.36, 0.014, 24), 'black', [x0 - 0.031, R * 0.25, 0]);
    b.add(cylX(R * 0.1, 0.025, 10), 'machined', [x0 - 0.012, R * 0.25, 0]);
    b.add(cylX(R * 0.08, 0.03, 10), 'chrome', [x0 - 0.015, -R * 0.35, 0]);
    // EPC valve
    const xe = x0 + body;
    b.add(cylX(R * 0.25, 0.03, 16), 'machined', [xe + 0.015, 0, 0]);
    b.add(box(0.03, R * 0.6, R * 0.5, 0.004), 'black', [xe + 0.04, R * 0.2, 0]);
    b.add(hexX(R * 0.24, 0.016), 'blue', [xe + 0.062, 0, 0]);
    // mounting clamps
    for (const x of [x0 + body * 0.25, x0 + body * 0.75]) {
      b.add(cylX(R * 1.04, 0.02, 32), 'satin', [x, 0, 0]);
      b.add(box(0.02, 0.012, R * 1.6, 0.002), 'satin', [x, -R - 0.004, 0]);
    }
    return b.build();
  },

  // Kooks-style oval race muffler: rolled lock-seam ends, 3 in stubs. variant 'lowInlet': the inlet (-X)
  // stub sits low in the oval so the mid pipe can pass under the rear cradle brace; outlet stays centred.
  engine_support_muffler(L, D1, D2, ctx) {
    const b = new PartBuilder();
    const body = L * 0.83;
    const R = 0.5;
    const prof = [[0.0001, -body / 2], [R * 0.9, -body / 2], [R * 0.98, -body / 2 + 0.006], [R * 1.0, -body / 2 + 0.008], [R * 0.985, -body / 2 + 0.014], [R * 0.985, body / 2 - 0.014], [R, body / 2 - 0.008], [R * 0.98, body / 2 - 0.006], [R * 0.9, body / 2], [0.0001, body / 2]];
    b.add(latheX(prof, 40), 'stainless', [0, 0, 0], [0, 0, 0], [1, D1, D2]);
    // lock seam along the bottom
    b.add(box(body - 0.03, 0.006, 0.01, 0.002), 'stainless', [0, -D1 * 0.49, D2 * 0.05]);
    const pr = 0.038, stub = (L - body) / 2 + 0.005;
    const lowDy = ctx?.variant === 'lowInlet' ? -Math.max(0, D1 / 2 - pr - 0.002) : 0;
    for (const s of [-1, 1]) b.add(cylX(pr, stub, 20), 'stainless', [s * (body / 2 + stub / 2 - 0.004), s < 0 ? lowDy : 0, 0]);
    return b.build();
  },

  // Interlock flex section: braided corrugated bellows with plain cuffs.
  engine_support_flex(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const cuff = L * 0.16;
    const prof = [];
    const n = 16;
    for (let i = 0; i <= n; i++) prof.push([i % 2 ? R : R * 0.93, -L / 2 + cuff + (i / n) * (L - 2 * cuff)]);
    b.add(latheX(prof, 28), 'braided');
    for (const s of [-1, 1]) b.add(cylX(R * 0.92, cuff, 24), 'stainless', [s * (L / 2 - cuff / 2), 0, 0]);
    for (const s of [-1, 1]) b.add(cylX(R * 0.98, 0.008, 24), 'stainless', [s * (L / 2 - cuff), 0, 0]);
    return b.build();
  },

  // V-band clamp (torus primitive, L = band width): V-section band, flanges, T-bolt latch.
  engine_support_vband(L, D) {
    const R = D / 2;
    const w = Math.max(0.012, L);
    const b = new PartBuilder();
    b.add(latheX([[R * 0.8, -w / 2], [R, -w * 0.35], [R, w * 0.35], [R * 0.8, w / 2], [R * 0.78, w / 2], [R * 0.78, -w / 2], [R * 0.8, -w / 2]], 48), 'stainless');
    for (const s of [-1, 1]) b.add(ringX(R * 0.8, R * 0.7, 0.006, 40), 'stainless', [s * w * 0.2, 0, 0]);
    b.add(box(w * 0.8, 0.012, 0.03, 0.002), 'stainless', [0, R + 0.004, 0]);
    b.add(cylZ(0.003, 0.05, 8), 'chrome', [0, R + 0.012, 0]);
    b.add(hexX(0.005, 0.008), 'chrome', [0, R + 0.012, 0.028], [0, PI / 2, 0]);
    return b.build();
  },

  // Sensors: O2 (slotted shroud, 22 mm hex, boot), EGT (thin probe + compression nut), temp/pressure.
  engine_support_sensor(L, D, D2, ctx) {
    const v = ctx?.variant || 'temp';
    const R = Math.min(D, D2) / 2;
    const b = new PartBuilder();
    if (v === 'o2') {
      b.add(cylX(0.0065, 0.016, 16), 'stainless', [-L / 2 + 0.008, 0, 0]);
      for (let i = 0; i < 4; i++) b.add(box(0.008, 0.0015, 0.004, 0), 'black', [-L / 2 + 0.008, Math.cos(i * PI / 2) * 0.0066, Math.sin(i * PI / 2) * 0.0066], [i * PI / 2, 0, 0]);
      b.add(hexX(0.0125, 0.012), 'stainless', [-L / 2 + 0.023, 0, 0]);
      b.add(cylX(0.008, L * 0.35, 16), 'stainless', [-L / 2 + 0.03 + L * 0.175, 0, 0]);
      b.add(cylX(0.0065, L * 0.25, 12, 0.0045), 'rubber', [L / 2 - L * 0.125, 0, 0]);
    } else if (v === 'egt') {
      b.add(cylX(0.0016, L, 8), 'stainless');
      b.add(hexX(0.005, 0.008), 'chrome', [-L * 0.15, 0, 0]);
      b.add(cylX(0.0025, L * 0.3, 8), 'yellow', [L * 0.35, 0, 0]);
    } else if (v === 'inline') {
      b.add(cylX(R * 0.75, L, 20), 'blue');
      for (const s of [-1, 1]) b.add(cylX(R * 0.8, 0.004, 20), 'machined', [s * L * 0.42, 0, 0]);
      b.add(hexX(0.006, 0.01), 'gold', [0, R * 0.75 + 0.004, 0], [0, 0, PI / 2]);
      b.add(cylY(0.005, 0.014, 10), 'plastic', [0, R * 0.75 + 0.016, 0]);
    } else {
      // threaded brass/stainless sensor (thread at -X)
      b.add(cylX(R * 0.5, L * 0.25, 12), v === 'pressure' ? 'stainless' : 'gold', [-L / 2 + L * 0.125, 0, 0]);
      b.add(hexX(R * 1.0, L * 0.18), v === 'pressure' ? 'stainless' : 'gold', [-L * 0.2, 0, 0]);
      b.add(cylX(R * 0.85, L * 0.35, 16), v === 'pressure' ? 'stainless' : 'plastic', [L * 0.08, 0, 0]);
      b.add(box(L * 0.22, R * 1.5, R * 1.3, 0.002), 'plastic', [L / 2 - L * 0.11, 0, 0]);
    }
    return b.build();
  },

  // AN fitting / bulkhead / adapter / weld bung: jam-nut hex (red) + body + male flare ends (blue).
  engine_support_fitting(L, D, D2) {
    const R = Math.min(D, D2) / 2;
    const b = new PartBuilder();
    b.add(hexX(R, L * 0.25), 'red', [-L / 2 + L * 0.125, 0, 0]);
    b.add(cylX(R * 0.62, L * 0.5, 16), 'blue', [L * 0.05, 0, 0]);
    b.add(hexX(R * 0.85, L * 0.2), 'blue', [L * 0.05, 0, 0]);
    b.add(latheX([[R * 0.62, L / 2 - L * 0.22], [R * 0.6, L / 2 - 0.002], [R * 0.4, L / 2], [0.0001, L / 2]], 16), 'blue');
    return b.build();
  },

  // Rollover / vent check valve (vertical; +X up): anodised body, hex, -8 male outlet.
  engine_support_rollover(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(hexX(R, L * 0.2), 'machined', [-L * 0.25, 0, 0]);
    b.add(latheX([[R * 0.8, -L * 0.15], [R * 0.85, L * 0.15], [R * 0.6, L * 0.3], [0.0001, L * 0.3]], 20), 'red');
    b.add(cylX(R * 0.36, L * 0.25, 14), 'blue', [L * 0.375, 0, 0]);
    b.add(cylX(R * 0.5, L * 0.2, 14), 'machined', [-L / 2 + L * 0.1, 0, 0]);
    return b.build();
  },

  // Filler flapper/check valve in the fill-plate opening (vertical; +X up).
  engine_support_fillerValve(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.65, L * 0.25, 40), 'machined', [L / 2 - L * 0.125, 0, 0]);
    b.add(ringX(R * 0.66, R * 0.58, L * 0.75, 32), 'aluminum', [-L * 0.125, 0, 0]);
    b.add(cylX(R * 0.6, 0.004, 28), 'black', [-L * 0.3, 0, 0], [0, 0, 0.25]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; b.add(hexX(0.004, 0.004), 'chrome', [L / 2 + 0.002, Math.cos(a) * R * 0.83, Math.sin(a) * R * 0.83]); }
    return b.build();
  },

  // Capacitive level probe: tube, SAE 5-bolt head at top (+X), connector.
  engine_support_levelSender(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.55, L * 0.92, 16), 'machined', [-L * 0.04, 0, 0]);
    b.add(cylX(R * 0.6, 0.01, 16), 'black', [-L / 2 + 0.005, 0, 0]);
    b.add(cylX(R * 1.9, 0.006, 5), 'machined', [L / 2 - 0.02, 0, 0]);
    b.add(cylX(R * 0.9, 0.02, 20), 'blue', [L / 2 - 0.007, 0, 0]);
    b.add(cylX(R * 0.45, 0.02, 12), 'plastic', [L / 2 + 0.008, 0, 0]);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; b.add(hexX(0.003, 0.004), 'chrome', [L / 2 - 0.016, Math.cos(a) * R * 1.6, Math.sin(a) * R * 1.6]); }
    return b.build();
  },

  // Foam-free pickup collector with screen.
  engine_support_pickup(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.9, L, 32), 'machined');
    b.add(cylX(R * 0.88, L * 0.9, 24), 'net');
    b.add(cylX(R, 0.004, 32), 'machined', [-L / 2, 0, 0]);
    b.add(cylX(0.006, L * 0.9, 12), 'stainless', [L * 0.1, R * 0.4, 0]);
    return b.build();
  },

  // GM-style ribbed surge-tank pressure cap (+X up) on its neck.
  engine_support_pressureCap(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.75, L * 0.35, 24), 'chassis', [-L / 2 + L * 0.175, 0, 0]);
    b.add(latheX([[R * 0.9, -L * 0.15], [R, -L * 0.1], [R, L * 0.35], [R * 0.85, L / 2], [0.0001, L / 2]], 32), 'black');
    for (let i = 0; i < 16; i++) { const a = (i / 16) * PI * 2; b.add(box(L * 0.4, 0.004, 0.004, 0), 'black', [L * 0.12, Math.cos(a) * R, Math.sin(a) * R]); }
    b.add(box(0.002, R * 0.8, R * 0.5, 0), 'yellow', [L / 2 + 0.001, 0, 0]);
    return b.build();
  },

  // Radiator rubber isolator grommet with locating pin (+X up).
  engine_support_isolator(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.35, -L / 2], [R, -L / 2], [R, -L * 0.15], [R * 0.7, -L * 0.05], [R * 0.7, L * 0.15], [R * 0.95, L * 0.25], [R * 0.95, L / 2], [R * 0.35, L / 2]], 20), 'rubber');
    b.add(cylX(R * 0.3, L * 1.1, 10), 'steel');
    return b.build();
  },

  // Gen V thermostat: brass flange, wax pellet, spring.
  engine_support_thermostat(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.55, 0.003, 32), 'copper', [0, 0, 0]);
    b.add(ringX(R * 0.98, R * 0.6, 0.006, 32), 'rubber', [-0.004, 0, 0]);
    b.add(box(0.004, R * 1.2, 0.01, 0), 'steel', [L * 0.15, 0, 0]);
    b.add(cylX(R * 0.25, L * 0.5, 16), 'copper', [-L * 0.2, 0, 0]);
    b.add(latheX([[R * 0.45, -L / 2], [R * 0.3, -L * 0.1], [R * 0.45, -L * 0.05]], 12), 'steel');
    return b.build();
  },

  // Cast water outlet neck (axis = hose direction) with hose bead and 2-bolt flange.
  engine_support_waterNeck(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.7, -L / 2], [R * 0.72, L / 2 - 0.01], [R * 0.82, L / 2 - 0.006], [R * 0.7, L / 2]], 24), 'cast');
    b.add(box(0.008, R * 1.6, R * 2.4, 0.004), 'cast', [-L / 2 + 0.004, 0, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.006, 0.006), 'chrome', [-L / 2 + 0.01, 0, s * R * 0.95]);
    return b.build();
  },

  // Petcock / drain plug (+X up -> points down into tank bottom).
  engine_support_drain(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.6, L * 0.5, 12), 'plastic', [L * 0.2, 0, 0]);
    b.add(box(L * 0.25, R * 0.4, R * 2, 0.002), 'plastic', [-L * 0.3, 0, 0]);
    return b.build();
  },

  // Water pump O-ring / gasket (torus).
  engine_support_oring(L, D) {
    const R = D / 2;
    return new PartBuilder().add(torusX(R - L / 2, L / 2, 8, 48), 'rubber').build();
  },

  // Dry-break quick disconnect (-8): two halves + locking sleeve.
  engine_support_dryBreak(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(hexX(R * 0.8, L * 0.15), 'red', [-L / 2 + L * 0.075, 0, 0]);
    b.add(cylX(R * 0.75, L * 0.35, 20), 'gold', [-L * 0.15, 0, 0]);
    b.add(cylX(R, L * 0.25, 24), 'machined', [L * 0.1, 0, 0]);
    for (let i = 0; i < 3; i++) b.add(cylX(R * 1.02, 0.002, 24), 'satin', [L * 0.02 + i * 0.006, 0, 0]);
    b.add(cylX(R * 0.7, L * 0.2, 20), 'gold', [L * 0.3, 0, 0]);
    b.add(hexX(R * 0.8, L * 0.1), 'blue', [L / 2 - L * 0.05, 0, 0]);
    return b.build();
  },

  // Billet catch can (vertical, +X top): finned body, top cap with 2 AN inlets, drain at bottom.
  engine_support_catchCan(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const body = L * 0.78;
    const prof = [[0.0001, -L / 2], [R * 0.9, -L / 2], [R * 0.97, -L / 2 + 0.008]];
    const fins = 10;
    for (let i = 0; i <= fins * 2; i++) prof.push([i % 2 ? R * 0.92 : R, -L / 2 + 0.01 + (i / (fins * 2)) * body * 0.7]);
    prof.push([R * 0.95, -L / 2 + body], [0.0001, -L / 2 + body]);
    b.add(latheX(prof, 32), 'satin');
    b.add(cylX(R * 1.02, L * 0.07, 32), 'machined', [-L / 2 + body + L * 0.035, 0, 0]);
    const lid = -L / 2 + body + L * 0.07;
    // three -10 AN inlet bungs (two crankcase breathers + dry-sump tank vent); local y = world -x when vertical
    for (const [yy, zz] of [[R * 0.56, R * 0.56], [R * 0.56, -R * 0.56], [-R * 0.56, R * 0.56]]) {
      b.add(hexX(0.011, 0.012), 'blue', [lid + 0.006, yy, zz]);
      b.add(cylX(0.0075, 0.02, 12), 'red', [lid + 0.02, yy, zz]);
    }
    // centre outlet riser carrying the breather filter
    b.add(cylX(0.008, 0.04, 14), 'machined', [lid + 0.02, 0, 0]);
    b.add(hexX(0.008, 0.012), 'blue', [-L / 2 - 0.006, 0, 0]);
    b.add(cylX(0.003, L * 0.12, 6), 'chrome', [L / 2 - L * 0.06, R * 0.5, 0]);
    return b.build();
  },

  // Breather filter: AN base, pleated element, chrome cap (+X up).
  engine_support_breather(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const g = new THREE.CylinderGeometry(R * 0.92, R * 0.92, L * 0.6, 36, 1, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = Math.round((a / (2 * PI)) * 36) % 2 ? 1.04 : 0.98;
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    g.rotateZ(-PI / 2);
    b.add(g, 'red', [-L * 0.02, 0, 0]);
    b.add(cylX(R, L * 0.12, 32), 'chrome', [L / 2 - L * 0.06, 0, 0]);
    b.add(cylX(R * 0.95, L * 0.08, 32), 'chrome', [-L * 0.36, 0, 0]);
    b.add(hexX(R * 0.4, L * 0.12), 'blue', [-L / 2 + L * 0.06, 0, 0]);
    return b.build();
  },

  // ZL1/Roto-Fab style pleated oiled filter; flange (outlet) at -X.
  engine_support_airFilter(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const g = new THREE.CylinderGeometry(R * 0.95, R * 0.95, L * 0.82, 56, 1, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = Math.round((a / (2 * PI)) * 56) % 2 ? 1.04 : 0.96;
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    g.rotateZ(-PI / 2);
    b.add(g, 'red');
    b.add(cylX(R * 0.86, 0.004, 36), 'net', [0, 0, 0]);
    b.add(ringX(R, R * 0.55, L * 0.09, 40), 'rubber', [-L / 2 + L * 0.045, 0, 0]);
    b.add(cylX(R, L * 0.09, 40), 'rubber', [L / 2 - L * 0.045, 0, 0]);
    b.add(cylX(R * 0.3, 0.004, 20), 'chrome', [L / 2 + 0.002, 0, 0]);
    return b.build();
  },

  // Silicone hump coupler with two T-bolt clamps.
  engine_support_coupler(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.86, -L / 2], [R * 0.9, -L / 2], [R * 0.9, -L * 0.15], [R, -L * 0.05], [R, L * 0.05], [R * 0.9, L * 0.15], [R * 0.9, L / 2], [R * 0.86, L / 2]], 36), 'blue');
    for (const s of [-1, 1]) {
      b.add(cylX(R * 0.93, L * 0.16, 36), 'stainless', [s * L * 0.32, 0, 0]);
      b.add(box(L * 0.16, 0.012, 0.016, 0.002), 'stainless', [s * L * 0.32, R * 0.95, 0]);
      b.add(cylZ(0.0025, 0.03, 6), 'chrome', [s * L * 0.32, R * 0.98, 0]);
    }
    return b.build();
  },

  // Throttle-body inlet ring / gasket.
  engine_support_tbRing(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.8, L * 0.6, 40), 'machined', [-L * 0.2, 0, 0]);
    b.add(ringX(R * 0.92, R * 0.8, L * 0.4, 40), 'rubber', [L * 0.3, 0, 0]);
    return b.build();
  },

  // Electric intercooler pump: volute + axial inlet at -X, tangential outlet up, motor can at +X.
  engine_support_icPump(L, D1, D2) {
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    const vol = L * 0.32;
    b.add(latheX([[0.0001, -L / 2 + 0.03], [R * 0.6, -L / 2 + 0.03], [R, -L / 2 + 0.04], [R, -L / 2 + vol], [0.0001, -L / 2 + vol]], 28), 'black');
    b.add(cylX(0.0125, 0.04, 16), 'black', [-L / 2 + 0.02, 0, 0]);
    b.add(cylX(0.0145, 0.004, 16), 'black', [-L / 2 + 0.004, 0, 0]);
    b.add(cylY(0.0125, R * 0.9, 16), 'black', [-L / 2 + 0.065, R * 0.75, R * 0.35]);
    b.add(cylX(R * 0.85, L - vol - 0.03, 28), 'satin', [L / 2 - (L - vol - 0.03) / 2, 0, 0]);
    for (let i = 0; i < 4; i++) b.add(cylX(R * 0.88, 0.004, 28), 'black', [-L / 2 + vol + 0.02 + i * 0.02, 0, 0]);
    b.add(box(0.03, 0.02, 0.035, 0.003), 'plastic', [L / 2 - 0.02, R * 0.85, 0]);
    // T20 screws on the volute
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; b.add(cylX(0.003, 0.004, 6), 'chrome', [-L / 2 + vol + 0.002, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9]); }
    // rubber-isolated bracket
    b.add(cylX(R * 0.9, 0.02, 28), 'rubber', [L * 0.12, 0, 0]);
    b.add(box(0.02, 0.01, R * 2.4, 0.002), 'satin', [L * 0.12, -R * 0.92, 0]);
    return b.build();
  },
};

// ============================================================================== BOXES
const boxes = {
  // Cross-flow radiator: aluminium core, black plastic side tanks, inlet top driver tank, outlet bottom passenger tank.
  engine_support_radiator(sx, sy, sz) {
    const b = new PartBuilder();
    const tw = Math.min(0.075, sz * 0.1);
    crossflow(b, sx, sy, sz, tw, sx * 0.62, 'plastic');
    const zt = sz / 2 - tw / 2;
    neckX(b, [sx / 2 - 0.005, 0.66 - 0.48, zt], 0.019, 0.05, 'plastic'); // inlet (driver, top)
    neckX(b, [sx / 2 - 0.005, 0.28 - 0.48, -zt], 0.021, 0.05, 'plastic'); // outlet (passenger, bottom)
    b.add(cylY(0.005, 0.03, 10), 'plastic', [0, sy / 2 + 0.015, zt]); // degas nipple
    for (const z of [-0.3, 0.3]) for (const s of [-1, 1]) b.add(cylY(0.006, 0.03, 10), 'plastic', [-sx / 2 + 0.005, s * (sy / 2 + 0.01), z]); // isolator pins (front edge, into the support-rail grommets)
    // tank ribs
    for (const s of [-1, 1]) for (let i = -3; i <= 3; i++) b.add(box(sx * 0.4, 0.006, tw * 0.9, 0.002), 'plastic', [sx / 2, i * sy * 0.12, s * zt]);
    return b.build();
  },

  // Intercooler low-temp heat exchanger: thin core, welded aluminium end tanks, 3/4 in barbs, bleed screw.
  engine_support_heatExchanger(sx, sy, sz) {
    const b = new PartBuilder();
    const tw = 0.04;
    crossflow(b, sx, sy, sz, tw, sx * 0.8, 'aluminum');
    const zt = sz / 2 - tw / 2;
    for (const [yy, f] of [[sy / 2 - 0.05, 'aluminum'], [-sy / 2 + 0.05, 'aluminum']]) neckX(b, [sx / 2 - 0.004, yy, zt], 0.0105, 0.04, f);
    b.add(hexX(0.006, 0.01), 'chrome', [0, sy / 2 + 0.004, zt], [0, 0, PI / 2]);
    for (const s of [-1, 1]) b.add(box(0.025, 0.004, 0.03, 0.001), 'aluminum', [0, s * (sy / 2 + 0.002), 0]);
    return b.build();
  },

  // Setrab-style stacked-plate oil cooler: black end tanks, M22 ports on the inboard tank, brackets.
  engine_support_oilCooler(sx, sy, sz, ctx) {
    const side = ctx?.side || 1;
    const b = new PartBuilder();
    const tw = Math.min(0.051, sz * 0.16);
    crossflow(b, sx, sy, sz, tw, sx * 0.9, 'black', { seamFin: 'black' });
    // row plates
    const rows = 12;
    for (let i = 1; i < rows; i++) b.add(box(sx * 0.92, 0.0015, sz - 2 * tw, 0), 'black', [0, -sy / 2 + (i / rows) * sy, 0]);
    const zin = -side * (sz / 2 - tw / 2);
    for (const yy of [sy * 0.22, -sy * 0.22]) {
      b.add(cylX(0.014, 0.02, 20), 'black', [sx / 2 + 0.01, yy, zin]);
      b.add(hexX(0.016, 0.012), 'blue', [sx / 2 + 0.026, yy, zin]);
    }
    // low-profile rubber-isolated mounting tabs (10 mm stack on top); the inboard top tab is left off, where the
    // crush can sits directly above the inboard end tank
    for (const s of [-1, 1]) for (const zz of [-1, 1]) {
      if (s > 0 && zz === -side) continue;
      const tab = s > 0 ? 0.004 : 0.002, rub = s > 0 ? 0.006 : 0.004; // bottom stack 6 mm: sits on the splitter
      b.add(box(0.03, 0.03, tab, 0.0008), 'black', [0, s * (sy / 2 + tab / 2), zz * (sz / 2 - tw / 2)], [PI / 2, 0, 0]);
      b.add(cylY(0.007, rub, 10), 'rubber', [0, s * (sy / 2 + tab + rub / 2), zz * (sz / 2 - tw / 2)]);
    }
    return b.build();
  },

  // Full fan shroud: plate with venturi opening, perimeter lip, rubber flapper doors, top clips.
  engine_support_shroud(sx, sy, sz) {
    const b = new PartBuilder();
    const Rh = Math.min(sy, sz) / 2 - 0.006;
    const s = new THREE.Shape();
    const w = sz / 2, h = sy / 2, cr = 0.03;
    s.moveTo(-w + cr, -h); s.lineTo(w - cr, -h); s.quadraticCurveTo(w, -h, w, -h + cr); s.lineTo(w, h - cr); s.quadraticCurveTo(w, h, w - cr, h);
    s.lineTo(-w + cr, h); s.quadraticCurveTo(-w, h, -w, h - cr); s.lineTo(-w, -h + cr); s.quadraticCurveTo(-w, -h, -w + cr, -h);
    s.holes.push(new THREE.Path().absarc(0, 0, Rh, 0, PI * 2, true));
    const t = 0.004;
    b.add(extrudeX(s, t, 48), 'plastic', [sx / 2 - t / 2, 0, 0]);
    // perimeter lip forward to the radiator
    for (const yy of [-h + 0.002, h - 0.002]) b.add(box(sx, 0.004, sz, 0.001), 'plastic', [0, yy, 0]);
    for (const zz of [-w + 0.002, w - 0.002]) b.add(box(sx, sy, 0.004, 0.001), 'plastic', [0, 0, zz]);
    // venturi ring
    b.add(latheX([[Rh, sx / 2 - 0.002], [Rh, sx / 2 + 0.008], [Rh + 0.004, sx / 2 + 0.008], [Rh + 0.004, sx / 2 - 0.002]], 72), 'plastic');
    // flapper doors in the corners
    for (const yy of [-1, 1]) for (const zz of [-1, 1]) {
      b.add(box(0.003, sy * 0.16, sz * 0.12, 0.001), 'rubber', [sx / 2 + 0.002, yy * h * 0.72, zz * w * 0.8]);
    }
    // ribs
    for (const zz of [-w * 0.86, w * 0.86]) b.add(box(0.012, sy * 0.9, 0.004, 0.001), 'plastic', [sx / 2 + 0.006, 0, zz]);
    for (const zz of [-0.25, 0, 0.25]) b.add(box(0.012, 0.012, 0.02, 0.002), 'plastic', [-sx / 2 + 0.006, h + 0.004, zz]);
    return b.build();
  },

  // Coolant surge tank (GM two-chamber translucent) / IC degas bottle.
  engine_support_coolantTank(sx, sy, sz, ctx) {
    const ic = ctx?.variant === 'ic';
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, 0.02), 'chassis');
    if (!ic) b.add(box(0.006, sy * 1.01, sz * 1.01, 0.003), 'chassis', [sx * 0.12, 0, 0]); // chamber divider seam
    b.add(box(sx * 1.02, 0.006, sz * 1.02, 0.003), 'chassis', [0, sy * 0.05, 0]); // weld seam
    // cap neck (cap is a separate component for the surge tank)
    const cx = ic ? 0 : -sx / 2 + 0.06 - 0.02;
    b.add(cylY(0.024, 0.016, 24), 'chassis', [cx, sy / 2 + 0.006, 0]);
    if (ic) b.add(cylY(0.03, 0.018, 24), 'black', [cx, sy / 2 + 0.012, 0]);
    // hose nipples
    b.add(cylY(0.005, 0.016, 10), 'chassis', [sx / 2 - 0.04, sy / 2 + 0.006, sz * 0.15]);
    b.add(cylY(0.005, 0.016, 10), 'chassis', [sx / 2 - 0.02, sy / 2 + 0.006, -sz * 0.15]);
    b.add(cylY(ic ? 0.0105 : 0.0115, 0.022, 14), 'chassis', [ic ? 0 : -sx * 0.1, -sy / 2 - 0.008, 0]);
    // level marks + mounting tabs
    b.add(box(sx * 0.3, 0.003, 0.002, 0), 'yellow', [0, -sy * 0.1, sz / 2 + 0.001]);
    for (const s of [-1, 1]) b.add(box(0.03, 0.025, 0.006, 0.002), 'chassis', [s * (sx / 2 - 0.03), -sy * 0.2, -sz / 2 - 0.003]);
    return b.build();
  },

  // Fuel Safe Enduro steel can: black powder coat, 1 in mounting flange at the top seam, stiffening beads.
  engine_support_fuelCell(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, 0.012), 'black');
    b.add(box(sx + 0.05, 0.003, sz + 0.05, 0.002), 'black', [0, sy / 2 - 0.03, 0]);
    // flange bolts
    for (let i = 0; i < 8; i++) {
      const z = -sz / 2 - 0.012 + ((i + 0.5) / 8) * (sz + 0.024);
      for (const s of [-1, 1]) b.add(cylY(0.005, 0.006, 6), 'chrome', [s * (sx / 2 + 0.013), sy / 2 - 0.027, z]);
    }
    for (let i = 0; i < 5; i++) {
      const x = -sx / 2 + ((i + 0.5) / 5) * sx;
      for (const s of [-1, 1]) b.add(cylY(0.005, 0.006, 6), 'chrome', [x, sy / 2 - 0.027, s * (sz / 2 + 0.013)]);
    }
    // swaged stiffening beads on sides
    for (const yy of [-sy * 0.22, sy * 0.08]) {
      b.add(box(sx * 0.9, 0.012, sz + 0.004, 0.004), 'black', [0, yy, 0]);
      b.add(box(sx + 0.004, 0.012, sz * 0.9, 0.004), 'black', [0, yy, 0]);
    }
    // fill-plate recess ring & warning label
    b.add(box(0.17, 0.004, 0.27, 0.004), 'satin', [0, sy / 2 + 0.001, 0.08]);
    b.add(box(0.002, 0.06, 0.16, 0), 'yellow', [-sx / 2 - 0.001, sy * 0.25, 0]);
    return b.build();
  },

  engine_support_bladder(sx, sy, sz) {
    return new PartBuilder().add(box(sx * 0.99, sy * 0.99, sz * 0.99, 0.025), 'rubber').build();
  },

  // 6 x 10 in aluminium fill plate with bolt ring and gasket.
  engine_support_fillPlate(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.6, sz, 0.012), 'aluminum', [0, sy * 0.2, 0]);
    b.add(box(sx * 1.02, sy * 0.3, sz * 1.02, 0.012), 'rubber', [0, -sy * 0.3, 0]);
    const n = 18;
    const per = 2 * (sx + sz);
    for (let i = 0; i < n; i++) {
      let d = ((i + 0.5) / n) * per;
      const ix = sx - 0.024, iz = sz - 0.024;
      let x, z;
      if (d < ix) { x = -ix / 2 + d; z = -iz / 2; } else if ((d -= ix) < iz) { x = ix / 2; z = -iz / 2 + d; } else if ((d -= iz) < ix) { x = ix / 2 - d; z = iz / 2; } else { d -= ix; x = -ix / 2; z = iz / 2 - Math.min(d, iz); }
      b.add(cylY(0.0055, 0.005, 6), 'chrome', [x, sy / 2 + 0.002, z]);
    }
    return b.build();
  },

  // U-shaped rubber-lined steel strap over the cell with bolt tabs.
  engine_support_cellStrap(sx, sy, sz) {
    const b = new PartBuilder();
    const t = 0.003;
    b.add(box(sx, t, sz, 0.001), 'satin', [0, sy / 2 - t / 2, 0]);
    b.add(box(sx * 0.9, 0.002, sz * 0.94, 0.0005), 'rubber', [0, sy / 2 - t - 0.001, 0]);
    for (const s of [-1, 1]) {
      b.add(box(sx, sy - 0.02, t, 0.001), 'satin', [0, 0.01, s * (sz / 2 - t / 2)]);
      b.add(box(sx, t, 0.04, 0.001), 'satin', [0, -sy / 2 + t / 2, s * (sz / 2 + 0.017)]);
      b.add(hexX(0.008, 0.008), 'chrome', [0, -sy / 2 + 0.007, s * (sz / 2 + 0.022)], [0, 0, PI / 2]);
    }
    return b.build();
  },

  // Tinned braided bonding strap with ring lugs (along its longest side).
  engine_support_bondStrap(sx, sy, sz) {
    const b = new PartBuilder();
    const along = sx >= sz ? 'x' : 'z';
    const L = Math.max(sx, sz), W = Math.min(sx, sz);
    const rot = along === 'x' ? [0, 0, 0] : [0, PI / 2, 0];
    b.add(box(L * 0.8, sy, W, 0.001), 'copper', [0, 0, 0], rot);
    for (const s of [-1, 1]) {
      const p = along === 'x' ? [s * L * 0.42, 0, 0] : [0, 0, s * L * 0.42];
      b.add(cylY(W * 0.6, sy * 1.6, 16), 'copper', p);
      b.add(hexX(W * 0.3, 0.006), 'chrome', [p[0], sy + 0.003, p[2]], [0, 0, PI / 2]);
    }
    return b.build();
  },

  // Bypass EFI regulator: billet body, spring dome + adjuster on top, AN ports.
  engine_support_regulator(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.5, sz, 0.006), 'satin', [0, -sy * 0.25, 0]);
    b.add(cylY(Math.min(sx, sz) * 0.42, sy * 0.35, 28), 'machined', [0, sy * 0.175, 0]);
    b.add(cylY(0.004, sy * 0.25, 10), 'chrome', [0, sy * 0.4, 0]);
    b.add(hexX(0.007, 0.006), 'chrome', [0, sy * 0.38, 0], [0, 0, PI / 2]);
    for (const [p, r] of [[[-sx / 2 - 0.007, -sy * 0.25, 0], [0, 0, 0]], [[sx / 2 + 0.007, -sy * 0.25, 0], [0, 0, 0]], [[0, -sy / 2 - 0.007, 0], [0, 0, PI / 2]]]) {
      b.add(hexX(0.01, 0.014), 'blue', p, r);
    }
    b.add(cylZ(0.005, 0.016, 10), 'machined', [0, -sy * 0.25, sz / 2 + 0.008]);
    return b.build();
  },

  // Billet line separator / clamp with cap screw.
  engine_support_lineClamp(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.45, sz, 0.003), 'blue', [0, -sy * 0.2, 0]);
    b.add(box(sx, sy * 0.35, sz, 0.003), 'blue', [0, sy * 0.25, 0]);
    b.add(cylY(0.003, sy * 1.1, 6), 'chrome', [0, 0, 0]);
    b.add(hexX(0.004, 0.003), 'chrome', [0, sy / 2 + 0.002, 0], [0, 0, PI / 2]);
    return b.build();
  },

  // Billet blocks: remote filter mount / oil thermostat / sensor manifold.
  engine_support_billet(sx, sy, sz, ctx) {
    const v = ctx?.variant || 'manifold';
    const b = new PartBuilder();
    const fin = v === 'thermostat' ? 'satin' : v === 'filterMount' ? 'blue' : 'machined';
    b.add(box(sx, sy, sz, 0.004), fin);
    const port = (p, rot, r = 0.012) => {
      b.add(hexX(r, 0.012), 'blue', p, rot);
    };
    if (v === 'filterMount') {
      b.add(cylX(Math.min(sy, sz) * 0.42, 0.012, 28), 'machined', [-sx / 2 - 0.006, 0, 0]);
      port([0, sy / 2 + 0.006, 0], [0, 0, PI / 2]);
      port([0, -sy / 2 - 0.006, 0], [0, 0, PI / 2]);
      for (const s of [-1, 1]) b.add(cylZ(0.005, 0.01, 8), 'chrome', [0, s * sy * 0.3, sz / 2 + 0.004]);
    } else if (v === 'thermostat') {
      for (const s of [-1, 1]) for (const k of [-1, 1]) port([s * (sx / 2 + 0.006), 0, k * sz * 0.22], [0, 0, 0], 0.011);
      b.add(cylY(Math.min(sx, sz) * 0.35, 0.012, 20), 'machined', [0, sy / 2 + 0.006, 0]);
    } else {
      for (const xx of [-sx * 0.25, sx * 0.25]) b.add(hexX(0.007, 0.01), 'gold', [xx, sy / 2 + 0.005, 0], [0, 0, PI / 2]);
      for (const s of [-1, 1]) port([s * (sx / 2 + 0.006), 0, 0], [0, 0, 0]);
    }
    return b.build();
  },

  // Billet dry-sump pan: O-ring rail, integrated scavenge bays, side ports, fins, drains.
  engine_support_drySumpPan(sx, sy, sz, ctx) {
    const side = -1; // pump & ports on the passenger side (-z)
    void ctx;
    const b = new PartBuilder();
    b.add(box(sx + 0.012, 0.012, sz + 0.02, 0.003), 'machined', [0, sy / 2 - 0.006, 0]);
    b.add(box(sx, sy - 0.012, sz * 0.92, 0.012), 'machined', [0, -0.006, 0]);
    // four scavenge bays under the crank (humps) + front timing bay
    const bays = 4;
    for (let i = 0; i < bays; i++) {
      const x = -sx / 2 + ((i + 0.5) / bays) * sx * 0.95;
      b.add(box(sx / bays - 0.03, 0.012, sz * 0.5, 0.005), 'machined', [x, -sy / 2 - 0.004, 0]);
      b.add(cylZ(0.004, 0.006, 6), 'chrome', [x, -sy / 2 - 0.012, sz * 0.18], [PI / 2, 0, 0]);
    }
    // -12 scavenge outlets grouped on the passenger side ahead of the starter (rear bays drain forward
    // through internal pickup tubes); 35 mm pitch, matching the scavenge-line start points.
    // (outlets at a fixed 35 mm pitch from the front edge, which sits just behind the rack / cradle crossmember)
    for (let i = 0; i < 4; i++) {
      b.add(hexX(0.014, 0.014), 'blue', [-sx / 2 + 0.025 + i * 0.035, -sy * 0.15, side * (sz * 0.46 + 0.006)], [0, PI / 2, 0]);
    }
    // fins on the outboard driver side
    for (let i = 0; i < 6; i++) b.add(box(sx * 0.8, 0.004, 0.008, 0.001), 'machined', [0, -sy / 2 + 0.012 + i * 0.012, -side * (sz * 0.46 + 0.004)]);
    // front pressure inlet boss (on the centreline, under the flat rack-relief front cover)
    b.add(hexX(0.014, 0.014), 'blue', [-sx / 2 - 0.007, 0, 0]);
    // rail bolts
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) b.add(cylY(0.004, 0.005, 6), 'chrome', [-sx / 2 + 0.02 + (i / 8) * (sx - 0.04), sy / 2 + 0.002, s * (sz / 2 + 0.004)]);
    return b.build();
  },

  // Factory LT4 cast wet-sump pan: rail, deep rear sump, front filter boss, ribs.
  engine_support_wetSump(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, 0.012, sz, 0.004), 'cast', [0, sy / 2 - 0.006, 0]);
    b.add(box(sx * 0.98, sy * 0.45, sz * 0.94, 0.012), 'cast', [0, sy * 0.27, 0]);
    b.add(box(sx * 0.55, sy * 0.6, sz * 0.75, 0.015), 'cast', [sx * 0.18, -sy * 0.2, 0]);
    for (let i = 0; i < 4; i++) b.add(box(0.008, sy * 0.5, sz * 0.8, 0.002), 'cast', [sx * (-0.05 + i * 0.12), -sy * 0.1, 0]);
    b.add(cylY(0.04, 0.03, 24), 'cast', [-sx / 2 + 0.06, -sy * 0.1, -sz * 0.3]);
    b.add(cylY(0.006, 0.012, 6), 'chrome', [sx * 0.3, -sy / 2 - 0.004, 0]);
    return b.build();
  },

  // Rubber-lined bands holding the round oil tank + mounting plate on the fender side.
  engine_support_tankBands(sx, sy, sz, ctx) {
    const side = -(ctx?.side || 1); // inboard, towards the frame rail
    const b = new PartBuilder();
    const R = Math.min(sx, sz) / 2 - 0.006;
    for (const yy of [-sy / 2 + 0.03, sy / 2 - 0.03]) {
      const g = ringX(R + 0.004, R, 0.025, 40);
      b.add(g, 'satin', [0, yy, 0], [0, 0, PI / 2]);
      b.add(ringX(R, R - 0.003, 0.027, 40), 'rubber', [0, yy, 0], [0, 0, PI / 2]);
      b.add(box(0.03, 0.025, 0.006, 0.001), 'satin', [0, yy, side * (R + 0.0065)]);
      for (const xx of [-0.01, 0.01]) b.add(cylZ(0.003, 0.016, 6), 'chrome', [xx, yy, side * (R + 0.008)]);
    }
    // plate bolted to the frame-rail outer face, 14 mm gap tank-to-rail
    b.add(box(sx * 0.6, sy, 0.005, 0.002), 'aluminum', [0, 0, side * (R + 0.0115)]);
    return b.build();
  },

  // Formed aluminium belt guard on stand-offs (thin in x).
  engine_support_beltGuard(sx, sy, sz) {
    const b = new PartBuilder();
    const s = new THREE.Shape();
    const w = sz / 2, h = sy / 2;
    // rounded outline enclosing both pulleys (crank top-right, pump bottom-left)
    s.moveTo(-w + 0.05, -h); s.lineTo(-w * 0.1, -h); s.quadraticCurveTo(w * 0.4, -h, w, -h * 0.1);
    s.lineTo(w, h - 0.04); s.quadraticCurveTo(w, h, w - 0.04, h); s.lineTo(w * 0.2, h);
    s.quadraticCurveTo(-w * 0.3, h * 0.6, -w, -h * 0.2); s.lineTo(-w, -h + 0.05); s.quadraticCurveTo(-w, -h, -w + 0.05, -h);
    b.add(extrudeX(s, 0.0016, 12), 'aluminum', [-sx / 2 + 0.001, 0, 0], [0, PI, 0]);
    b.add(box(sx, 0.003, sz * 0.7, 0.001), 'aluminum', [0, -h + 0.0015, w * 0.1]);
    for (const [yy, zz] of [[h * 0.6, w * 0.6], [-h * 0.6, -w * 0.6], [-h * 0.6, w * 0.6]]) b.add(cylX(0.005, sx, 8), 'chrome', [0, yy, zz]);
    return b.build();
  },

  // Billet pump bracket plate with lightening pockets (thin in x).
  engine_support_pumpBracket(sx, sy, sz) {
    const b = new PartBuilder();
    const s = new THREE.Shape();
    const w = sz / 2, h = sy / 2;
    s.moveTo(-w, -h); s.lineTo(w, -h + 0.03); s.lineTo(w, h); s.lineTo(-w + 0.04, h); s.lineTo(-w, h - 0.04); s.lineTo(-w, -h);
    s.holes.push(new THREE.Path().absarc(w * 0.1, -h * 0.1, Math.min(w, h) * 0.32, 0, PI * 2, true));
    b.add(extrudeX(s, sx, 16), 'machined');
    for (const [yy, zz] of [[h * 0.75, w * 0.7], [h * 0.75, -w * 0.6], [-h * 0.7, w * 0.7]]) b.add(hexX(0.006, 0.008), 'chrome', [-sx / 2 - 0.004, yy, zz]);
    return b.build();
  },

  // GM plug-in MAF/IAT sensor.
  engine_support_maf(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.45, sz, 0.004), 'plastic', [0, -sy * 0.2, 0]);
    b.add(box(sx * 0.5, sy * 0.55, sz * 0.6, 0.004), 'plastic', [sx * 0.1, sy * 0.22, 0]);
    for (const s of [-1, 1]) b.add(cylY(0.003, 0.006, 6), 'chrome', [s * sx * 0.38, -sy * 0.0, 0]);
    return b.build();
  },

  // Sealed cold-air box: open top with foam lip, inboard outlet snout, fascia inlet.
  engine_support_airbox(sx, sy, sz, ctx) {
    const side = ctx?.side || 1;
    const b = new PartBuilder();
    const t = 0.004;
    b.add(box(sx, t, sz, 0.002), 'plastic', [0, -sy / 2 + t / 2, 0]);
    for (const s of [-1, 1]) {
      b.add(box(t, sy, sz, 0.002), 'plastic', [s * (sx / 2 - t / 2), 0, 0]);
      b.add(box(sx, sy, t, 0.002), 'plastic', [0, 0, s * (sz / 2 - t / 2)]);
      b.add(box(0.014, 0.012, sz, 0.004), 'rubber', [s * (sx / 2 - 0.007), sy / 2 + 0.004, 0]);
      b.add(box(sx, 0.012, 0.014, 0.004), 'rubber', [0, sy / 2 + 0.004, s * (sz / 2 - 0.007)]);
    }
    const zo = -side * (sz / 2 + 0.012);
    b.add(cylZ(0.056, 0.025, 32), 'plastic', [sx * 0.17, sy * 0.2, zo]);
    b.add(ringX(0.05, 0.042, 0.02, 28), 'plastic', [-sx / 2 - 0.008, -sy * 0.2, 0]);
    return b.build();
  },

  // Exhaust hanger: 2-hole rubber isolator with rods.
  engine_support_hanger(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.6, sz * 0.5, 0.004), 'rubber');
    b.add(cylZ(0.005, sz, 10), 'steel', [0, sy * 0.18, 0]);
    b.add(cylZ(0.005, sz, 10), 'steel', [0, -sy * 0.18, 0]);
    b.add(cylY(0.005, sy * 0.3, 8), 'steel', [0, sy * 0.4, sz / 2]);
    b.add(cylY(0.005, sy * 0.3, 8), 'steel', [0, -sy * 0.4, sz / 2]);
    return b.build();
  },

  // Embossed aluminium heat shield hung on stand-offs. The box is the whole stack: the ~1 mm sheet is at
  // the bottom face (-sy/2), the embossed beads, rolled edge hems and spacer stand-offs rise from it and end
  // on the top face (+sy/2), which the data puts on the underside of the panel the shield bolts to.
  engine_support_heatShield(sx, sy, sz) {
    const b = new PartBuilder();
    const t = Math.min(0.0012, sy * 0.5);
    const h = Math.max(0.0004, sy - t); // stand-off height
    const y0 = -sy / 2;
    b.add(box(sx, t, sz, 0.0004), 'aluminum', [0, y0 + t / 2, 0]);
    const hem = Math.min(sy, 0.003);
    for (const s of [-1, 1]) b.add(box(sx, hem, 0.004, 0.0005), 'aluminum', [0, y0 + hem / 2, s * (sz / 2 - 0.002)]);
    const n = Math.max(2, Math.round(sz / 0.06));
    const bead = Math.min(0.0015, h * 0.7);
    for (let i = 0; i < n; i++) b.add(box(sx * 0.95, bead, 0.008, 0.0003), 'aluminum', [0, y0 + t + bead / 2, -sz / 2 + ((i + 0.5) / n) * sz]);
    for (const xx of [-sx * 0.4, 0, sx * 0.4]) for (const s of [-1, 1]) {
      b.add(cylY(0.005, h, 8), 'steel', [xx, y0 + t + h / 2, s * sz * 0.4]);
      b.add(cylY(0.0045, 0.0008, 8), 'steel', [xx, y0 - 0.0004, s * sz * 0.4]); // flanged rivet head
    }
    return b.build();
  },

  // Debris / stone screen: frame + wire mesh (thin in x).
  engine_support_mesh(sx, sy, sz) {
    const b = new PartBuilder();
    const f = 0.012;
    for (const s of [-1, 1]) {
      b.add(box(sx * 2, f, sz, 0.001), 'satin', [0, s * (sy / 2 - f / 2), 0]);
      b.add(box(sx * 2, sy, f, 0.001), 'satin', [0, 0, s * (sz / 2 - f / 2)]);
    }
    const pitch = 0.025;
    const ny = Math.floor(sy / pitch), nz = Math.floor(sz / pitch);
    for (let i = 1; i < ny; i++) b.add(new THREE.BoxGeometry(0.0015, 0.0015, sz - 2 * f), 'stainless', [0, -sy / 2 + i * (sy / ny), 0]);
    for (let i = 1; i < nz; i++) b.add(new THREE.BoxGeometry(0.0015, sy - 2 * f, 0.0015), 'stainless', [0.001, 0, -sz / 2 + i * (sz / nz)]);
    return b.build();
  },

  // Thermostat housing / water inlet: cast body, 2 bolts, hose neck towards the radiator (-x).
  engine_support_tstatHousing(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.6, sy, sz, 0.01), 'cast', [sx * 0.2, 0, 0]);
    b.add(latheX([[0.022, sx * 0.0], [0.022, -sx / 2 + 0.008], [0.025, -sx / 2 + 0.004], [0.022, -sx / 2]], 24), 'cast', [0, 0, 0]);
    for (const s of [-1, 1]) b.add(hexX(0.006, 0.008), 'chrome', [-sx * 0.1 + 0.004, s * sy * 0.36, s * sz * 0.36]);
    b.add(cylY(0.006, 0.012, 8), 'gold', [sx * 0.2, sy / 2 + 0.004, 0]);
    return b.build();
  },

  // Dry-sump tank filler cap with dipstick.
  engine_support_tankCap(sx, sy, sz) {
    const b = new PartBuilder();
    const R = Math.min(sx, sz) / 2;
    b.add(cylY(R * 0.7, sy * 0.4, 28), 'machined', [0, -sy * 0.3, 0]);
    b.add(cylY(R, sy * 0.6, 6), 'blue', [0, sy * 0.2, 0]);
    b.add(box(R * 1.4, sy * 0.25, 0.008, 0.002), 'blue', [0, sy * 0.55, 0]);
    return b.build();
  },
};

// ============================================================================== PATHS
const paths = {
  // AN hose with hose ends. variant: braided (default, stainless braid, red/blue ends), ptfe (black braid/ends).
  engine_support_anHose(pts, r, ctx) {
    const ptfe = ctx?.variant === 'ptfe';
    const rr = Math.max(0.0045, r);
    if (ctx?.variant === 'efi') {
      // SAE J30R14 EFI rubber hose pushed onto barbed nipples, 4.5 mm wide fuel-injection band clamps at each end
      const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 12), 'rubber');
      const d0 = dirAt(pts, false), d1 = dirAt(pts, true);
      bandClamp(b, pts[0].clone().addScaledVector(d0, 0.008), d0, rr, 'stainless', 0.0045);
      bandClamp(b, pts[pts.length - 1].clone().addScaledVector(d1, 0.008), d1, rr, 'stainless', 0.0045);
      return b.build();
    }
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 10), ptfe ? 'black' : 'braided');
    anEnd(b, pts[0], dirAt(pts, false), rr, ptfe);
    anEnd(b, pts[pts.length - 1], dirAt(pts, true), rr, ptfe);
    return b.build();
  },

  // Molded rubber coolant hose with clamps; variant qc = GM quick-connect at the engine end, filler = 2 in filler hose.
  engine_support_coolantHose(pts, r, ctx) {
    const rr = Math.max(0.006, r);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 16), 'rubber');
    const d0 = dirAt(pts, false), d1 = dirAt(pts, true);
    if (ctx?.variant === 'qc') {
      seg(b, UCYL24, 'plastic', pts[0].clone().addScaledVector(d0, -0.004), pts[0].clone().addScaledVector(d0, 0.03), rr * 2.35);
      seg(b, UCYL24, 'yellow', pts[0].clone().addScaledVector(d0, 0.012), pts[0].clone().addScaledVector(d0, 0.018), rr * 2.45);
    } else {
      bandClamp(b, pts[0].clone().addScaledVector(d0, rr * 0.9), d0, rr);
    }
    bandClamp(b, pts[pts.length - 1].clone().addScaledVector(d1, rr * 0.9), d1, rr, ctx?.variant === 'qc' ? 'spring' : 'stainless');
    if (ctx?.variant === 'filler') bandClamp(b, pts[0].clone().addScaledVector(d0, rr * 2), d0, rr);
    return b.build();
  },

  // Long-tube header: primaries (r < 30 mm) with a port-flange segment and bolts; collector (r >= 30 mm) with merge cone and V-band flange.
  engine_support_header(pts, r) {
    const b = new PartBuilder();
    const curve = curveFrom(pts);
    if (r < 0.03) {
      const rr = clamp(r, 0.018, 0.028);
      b.add(tubeAlong(curve, rr, null, 14), 'stainless');
      const p = pts[0];
      const sz = Math.sign(p.z) || 1;
      b.add(box(0.112, 0.068, 0.0095, 0.004), 'stainless', [p.x, p.y, p.z - sz * 0.002]);
      for (const s of [-1, 1]) b.add(cylZ(0.0075, 0.012, 6), 'chrome', [p.x + s * 0.03, p.y + s * 0.027, p.z + sz * 0.006]);
      return b.build();
    }
    const rr = clamp(r, 0.03, 0.05);
    const len = curve.getLength();
    const t0 = Math.min(0.6, 0.13 / len);
    const pA = curve.getPointAt(0), pB = curve.getPointAt(t0);
    // 4-into-1 merge cone from the four primaries down to the 3 in collector
    const cone = latheX([[rr * 1.75, 0], [rr * 1.6, 0.25], [rr * 1.15, 0.75], [rr, 1]], 24);
    const m = alignX(pA, pB, 1);
    const g = cone.clone();
    g.translate(-0.5, 0, 0);
    // alignX scales unit X by length and Y/Z by 1 -> radii stay metric
    b.addMatrix(g, 'stainless', m);
    const rest = [pB, ...pts.filter((q) => q.distanceTo(pA) > pA.distanceTo(pB) + 0.01)];
    if (rest.length >= 2) b.add(tubeAlong(curveFrom(rest), rr, null, 16), 'stainless');
    const pe = pts[pts.length - 1], de = dirAt(pts, true);
    seg(b, UCYL24, 'stainless', pe.clone().addScaledVector(de, 0.012), pe.clone(), rr * 2 + 0.014);
    return b.build();
  },

  // 3 in exhaust pipe. variants: x (merge collar), cat (high-flow cat body + O2 boss), mid (slip clamps), tips (quad slash tips), side (turn-out).
  engine_support_pipe(pts, r, ctx) {
    const v = ctx?.variant || 'mid';
    const rr = clamp(r, 0.025, 0.05);
    const curve = curveFrom(pts);
    const b = new PartBuilder();
    const d0 = dirAt(pts, false), d1 = dirAt(pts, true);
    if (v === 'tips') {
      // pipe to the split, then two 4 in slash-cut tips side by side
      const pe = pts[pts.length - 1];
      const split = pe.clone().addScaledVector(d1, 0.11);
      const mid = [pts[0], ...pts.slice(1, -1).filter((q) => q.distanceTo(pe) > 0.12), split];
      b.add(tubeAlong(curveFrom(mid), rr, null, 16), 'stainless');
      b.addMatrix(sphere(1, 16, 10), 'stainless', new THREE.Matrix4().compose(split, new THREE.Quaternion(), V(rr * 1.4, rr * 1.15, rr * 2.2)));
      const fwd = d1.clone().negate();
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), fwd);
      for (const s of [-1, 1]) {
        const c = split.clone().add(V(0, 0, s * 0.058)).addScaledVector(fwd, 0.05);
        const tipLen = 0.16;
        const g = slashTube(0.051, tipLen, -0.5);
        b.addMatrix(g, 'black', new THREE.Matrix4().compose(c.clone().addScaledVector(fwd, tipLen / 2), q, V(1, 1, 1)));
        const gi = slashTube(0.044, tipLen * 0.98, -0.5, 20);
        b.addMatrix(gi, 'satin', new THREE.Matrix4().compose(c.clone().addScaledVector(fwd, tipLen / 2), q, V(1, 1, 1)));
        seg(b, UCYL24, 'stainless', split.clone().add(V(0, 0, s * 0.03)), c.clone().addScaledVector(fwd, 0.02), rr * 2);
      }
      return b.build();
    }
    b.add(tubeAlong(curve, rr, null, 16), 'stainless');
    if (v === 'x') {
      // merge window where the two tubes cross (closest point to the centreline)
      let best = 0, bz = Infinity;
      for (let i = 0; i <= 60; i++) { const p = curve.getPointAt(i / 60); if (Math.abs(p.z) < bz) { bz = Math.abs(p.z); best = i / 60; } }
      const c = curve.getPointAt(best);
      b.addMatrix(sphere(1, 20, 12), 'stainless', new THREE.Matrix4().compose(c, new THREE.Quaternion(), V(rr * 2.6, rr * 1.05, rr * 1.6)));
    }
    if (v === 'cat') {
      const c = curve.getPointAt(0.75), tan = curve.getTangentAt(0.75); // cat body on the level run under the floor
      const body = latheX([[rr, -0.5], [rr * 1.3, -0.3], [rr * 1.3, 0.3], [rr, 0.5]], 28);
      b.addMatrix(body, 'stainless', alignX(c.clone().addScaledVector(tan, -0.09), c.clone().addScaledVector(tan, 0.09), 1));
      // heat-shield seam bands
      for (const s of [-0.05, 0.05]) seg(b, UCYL24, 'stainless', c.clone().addScaledVector(tan, s - 0.003), c.clone().addScaledVector(tan, s + 0.003), rr * 2.65);
    }
    if (v === 'side') {
      const pe = pts[pts.length - 1];
      const out = d1.clone().negate();
      b.addMatrix(latheX([[rr, 0], [rr * 1.18, 0.7], [rr * 1.22, 1]], 20), 'chrome', alignX(pe.clone().addScaledVector(out, -0.04), pe.clone().addScaledVector(out, 0.04), 1));
    }
    // slip-joint band clamps
    if (v !== 'side') bandClamp(b, pts[0].clone().addScaledVector(d0, 0.03), d0, rr, 'stainless', 0.03);
    bandClamp(b, pts[pts.length - 1].clone().addScaledVector(d1, 0.03), d1, rr, 'stainless', 0.03);
    return b.build();
  },

  // Rotomolded / coated intake tube with bead rolls and MAF boss.
  engine_support_intakeTube(pts, r) {
    const rr = Math.max(0.03, r);
    const curve = curveFrom(pts);
    const b = new PartBuilder().add(tubeAlong(curve, rr * 0.97, null, 24), 'black');
    for (const t of [0.05, 0.95]) {
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      seg(b, UCYL24, 'black', p.clone().addScaledVector(tan, -0.004), p.clone().addScaledVector(tan, 0.004), rr * 2.04);
    }
    const p = curve.getPointAt(0.3);
    b.add(box(0.05, 0.02, 0.045, 0.004), 'black', [p.x, p.y + rr * 0.95, p.z]);
    return b.build();
  },

  // Fascia snorkel: duct tube with a flared rectangular mouth at the grille.
  engine_support_snorkel(pts, r) {
    const rr = Math.max(0.03, r);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 18), 'plastic');
    const p = pts[0];
    b.add(box(0.03, rr * 2.1, rr * 3.2, 0.006), 'plastic', [p.x + 0.012, p.y, p.z]);
    b.add(box(0.006, rr * 2.3, rr * 3.4, 0.003), 'rubber', [p.x - 0.004, p.y, p.z]);
    return b.build();
  },

  // HTD toothed belt (width along the pulley axis).
  engine_support_htdBelt(pts) {
    const c = curveFrom(pts);
    const b = new PartBuilder().add(ribbonAlong(c, 0.0045, 0.02), 'rubber');
    return b.build();
  },

  // 1 x 1 in square tube cradle members.
  engine_support_squareTube(pts, r) {
    const b = new PartBuilder();
    const s = Math.max(0.0127, r) * 2;
    for (let i = 0; i < pts.length - 1; i++) b.addMatrix(UBOX, 'satin', alignX(pts[i], pts[i + 1], s));
    return b.build();
  },

  // Fire sleeve over a fuel line with clamp bands.
  engine_support_fireSleeve(pts, r) {
    const rr = Math.max(0.008, r);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 12), 'heatwrap');
    bandClamp(b, pts[0].clone().addScaledVector(dirAt(pts, false), 0.01), dirAt(pts, false), rr, 'stainless', 0.008);
    bandClamp(b, pts[pts.length - 1].clone().addScaledVector(dirAt(pts, true), 0.01), dirAt(pts, true), rr, 'stainless', 0.008);
    return b.build();
  },
};

// ============================================================================== RULES
const id = (s) => new RegExp(`^engine-support\\.${s}$`);
const rules = [
  // cooling
  [id('cooling\\.radiator'), 'engine_support_radiator'],
  [id('cooling\\.radiator-isolators'), 'engine_support_isolator'],
  [id('cooling\\.fan-assembly'), 'engine_support_fan'],
  [id('cooling\\.fan-shroud'), 'engine_support_shroud'],
  [id('cooling\\.(upper-hose|lower-hose)'), 'engine_support_coolantHose', { variant: 'qc' }],
  [id('cooling\\.(makeup-line|heater-bypass)'), 'engine_support_coolantHose'],
  [id('cooling\\.(degas-line|steam-vent-line)'), 'engine_support_anHose'],
  [id('cooling\\.thermostat'), 'engine_support_thermostat'],
  [id('cooling\\.thermostat-housing'), 'engine_support_tstatHousing'],
  [id('cooling\\.water-outlet'), 'engine_support_waterNeck'],
  [id('cooling\\.water-pump-interface'), 'engine_support_oring'],
  [id('cooling\\.surge-tank'), 'engine_support_coolantTank'],
  [id('cooling\\.pressure-cap'), 'engine_support_pressureCap'],
  [id('cooling\\.radiator-drain'), 'engine_support_drain'],
  [id('cooling\\.coolant-sensors'), 'engine_support_sensor', { variant: 'temp' }],
  // coolers
  [id('coolers-auxiliary\\.debris-screens'), 'engine_support_mesh'],
  [id('lubrication\\.oil-cooler'), 'engine_support_oilCooler'],
  // intercooler loop
  [id('intercooler-loop\\.heat-exchanger'), 'engine_support_heatExchanger'],
  [id('intercooler-loop\\.ic-pump'), 'engine_support_icPump'],
  [id('intercooler-loop\\.ic-reservoir'), 'engine_support_coolantTank', { variant: 'ic' }],
  [id('intercooler-loop\\.[a-z-]+-hose'), 'engine_support_coolantHose'],
  [id('intercooler-loop\\.ic-temp-sensor'), 'engine_support_sensor', { variant: 'inline' }],
  // exhaust
  [id('exhaust\\.headers'), 'engine_support_header'],
  [id('exhaust\\.collector-joints'), 'engine_support_vband'],
  [id('exhaust\\.connection-pipes'), 'engine_support_pipe', { variant: 'cat' }],
  [id('exhaust\\.x-pipe'), 'engine_support_pipe', { variant: 'x' }],
  [id('exhaust\\.mid-pipes'), 'engine_support_pipe', { variant: 'mid' }],
  [id('exhaust\\.tailpipes'), 'engine_support_pipe', { variant: 'tips' }],
  [id('exhaust\\.side-exit-option'), 'engine_support_pipe', { variant: 'side' }],
  [id('exhaust\\.mufflers'), 'engine_support_muffler', { variant: 'lowInlet' }],
  [id('exhaust\\.flex-joints'), 'engine_support_flex'],
  [id('exhaust\\.o2-sensors'), 'engine_support_sensor', { variant: 'o2' }],
  [id('exhaust\\.egt-probes'), 'engine_support_sensor', { variant: 'egt' }],
  [id('exhaust\\.hangers'), 'engine_support_hanger'],
  [id('exhaust\\.heat-shields'), 'engine_support_heatShield'],
  // fuel cell
  [id('fuel-cell\\.container'), 'engine_support_fuelCell'],
  [id('fuel-cell\\.bladder'), 'engine_support_bladder'],
  [id('fuel-cell\\.fill-plate'), 'engine_support_fillPlate'],
  [id('fuel-cell\\.plate-fittings'), 'engine_support_fitting'],
  [id('fuel-cell\\.pickup-and-sump'), 'engine_support_pickup'],
  [id('fuel-cell\\.rollover-vent-valve'), 'engine_support_rollover'],
  [id('fuel-cell\\.vent-line'), 'engine_support_anHose', { variant: 'ptfe' }],
  [id('fuel-cell\\.filler-neck'), 'engine_support_coolantHose', { variant: 'filler' }],
  [id('fuel-cell\\.filler-check-valve'), 'engine_support_fillerValve'],
  [id('fuel-cell\\.level-sender'), 'engine_support_levelSender'],
  [id('fuel-cell\\.mounting-straps'), 'engine_support_cellStrap'],
  [id('fuel-cell\\.mounting-cradle'), 'engine_support_squareTube'],
  [id('fuel-cell\\.bonding-strap'), 'engine_support_bondStrap'],
  // fuel delivery
  [id('fuel-delivery\\.(lift-pump-prefilter|post-pump-filter)'), 'engine_support_anFilter'],
  [id('fuel-delivery\\.lift-pump'), 'engine_support_pump044'],
  [id('fuel-delivery\\.surge-tank'), 'engine_support_surgeTank'],
  [id('fuel-delivery\\.feed-pumps'), 'engine_support_walbro'],
  [id('fuel-delivery\\.fuel-pressure-regulator'), 'engine_support_regulator'],
  [id('fuel-delivery\\.port-injection-feed'), 'engine_support_anHose', { variant: 'efi' }],
  [id('fuel-delivery\\.(lift-pump-line|regulator-return-line|surge-overflow-line|feed-line)'), 'engine_support_anHose', { variant: 'ptfe' }],
  [id('fuel-delivery\\.line-clamps'), 'engine_support_lineClamp'],
  [id('fuel-delivery\\.(bulkhead-fittings|engine-feed-adapter)'), 'engine_support_fitting'],
  [id('fuel-delivery\\.engine-quick-disconnect'), 'engine_support_dryBreak'],
  [id('fuel-delivery\\.fuel-pressure-sensor'), 'engine_support_sensor', { variant: 'pressure' }],
  [id('fuel-delivery\\.heat-sleeve'), 'engine_support_fireSleeve'],
  // induction
  [id('induction\\.fascia-snorkel'), 'engine_support_snorkel'],
  [id('induction\\.airbox'), 'engine_support_airbox'],
  [id('induction\\.air-filter'), 'engine_support_airFilter'],
  [id('induction\\.maf-sensor'), 'engine_support_maf'],
  [id('induction\\.intake-tube'), 'engine_support_intakeTube'],
  [id('induction\\.couplers'), 'engine_support_coupler'],
  [id('induction\\.throttle-body-interface'), 'engine_support_tbRing'],
  // lubrication
  [id('lubrication\\.factory-wet-sump-pan'), 'engine_support_wetSump'],
  [id('lubrication\\.dry-sump-pan'), 'engine_support_drySumpPan', { prim: true }], // prim 1 = flat front cover over the rack (plain)
  [id('lubrication\\.dry-sump-pump'), 'engine_support_dryPump'],
  [id('lubrication\\.pump-bracket'), 'engine_support_pumpBracket', { prim: true }], // arms (prims 1+) stay plain boxes
  [id('lubrication\\.drive-mandrel'), 'engine_support_mandrel'],
  [id('lubrication\\.(crank-drive-pulley|pump-pulley)'), 'engine_support_htdPulley'],
  [id('lubrication\\.drive-belt'), 'engine_support_htdBelt'],
  [id('lubrication\\.belt-guard'), 'engine_support_beltGuard'],
  [id('lubrication\\.(scavenge-lines|tank-feed-line|scavenge-return-line|pressure-line|oil-cooler-lines|engine-inlet-line)'), 'engine_support_anHose'],
  [id('lubrication\\.scavenge-inline-screens'), 'engine_support_anFilter', { variant: 'screen' }],
  [id('lubrication\\.oil-tank'), 'engine_support_oilTank'],
  [id('lubrication\\.oil-tank-mount'), 'engine_support_tankBands'],
  [id('lubrication\\.remote-filter-mount'), 'engine_support_billet', { variant: 'filterMount' }],
  [id('lubrication\\.oil-filter'), 'engine_support_spinOn'],
  [id('lubrication\\.oil-thermostat'), 'engine_support_billet', { variant: 'thermostat' }],
  [id('lubrication\\.sensor-manifold'), 'engine_support_billet', { variant: 'manifold' }],
  [id('lubrication\\.tank-sensors-and-dipstick'), 'engine_support_tankCap'],
  [id('lubrication\\.accumulator'), 'engine_support_accusump'],
  // catch cans & breathers
  [id('catch-cans-and-breathers\\.catch-can'), 'engine_support_catchCan'],
  [id('catch-cans-and-breathers\\.breather-filter'), 'engine_support_breather'],
  [id('catch-cans-and-breathers\\.(valve-cover-breathers|pcv-fresh-air)'), 'engine_support_fitting'],
  [id('catch-cans-and-breathers\\.(breather-hoses|tank-vent-line|catch-can-drain)'), 'engine_support_anHose'],
];

export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules,
  axial,
  boxes,
  paths,
  whole: {},
};
