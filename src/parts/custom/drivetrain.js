// Precise part models for the "drivetrain" group. See data/MODELING.md.
// Owned by one modeling pass; generator names must be prefixed "drivetrain_".
//
// Reference layout (car coords, m): LT4 crank axis y 0.40; block rear / bellhousing face x 0.38;
// TR-6060 integral bellhousing x 0.38-0.555, main case + tail x 0.555-1.235 (axis tilted ~2.6 deg down to
// y 0.365 at the output flange); front guibo x 1.27; centre bearing x 1.95; rear guibo x 2.615;
// 226 mm eLSD rear drive module centred x 2.805 (axle axis y 0.372, pinion axis y 0.352, 20 mm hypoid drop);
// halfshafts from the diff side gears (z 0.18) to the hub nut (z 0.765).
import * as THREE from 'three';
// eslint-disable-next-line no-unused-vars
import { PartBuilder, cylX, cylY, cylZ, hexX, box, sphere, torusX, latheX, ringX, extrudeX, Helix, curveFrom, tubeAlong, ribbonAlong, alignX, V } from '../geo.js';

const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ helpers
/** Lathe around +Y from [radius, y] profile. */
function latheY(profile, seg = 32) {
  const g = latheX(profile, seg);
  g.rotateZ(PI / 2);
  return g;
}
/** Lathe around +Z from [radius, z] profile. */
function latheZ(profile, seg = 32) {
  const g = latheX(profile, seg);
  g.rotateY(-PI / 2);
  return g;
}
/** Shape for extrudeX from points given as [z, y] (extrudeX maps shape u -> -z, v -> y). */
function shapeZY(pts) {
  return new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y)));
}
/** Closed outline r(theta) in the YZ plane (theta from +Y toward +Z) as a Shape for extrudeX. */
function polarShape(rf, n = 72, holeR = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const r = rf(a);
    pts.push([Math.sin(a) * r, Math.cos(a) * r]);
  }
  const s = shapeZY(pts);
  if (holeR > 0) s.holes.push(new THREE.Path().absarc(0, 0, holeR, 0, PI * 2, true));
  return s;
}
/** Annular sector (theta from a0 to a1) for extrudeX. */
function sectorShape(r0, r1, a0, a1, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([Math.sin(a) * r1, Math.cos(a) * r1]); }
  for (let i = n; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / n; pts.push([Math.sin(a) * r0, Math.cos(a) * r0]); }
  return shapeZY(pts);
}
/**
 * Loft a closed [z, y] profile along X through stations {x, sy, sz, dy}. Smooth sides, flat end caps.
 */
function loftX(profile, stations, caps = true) {
  const n = profile.length;
  const pos = [], idx = [];
  const P = (s, i) => [s.x, (s.dy || 0) + profile[i][1] * (s.sy ?? s.s ?? 1), profile[i][0] * (s.sz ?? s.s ?? 1)];
  stations.forEach((s) => { for (let i = 0; i < n; i++) pos.push(...P(s, i)); });
  for (let k = 0; k < stations.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = k * n + i, a1 = k * n + j, b0 = (k + 1) * n + i, b1 = (k + 1) * n + j;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  if (caps) {
    const tri = THREE.ShapeUtils.triangulateShape(profile.map(([z, y]) => new THREE.Vector2(z, y)), []);
    for (const s of [stations[0], stations[stations.length - 1]]) {
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) pos.push(...P(s, i));
      for (const t of tri) idx.push(base + t[0], base + t[1], base + t[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Superellipse profile [z, y] of unit half-size. */
function superEllipse(n = 20, e = 2.6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    out.push([Math.sign(c) * Math.abs(c) ** (2 / e), Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  return out;
}
/** Hex bolt head (+ washer face) pointing along axis ('x'|'y'|'z'), sign = direction of the head. */
function bolt(b, p, axis = 'x', r = 0.007, h = 0.007, finish = 'chrome', sign = 1) {
  const rot = axis === 'x' ? [0, 0, 0] : axis === 'y' ? [0, 0, PI / 2] : [0, -PI / 2, 0];
  const off = (d) => { const q = [...p]; const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2; q[k] += d * sign; return q; };
  b.add(hexX(r, h), finish, off(h / 2), rot);
  b.add(cylX(r * 1.15, 0.0015, 16), finish, off(0.00075), rot);
}
/** Matrix from an origin and three basis vectors (columns), with scale. */
function basis(o, xa, ya, za, s = [1, 1, 1]) {
  const m = new THREE.Matrix4().makeBasis(xa.clone().multiplyScalar(s[0]), ya.clone().multiplyScalar(s[1]), za.clone().multiplyScalar(s[2]));
  m.setPosition(o);
  return m;
}
/** Place a geometry built along +X so that its origin is at `o` and +X points along `dir` (no scaling). */
function placeAlong(o, dir) {
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.clone().normalize());
  return new THREE.Matrix4().compose(o.clone(), q, V(1, 1, 1));
}
/** Three-arm (or n-arm) flange outline, as used on GM guibo-coupled output/pinion flanges. */
function armFlangeShape(rCore, rArm, arms = 3, holeR = 0) {
  return polarShape((a) => rCore + (rArm - rCore) * Math.pow(Math.max(0, Math.cos((a * arms) / 2) ** 2), 3), 90, holeR);
}

// ------------------------------------------------------------------ AXIAL (length along +X)
const axial = {
  /** TR-6060 integral bellhousing (GM LT bolt pattern). Front face (-X) on the block. */
  drivetrain_bellhousing(L, D1, D2) {
    const b = new PartBuilder();
    const k = Math.min(D1 / 0.44, D2 / 0.47);
    const xf = -L / 2;
    // front mounting flange: round with flattened top/bottom
    const flange = polarShape((a) => {
      let r = 0.205 * k;
      const c = Math.cos(a);
      if (c > 0.01) r = Math.min(r, (0.19 * k) / c);
      if (c < -0.01) r = Math.min(r, (0.2 * k) / -c);
      return r;
    }, 80, 0.172 * k);
    b.add(extrudeX(flange, 0.014, 40), 'cast', [xf + 0.007, 0, 0]);
    // tapered bell shell
    b.add(latheX([[0.2 * k, xf + 0.012], [0.197 * k, xf + 0.04], [0.178 * k, xf + 0.085], [0.152 * k, L / 2 - 0.028], [0.143 * k, L / 2 - 0.008], [0.14 * k, L / 2]], 48), 'cast');
    b.add(ringX(0.142 * k, 0.056 * k, 0.012, 40), 'cast', [L / 2 - 0.006, 0, 0]);
    // input-bearing retainer snout (CSC pilot)
    b.add(cylX(0.05 * k, 0.05, 28), 'machined', [L / 2 - 0.03, 0, 0]);
    // bolt ears + bolts (6) and their bosses running back along the shell
    for (const th of [0.87, -0.87, 1.75, -1.75, 2.5, -2.5]) {
      const r = 0.212 * k;
      const y = Math.cos(th) * r, z = Math.sin(th) * r;
      b.add(cylX(0.019, 0.014, 18), 'cast', [xf + 0.007, y, z]);
      b.add(cylX(0.012, 0.04, 14), 'cast', [xf + 0.034, y * 0.96, z * 0.96]);
      bolt(b, [xf + 0.054, y * 0.96, z * 0.96], 'x', 0.0075, 0.007, 'chrome');
    }
    // external stiffening ribs
    for (const th of [0.5, -0.5, 1.25, -1.25, 2.05, -2.05]) {
      const a = V(xf + 0.016, Math.cos(th) * 0.203 * k, Math.sin(th) * 0.203 * k);
      const c = V(L / 2 - 0.012, Math.cos(th) * 0.146 * k, Math.sin(th) * 0.146 * k);
      b.addMatrix(box(1, 1, 1, 0), 'cast', alignX(a, c, 0.011));
    }
    // starter clearance pocket (passenger side, low) and clutch-line boss (driver side)
    b.add(cylX(0.046 * k, 0.075, 24), 'cast', [xf + 0.05, -0.115 * k, -0.155 * k]);
    b.add(cylZ(0.012, 0.024, 14), 'cast', [0.01, -0.07 * k, 0.15 * k]);
    return b.build();
  },

  /** Single-mass flywheel (cast iron), friction face on +X, 8-bolt LT4 crank pattern. */
  drivetrain_flywheel(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(latheX([[0.02, -L / 2], [R, -L / 2], [R, L / 2 - 0.008], [R - 0.007, L / 2 - 0.008], [R - 0.007, L / 2], [0.062, L / 2], [0.062, L / 2 - 0.008], [0.02, L / 2 - 0.008], [0.02, -L / 2]], 56), 'iron');
    b.add(ringX(R * 0.74, 0.066, 0.0012, 56), 'machined', [L / 2 + 0.0006, 0, 0]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * PI * 2 + PI / 8;
      bolt(b, [L / 2 - 0.008, Math.cos(a) * 0.036, Math.sin(a) * 0.036], 'x', 0.0072, 0.007, 'chrome');
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      // pressure-plate bolt holes on the outer step + balance drillings
      b.add(cylX(0.0055, 0.002, 12), 'black', [L / 2 + 0.0005, Math.cos(a) * (R - 0.022), Math.sin(a) * (R - 0.022)]);
      b.add(cylX(0.008, 0.002, 12), 'black', [-L / 2 - 0.0005, Math.cos(a + 0.5) * (R - 0.03), Math.sin(a + 0.5) * (R - 0.03)]);
    }
    return b.build();
  },

  /** 168-tooth starter ring gear shrunk on the flywheel. */
  drivetrain_ringGear(L, D) {
    const n = 168;
    const Ro = D / 2, Rr = Ro - 0.0045, Ri = Ro - 0.013;
    const pts = [];
    for (let i = 0; i < n; i++) {
      for (const [f, r] of [[0, Rr], [0.32, Ro], [0.55, Ro], [0.85, Rr]]) {
        const a = ((i + f) / n) * PI * 2;
        pts.push([Math.sin(a) * r, Math.cos(a) * r]);
      }
    }
    const s = shapeZY(pts);
    s.holes.push(new THREE.Path().absarc(0, 0, Ri, 0, PI * 2, true));
    return new PartBuilder().add(extrudeX(s, Math.min(L, 0.016), 64), 'steel').build();
  },

  /** Twin-disc pack: friction disc, floater plate, friction disc (front to rear). */
  drivetrain_twinDiscPack(L, D) {
    const b = new PartBuilder();
    const R = Math.min(D / 2, 0.13);
    const Rf = R * 0.94; // friction OD (~245 mm)
    const t = Math.min(0.009, L * 0.25);
    for (const [x, sprung] of [[-L / 2 + t / 2 + 0.001, true], [L / 2 - t / 2 - 0.001, false]]) {
      // 8 bonded friction segments each face
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * PI * 2 + 0.04, a1 = ((i + 1) / 8) * PI * 2 - 0.04;
        b.add(extrudeX(sectorShape(Rf * 0.64, Rf, a0, a1, 6), t, 8), 'copper', [x, 0, 0]);
      }
      b.add(ringX(Rf * 0.66, 0.034, t * 0.35, 36), 'steel', [x, 0, 0]);
      b.add(cylX(0.034, t + 0.012, 24), 'steel', [x, 0, 0]);
      b.add(cylX(0.019, t + 0.014, 13), 'machined', [x, 0, 0]); // splined bore (26-spline)
      if (sprung) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * PI * 2;
          const c = V(x + 0.002, Math.cos(a) * 0.056, Math.sin(a) * 0.056);
          const tan = V(0, -Math.sin(a), Math.cos(a));
          b.addMatrix(cylX(0.0075, 0.03, 12), 'spring', placeAlong(c, tan));
        }
      }
    }
    // floater (intermediate) plate with drive lugs
    b.add(ringX(R * 0.95, R * 0.6, Math.min(0.008, L * 0.22), 48), 'iron', [0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      b.add(box(0.008, 0.016, 0.022, 0), 'iron', [0, Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97], [-a, 0, 0]);
    }
    return b.build();
  },

  /** Diaphragm pressure plate: bolt flange on -X (flywheel), fingers converging on +X. */
  drivetrain_pressurePlate(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const xf = -L / 2;
    // stamped cover: flange + skirt + rear face
    b.add(ringX(R * 0.93, R * 0.78, 0.004, 48), 'steel', [xf + 0.002, 0, 0]);
    b.add(latheX([[R * 0.9, xf + 0.003], [R * 0.9, xf + L * 0.55], [R * 0.86, xf + L * 0.64], [R * 0.66, xf + L * 0.68], [R * 0.62, xf + L * 0.66]], 48), 'steel');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + PI / 6;
      const y = Math.cos(a) * R * 0.9, z = Math.sin(a) * R * 0.9;
      b.add(cylX(0.016, 0.004, 16), 'steel', [xf + 0.002, y, z]);
      bolt(b, [xf + 0.004, y, z], 'x', 0.006, 0.006, 'chrome');
      // cover windows (dark) between ears
      const a2 = a + PI / 6;
      b.add(box(0.002, 0.03, 0.05, 0), 'black', [xf + L * 0.67, Math.cos(a2) * R * 0.76, Math.sin(a2) * R * 0.76], [-a2, 0, 0]);
    }
    // cast pressure ring visible through the windows
    b.add(ringX(R * 0.86, R * 0.6, 0.012, 48), 'iron', [xf + L * 0.45, 0, 0]);
    // diaphragm spring: Belleville rim + 18 fingers sloping to the release bearing
    b.add(latheX([[R * 0.68, xf + L * 0.66], [R * 0.6, xf + L * 0.74]], 48), 'steel');
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const rd = V(0, Math.cos(a), Math.sin(a));
      const tan = V(0, -Math.sin(a), Math.cos(a));
      const p0 = V(xf + L * 0.74, 0, 0).addScaledVector(rd, R * 0.6);
      const p1 = V(L / 2, 0, 0).addScaledVector(rd, 0.024);
      const dir = p1.clone().sub(p0);
      const len = dir.length();
      dir.normalize();
      const nrm = V().crossVectors(dir, tan).normalize();
      b.addMatrix(box(1, 1, 1, 0), 'machined', basis(p0.clone().add(p1).multiplyScalar(0.5), dir, nrm, tan, [len, 0.0025, 0.0125]));
    }
    return b.build();
  },

  /** Concentric slave cylinder (hydraulic release bearing) on the input-bearing retainer. */
  drivetrain_csc(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const xf = -L / 2;
    b.add(latheX([[0.022, xf], [0.036, xf], [0.036, xf + 0.014], [0.022, xf + 0.014]], 32), 'machined'); // bearing
    b.add(latheX([[0.03, xf + 0.014], [0.034, xf + 0.02], [0.03, xf + 0.026], [0.035, xf + 0.032], [0.031, xf + 0.038]], 24), 'rubber'); // dust boot
    b.add(latheX([[0.026, xf + 0.036], [R * 0.72, xf + 0.036], [R * 0.72, L / 2 - 0.008], [0.026, L / 2 - 0.008]], 32), 'black'); // body
    // 3-ear mounting flange
    b.add(extrudeX(armFlangeShape(R * 0.72, R * 0.97, 3, 0.026), 0.008, 24), 'black', [L / 2 - 0.004, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + PI;
      bolt(b, [L / 2, Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88], 'x', 0.006, 0.006, 'chrome');
    }
    // feed port and bleeder spigots (to driver side / top)
    const port = V(xf + 0.045, R * 0.55, R * 0.25);
    b.addMatrix(cylX(0.5, 1, 14), 'black', alignX(port, port.clone().add(V(0, R * 0.42, R * 0.2)), 0.016));
    b.addMatrix(cylX(0.5, 1, 12), 'blue', alignX(port.clone().add(V(0, R * 0.38, R * 0.18)), port.clone().add(V(0, R * 0.46, R * 0.22)), 0.014));
    const bl = V(xf + 0.045, R * 0.55, -R * 0.25);
    b.addMatrix(cylX(0.5, 1, 10), 'black', alignX(bl, bl.clone().add(V(0, R * 0.35, -R * 0.2)), 0.011));
    return b.build();
  },

  /** Crankshaft pilot bearing (needle roller in a drawn cup). */
  drivetrain_pilotBearing(L, D) {
    const b = new PartBuilder();
    b.add(ringX(D / 2, D * 0.33, L, 28), 'machined');
    b.add(ringX(D * 0.33, D * 0.26, L * 0.9, 24), 'steel');
    return b.build();
  },

  /** GM 3-arm guibo flange (trans output or pinion). Hub runs into the gearbox (-X) or diff (+X). */
  drivetrain_armFlange(L, D, D2, ctx) {
    const b = new PartBuilder();
    const R = D / 2;
    const hubDir = /pinion/.test(ctx?.comp?.id || '') ? 1 : -1;
    b.add(extrudeX(armFlangeShape(R * 0.52, R * 0.98, 3, 0.012), L * 0.6, 30), 'steel', [-hubDir * L * 0.2, 0, 0]);
    b.add(cylX(R * 0.5, L * 1.6, 28), 'steel', [hubDir * L * 0.7, 0, 0]);
    b.add(cylX(R * 0.3, L * 0.3, 20), 'machined', [-hubDir * L * 0.5, 0, 0]);
    b.add(hexX(R * 0.26, L * 0.4), 'chrome', [-hubDir * L * 0.55, 0, 0]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2;
      bolt(b, [-hubDir * L * 0.5, Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82], 'x', 0.0085, 0.008, 'chrome', -hubDir);
    }
    return b.build();
  },

  /** Rubber flex coupler (guibo): 6-lobe disc with steel sleeves, bolts alternate sides. */
  drivetrain_guibo(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const s = polarShape((a) => R * 0.78 + R * 0.2 * Math.pow(Math.cos(3 * a) ** 2, 2), 96, R * 0.24);
    b.add(extrudeX(s, L * 0.8, 40), 'rubber');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      const y = Math.cos(a) * R * 0.78, z = Math.sin(a) * R * 0.78;
      b.add(cylX(R * 0.17, L, 18), 'steel', [0, y, z]);
      const side = i % 2 ? 1 : -1;
      bolt(b, [side * L / 2, y, z], 'x', R * 0.13, 0.008, 'chrome', side);
      b.add(hexX(R * 0.13, 0.009), 'chrome', [-side * (L / 2 + 0.0045), y, z]);
    }
    b.add(ringX(R * 0.26, R * 0.18, L * 0.9, 24), 'steel');
    return b.build();
  },

  /** Plunging tripod inner CV: stub into the diff side gear (-X), 3-lobed tulip housing. */
  drivetrain_innerCV(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const xf = -L / 2;
    b.add(cylX(0.0165, 0.032, 14), 'machined', [xf + 0.016, 0, 0]); // splined stub
    b.add(torusX(0.0155, 0.0015, 6, 18), 'chrome', [xf + 0.006, 0, 0]); // circlip
    b.add(latheX([[0.02, xf + 0.03], [R * 0.7, xf + 0.04], [R * 0.8, xf + 0.05]], 28), 'steel');
    const lobe = polarShape((a) => R * 0.78 + R * 0.2 * Math.pow(Math.cos(1.5 * a) ** 2, 2), 72);
    b.add(extrudeX(lobe, L - 0.055, 24), 'steel', [xf + 0.05 + (L - 0.055) / 2, 0, 0]);
    b.add(ringX(R * 0.8, R * 0.62, 0.006, 32), 'machined', [L / 2 - 0.006, 0, 0]);
    return b.build();
  },

  /** Fixed Rzeppa outer CV: bell (inboard, -X) + splined stub through the hub (+X) with threaded end. */
  drivetrain_outerCV(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const xf = -L / 2;
    b.add(latheX([[R * 0.62, xf], [R * 0.86, xf + 0.004], [R * 0.98, xf + 0.03], [R * 0.96, xf + 0.06], [R * 0.72, xf + 0.08], [0.026, xf + 0.09], [0.022, xf + 0.094]], 32), 'steel');
    b.add(ringX(R * 0.72, R * 0.5, 0.006, 28), 'machined', [xf + 0.003, 0, 0]);
    const stubL = L - 0.094 - 0.014;
    b.add(cylX(0.0165, stubL, 16), 'machined', [xf + 0.094 + stubL / 2, 0, 0]);
    b.add(cylX(0.012, 0.016, 12), 'chrome', [L / 2 - 0.008, 0, 0]);
    return b.build();
  },

  /** CV boot: inner boots have the big end inboard (-X), outer boots outboard (+X). */
  drivetrain_cvBoot(L, D, D2, ctx) {
    const R = D / 2;
    const inner = Math.abs(ctx?.pos?.[2] ?? 0.3) < 0.45;
    const folds = 5;
    const prof = [];
    for (let i = 0; i <= folds * 2; i++) {
      const f = i / (folds * 2);
      const big = inner ? 1 - f : f;
      const rr = R * (0.42 + 0.56 * big) * (i % 2 ? 0.86 : 1);
      prof.push([rr, -L / 2 + f * L]);
    }
    return new PartBuilder().add(latheX(prof, 28), 'rubber').build();
  },

  /** Ear-type (Oetiker) boot clamp; radius picked from the position on the shaft. */
  drivetrain_bootClamp(L, D, D2, ctx) {
    const z = Math.abs(ctx?.pos?.[2] ?? 0.3);
    const big = z < 0.31 || z > 0.58;
    const R = Math.min(D / 2, big ? 0.049 : 0.021);
    const b = new PartBuilder();
    b.add(ringX(R + 0.0012, R, 0.008, 36), 'stainless');
    b.add(box(0.008, 0.005, 0.009, 0), 'stainless', [0, R + 0.002, 0]);
    return b.build();
  },

  /** Rubber mount bushing in a steel shell with a protruding inner sleeve. */
  drivetrain_bushing(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(ringX(R, R * 0.86, L * 0.85, 28), 'steel');
    b.add(ringX(R * 0.86, R * 0.36, L * 0.8, 28), 'rubber');
    b.add(ringX(R * 0.36, R * 0.22, L * 1.05, 20), 'machined');
    for (const s of [-1, 1]) b.add(ringX(R * 0.7, R * 0.5, 0.002, 20), 'black', [s * L * 0.4, 0, 0]);
    return b.build();
  },

  /**
   * Ring & pinion (226 mm hypoid) with the diff case behind it. Axis X = axle axis (box spans ring + case);
   * teeth face +X; the pinion axis sits 40 mm toward +X from the ring centre (car centreline), 20 mm low,
   * and runs forward along +Z.
   */
  drivetrain_ringPinion(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const T = Math.min(L, 0.032);
    const xr = L / 2 - 0.075; // ring gear centre
    b.add(latheX([[R * 0.66, xr - T / 2], [R, xr - T / 2], [R, xr - T / 2 + T * 0.45], [R * 0.72, xr + T / 2], [R * 0.66, xr + T / 2]], 64), 'gold');
    const n = 41;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const rd = V(0, Math.cos(a), Math.sin(a));
      const p = V(xr + T * 0.12, 0, 0).addScaledVector(rd, R * 0.86);
      b.addMatrix(box(1, 1, 1, 0), 'gold', basis(p, rd, V(1, 0, 0), V(0, -Math.sin(a), Math.cos(a)), [R * 0.28, T * 0.5, 0.006]));
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      bolt(b, [xr - T / 2, Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75], 'x', 0.0075, 0.007, 'chrome', -1);
    }
    // diff case (carries the eLSD clutch pack) behind the ring gear
    b.add(latheX([[R * 0.66, xr - T / 2], [0.085, xr - T / 2 - 0.02], [0.075, -L / 2 + 0.01], [0.04, -L / 2]], 32), 'iron');
    // pinion head + shaft, toward the front (+Z)
    const pin = latheX([[0.026, 0], [0.036, 0.03], [0.022, 0.035], [0.02, 0.05]], 20);
    pin.rotateY(-PI / 2); // +X -> +Z
    b.add(pin, 'gold', [L / 2 - 0.04, -0.02, R * 0.5]);
    return b.build();
  },

  /** Clutch master cylinder: body with reservoir spigot, firewall flange (-X end), pushrod (+X). */
  drivetrain_clutchMaster(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(cylX(R * 0.7, L * 0.62, 20), 'plastic', [-L * 0.12, 0, 0]);
    b.add(box(0.008, R * 2.6, R * 1.8, 0.003), 'plastic', [L * 0.2, 0, 0]);
    b.add(cylY(R * 0.32, R * 0.7, 14), 'plastic', [-L * 0.05, R * 0.85, 0]);
    b.add(cylX(R * 0.3, L * 0.12, 12), 'blue', [-L * 0.44, 0, 0]);
    b.add(cylX(R * 0.14, L * 0.24, 10), 'chrome', [L * 0.36, 0, 0]);
    b.add(latheX([[R * 0.2, L * 0.22], [R * 0.45, L * 0.25], [R * 0.3, L * 0.3]], 14), 'rubber');
    return b.build();
  },

  /** Billet AN fitting: hex body, nut and nipple along X. */
  drivetrain_anFitting(L, D, D2, ctx) {
    const b = new PartBuilder();
    const R = Math.min(D, D2) / 2;
    const oem = /bulkhead/.test(ctx?.comp?.id || '');
    const f = oem ? 'plastic' : 'blue';
    b.add(hexX(R * 0.95, L * 0.35), f, [-L * 0.25, 0, 0]);
    b.add(cylX(R * 0.6, L * 0.3, 14), oem ? 'machined' : 'blue', [L * 0.05, 0, 0]);
    b.add(hexX(R * 0.85, L * 0.3), oem ? 'plastic' : 'red', [L * 0.32, 0, 0]);
    return b.build();
  },

  /** Billet in-line oil filter: anodised body, hex end caps, AN ports. */
  drivetrain_inlineFilter(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(cylX(R * 0.92, L * 0.62, 28), 'blue');
    for (let i = 0; i < 6; i++) b.add(torusX(R * 0.93, 0.0012, 6, 28), 'blue', [-L * 0.25 + i * L * 0.1, 0, 0]);
    for (const s of [-1, 1]) {
      b.add(hexX(R, L * 0.1), 'blue', [s * L * 0.36, 0, 0]);
      b.add(hexX(R * 0.55, L * 0.08), 'red', [s * L * 0.46, 0, 0]);
    }
    return b.build();
  },

  /** 12 V cooler circulation pump: motor can + gear-pump head with two AN ports. */
  drivetrain_oilPump(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(latheX([[0.0001, -L / 2], [R * 0.85, -L / 2], [R * 0.9, -L / 2 + 0.006], [R * 0.9, L * 0.1], [R * 0.7, L * 0.12]], 28), 'black');
    b.add(box(L * 0.35, R * 1.5, R * 1.5, 0.006), 'aluminum', [L * 0.3, 0, 0]);
    b.add(hexX(R * 0.35, L * 0.08), 'blue', [L / 2 - L * 0.04, 0, 0]);
    b.add(cylY(R * 0.3, R * 0.5, 6), 'blue', [L * 0.3, R * 0.85, 0]);
    b.add(box(L * 0.12, R * 0.4, R * 0.45, 0.003), 'plastic', [-L * 0.2, R * 0.95, 0]);
    b.add(box(L * 0.5, 0.003, R * 2.4, 0), 'steel', [0, -R * 0.95, 0]); // strap bracket base
    return b.build();
  },

  /** Steel 360-degree driveshaft safety loop with floor mounting tabs at the top. */
  drivetrain_safetyLoop(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const w = Math.max(0.025, L);
    b.add(ringX(R * 0.9, R * 0.86, w, 40), 'red');
    for (const s of [-1, 1]) b.add(box(w, 0.005, R * 0.45, 0), 'red', [0, R * 0.88, s * R * 0.5]);
    for (const s of [-1, 1]) bolt(b, [0, R * 0.88 + 0.0025, s * R * 0.62], 'y', 0.007, 0.006, 'chrome');
    return b.build();
  },

  /** One-piece driveshaft front CV + flange adapter (bolts to the trans 3-arm flange). */
  drivetrain_cvFlange(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(extrudeX(armFlangeShape(R * 0.55, R * 0.95, 3, 0.01), 0.012, 24), 'machined', [-L / 2 + 0.006, 0, 0]);
    b.add(cylX(R * 0.85, L * 0.42, 32), 'steel', [-L * 0.05, 0, 0]); // CV body
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2;
      bolt(b, [L * 0.16, Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7], 'x', 0.006, 0.006, 'chrome');
    }
    b.add(latheX([[R * 0.75, L * 0.16], [R * 0.55, L * 0.28], [R * 0.62, L * 0.34], [R * 0.4, L * 0.44], [R * 0.35, L / 2]], 24), 'rubber');
    return b.build();
  },

  /** Pneumatic shift actuator: aluminium cylinder, valve block, fittings. */
  drivetrain_pneumaticActuator(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    b.add(cylX(R * 0.8, L * 0.7, 24), 'aluminum', [-L * 0.1, 0, 0]);
    for (const s of [-1, 1]) b.add(box(0.012, R * 1.7, R * 1.7, 0.003), 'satin', [-L * 0.1 + s * L * 0.35, 0, 0]);
    b.add(cylX(R * 0.2, L * 0.25, 12), 'chrome', [L * 0.36, 0, 0]);
    b.add(box(L * 0.25, R * 0.8, R * 1.2, 0.004), 'blue', [-L * 0.1, R * 1.1, 0]);
    b.add(box(L * 0.1, R * 0.5, R * 0.5, 0.002), 'plastic', [-L * 0.25, R * 1.55, 0]);
    return b.build();
  },

  /** Air tank for pneumatic shifting: domed ends, regulator and gauge. */
  drivetrain_airTank(L, D) {
    const b = new PartBuilder();
    const R = D / 2;
    const prof = [[0.0001, -L / 2]];
    for (let i = 1; i <= 6; i++) { const a = (i / 6) * (PI / 2); prof.push([R * Math.sin(a), -L / 2 + R * 0.6 * (1 - Math.cos(a))]); }
    for (let i = 6; i >= 0; i--) { const a = (i / 6) * (PI / 2); prof.push([R * Math.sin(a), L / 2 - R * 0.6 * (1 - Math.cos(a))]); }
    b.add(latheX(prof, 28), 'black');
    b.add(box(0.03, 0.03, 0.03, 0.004), 'aluminum', [L / 2 + 0.01, 0, 0]);
    b.add(cylX(0.016, 0.01, 18), 'chrome', [L / 2 + 0.03, 0, 0]);
    return b.build();
  },

  /** GM ZL1 suede shift knob (axis Y, bottom at -X). */
  drivetrain_shiftKnob(L, D) {
    const R = Math.min(D / 2, 0.026);
    const prof = [[0.0001, -L / 2], [R * 0.45, -L / 2], [R * 0.5, -L / 2 + 0.006], [R * 0.9, -L / 2 + 0.016], [R, -L / 2 + 0.026]];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * (PI / 2); prof.push([R * Math.cos(a), L / 2 - R * 0.7 + R * 0.7 * Math.sin(a)]); }
    const b = new PartBuilder().add(latheX(prof, 32), 'seat');
    b.add(cylX(R * 0.52, 0.003, 24), 'chrome', [-L / 2 + 0.004, 0, 0]);
    return b.build();
  },
};

// ------------------------------------------------------------------ BOXES (world-aligned)
const boxes = {
  /**
   * TREMEC TR-6060 main case + mid plate + tail (extension) housing with shift tower.
   * Local origin on the mainshaft axis; front face (-X) mates the integral bellhousing.
   */
  drivetrain_tr6060(sx, sy, sz) {
    const b = new PartBuilder();
    const kx = sx / 0.68, ky = sy / 0.3, kz = sz / 0.28;
    const X = (v) => v * kx;
    const MAIN = [[0, -0.15], [0.06, -0.146], [0.1, -0.122], [0.123, -0.075], [0.13, -0.02], [0.127, 0.03], [0.114, 0.07], [0.09, 0.098], [0.05, 0.11], [0, 0.113],
      [-0.05, 0.11], [-0.09, 0.098], [-0.114, 0.07], [-0.127, 0.03], [-0.13, -0.02], [-0.123, -0.075], [-0.1, -0.122], [-0.06, -0.146]].map(([z, y]) => [z * kz, y * ky]);
    const scaleAt = (x) => 1 - 0.07 * clamp((x - X(-0.328)) / (X(0.015) - X(-0.328)), 0, 1);
    b.add(loftX(MAIN, [
      { x: X(-0.34), s: 1.03 }, { x: X(-0.328), s: 1.03 }, { x: X(-0.328), s: 1.0 },
      { x: X(-0.1), s: 0.97 }, { x: X(0.012), s: 0.93 },
      { x: X(0.012), s: 0.965 }, { x: X(0.03), s: 0.965 }, { x: X(0.03), s: 0.7 },
    ]), 'cast');
    // tail / extension housing
    const SE = superEllipse(20, 2.4);
    b.add(loftX(SE, [
      { x: X(0.03), sz: 0.094 * kz, sy: 0.1 * ky, dy: -0.004 },
      { x: X(0.1), sz: 0.084 * kz, sy: 0.088 * ky, dy: -0.002 },
      { x: X(0.22), sz: 0.067 * kz, sy: 0.07 * ky },
      { x: X(0.29), sz: 0.057 * kz, sy: 0.058 * ky },
      { x: X(0.3), sz: 0.05 * kz, sy: 0.05 * ky },
    ]), 'cast');
    b.add(latheX([[0.046 * ky, X(0.298)], [0.046 * ky, X(0.33)], [0.04 * ky, X(0.34)]], 28), 'cast');
    // top cover over the main case and shift tower / semi-remote rail housing
    b.add(box(X(0.22), 0.012, 0.15 * kz, 0.004), 'cast', [X(-0.19), 0.114 * ky, 0]);
    b.add(box(X(0.2), 0.05 * ky, 0.1 * kz, 0.012), 'cast', [X(0.05), 0.112 * ky, 0]);
    b.add(box(X(0.13), 0.03 * ky, 0.06 * kz, 0.01), 'cast', [X(0.21), 0.085 * ky, 0]);
    for (const [x, z] of [[-0.28, 0.06], [-0.28, -0.06], [-0.1, 0.06], [-0.1, -0.06], [-0.04, 0.045], [-0.04, -0.045], [0.14, 0.045], [0.14, -0.045]]) {
      bolt(b, [X(x), (x < -0.05 ? 0.12 : 0.137) * ky, z * kz], 'y', 0.0055, 0.005, 'chrome');
    }
    // vertical side ribs + a longitudinal rib on the main case
    for (const x of [-0.29, -0.22, -0.15, -0.08, -0.015]) {
      const s = scaleAt(X(x));
      for (const side of [-1, 1]) b.add(box(0.008, 0.12 * ky, 0.014, 0), 'cast', [X(x), -0.015 * ky, side * (0.127 * kz * s + 0.004)]);
    }
    for (const side of [-1, 1]) b.add(box(X(0.33), 0.008, 0.012, 0), 'cast', [X(-0.16), -0.02 * ky, side * 0.128 * kz]);
    // tail-housing fins
    for (const th of [0.8, -0.8, 2.35, -2.35]) {
      const a = V(X(0.04), Math.cos(th) * 0.092 * ky, Math.sin(th) * 0.086 * kz);
      const c = V(X(0.27), Math.cos(th) * 0.06 * ky, Math.sin(th) * 0.058 * kz);
      b.addMatrix(box(1, 1, 1, 0), 'cast', alignX(a, c, 0.009));
    }
    // mid-plate perimeter bolts
    for (let i = 0; i < MAIN.length; i += 2) {
      const [z, y] = MAIN[i];
      bolt(b, [X(0.03), y * 0.93, z * 0.93], 'x', 0.006, 0.006, 'chrome');
    }
    // crossmember mount pad under the tail
    b.add(box(X(0.07), 0.026, 0.11 * kz, 0.004), 'cast', [X(0.255), -0.074 * ky, 0]);
    // electrical connector pads (2-3 skip, reverse lockout) on the case side
    b.add(box(0.03, 0.02, 0.02, 0.004), 'plastic', [X(-0.2), 0.06 * ky, 0.12 * kz]);
    return b.build();
  },

  /** Stamped-steel centre support bearing: band + side flanges, rubber isolator, ball bearing. */
  drivetrain_centerBearing(sx, sy, sz) {
    const b = new PartBuilder();
    const w = sx;
    const Ro = Math.min(sy, sz) * 0.42;
    b.add(ringX(Ro, Ro - 0.004, w * 0.75, 40), 'black');
    // stamped bracket: flanges bolted up to the tunnel, side webs down to the band
    const yT = sy / 2 - 0.004;
    const half = sz / 2;
    for (const s of [-1, 1]) {
      const fw = half - Ro;
      b.add(box(w, 0.004, fw, 0), 'black', [0, yT, s * (Ro + fw / 2)]);
      b.add(box(w * 0.9, yT, 0.004, 0), 'black', [0, yT / 2, s * (Ro + 0.001)]);
      b.add(box(0.004, yT * 0.8, half - Ro, 0), 'black', [w * 0.45, yT * 0.55, s * (Ro + (half - Ro) / 2)]);
      bolt(b, [0, yT + 0.002, s * (half - 0.018)], 'y', 0.0075, 0.007, 'chrome');
    }
    b.add(box(w, 0.004, Ro * 2, 0), 'black', [0, Ro + 0.002, 0]);
    // rubber isolator with voids + bearing
    b.add(ringX(Ro - 0.004, 0.024, w * 0.6, 36), 'rubber');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * PI * 2 + PI / 4;
      b.add(cylX(0.008, w * 0.62, 10), 'black', [0, Math.cos(a) * (Ro - 0.016), Math.sin(a) * (Ro - 0.016)]);
    }
    b.add(ringX(0.024, 0.016, w * 0.4, 28), 'machined');
    for (const s of [-1, 1]) b.add(ringX(0.03, 0.018, 0.0015, 28), 'steel', [s * w * 0.32, 0, 0]);
    return b.build();
  },

  /**
   * GM 226 mm rear drive module housing (aluminium) without the rear cover.
   * Local origin on the axle axis; pinion axis 20 mm lower; nose forward (-X).
   */
  drivetrain_diffHousing(sx, sy, sz) {
    const b = new PartBuilder();
    const hx = sx / 2;
    const k = Math.min(sy / 0.28, sz / 0.38);
    const yp = -0.02;
    // pinion nose (bearing housing) on the pinion axis
    const nose = latheX([[0.042 * k, -hx + 0.01], [0.047 * k, -hx + 0.014], [0.05 * k, -hx + 0.05], [0.058 * k, -hx + 0.07], [0.085 * k, -hx + 0.11]], 32);
    b.add(nose, 'cast', [0, yp, 0]);
    b.add(cylX(0.036 * k, 0.012, 24), 'rubber', [-hx + 0.006, yp, 0]); // pinion seal lip
    // pumpkin body + cover flange
    b.add(latheX([[0.06 * k, -hx + 0.07], [0.105 * k, -0.065], [0.132 * k, -0.02], [0.138 * k, 0.04], [0.138 * k, hx - 0.04], [0.148 * k, hx - 0.04], [0.148 * k, hx - 0.025], [0.12 * k, hx - 0.025]], 44), 'cast');
    // side output bosses with seal bores
    b.add(latheZ([[0.05 * k, -sz / 2], [0.058 * k, -sz / 2 + 0.008], [0.064 * k, -sz / 2 + 0.03], [0.09 * k, -0.08], [0.09 * k, 0.08], [0.064 * k, sz / 2 - 0.03], [0.058 * k, sz / 2 - 0.008], [0.05 * k, sz / 2]], 32), 'cast');
    for (const s of [-1, 1]) b.add(cylZ(0.042 * k, 0.004, 24), 'black', [0, 0, s * (sz / 2 - 0.001)]);
    // front mount ears (two, vertical bushings) and rear mount lug (on the cover side)
    for (const s of [-1, 1]) {
      const eye = V(-0.12, 0.06, s * 0.13);
      b.addMatrix(box(1, 1, 1, 0), 'cast', alignX(V(-0.05, 0.03, s * 0.06), eye, 0.034));
      b.add(cylY(0.033, 0.05, 24), 'cast', eye.toArray());
    }
    b.addMatrix(box(1, 1, 1, 0), 'cast', alignX(V(hx - 0.06, 0.09, 0), V(hx + 0.01, 0.035, 0), 0.04));
    b.add(cylX(0.042, 0.05, 24), 'cast', [hx + 0.02, 0.03, 0]);
    // stiffening ribs on the front of the pumpkin
    for (const z of [-0.06, 0, 0.06]) {
      b.addMatrix(box(1, 1, 1, 0), 'cast', alignX(V(-hx + 0.06, yp + 0.05, z), V(-0.02, 0.135 * k, z * 1.2), 0.01));
      b.addMatrix(box(1, 1, 1, 0), 'cast', alignX(V(-hx + 0.06, yp - 0.05, z), V(-0.02, -0.13 * k, z * 1.2), 0.01));
    }
    return b.build();
  },

  /** Finned aluminium diff cover with perimeter bolts (gasket/RTV line). */
  drivetrain_diffCover(sx, sy, sz) {
    const b = new PartBuilder();
    const R = sy / 2;
    const cz = sz / sy;
    const dome = latheX([[R * 0.98, -sx / 2], [R * 0.96, -sx / 2 + 0.006], [R * 0.82, sx * 0.1], [R * 0.5, sx / 2 - 0.002], [0.0001, sx / 2]], 44);
    b.add(dome, 'cast', [0, 0, 0], [0, 0, 0], [1, 1, cz]);
    b.add(ringX(R, R * 0.9, 0.002, 44), 'black', [-sx / 2 - 0.001, 0, 0], [0, 0, 0], [1, 1, cz]);
    for (const y of [-0.06, -0.02, 0.02, 0.06]) b.add(box(sx * 0.7, 0.006, R * 1.2 * cz, 0), 'cast', [sx * 0.15, y * (R / 0.13), 0]);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2 + PI / 10;
      bolt(b, [-sx / 2 + 0.006, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92 * cz], 'x', 0.0065, 0.006, 'chrome');
    }
    return b.build();
  },

  /** eLSD electro-hydraulic actuator: motor/pump on the housing side, valve body, connector. */
  drivetrain_elsdActuator(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.6, sy * 0.5, sz * 0.8, 0.006), 'cast', [-sx * 0.15, -sy * 0.15, 0]);
    b.add(cylX(Math.min(sy, sz) * 0.36, sx * 0.55, 24), 'black', [sx * 0.2, sy * 0.15, 0]);
    b.add(box(sx * 0.15, sy * 0.15, sz * 0.4, 0.003), 'plastic', [sx * 0.15, sy * 0.45, 0]);
    for (const [y, z] of [[-sy * 0.35, sz * 0.3], [-sy * 0.35, -sz * 0.3], [sy * 0.05, sz * 0.3]]) bolt(b, [-sx * 0.45, y, z], 'x', 0.005, 0.005, 'chrome', -1);
    return b.build();
  },

  /** Gen 6 manual-trans support: e-coated stamped hat-section beam, dropped centre, bolt-up ends. */
  drivetrain_crossmember(sx, sy, sz) {
    const b = new PartBuilder();
    const hz = sz / 2;
    const yHi = sy / 2 - 0.008, yLo = -sy / 2 + 0.012;
    const line = [[-hz, yHi], [-hz * 0.72, yHi], [-hz * 0.5, yLo], [hz * 0.5, yLo], [hz * 0.72, yHi], [hz, yHi]];
    const strip = (lineP, t) => [...lineP.map(([z, y]) => [z, y + t / 2]), ...lineP.slice().reverse().map(([z, y]) => [z, y - t / 2])];
    b.add(extrudeX(shapeZY(strip(line, 0.006)), sx * 0.9, 4), 'black');
    for (const s of [-1, 1]) {
      const lip = line.map(([z, y]) => [z, y - 0.012]);
      b.add(extrudeX(shapeZY(strip(lip, 0.024)), 0.003, 4), 'black', [s * sx * 0.45, 0, 0]);
    }
    for (const s of [-1, 1]) {
      for (const x of [-sx * 0.25, sx * 0.25]) bolt(b, [x, yHi - 0.003, s * (hz - 0.035)], 'y', 0.008, 0.007, 'chrome', -1);
      b.add(cylY(0.016, 0.002, 18), 'black', [0, yLo + 0.004, s * hz * 0.25]); // lightening hole marker
    }
    for (const z of [-0.035, 0.035]) bolt(b, [0, yLo - 0.003, z], 'y', 0.008, 0.007, 'chrome', -1);
    return b.build();
  },

  /** Transmission isolator: lower plate with studs, moulded rubber block, upper plate with studs. */
  drivetrain_transMount(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, 0.006, sz, 0.002), 'steel', [0, -sy / 2 + 0.003, 0]);
    b.add(box(sx * 0.75, 0.006, sz * 0.7, 0.002), 'steel', [0, sy / 2 - 0.003, 0]);
    b.add(loftX(superEllipse(16, 3), [
      { x: -sx * 0.4, sz: sz * 0.42, sy: sy * 0.36 }, { x: sx * 0.4, sz: sz * 0.42, sy: sy * 0.36 },
    ]), 'rubber', [0, 0, 0]);
    for (const z of [-sz * 0.3, sz * 0.3]) b.add(cylY(0.005, 0.02, 10), 'chrome', [0, -sy / 2 - 0.008, z]);
    for (const z of [-sz * 0.22, sz * 0.22]) b.add(cylY(0.005, 0.02, 10), 'chrome', [0, sy / 2 + 0.008, z]);
    return b.build();
  },

  /** Trans-side mount bracket bolted to the tail housing. */
  drivetrain_mountBracket(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, sy * 0.4, sz, 0.003), 'steel', [0, -sy * 0.3, 0]);
    for (const s of [-1, 1]) b.add(box(sx * 0.9, sy, 0.008, 0.002), 'steel', [0, 0, s * sz * 0.45]);
    for (const s of [-1, 1]) for (const x of [-sx * 0.3, sx * 0.3]) bolt(b, [x, -sy * 0.1, s * (sz * 0.45 + 0.004)], 'z', 0.0065, 0.006, 'chrome', s);
    return b.build();
  },

  /** GM semi-remote shift control: cast base with mount ears, pivot dome, forward rod clevis. */
  drivetrain_remoteShifter(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.7, sy * 0.35, sz * 0.8, 0.008), 'cast', [0, -sy * 0.3, 0]);
    b.add(sphere(Math.min(sx, sz) * 0.26, 24, 12), 'cast', [0, sy * 0.05, 0], [0, 0, 0], [1, 0.75, 1]);
    b.add(cylY(0.016, sy * 0.3, 18), 'machined', [0, sy * 0.3, 0]);
    for (const s of [-1, 1]) for (const x of [-sx * 0.3, sx * 0.3]) {
      b.add(cylY(0.011, 0.01, 14), 'cast', [x, -sy * 0.42, s * sz * 0.44]);
      bolt(b, [x, -sy * 0.37, s * sz * 0.44], 'y', 0.006, 0.005, 'chrome');
    }
    b.add(box(sx * 0.3, sy * 0.25, 0.03, 0.004), 'cast', [-sx * 0.42, -sy * 0.15, 0]);
    b.add(cylZ(0.006, 0.04, 10), 'chrome', [-sx * 0.5, -sy * 0.15, 0]);
    return b.build();
  },

  /** Air-to-oil cooler: tube-and-fin core, two side tanks on the long axis, -10 AN ports, tabs. */
  drivetrain_oilCooler(sx, sy, sz) {
    const dims = [sx, sy, sz];
    const thin = dims.indexOf(Math.min(...dims));
    const other = [0, 1, 2].filter((i) => i !== thin);
    const long = dims[other[0]] >= dims[other[1]] ? other[0] : other[1];
    const short = other.find((i) => i !== long);
    const b = new PartBuilder();
    const tank = Math.max(0.022, dims[long] * 0.1);
    const core = [...dims]; core[long] = dims[long] - 2 * tank;
    b.add(box(core[0], core[1], core[2], 0.001), 'core');
    // side plates
    for (const s of [-1, 1]) {
      const sp = [...dims]; sp[short] = 0.004; sp[long] = core[long];
      const p = [0, 0, 0]; p[short] = s * (dims[short] / 2 - 0.002);
      b.add(box(sp[0], sp[1], sp[2], 0), 'black', p);
    }
    for (const s of [-1, 1]) {
      const ts = [...dims]; ts[long] = tank; ts[thin] = dims[thin] * 1.1;
      const p = [0, 0, 0]; p[long] = s * (dims[long] / 2 - tank / 2);
      b.add(box(ts[0], ts[1], ts[2], 0.006), 'black', p);
      // AN port on the back face of each tank
      const q = [...p]; q[thin] = -dims[thin] * 0.55; q[short] = s * dims[short] * 0.25;
      const rot = thin === 0 ? [0, 0, 0] : thin === 1 ? [0, 0, PI / 2] : [0, -PI / 2, 0];
      b.add(hexX(0.013, 0.02), 'blue', q, rot);
      // mounting tab
      const t = [...p]; t[short] = s * (dims[short] / 2 + 0.008);
      const tsz = [0, 0, 0]; tsz[thin] = 0.003; tsz[long] = tank * 0.8; tsz[short] = 0.02;
      b.add(box(tsz[0], tsz[1], tsz[2], 0), 'black', t);
    }
    return b.build();
  },

  /** Billet oil thermostat / bypass block with four AN ports and the element cap. */
  drivetrain_thermostat(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx * 0.7, sy * 0.75, sz * 0.7, 0.004), 'aluminum');
    for (const s of [-1, 1]) {
      b.add(hexX(0.01, 0.014), 'blue', [s * sx * 0.42, sy * 0.1, 0]);
      b.add(hexX(0.01, 0.014), 'blue', [0, -sy * 0.1, s * sz * 0.42], [0, PI / 2, 0]);
    }
    b.add(cylY(sz * 0.25, sy * 0.25, 20), 'aluminum', [0, sy * 0.45, 0]);
    return b.build();
  },

  /** Moulded plastic cooler duct (tapered rectangular box section). */
  drivetrain_coolerDuct(sx, sy, sz) {
    const b = new PartBuilder();
    const t = 0.003;
    const sq = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    // walls as thin plates from a large inlet (-X) to a smaller outlet (+X)
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      const a = sq[i], c = sq[j];
      const p0 = V(-sx / 2, a[1] * sy / 2, a[0] * sz / 2), p1 = V(-sx / 2, c[1] * sy / 2, c[0] * sz / 2);
      const q0 = V(sx / 2, a[1] * sy * 0.38, a[0] * sz * 0.38), q1 = V(sx / 2, c[1] * sy * 0.38, c[0] * sz * 0.38);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...p0.toArray(), ...q0.toArray(), ...q1.toArray(), ...p0.toArray(), ...q1.toArray(), ...p1.toArray()], 3));
      g.computeVertexNormals();
      b.add(g, 'plastic');
    }
    return b.build();
  },

  /** Stamped bellhousing inspection cover with flanged edges and two bolts. */
  drivetrain_inspectionCover(sx, sy, sz) {
    const b = new PartBuilder();
    b.add(box(sx, Math.max(0.002, sy * 0.5), sz, 0.001), 'black');
    for (const s of [-1, 1]) b.add(box(sx, 0.008, 0.002, 0), 'black', [0, 0.004, s * sz / 2]);
    for (const s of [-1, 1]) bolt(b, [0, -sy * 0.25, s * sz * 0.4], 'y', 0.006, 0.005, 'chrome', -1);
    return b.build();
  },

  /** Aluminium tunnel heat shield: arched sheet with transverse stiffening beads. */
  drivetrain_tunnelShield(sx, sy, sz) {
    const b = new PartBuilder();
    const hz = sz / 2;
    const top = [], bot = [];
    for (let i = 0; i <= 16; i++) {
      const u = -1 + (2 * i) / 16;
      const y = -sy / 2 + (sy - 0.004) * Math.sqrt(Math.max(0, 1 - u * u * 0.92));
      top.push([u * hz, y + 0.0015]);
      bot.push([u * hz, y - 0.0015]);
    }
    b.add(extrudeX(shapeZY([...top, ...bot.reverse()]), sx, 4), 'aluminum');
    for (let x = -sx / 2 + 0.1; x < sx / 2 - 0.05; x += 0.15) {
      const bead = new THREE.TorusGeometry(1, 0.08, 6, 24, PI);
      bead.rotateY(PI / 2);
      b.add(bead, 'aluminum', [x, -sy / 2, 0], [0, 0, 0], [0.05, sy - 0.004, hz * 0.98]);
    }
    return b.build();
  },
};

// ------------------------------------------------------------------ PATHS (world coords)
function shaftFrame(pts) {
  const a = pts[0], z = pts[pts.length - 1];
  const dir = V().subVectors(z, a);
  const len = dir.length();
  dir.normalize();
  return { a, z, dir, len };
}

const paths = {
  /**
   * GM two-piece propeller shaft half. Front half: 3-arm flange to the trans guibo, CV/slip at the centre
   * bearing. Rear half: CV stub from the centre bearing, 3-arm flange to the diff guibo.
   */
  drivetrain_propShaft(pts, r, ctx) {
    const { a, dir, len } = shaftFrame(pts);
    const rear = /rear/.test(ctx?.comp?.id || '');
    const R = clamp(r, 0.03, 0.05);
    const b = new PartBuilder();
    const m = placeAlong(a, dir);
    const flangeEnd = rear ? len : 0; // x of the guibo flange along the shaft
    const cvEnd = rear ? 0 : len;
    const sgn = rear ? -1 : 1; // direction from the flange end into the tube
    // tube with swaged ends
    const x0 = Math.min(flangeEnd + sgn * 0.06, cvEnd - sgn * 0.08), x1 = Math.max(flangeEnd + sgn * 0.06, cvEnd - sgn * 0.08);
    b.addMatrix(latheX([[R * 0.62, x0 - 0.02], [R, x0 + 0.02], [R, x1 - 0.02], [R * 0.62, x1 + 0.02]], 28), 'black', m);
    for (const x of [x0 + 0.02, x1 - 0.02]) b.addMatrix(torusX(R * 0.99, 0.0025, 6, 28), 'steel', m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, 0)));
    // balance weights
    for (const x of [x0 + 0.06, x1 - 0.07]) b.addMatrix(box(0.02, 0.003, 0.014, 0), 'steel', m.clone().multiply(new THREE.Matrix4().makeTranslation(x, R + 0.0015, 0)));
    // flange end: spigot + 3-arm flange (rotated 60 deg from the trans flange so arms interleave on the guibo)
    const fx = flangeEnd + sgn * 0.008;
    const fl = extrudeX(armFlangeShape(0.03, 0.054, 3, 0.012), 0.012, 30);
    fl.rotateX(PI / 3);
    b.addMatrix(fl, 'steel', m.clone().multiply(new THREE.Matrix4().makeTranslation(fx, 0, 0)));
    b.addMatrix(latheX([[0.032, fx], [R * 0.62, fx + sgn * 0.065]], 24), 'steel', m);
    // CV / slip joint end
    const cx = cvEnd - sgn * 0.045;
    b.addMatrix(cylX(R * 1.25, 0.05, 28), 'steel', m.clone().multiply(new THREE.Matrix4().makeTranslation(cx, 0, 0)));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * PI * 2;
      b.addMatrix(hexX(0.006, 0.006), 'chrome', m.clone().multiply(new THREE.Matrix4().makeTranslation(cx - sgn * 0.028, Math.cos(ang) * R, Math.sin(ang) * R)));
    }
    b.addMatrix(latheX([[R * 1.1, cvEnd - sgn * 0.02], [R * 0.75, cvEnd - sgn * 0.01], [R * 0.55, cvEnd]], 20), 'rubber', m);
    b.addMatrix(cylX(0.017, 0.03, 14), 'machined', m.clone().multiply(new THREE.Matrix4().makeTranslation(cvEnd + sgn * 0.005, 0, 0)));
    return b.build();
  },

  /** One-piece carbon driveshaft with bonded aluminium end tubes and a billet rear adapter plate. */
  drivetrain_carbonShaft(pts, r) {
    const { a, dir, len } = shaftFrame(pts);
    const R = clamp(r, 0.035, 0.05);
    const b = new PartBuilder();
    const m = placeAlong(a, dir);
    b.addMatrix(latheX([[R * 0.7, 0.03], [R, 0.09], [R, len - 0.09], [R * 0.7, len - 0.03]], 30), 'carbon', m);
    for (const [x0, x1] of [[0.02, 0.1], [len - 0.1, len - 0.02]]) b.addMatrix(latheX([[R * 0.72, x0], [R * 1.01, x0 + 0.02], [R * 1.01, x1], [R * 0.72, x1 + 0.005]], 28), 'aluminum', m);
    b.addMatrix(ringX(0.06, 0.02, 0.012, 32), 'machined', m.clone().multiply(new THREE.Matrix4().makeTranslation(len - 0.01, 0, 0)));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * PI * 2;
      b.addMatrix(hexX(0.0065, 0.007), 'chrome', m.clone().multiply(new THREE.Matrix4().makeTranslation(len - 0.02, Math.cos(ang) * 0.048, Math.sin(ang) * 0.048)));
    }
    return b.build();
  },

  /** Solid halfshaft bar with splined ends and boot grooves (CV joints are separate parts). */
  drivetrain_halfShaftBar(pts, r) {
    const { a, dir, len } = shaftFrame(pts);
    const R = clamp(r, 0.012, 0.02);
    const b = new PartBuilder();
    const m = placeAlong(a, dir);
    b.addMatrix(latheX([[R * 0.85, 0], [R * 0.85, 0.035], [R, 0.045], [R, len - 0.045], [R * 0.85, len - 0.035], [R * 0.85, len]], 18), 'black', m);
    for (const x of [0.012, len - 0.012]) b.addMatrix(cylX(R * 0.9, 0.022, 12), 'machined', m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0, 0)));
    return b.build();
  },

  /** Remote shift lever: bent steel lever, pivot collar, threaded top. */
  drivetrain_shiftLever(pts, r) {
    const rr = clamp(r, 0.006, 0.01);
    const b = new PartBuilder();
    const curve = curveFrom(pts);
    b.add(tubeAlong(curve, rr, null, 12), 'satin');
    const p0 = pts[0], d0 = curve.getTangentAt(0);
    b.addMatrix(cylX(0.5, 1, 18), 'machined', alignX(p0.clone().addScaledVector(d0, 0.005), p0.clone().addScaledVector(d0, 0.025), rr * 3.2));
    const p1 = pts[pts.length - 1], d1 = curve.getTangentAt(1);
    b.addMatrix(cylX(0.5, 1, 10), 'chrome', alignX(p1, p1.clone().addScaledVector(d1, 0.02), rr * 1.6));
    return b.build();
  },

  /** External shift rod with rubber-isolated eyes at both ends. */
  drivetrain_shiftRod(pts, r) {
    const rr = clamp(r, 0.005, 0.01);
    const b = new PartBuilder();
    const a = pts[0], z = pts[pts.length - 1];
    b.add(tubeAlong(curveFrom([a.clone().lerp(pts[1], 0.15), ...pts.slice(1, -1), z.clone().lerp(pts[pts.length - 2], 0.15)]), rr, null, 10), 'satin');
    for (const [p, q] of [[a, pts[1]], [z, pts[pts.length - 2]]]) {
      const d = V().subVectors(p, q).normalize();
      const side = V().crossVectors(d, V(0, 1, 0)).normalize();
      const m = new THREE.Matrix4().lookAt(V(), side, d);
      m.setPosition(p);
      b.addMatrix(new THREE.TorusGeometry(rr * 1.9, rr * 0.8, 8, 18), 'satin', m);
      b.addMatrix(cylX(0.5, 1, 14), 'rubber', new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), side), V(rr * 2.4, rr * 3.4, rr * 3.4)));
    }
    return b.build();
  },
};

// ------------------------------------------------------------------ WHOLE (component union box)
const whole = {
  /** Hanging clutch pedal: pivot boss at the top, curved arm, rubber pad, pushrod clevis. */
  drivetrain_clutchPedal(min, max) {
    const b = new PartBuilder();
    const s = V().subVectors(max, min);
    const piv = V(min.x + s.x * 0.25, max.y - 0.02, 0);
    const pad = V(max.x - 0.02, min.y + 0.035, 0);
    const mid = V(min.x + s.x * 0.45, min.y + s.y * 0.45, 0);
    b.add(cylZ(0.018, Math.min(0.05, s.z * 0.6), 18), 'machined', piv.toArray());
    const curve = curveFrom([piv, mid, pad]);
    b.add(ribbonAlong(curve, 0.022, 0.008), 'black');
    b.add(box(0.012, 0.055, Math.min(0.075, s.z * 0.85), 0.006), 'rubber', [pad.x + 0.004, pad.y, 0], [0, 0, 0.35]);
    const clev = V(piv.x - 0.01, piv.y - 0.05, 0);
    b.addMatrix(cylX(0.5, 1, 12), 'chrome', alignX(clev, V(min.x, clev.y + 0.02, 0), 0.01));
    return b.build();
  },
};

// ------------------------------------------------------------------ rules
export default {
  // [RegExp on component id, generatorName, options] — checked before the built-in rules
  rules: [
    [/^drivetrain\.bellhousing\.bellhousing$/, 'drivetrain_bellhousing', { prim: true, axis: 'x' }],
    [/^drivetrain\.bellhousing\.inspection-cover$/, 'drivetrain_inspectionCover'],
    [/^drivetrain\.flywheel-clutch\.flywheel$/, 'drivetrain_flywheel', { axis: 'x' }],
    [/^drivetrain\.flywheel-clutch\.starter-ring-gear$/, 'drivetrain_ringGear', { axis: 'x' }],
    [/^drivetrain\.flywheel-clutch\.clutch-disc-pack$/, 'drivetrain_twinDiscPack', { prim: true, axis: 'x' }],
    [/^drivetrain\.flywheel-clutch\.pressure-plate$/, 'drivetrain_pressurePlate', { axis: 'x' }],
    [/^drivetrain\.flywheel-clutch\.pilot-bearing$/, 'drivetrain_pilotBearing', { axis: 'x' }],
    [/^drivetrain\.clutch-hydraulics\.master-cylinder$/, 'drivetrain_clutchMaster', { axis: 'x' }],
    [/^drivetrain\.clutch-hydraulics\.release-bearing$/, 'drivetrain_csc', { axis: 'x' }],
    [/^drivetrain\.clutch-hydraulics\.clutch-pedal$/, 'drivetrain_clutchPedal', { whole: true }],
    [/^drivetrain\.clutch-hydraulics\.pressure-line$/, 'hardline'],
    [/^drivetrain\.clutch-hydraulics\.reservoir-hose$/, 'hose'],
    [/^drivetrain\.clutch-hydraulics\.bulkhead-fitting$/, 'drivetrain_anFitting', { perPart: true }],
    [/^drivetrain\.transmission\.transmission$/, 'drivetrain_tr6060', { prim: true }],
    [/^drivetrain\.transmission\.output-flange$/, 'drivetrain_armFlange', { axis: 'x', perPart: true }],
    [/^drivetrain\.rear-differential\.pinion-flange$/, 'drivetrain_armFlange', { axis: 'x', perPart: true }],
    [/^drivetrain\.transmission\.vent-tube$/, 'hose'],
    [/^drivetrain\.trans-mount-crossmember\.crossmember$/, 'drivetrain_crossmember', { prim: true }],
    [/^drivetrain\.trans-mount-crossmember\.transmission-mount$/, 'drivetrain_transMount'],
    [/^drivetrain\.trans-mount-crossmember\.mount-bracket$/, 'drivetrain_mountBracket'],
    [/^drivetrain\.driveshaft\.(front|rear)-driveshaft$/, 'drivetrain_propShaft', { perPart: true }],
    [/^drivetrain\.driveshaft\.one-piece-driveshaft$/, 'drivetrain_carbonShaft'],
    [/^drivetrain\.driveshaft\.(front|rear)-flex-coupler$/, 'drivetrain_guibo', { axis: 'x' }],
    [/^drivetrain\.driveshaft\.center-support-bearing$/, 'drivetrain_centerBearing', { prim: true }],
    [/^drivetrain\.driveshaft\.cv-flange-adapter$/, 'drivetrain_cvFlange', { axis: 'x' }],
    [/^drivetrain\.driveshaft\.safety-loop$/, 'drivetrain_safetyLoop', { axis: 'x' }],
    [/^drivetrain\.driveshaft\.tunnel-heat-shield$/, 'drivetrain_tunnelShield'],
    [/^drivetrain\.rear-differential\.differential-assembly$/, 'drivetrain_diffHousing', { prim: true }],
    [/^drivetrain\.rear-differential\.cover-and-gasket$/, 'drivetrain_diffCover'],
    [/^drivetrain\.rear-differential\.ring-and-pinion$/, 'drivetrain_ringPinion', { axis: 'z' }],
    [/^drivetrain\.rear-differential\.elsd-actuator$/, 'drivetrain_elsdActuator'],
    [/^drivetrain\.rear-differential\.(front-mount-bushings|rear-mount-bushing)$/, 'drivetrain_bushing'],
    [/^drivetrain\.rear-differential\.vent$/, 'hose'],
    [/^drivetrain\.halfshafts\.halfshaft$/, 'drivetrain_halfShaftBar'],
    [/^drivetrain\.halfshafts\.inner-cv-joint$/, 'drivetrain_innerCV', { axis: 'z' }],
    [/^drivetrain\.halfshafts\.outer-cv-joint$/, 'drivetrain_outerCV', { axis: 'z' }],
    [/^drivetrain\.halfshafts\.cv-boots$/, 'drivetrain_cvBoot', { axis: 'z', usesPos: true }],
    [/^drivetrain\.halfshafts\.boot-clamps$/, 'drivetrain_bootClamp', { axis: 'z', usesPos: true }],
    [/^drivetrain\.shifter\.shifter-assembly$/, 'drivetrain_remoteShifter', { shapes: ['box'] }],
    [/^drivetrain\.shifter\.shifter-assembly$/, 'drivetrain_shiftLever', { shapes: ['tube'] }],
    [/^drivetrain\.shifter\.shift-rod$/, 'drivetrain_shiftRod'],
    [/^drivetrain\.shifter\.shift-knob$/, 'drivetrain_shiftKnob', { axis: 'y' }],
    [/^drivetrain\.shifter\.shift-boots$/, 'boot', { axis: 'y' }],
    [/^drivetrain\.shifter\.pneumatic-actuator$/, 'drivetrain_pneumaticActuator', { axis: 'x' }],
    [/^drivetrain\.shifter\.air-supply$/, 'drivetrain_airTank', { axis: 'x' }],
    [/^drivetrain\.coolers\.(trans|diff)-cooler$/, 'drivetrain_oilCooler'],
    [/^drivetrain\.coolers\.(trans|diff)-cooler-pump$/, 'drivetrain_oilPump', { axis: 'x' }],
    [/^drivetrain\.coolers\.(trans|diff)-thermostat$/, 'drivetrain_thermostat'],
    [/^drivetrain\.coolers\.(trans|diff)-cooler-lines$/, 'braided'],
    [/^drivetrain\.coolers\.(trans|diff)-cooler-fittings$/, 'drivetrain_anFitting'],
    [/^drivetrain\.coolers\.inline-filters$/, 'drivetrain_inlineFilter', { axis: 'x' }],
    [/^drivetrain\.coolers\.cooler-ducting$/, 'drivetrain_coolerDuct'],
  ],
  axial,
  boxes,
  paths,
  whole,
};
