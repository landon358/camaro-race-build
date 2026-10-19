// Procedural part generators.
//  axial(L, D1, D2, ctx):  canonical frame, length along X, cross-section D1 (Y) x D2 (Z)
//  box(sx, sy, sz, ctx):   world-aligned box (x rearward, y up, z left)
//  path(points, r, ctx):   world-space polyline (Vector3[]) and nominal radius
// Each returns a THREE.Group of meshes tagged with userData.finish.
import * as THREE from 'three';
import {
  PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, Helix,
  curveFrom, tubeAlong, ribbonAlong, alignX, V,
} from './geo.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ======================================================================= AXIAL

export const axial = {
  tire(L, D) {
    const W = L, Ro = D / 2;
    const Ri = Math.max(Ro * 0.6, Ro - 0.135);
    const sh = Math.min(0.03, W * 0.12); // shoulder radius
    const prof = [];
    prof.push([Ri, -W * 0.44]);
    prof.push([Ri + (Ro - Ri) * 0.35, -W / 2]);
    prof.push([Ro - sh * 1.6, -W / 2 + 0.002]);
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (PI / 2);
      prof.push([Ro - sh + Math.sin(a) * sh, -W / 2 + sh - Math.cos(a) * sh]);
    }
    // tread with 3 grooves
    const grooves = [-W * 0.22, 0, W * 0.22];
    for (const gx of grooves) {
      prof.push([Ro, gx - 0.008]); prof.push([Ro - 0.007, gx - 0.006]); prof.push([Ro - 0.007, gx + 0.006]); prof.push([Ro, gx + 0.008]);
    }
    for (let i = 0; i <= 6; i++) {
      const a = (PI / 2) - (i / 6) * (PI / 2);
      prof.push([Ro - sh + Math.sin(a) * sh, W / 2 - sh + Math.cos(a) * sh]);
    }
    prof.push([Ro - sh * 1.6, W / 2 - 0.002]);
    prof.push([Ri + (Ro - Ri) * 0.35, W / 2]);
    prof.push([Ri, W * 0.44]);
    prof.push([Ri, -W * 0.44]);
    return new PartBuilder().add(latheX(prof, 64), 'rubber').build();
  },

  rim(L, D) {
    const W = L, R = D / 2;
    const b = new PartBuilder();
    // barrel with lips
    b.add(latheX([[R * 0.9, -W / 2], [R, -W / 2], [R, -W / 2 + 0.012], [R * 0.93, -W / 2 + 0.03], [R * 0.9, W * 0.1], [R * 0.93, W / 2 - 0.03], [R, W / 2 - 0.012], [R, W / 2], [R * 0.9, W / 2]], 56), 'wheel');
    b.add(latheX([[R * 0.885, W / 2], [R * 0.885, -W / 2]], 56), 'wheel');
    const face = W / 2 - 0.035;
    // hub + lug pad
    b.add(cylX(R * 0.24, 0.05, 32), 'wheel', [face - 0.03, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      b.add(hexX(0.012, 0.02), 'chrome', [face + 0.0, Math.cos(a) * 0.06, Math.sin(a) * 0.06]);
    }
    b.add(cylX(0.03, 0.012, 20), 'machined', [face + 0.0, 0, 0]);
    // 10 spokes in 5 pairs, slightly concave
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2 + (i % 2 ? 0.12 : -0.12);
      const len = R * 0.68;
      const g = box(0.028, len, 0.024, 0.006);
      const m = new THREE.Matrix4().makeRotationX(a);
      m.multiply(new THREE.Matrix4().makeTranslation(0, R * 0.22 + len / 2, 0));
      m.multiply(new THREE.Matrix4().makeRotationZ(0.18));
      const t = new THREE.Matrix4().makeTranslation(face - 0.035, 0, 0).multiply(m);
      b.addMatrix(g, 'wheel', t);
    }
    return b.build();
  },

  rotor(L, D) {
    const R = D / 2, Ri = R * 0.6, t = Math.max(L, 0.02);
    const plate = t * 0.3;
    const b = new PartBuilder();
    b.add(ringX(R, Ri, plate, 64), 'iron', [-t / 2 + plate / 2, 0, 0]);
    b.add(ringX(R, Ri, plate, 64), 'iron', [t / 2 - plate / 2, 0, 0]);
    const vanes = 36;
    for (let i = 0; i < vanes; i++) {
      const a = (i / vanes) * PI * 2;
      const rm = (R + Ri) / 2;
      b.add(box(t - plate * 2 + 0.001, (R - Ri) * 0.95, 0.006, 0), 'iron', [0, Math.cos(a) * rm, Math.sin(a) * rm], [a + 0.3, 0, 0]);
    }
    // slots on outer face
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      const rm = (R + Ri) / 2;
      b.add(box(0.0025, (R - Ri) * 0.6, 0.004, 0), 'black', [t / 2 + 0.0008, Math.cos(a) * rm, Math.sin(a) * rm], [a + 0.5, 0, 0]);
    }
    return b.build();
  },

  hat(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.92, -L / 2], [R, -L / 2], [R, L / 2 - 0.006], [R * 0.85, L / 2], [R * 0.4, L / 2], [R * 0.4, L / 2 - 0.008], [R * 0.9, L / 2 - 0.008], [R * 0.92, -L / 2]], 48), 'aluminum');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * PI * 2;
      b.add(hexX(0.007, 0.012), 'chrome', [-L / 2 - 0.004, Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05]);
    }
    return b.build();
  },

  pulley(L, D) {
    const R = D / 2;
    const prof = [[R * 0.3, -L / 2]];
    const ribs = clamp(Math.round(L / 0.0036), 3, 10);
    for (let i = 0; i <= ribs; i++) {
      const x = -L / 2 + (i / ribs) * L;
      prof.push([i % 2 ? R * 0.94 : R, x]);
    }
    prof.push([R * 0.3, L / 2]);
    const b = new PartBuilder().add(latheX(prof, 40), 'machined');
    b.add(cylX(R * 0.32, L * 1.2, 20), 'satin');
    b.add(hexX(R * 0.14, L * 1.4), 'chrome');
    return b.build();
  },

  spring(L, D) {
    const wire = clamp(D * 0.075, 0.004, 0.02);
    const turns = clamp(Math.round(L / (wire * 3.2)), 4, 11);
    const b = new PartBuilder();
    b.add(tubeAlong(new Helix(D / 2 - wire, L - wire * 2, turns), wire, turns * 24, 8), 'spring');
    return b.build();
  },

  canister(L, D1, D2, ctx) {
    const variant = ctx?.variant || 'can';
    const R = Math.min(D1, D2) / 2;
    const b = new PartBuilder();
    const fin = { filter: 'blue', pump: 'black', bottle: 'red', tank: 'aluminum', can: 'aluminum', sensor: 'gold', extinguisher: 'red' }[variant] || 'aluminum';
    const e = Math.min(R * 0.5, L * 0.18);
    const prof = [[0.0001, -L / 2]];
    for (let i = 0; i <= 5; i++) { const a = (i / 5) * (PI / 2); prof.push([Math.sin(a) * R * 0.98, -L / 2 + e - Math.cos(a) * e]); }
    for (let i = 0; i <= 5; i++) { const a = (PI / 2) - (i / 5) * (PI / 2); prof.push([Math.sin(a) * R * 0.98, L / 2 - e + Math.cos(a) * e]); }
    prof.push([0.0001, L / 2]);
    b.add(latheX(prof, 32), fin);
    if (variant === 'filter') {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * PI * 2;
        b.add(box(L * 0.18, 0.004, 0.004, 0), 'blue', [L / 2 - L * 0.12, Math.cos(a) * R, Math.sin(a) * R]);
      }
      b.add(cylX(R * 1.02, 0.006, 32), 'machined', [-L / 2 + 0.006, 0, 0]);
    }
    if (variant === 'pump') {
      b.add(cylX(R * 1.05, L * 0.28, 24), 'machined', [L / 2 - L * 0.14, 0, 0]);
      b.add(hexX(R * 0.45, 0.02), 'red', [L / 2 + 0.01, 0, 0]);
      b.add(cylY(R * 0.4, R * 0.9, 6), 'blue', [L / 2 - L * 0.14, R * 0.9, 0]);
      b.add(box(0.025, 0.02, 0.03), 'plastic', [-L / 2 + 0.02, R * 0.9, 0]);
    }
    if (variant === 'bottle' || variant === 'extinguisher') {
      b.add(cylX(R * 0.35, L * 0.12, 16), 'chrome', [L / 2 + L * 0.05, 0, 0]);
      b.add(box(L * 0.08, R * 0.9, R * 0.4), 'black', [L / 2 + L * 0.12, R * 0.3, 0]);
      b.add(cylX(R * 0.3, 0.01, 20), 'chrome', [L / 2 - L * 0.1, R * 0.95, 0]);
      for (const x of [-L * 0.25, L * 0.25]) b.add(cylX(R * 1.03, 0.02, 32), 'black', [x, 0, 0]);
    }
    if (variant === 'tank' || variant === 'can') {
      b.add(hexX(Math.max(0.008, R * 0.18), 0.025), 'blue', [L / 2 + 0.008, R * 0.4, 0]);
      b.add(hexX(Math.max(0.008, R * 0.18), 0.025), 'red', [L / 2 + 0.008, -R * 0.4, 0]);
      b.add(cylX(R * 0.5, 0.02, 20), 'black', [-L / 2 - 0.005, 0, 0]);
    }
    if (variant === 'sensor') {
      b.add(hexX(R * 1.1, L * 0.25), 'gold', [-L * 0.2, 0, 0]);
      b.add(cylX(R * 0.9, L * 0.4, 16), 'plastic', [L * 0.25, 0, 0]);
    }
    return b.build();
  },

  motor(L, D, D2, ctx) {
    const R = Math.min(D, D2) / 2;
    const b = new PartBuilder();
    const prof = [[0.0001, -L / 2], [R * 0.85, -L / 2]];
    const fins = 10;
    for (let i = 0; i <= fins; i++) {
      const x = -L / 2 + 0.01 + (i / fins) * (L * 0.75);
      prof.push([i % 2 ? R * 0.92 : R, x]);
    }
    prof.push([R * 0.9, L * 0.3], [R * 0.6, L * 0.38], [0.0001, L * 0.38]);
    b.add(latheX(prof, 28), 'cast');
    if (ctx?.variant === 'starter') {
      b.add(cylX(R * 0.42, L * 0.55, 18), 'black', [-L * 0.05, R * 1.1, 0]);
      b.add(cylX(R * 0.35, L * 0.14, 14), 'steel', [L * 0.45, 0, 0]);
    } else {
      b.add(axialPulleyGeo(R * 0.55, L * 0.14), 'machined', [L * 0.44, 0, 0]);
      b.add(hexX(R * 0.12, L * 0.08), 'chrome', [-L / 2 - 0.01, R * 0.5, 0]);
    }
    return b.build();
  },

  fan(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.95, -L / 2], [R, -L / 2], [R, L / 2], [R * 0.95, L / 2], [R * 0.95, -L / 2]], 48), 'plastic');
    b.add(cylX(R * 0.25, L * 0.8, 24), 'black');
    const blades = 7;
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * PI * 2;
      const len = R * 0.68;
      b.add(box(0.004, len, R * 0.32, 0), 'plastic', [0, Math.cos(a) * (R * 0.25 + len / 2), Math.sin(a) * (R * 0.25 + len / 2)], [a, 0.45, 0]);
    }
    return b.build();
  },

  flywheel(L, D) {
    const R = D / 2;
    const teeth = 90;
    const shape = new THREE.Shape();
    for (let i = 0; i <= teeth * 2; i++) {
      const a = (i / (teeth * 2)) * PI * 2;
      const r = i % 2 ? R : R * 0.975;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.holes.push(new THREE.Path().absarc(0, 0, R * 0.12, 0, PI * 2, true));
    const b = new PartBuilder().add(extrudeX(shape, L, 8), 'steel');
    b.add(ringX(R * 0.78, R * 0.42, L * 0.2, 48), 'machined', [L / 2, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2;
      b.add(hexX(0.008, 0.012), 'chrome', [L / 2 + 0.004, Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2]);
    }
    return b.build();
  },

  pressurePlate(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 0.35, -L / 2], [R, -L / 2], [R, L * 0.1], [R * 0.8, L / 2], [R * 0.35, L / 2]], 48), 'steel');
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * PI * 2;
      b.add(box(0.003, R * 0.42, 0.012, 0), 'machined', [L / 2 + 0.003, Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48], [a, 0, 0]);
    }
    return b.build();
  },

  clutchDisc(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R, R * 0.6, L, 48), 'copper');
    b.add(ringX(R * 0.6, R * 0.18, L * 0.6, 32), 'steel');
    b.add(cylX(R * 0.2, L * 3, 20), 'steel');
    return b.build();
  },

  bellhousing(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[R * 1.02, -L / 2], [R * 1.02, -L / 2 + 0.012], [R * 0.97, -L / 2 + 0.014], [R * 0.6, L / 2 - 0.01], [R * 0.62, L / 2], [R * 0.5, L / 2], [R * 0.55, L / 2 - 0.01], [R * 0.92, -L / 2 + 0.016], [R * 0.95, -L / 2]], 40), 'cast');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      b.add(box(L * 0.85, 0.01, 0.025, 0.003), 'cast', [0, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8], [a, 0, 0]);
    }
    return b.build();
  },

  muffler(L, D1, D2) {
    const b = new PartBuilder();
    const R = Math.max(D1, D2) / 2;
    const g = latheX([[0.0001, -L / 2], [R * 0.95, -L / 2], [R, -L / 2 + 0.01], [R, L / 2 - 0.01], [R * 0.95, L / 2], [0.0001, L / 2]], 32);
    b.add(g, 'stainless', [0, 0, 0], [0, 0, 0], [1, D1 / 2 / R, D2 / 2 / R]);
    const pr = Math.min(D1, D2) * 0.22;
    b.add(cylX(pr, L * 0.15, 20), 'stainless', [-L / 2 - L * 0.06, 0, 0]);
    b.add(cylX(pr, L * 0.15, 20), 'stainless', [L / 2 + L * 0.06, 0, 0]);
    return b.build();
  },

  throttle(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(ringX(R * 0.95, R * 0.75, L, 40), 'machined');
    b.add(box(0.012, D * 1.1, D * 1.1, 0.008), 'machined', [L / 2 - 0.006, 0, 0]);
    b.add(box(0.002, R * 1.5, 0.004, 0), 'machined', [0, 0, 0], [0.5, 0, 0]);
    b.add(box(L * 0.8, R * 0.7, R * 0.6), 'black', [0, 0, R * 1.2]);
    return b.build();
  },

  coneFilter(L, D) {
    const R = D / 2;
    const g = new THREE.CylinderGeometry(R * 0.72, R, L * 0.85, 48, 1, false);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + (Math.round((a / (2 * PI)) * 48) % 2 ? 0.04 : -0.02);
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    g.computeVertexNormals();
    g.rotateZ(-PI / 2);
    const b = new PartBuilder().add(g, 'red', [L * 0.05, 0, 0]);
    b.add(cylX(R * 1.01, L * 0.08, 32), 'black', [-L / 2 + L * 0.04, 0, 0]);
    b.add(cylX(R * 0.74, L * 0.06, 32), 'black', [L / 2 - L * 0.03, 0, 0]);
    return b.build();
  },

  hub(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.55, L, 28), 'steel');
    b.add(cylX(R, L * 0.25, 5), 'steel', [L / 2 - L * 0.12, 0, 0]);
    b.add(cylX(R * 0.38, L * 0.4, 24), 'machined', [L / 2 + L * 0.15, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * PI * 2;
      b.add(cylX(0.0065, 0.05, 10), 'chrome', [L / 2 + 0.02, Math.cos(a) * 0.06, Math.sin(a) * 0.06]);
    }
    return b.build();
  },

  nut(L, D) {
    return new PartBuilder().add(hexX(D / 2, L), 'chrome').build();
  },

  stud(L, D) {
    const b = new PartBuilder().add(cylX(D / 2, L, 10), 'chrome');
    return b.build();
  },

  masterCyl(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R, L, 24), 'machined');
    b.add(box(0.012, R * 3.2, R * 2.4, 0.004), 'machined', [-L / 2 + 0.006, 0, 0]);
    b.add(cylY(R * 0.45, R * 1.4, 12), 'machined', [L * 0.1, R * 1.1, 0]);
    b.add(hexX(R * 0.35, 0.015), 'blue', [L / 2 + 0.007, 0, 0]);
    b.add(cylX(R * 0.25, L * 0.6, 10), 'chrome', [-L / 2 - L * 0.3, 0, 0]);
    return b.build();
  },

  booster(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, -L / 2], [R * 0.85, -L / 2], [R, -L * 0.1], [R, L * 0.1], [R * 0.85, L / 2], [0.0001, L / 2]], 40), 'black');
    b.add(cylX(R * 0.1, L * 0.5, 12), 'chrome', [L / 2 + L * 0.25, 0, 0]);
    return b.build();
  },

  crank(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.55, L, 20), 'machined');
    const throws = 4;
    for (let i = 0; i < throws; i++) {
      const x = -L / 2 + L * ((i + 0.5) / throws);
      const a = i * (PI / 2);
      for (const dx of [-L * 0.045, L * 0.045]) {
        const s = new THREE.Shape().absarc(0, 0, R * 1.9, a + PI * 0.75, a + PI * 1.25, false);
        s.lineTo(0, 0);
        b.add(extrudeX(s, L * 0.035, 16), 'steel', [x + dx, 0, 0]);
      }
      b.add(cylX(R * 0.5, L * 0.07, 16), 'machined', [x, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9]);
    }
    return b.build();
  },

  camshaft(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.45, L, 16), 'machined');
    const lobes = 16;
    for (let i = 0; i < lobes; i++) {
      const x = -L / 2 + L * ((i + 0.5) / lobes);
      b.add(cylX(R * 0.7, L * 0.025, 18), 'machined', [x, R * 0.2 * Math.cos(i * 1.3), R * 0.2 * Math.sin(i * 1.3)], [0, 0, 0], [1, 1.25, 1]);
    }
    return b.build();
  },

  balancer(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R, L * 0.55, 40), 'black', [-L * 0.2, 0, 0]);
    b.add(ringX(R * 1.0, R * 0.92, L * 0.56, 40), 'rubber', [-L * 0.2, 0, 0]);
    b.add(axialPulleyGeo(R * 0.85, L * 0.45), 'machined', [L * 0.27, 0, 0]);
    b.add(hexX(R * 0.2, L * 0.3), 'chrome', [L / 2 + 0.01, 0, 0]);
    return b.build();
  },

  dryPump(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    const stages = 5;
    for (let i = 0; i < stages; i++) {
      const x = -L / 2 + L * ((i + 0.5) / stages);
      b.add(box(L / stages - 0.004, D, D * 0.9, 0.006), i % 2 ? 'blue' : 'machined', [x, 0, 0]);
      b.add(hexX(R * 0.28, 0.03), 'red', [x, R + 0.012, 0], [0, 0, PI / 2]);
    }
    b.add(axialPulleyGeo(R * 0.9, 0.03), 'machined', [-L / 2 - 0.02, 0, 0]);
    return b.build();
  },

  steeringWheel(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(torusX(R - 0.016, 0.016, 12, 64), 'seat');
    b.add(cylX(0.04, 0.05, 24), 'satin', [-0.02, 0, 0]);
    for (const a of [PI / 2 + 0.25, PI / 2 - 0.25 + PI, -PI / 2]) {
      b.add(box(0.012, R - 0.02, 0.04, 0.004), 'satin', [0, Math.cos(a) * (R / 2), Math.sin(a) * (R / 2)], [a, 0, 0]);
    }
    b.add(box(0.01, 0.012, 0.03, 0), 'yellow', [0.005, R - 0.016, 0]);
    return b.build();
  },

  piston(L, D) {
    const R = Math.min(L, D) / 2;
    const b = new PartBuilder();
    b.add(latheX([[0.0001, -D / 2], [R, -D / 2], [R, -D / 2 + 0.012], [R * 0.98, -D / 2 + 0.014], [R, -D / 2 + 0.018], [R * 0.97, D / 2], [0.0001, D / 2]], 28), 'machined');
    return b.build();
  },

  cvJoint(L, D) {
    const R = D / 2;
    return new PartBuilder().add(latheX([[R * 0.4, -L / 2], [R, -L * 0.2], [R, L * 0.2], [R * 0.7, L / 2], [R * 0.35, L / 2]], 28), 'steel').build();
  },

  boot(L, D) {
    const R = D / 2;
    const prof = [];
    const folds = 6;
    for (let i = 0; i <= folds * 2; i++) {
      const x = -L / 2 + (i / (folds * 2)) * L;
      const taper = 1 - (i / (folds * 2)) * 0.45;
      prof.push([R * taper * (i % 2 ? 0.8 : 1), x]);
    }
    return new PartBuilder().add(latheX(prof, 24), 'rubber').build();
  },

  rack(L, D) {
    const R = D / 2;
    const b = new PartBuilder();
    b.add(cylX(R * 0.6, L * 0.62, 20), 'cast');
    b.add(box(L * 0.14, D * 1.3, D * 1.2, 0.01), 'cast', [-L * 0.18, 0, 0]);
    for (const s of [-1, 1]) {
      const bx = axial.boot(L * 0.16, D * 0.9);
      b.add(bx.children[0].geometry, 'rubber', [s * (L * 0.31 + L * 0.08), 0, 0], [0, s > 0 ? 0 : PI, 0]);
    }
    return b.build();
  },

  disc(L, D) {
    return new PartBuilder().add(ringX(D / 2, D * 0.16, Math.max(L, 0.002), 40), 'steel').build();
  },
};

function axialPulleyGeo(R, L) {
  return axial.pulley(L, R * 2).children[0].geometry;
}

// ========================================================================= BOX

export const boxes = {
  block(sx, sy, sz) {
    const b = new PartBuilder();
    const crankH = sy * 0.45;
    b.add(box(sx, crankH, sz * 0.78, 0.012), 'cast', [0, -sy / 2 + crankH / 2, 0]);
    for (const s of [-1, 1]) {
      const bankW = sz * 0.3, bankH = sy * 0.78;
      b.add(box(sx * 0.98, bankH, bankW, 0.01), 'cast', [0, -sy / 2 + crankH * 0.55 + bankH * 0.38, s * sz * 0.24], [s * -0.68, 0, 0]);
      for (let i = 0; i < 3; i++) b.add(cylZ(0.016, 0.006, 16), 'chrome', [-sx / 2 + sx * (0.25 + i * 0.25), -sy / 2 + crankH * 0.8, s * (sz * 0.39 + 0.002)]);
    }
    b.add(box(sx * 0.9, 0.02, sz * 0.25, 0.006), 'cast', [0, sy / 2 - 0.05, 0]);
    return b.build();
  },

  head(sx, sy, sz, ctx) {
    const side = ctx?.side || 1;
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, 0.01), 'cast');
    for (let i = 0; i < 4; i++) {
      const x = -sx / 2 + sx * ((i + 0.5) / 4);
      b.add(box(0.05, sy * 0.45, 0.02, 0.006), 'cast', [x, -sy * 0.1, side * (sz / 2 + 0.008)]);
    }
    return b.build();
  },

  valveCover(sx, sy, sz, ctx) {
    const side = ctx?.side || 1;
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.85, sz, 0.02), 'crinkle', [0, -sy * 0.07, 0]);
    for (let i = 0; i < 5; i++) b.add(box(sx * 0.85, 0.008, 0.006, 0.002), 'crinkle', [0, sy * 0.36, -sz * 0.3 + i * sz * 0.15]);
    for (let i = 0; i < 4; i++) {
      const x = -sx / 2 + sx * ((i + 0.5) / 4);
      b.add(box(0.05, sy * 0.5, 0.04, 0.008), 'black', [x, sy * 0.25, side * sz * 0.32]);
    }
    return b.build();
  },

  supercharger(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.92, sy * 0.45, sz, 0.02), 'black', [0, -sy * 0.27, 0]);
    for (const s of [-1, 1]) b.add(cylX(sy * 0.3, sx * 0.8, 28), 'black', [0, sy * 0.12, s * sz * 0.17]);
    b.add(box(sx * 0.88, 0.02, sz * 0.9, 0.008), 'crinkle', [0, sy / 2 - 0.01, 0]);
    b.add(cylX(sy * 0.22, sx * 0.14, 24), 'machined', [-sx / 2 + sx * 0.02, sy * 0.05, 0]);
    b.add(axialPulleyGeo(sy * 0.2, 0.03), 'machined', [-sx / 2 - 0.02, sy * 0.05, 0]);
    b.add(box(0.01, sy * 0.25, sz * 0.5, 0), 'red', [0.0, sy / 2 + 0.001, 0], [0, 0, PI / 2]);
    return b.build();
  },

  intake(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.85, sy * 0.45, sz * 0.4, 0.03), 'black', [0, sy * 0.22, 0]);
    for (let i = 0; i < 4; i++) {
      const x = -sx * 0.38 + i * sx * 0.25;
      for (const s of [-1, 1]) {
        const c = curveFrom([V(x, sy * 0.15, 0), V(x, sy * 0.05, s * sz * 0.25), V(x, -sy * 0.4, s * sz * 0.45)]);
        b.add(tubeAlong(c, Math.min(0.022, sz * 0.06), 16, 10), 'black');
      }
    }
    return b.build();
  },

  gearbox(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.6, sy, sz, 0.03), 'cast', [-sx * 0.2, 0, 0]);
    b.add(cylX(Math.min(sy, sz) * 0.32, sx * 0.42, 24, Math.min(sy, sz) * 0.24), 'cast', [sx * 0.29, 0, 0]);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.add(box(0.008, sy * 0.8, 0.012, 0.002), 'cast', [-sx * 0.45 + i * sx * 0.12, 0, s * sz / 2]);
    b.add(box(sx * 0.12, sy * 0.25, sz * 0.25, 0.01), 'cast', [-sx * 0.05, sy / 2 + sy * 0.1, 0]);
    return b.build();
  },

  diff(sx, sy, sz) {
    const b = new PartBuilder();
    const R = Math.min(sx, sy) * 0.45;
    b.add(sphere(R, 28, 20), 'cast', [0, 0, 0], [0, 0, 0], [1, 1, sz / (2 * R) * 0.75]);
    b.add(cylX(R * 0.95, 0.03, 32), 'cast', [R * 0.8, 0, 0]);
    for (let i = 0; i < 4; i++) b.add(box(0.01, R * 1.4, 0.008, 0.002), 'cast', [R * 0.8 + 0.018, 0, -R * 0.45 + i * R * 0.3]);
    b.add(cylX(R * 0.35, sx * 0.4, 24, R * 0.25), 'cast', [-R - sx * 0.12, 0, 0]);
    for (const s of [-1, 1]) {
      b.add(cylZ(R * 0.42, sz * 0.25, 24), 'cast', [0, 0, s * sz * 0.38]);
      b.add(box(0.06, 0.03, 0.05, 0.008), 'cast', [-R * 0.5, R * 0.7, s * sz * 0.3]);
    }
    return b.build();
  },

  cooler(sx, sy, sz) {
    // thin dimension = core depth
    const dims = [sx, sy, sz];
    const thin = dims.indexOf(Math.min(...dims));
    const b = new PartBuilder();
    const core = box(sx, sy, sz, 0.002);
    // rotate stripes: texture runs along U; leave as is
    b.add(core, 'core');
    // end tanks along the longest in-plane axis
    const other = [0, 1, 2].filter((i) => i !== thin);
    const long = dims[other[0]] >= dims[other[1]] ? other[0] : other[1];
    const tankSize = [sx, sy, sz];
    tankSize[long] = Math.max(0.03, dims[long] * 0.06);
    tankSize[thin] = dims[thin] * 1.5;
    for (const s of [-1, 1]) {
      const p = [0, 0, 0];
      p[long] = s * (dims[long] / 2 + tankSize[long] / 2 - 0.004);
      b.add(box(...tankSize, 0.006), 'aluminum', p);
      const n = [0, 0, 0];
      n[long] = p[long];
      const short = other.find((i) => i !== long);
      n[short] = s * dims[short] * 0.3;
      n[thin] = -dims[thin];
      const neck = thin === 0 ? cylX(0.016, 0.05, 14) : thin === 1 ? cylY(0.016, 0.05, 14) : cylZ(0.016, 0.05, 14);
      b.add(neck, 'aluminum', n);
    }
    return b.build();
  },

  fuelCell(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, 0.02), 'black');
    for (let i = 0; i < 4; i++) b.add(box(sx * 1.01, 0.006, 0.02, 0.002), 'aluminum', [0, -sy / 2 + sy * (0.2 + i * 0.2), sz / 2]);
    b.add(box(sx * 0.45, 0.012, sz * 0.38, 0.004), 'machined', [0, sy / 2 + 0.006, 0]);
    b.add(cylY(0.05, 0.03, 24), 'red', [0, sy / 2 + 0.025, -sz * 0.08]);
    b.add(hexX(0.012, 0.02), 'blue', [sx * 0.1, sy / 2 + 0.02, sz * 0.1], [0, 0, PI / 2]);
    b.add(hexX(0.012, 0.02), 'red', [-sx * 0.1, sy / 2 + 0.02, sz * 0.1], [0, 0, PI / 2]);
    return b.build();
  },

  battery(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.85, sz, 0.006), 'satin', [0, -sy * 0.075, 0]);
    b.add(box(sx, sy * 0.15, sz, 0.006), 'red', [0, sy * 0.425 - 0.002, 0]);
    for (const s of [-1, 1]) b.add(cylY(0.009, 0.025, 12), s > 0 ? 'red' : 'black', [sx * 0.3, sy / 2 + 0.01, s * sz * 0.3]);
    return b.build();
  },

  electronics(sx, sy, sz, ctx) {
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, Math.min(0.006, Math.min(sx, sy, sz) * 0.3)), 'satin');
    const dims = [sx, sy, sz];
    const thin = dims.indexOf(Math.min(...dims));
    if (ctx?.variant === 'display') {
      const p = [0, 0, 0], s = [...dims];
      p[thin] = dims[thin] / 2 + 0.001; s[thin] = 0.002;
      s[(thin + 1) % 3] *= 0.86; s[(thin + 2) % 3] *= 0.86;
      // screen faces the driver (+x when the thin axis is x)
      if (thin === 0) p[0] = dims[0] / 2 + 0.001;
      b.add(box(...s, 0), 'screen', p);
      return b.build();
    }
    // two connector blocks on one edge face
    const n = Math.min(3, Math.max(1, Math.round(Math.max(sx, sz) / 0.06)));
    for (let i = 0; i < n; i++) {
      const p = [0, 0, 0];
      const long = sx >= sz ? 0 : 2;
      const across = long === 0 ? 2 : 0;
      p[long] = -dims[long] / 2 + dims[long] * ((i + 0.5) / n);
      p[across] = dims[across] / 2 + 0.008;
      const s = [0.03, Math.min(0.02, sy * 0.7), 0.03];
      s[across] = 0.016;
      b.add(box(...s, 0.002), 'plastic', p);
    }
    return b.build();
  },

  caliper(sx, sy, sz, ctx) {
    // Arc-shaped caliper hugging the rotor edge; wheel centre comes from ctx.
    const b = new PartBuilder();
    const off = ctx?.wheelOffset; // wheel centre relative to this part, xy
    if (!off) {
      b.add(box(sx, sy, sz, 0.015), 'red');
      return b.build();
    }
    const r0 = Math.hypot(off.x, off.y) || 0.15;
    const a0 = Math.atan2(-off.y, -off.x); // angle of the caliper centre around the wheel
    const radial = Math.min(sx, sy), tangential = Math.max(sx, sy);
    const span = clamp(tangential / r0, 0.4, 1.6);
    const ri = r0 - radial / 2, ro = r0 + radial / 2;
    const s = new THREE.Shape();
    s.absarc(0, 0, ro, a0 - span / 2, a0 + span / 2, false);
    s.absarc(0, 0, ri, a0 + span / 2, a0 - span / 2, true);
    const g = new THREE.ExtrudeGeometry(s, { depth: sz, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 16 });
    g.translate(off.x, off.y, -sz / 2);
    b.add(g, 'red');
    // bridge bolts & bleeders
    for (const t of [-0.35, 0.35]) {
      const a = a0 + t * span;
      b.add(cylZ(0.006, sz * 1.15, 10), 'chrome', [off.x + Math.cos(a) * (ro - 0.01), off.y + Math.sin(a) * (ro - 0.01), 0]);
    }
    b.add(box(0.01, tangential * 0.35, 0.002, 0), 'yellow', [off.x + Math.cos(a0) * r0, off.y + Math.sin(a0) * r0, sz / 2 + 0.007], [0, 0, a0 + PI / 2]);
    return b.build();
  },

  knuckle(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.6, sy, sz * 0.7, 0.012), 'cast');
    b.add(cylZ(Math.min(sx, sy) * 0.35, sz * 1.2, 24), 'cast', [0, 0, 0]);
    b.add(box(sx, sy * 0.12, sz * 0.6, 0.01), 'cast', [0, -sy * 0.42, 0]);
    b.add(box(sx * 0.9, sy * 0.12, sz * 0.6, 0.01), 'cast', [sx * 0.05, sy * 0.42, 0]);
    return b.build();
  },

  oilPan(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.35, sz, 0.008), 'cast', [0, sy * 0.32, 0]);
    b.add(box(sx * 0.55, sy * 0.7, sz * 0.7, 0.025), 'cast', [sx * 0.15, -sy * 0.12, 0]);
    for (let i = 0; i < 5; i++) b.add(box(sx * 0.5, 0.006, 0.008, 0.002), 'cast', [sx * 0.15, -sy * 0.47, -sz * 0.28 + i * sz * 0.14]);
    return b.build();
  },

  pads(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy, sz, 0.004), 'black');
    return b.build();
  },

  cell(sx, sy, sz, ctx) {
    // generic rounded box with a given finish
    return new PartBuilder().add(box(sx, sy, sz), ctx?.finish || 'steel').build();
  },

  net(sx, sy, sz) {
    const b = new PartBuilder();
    const dims = [sx, sy, sz];
    const thin = dims.indexOf(Math.min(...dims));
    const a = (thin + 1) % 3, c = (thin + 2) % 3;
    const n = 10;
    for (let i = 0; i <= n; i++) {
      for (const [ax, other] of [[a, c], [c, a]]) {
        const s = [0, 0, 0];
        s[thin] = 0.004; s[other] = 0.012; s[ax] = dims[ax];
        const p = [0, 0, 0];
        p[other] = -dims[other] / 2 + (i / n) * dims[other];
        b.add(box(...s, 0), 'net', p);
      }
    }
    return b.build();
  },
};

// ======================================================================== PATH

function endFittings(b, pts, r, finishA = 'blue', finishB = 'red') {
  const n = pts.length;
  const tips = [[pts[0], pts[1], finishA], [pts[n - 1], pts[n - 2], finishB]];
  for (const [p, q, fin] of tips) {
    const dir = V().subVectors(q, p).normalize();
    const a = p.clone(), c = p.clone().addScaledVector(dir, Math.max(0.025, r * 4));
    b.addMatrix(hexX(0.5, 1), fin, alignX(a, c, Math.max(r * 1.6, 0.007) * 2));
  }
}

function eye(b, p, q, r, finish = 'chrome') {
  // rod-end eye at p pointing away from q
  const dir = V().subVectors(p, q).normalize();
  const up = Math.abs(dir.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const side = V().crossVectors(dir, up).normalize();
  const m = new THREE.Matrix4().lookAt(V(), side, dir);
  m.setPosition(p);
  const R = Math.max(r * 1.5, 0.012);
  b.addMatrix(new THREE.TorusGeometry(R, R * 0.38, 8, 20), finish, m);
  b.addMatrix(sphere(R * 0.7, 12, 10), 'machined', new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
  const nutA = p.clone().addScaledVector(dir, -R * 1.6), nutB = p.clone().addScaledVector(dir, -R * 2.6);
  b.addMatrix(hexX(0.5, 1), 'chrome', alignX(nutA, nutB, R * 1.6));
}

export const paths = {
  tube(pts, r, ctx) {
    return new PartBuilder().add(tubeAlong(curveFrom(pts), r), ctx?.finish || 'steel').build();
  },
  hose(pts, r) {
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), r, null, 12), 'rubber');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const dir = V().subVectors(q, p).normalize();
      const c = p.clone().addScaledVector(dir, r * 1.2);
      b.addMatrix(cylX(0.5, 1, 16), 'stainless', alignX(c.clone().addScaledVector(dir, -r * 0.3), c.clone().addScaledVector(dir, r * 0.3), r * 2.3));
    }
    return b.build();
  },
  hardline(pts, r) {
    return new PartBuilder().add(tubeAlong(curveFrom(pts), Math.max(0.0028, r), null, 8), 'stainless').build();
  },
  braided(pts, r) {
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), Math.max(0.004, r), null, 10), 'braided');
    endFittings(b, pts, Math.max(0.004, r));
    return b.build();
  },
  harness(pts, r) {
    const rr = Math.max(0.006, r);
    const curve = curveFrom(pts);
    const b = new PartBuilder().add(tubeAlong(curve, rr, null, 8), 'harness');
    const len = curve.getLength();
    for (let d = 0.15; d < len; d += 0.3) {
      const t = d / len;
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      b.addMatrix(cylX(0.5, 1, 12), 'orange', alignX(p.clone().addScaledVector(tan, -0.008), p.clone().addScaledVector(tan, 0.008), rr * 2.3));
    }
    return b.build();
  },
  cable(pts, r, ctx) {
    return new PartBuilder().add(tubeAlong(curveFrom(pts), Math.max(0.004, r), null, 8), ctx?.finish || 'wire').build();
  },
  cage(pts, r) {
    return new PartBuilder().add(tubeAlong(curveFrom(pts), r, null, 14), 'cage').build();
  },
  link(pts, r, ctx) {
    const rr = clamp(r, 0.008, 0.025);
    const a = pts[0], z = pts[pts.length - 1];
    const b = new PartBuilder();
    const shortA = a.clone().lerp(pts[1], 0.12), shortZ = z.clone().lerp(pts[pts.length - 2], 0.12);
    const inner = [shortA, ...pts.slice(1, -1), shortZ];
    b.add(tubeAlong(curveFrom(inner.length >= 2 ? inner : [a, z]), rr, null, 12), ctx?.finish || 'black');
    eye(b, a, pts[1], rr);
    eye(b, z, pts[pts.length - 2], rr);
    return b.build();
  },
  swaybar(pts, r) {
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), clamp(r, 0.01, 0.022), null, 12), 'blue');
    return b.build();
  },
  driveshaft(pts, r) {
    const rr = clamp(r, 0.025, 0.055);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 20), 'machined');
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
      const dir = V().subVectors(q, p).normalize();
      b.addMatrix(cylX(0.5, 1, 20), 'steel', alignX(p, p.clone().addScaledVector(dir, 0.05), rr * 2.6));
      b.addMatrix(cylX(0.5, 1, 6), 'rubber', alignX(p.clone().addScaledVector(dir, -0.012), p.clone().addScaledVector(dir, 0.012), rr * 3));
    }
    return b.build();
  },
  halfshaft(pts, r) {
    const a = pts[0], z = pts[pts.length - 1];
    const dir = V().subVectors(z, a).normalize();
    const b = new PartBuilder();
    const rr = clamp(r, 0.013, 0.02);
    b.add(tubeAlong(curveFrom([a, z]), rr, 8, 12), 'steel');
    for (const [p, s] of [[a, 1], [z, -1]]) {
      const cvEnd = p.clone().addScaledVector(dir, s * 0.05);
      b.addMatrix(cylX(0.5, 1, 24), 'steel', alignX(p, cvEnd, 0.1));
      const bootEnd = cvEnd.clone().addScaledVector(dir, s * 0.1);
      const boot = axial.boot(1, 1).children[0].geometry;
      const m = alignX(s > 0 ? cvEnd : bootEnd, s > 0 ? bootEnd : cvEnd, 0.085);
      b.addMatrix(boot, 'rubber', m);
    }
    return b.build();
  },
  exhaust(pts, r) {
    const rr = clamp(r, 0.025, 0.05);
    const curve = curveFrom(pts);
    const b = new PartBuilder().add(tubeAlong(curve, rr, null, 16), 'stainless');
    return b.build();
  },
  header(pts, r) {
    return new PartBuilder().add(tubeAlong(curveFrom(pts), clamp(r, 0.018, 0.03), null, 14), 'header').build();
  },
  belt(pts) {
    const c = curveFrom(pts);
    return new PartBuilder().add(ribbonAlong(c, 0.022, 0.005), 'rubber').build();
  },
  strap(pts, r, ctx) {
    const c = curveFrom(pts);
    return new PartBuilder().add(ribbonAlong(c, 0.05, 0.004), ctx?.finish || 'webbing').build();
  },
  damper(pts, r) {
    const top = pts[0], bot = pts[pts.length - 1];
    const dir = V().subVectors(bot, top);
    const len = dir.length();
    dir.normalize();
    const rr = clamp(r, 0.018, 0.03);
    const b = new PartBuilder();
    const bodyStart = top.clone().addScaledVector(dir, len * 0.42);
    b.addMatrix(cylX(0.5, 1, 24), 'black', alignX(bodyStart, bot.clone().addScaledVector(dir, -0.03), rr * 2.2));
    b.addMatrix(cylX(0.5, 1, 16), 'chrome', alignX(top.clone().addScaledVector(dir, 0.03), bodyStart, rr * 0.75));
    b.addMatrix(cylX(0.5, 1, 24), 'red', alignX(bodyStart.clone().addScaledVector(dir, 0.0), bodyStart.clone().addScaledVector(dir, 0.012), rr * 3.2));
    // threaded section
    for (let i = 0; i < 6; i++) {
      const p = bodyStart.clone().addScaledVector(dir, 0.02 + i * 0.012);
      b.addMatrix(cylX(0.5, 1, 20), 'machined', alignX(p, p.clone().addScaledVector(dir, 0.004), rr * 2.35));
    }
    eye(b, top, bodyStart, rr * 0.6, 'steel');
    eye(b, bot, bodyStart, rr * 0.6, 'steel');
    return b.build();
  },
  shaft(pts, r) {
    const rr = clamp(r, 0.008, 0.02);
    const b = new PartBuilder().add(tubeAlong(curveFrom(pts), rr, null, 10), 'steel');
    for (const p of [pts[0], pts[pts.length - 1]]) b.addMatrix(sphere(1, 12, 10), 'steel', new THREE.Matrix4().makeScale(rr * 1.8, rr * 1.8, rr * 1.8).setPosition(p));
    return b.build();
  },
};

// =================================================================== COMPONENT

export const whole = {
  seat(min, max) {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const b = new PartBuilder();
    // seat faces -x (forward). Pan at bottom front, back rising at the rear.
    const panH = Math.min(0.1, sy * 0.15);
    b.add(box(sx * 0.75, panH, sz * 0.8, 0.03), 'seat', [-sx * 0.12, -sy / 2 + panH / 2 + 0.02, 0]);
    b.add(box(0.06, sy * 0.85, sz * 0.82, 0.03), 'seat', [sx / 2 - 0.08, sy * 0.05, 0], [0, 0, 0.18]);
    for (const s of [-1, 1]) {
      b.add(box(sx * 0.8, sy * 0.28, 0.04, 0.02), 'carbon', [-sx * 0.05, -sy / 2 + sy * 0.18, s * (sz / 2 - 0.02)]);
      b.add(box(0.12, sy * 0.55, 0.05, 0.02), 'carbon', [sx / 2 - 0.12, sy * 0.12, s * (sz / 2 - 0.03)], [0, 0, 0.18]);
      b.add(box(0.16, sy * 0.22, 0.05, 0.02), 'carbon', [sx / 2 - 0.2, sy / 2 - sy * 0.13, s * (sz / 2 - 0.04)], [0, s * 0.15, 0.18]);
    }
    for (const s of [-1, 1]) b.add(box(0.01, 0.06, 0.02, 0), 'black', [sx / 2 - 0.05, sy * 0.38, s * sz * 0.12]);
    return b.build();
  },

  pedals(min, max) {
    const sx = max.x - min.x, sy = max.y - min.y, sz = max.z - min.z;
    const b = new PartBuilder();
    b.add(box(sx, 0.01, sz, 0.003), 'aluminum', [0, -sy / 2 + 0.005, 0]);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const z = -sz / 2 + sz * ((i + 0.5) / n);
      b.add(box(0.02, sy * 0.85, 0.016, 0.004), 'aluminum', [sx * 0.15, sy * 0.05, z], [0, 0, -0.25]);
      b.add(box(0.012, 0.07, i === 1 ? 0.07 : 0.05, 0.004), 'satin', [sx * 0.32, -sy * 0.3, z], [0, 0, -0.35]);
      b.add(cylX(0.014, sx * 0.4, 14), 'machined', [-sx * 0.25, sy * 0.2, z]);
    }
    return b.build();
  },
};
