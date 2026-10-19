// Geometry helpers for procedural part generators.
// A PartBuilder collects primitives per finish and merges them, so each generated part is
// one draw call per finish.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function normalize(g) {
  let out = g.index ? g.toNonIndexed() : g;
  if (out === g) out = g.clone();
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.morphAttributes = {};
  out.clearGroups();
  return out;
}

export class PartBuilder {
  constructor() {
    this.byFinish = new Map();
  }

  /** add(geometry, finish, position, rotation(euler rad), scale) */
  add(geo, finish, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    const g = normalize(geo);
    _e.set(r[0], r[1], r[2]);
    _q.setFromEuler(_e);
    _m.compose(V(p[0], p[1], p[2]), _q, V(s[0], s[1], s[2]));
    g.applyMatrix4(_m);
    if (!this.byFinish.has(finish)) this.byFinish.set(finish, []);
    this.byFinish.get(finish).push(g);
    return this;
  }

  /** Add a geometry that is already transformed by a full matrix. */
  addMatrix(geo, finish, matrix) {
    const g = normalize(geo);
    g.applyMatrix4(matrix);
    if (!this.byFinish.has(finish)) this.byFinish.set(finish, []);
    this.byFinish.get(finish).push(g);
    return this;
  }

  build() {
    const group = new THREE.Group();
    for (const [finish, list] of this.byFinish) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo);
      mesh.userData.finish = finish;
      group.add(mesh);
    }
    return group;
  }
}

// ---------- primitive factories (all centered at origin) ----------

/** Cylinder along X. */
export function cylX(r, len, seg = 24, r2 = r, open = false) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, open);
  g.rotateZ(-Math.PI / 2);
  return g;
}
export function cylY(r, len, seg = 24, r2 = r) {
  return new THREE.CylinderGeometry(r2, r, len, seg);
}
export function cylZ(r, len, seg = 24, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  g.rotateX(Math.PI / 2);
  return g;
}
export function hexX(r, len) {
  return cylX(r, len, 6);
}
export function box(sx, sy, sz, radius = null) {
  const m = Math.min(sx, sy, sz);
  const rr = radius == null ? Math.min(0.008, m * 0.25) : Math.min(radius, m * 0.49);
  if (rr < 0.0015) return new THREE.BoxGeometry(sx, sy, sz);
  return new RoundedBoxGeometry(sx, sy, sz, 2, rr);
}
export function sphere(r, ws = 20, hs = 14) {
  return new THREE.SphereGeometry(r, ws, hs);
}
/** Torus whose hole axis is X. R = ring radius, t = tube radius. */
export function torusX(R, t, rs = 10, ts = 36) {
  const g = new THREE.TorusGeometry(R, t, rs, ts);
  g.rotateY(Math.PI / 2);
  return g;
}
/** Lathe around X axis from [radius, x] profile points. */
export function latheX(profile, seg = 32) {
  const pts = profile.map(([r, x]) => new THREE.Vector2(Math.max(0.0001, r), x));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
/** Annulus (ring) along X with thickness t. */
export function ringX(ro, ri, t, seg = 40) {
  const shape = new THREE.Shape().absarc(0, 0, ro, 0, Math.PI * 2);
  shape.holes.push(new THREE.Path().absarc(0, 0, ri, 0, Math.PI * 2, true));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: seg });
  g.translate(0, 0, -t / 2);
  g.rotateY(Math.PI / 2);
  return g;
}
/** Extrude a THREE.Shape (in the YZ plane after rotation) along X. */
export function extrudeX(shape, t, curveSegments = 24) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments });
  g.translate(0, 0, -t / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

export class Helix extends THREE.Curve {
  constructor(radius, length, turns) {
    super();
    this.r = radius; this.l = length; this.n = turns;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.n * Math.PI * 2;
    return target.set(-this.l / 2 + t * this.l, Math.cos(a) * this.r, Math.sin(a) * this.r);
  }
}

export function curveFrom(points) {
  const pts = points.map((p) => (p.isVector3 ? p : V(p[0], p[1], p[2])));
  if (pts.length === 2) return new THREE.LineCurve3(pts[0], pts[1]);
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
}

export function tubeAlong(curve, r, seg = null, radial = 10) {
  const len = curve.getLength();
  const s = seg || Math.min(260, Math.max(8, Math.round(len / 0.02)));
  return new THREE.TubeGeometry(curve, s, r, radial, false);
}

/** Flat ribbon (belts, harness webbing) following a curve. */
export function ribbonAlong(curve, width, thick) {
  const shape = new THREE.Shape();
  shape.moveTo(-thick / 2, -width / 2);
  shape.lineTo(thick / 2, -width / 2);
  shape.lineTo(thick / 2, width / 2);
  shape.lineTo(-thick / 2, width / 2);
  shape.closePath();
  const steps = Math.min(200, Math.max(8, Math.round(curve.getLength() / 0.02)));
  return new THREE.ExtrudeGeometry(shape, { steps, bevelEnabled: false, extrudePath: curve });
}

/** Matrix placing a unit-X object from a to b. */
export function alignX(a, b, scaleR = 1) {
  const dir = V().subVectors(b, a);
  const len = dir.length() || 1e-4;
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.clone().normalize());
  return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(len, scaleR, scaleR));
}

export { V };
