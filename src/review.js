// Dev-only review renderer (review.html, not built): draws the car exactly as the app does, for design
// reviews. scripts/review-shot.mjs drives it in headless Chrome through window.__render(opts).
//   opts.ids     part ids to review (array) — drawn in amber
//   opts.view    iso | iso2 | isoR | side | sideR | front | rear | top | under, or opts.cam + opts.target
//   opts.mode    context: whole car, see-through body, the parts in amber
//                solid:   whole car with a solid body, the parts in amber (what shows from outside)
//                isolate: only the parts and what they bolt to, close up, no body
//                car:     whole car as the app shows it at rest (no highlight)
//   opts.explode 0..1
import * as THREE from 'three';
import { state, indexDb } from './state.js';
import { Viewer } from './viewer.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
let viewer;

const DIRS = {
  iso: [-1, 0.55, 0.95], iso2: [1, 0.55, 0.95], isoR: [-1, 0.55, -0.95], isoR2: [1, 0.55, -0.95],
  side: [0.0001, 0.08, 1], sideR: [0.0001, 0.08, -1], front: [-1, 0.1, 0.0001], rear: [1, 0.12, 0.0001],
  top: [0.0001, 1, 0.0001], under: [0.0001, -1, 0.0001],
};

async function boot() {
  const db = await (await fetch(`${BASE}data/db.json`, { cache: 'no-store' })).json();
  indexDb(db);
  state.labels = false;
  state.showRoutes = true;
  state.flow = false;
  state.colorMode = 'real';
  viewer = new Viewer($('c'), { labels: $('labels'), tip: $('tip') });
  await viewer.loadBodyParts(`${BASE}models/body-parts.glb`);
  viewer.buildParts(db);
  window.__app = { viewer, state };
  window.__ready = true;
}

function boxOf(ids) {
  const b = new THREE.Box3();
  for (const id of ids) { const g = viewer.compGroups.get(id); if (g?.visible) b.expandByObject(g); }
  return b;
}

window.__render = async (opts = {}) => {
  const ids = (opts.ids || []).filter((id) => viewer.compGroups.has(id));
  const mode = opts.mode || 'context';
  state.selection = null;
  state.explode = opts.explode || 0;
  state.hiddenSystems = new Set();
  state.bodyMode = mode === 'context' ? 'ghost' : mode === 'isolate' ? 'off' : 'solid';
  viewer.applyAll({ light: true });

  const target = new Set(ids.map((id) => viewer.compGroups.get(id)));
  const near = new Set();
  if (mode === 'isolate') {
    for (const id of ids) {
      const c = state.byId.get(id);
      for (const n of c?.connectsTo || []) { const g = viewer.compGroups.get(n); if (g) near.add(g); }
    }
  }
  const amber = viewer.hlMat;
  for (const [, sg] of viewer.sysGroups) {
    for (const g of sg.children) {
      if (mode === 'isolate') g.visible = target.has(g) || (near.has(g) && !g.userData.shell);
      if (target.has(g)) { g.visible = true; g.traverse((o) => { if (o.isMesh) o.material = amber; }); }
    }
  }
  for (const r of viewer.routeMeshes) {
    const cg = r.userData.compId && viewer.compGroups.get(r.userData.compId);
    if (mode === 'isolate') r.visible = !!cg && (target.has(cg) || near.has(cg));
    if (cg && target.has(cg)) for (const o of r.userData.parts) o.material = amber;
  }
  viewer.xrayRoot.clear();
  $('labels').replaceChildren();

  // camera: around the reviewed parts (or the whole car)
  // camera: close on the reviewed parts (isolate), a little wider to show their surroundings (context/solid),
  // or the whole car (mode car, or opts.whole)
  let center = new THREE.Vector3(1.43, 0.55, 0), radius = 2.6;
  const box = ids.length && mode !== 'car' && !opts.whole ? boxOf(ids) : null;
  if (box && !box.isEmpty()) {
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    center = box.getCenter(new THREE.Vector3());
    radius = mode === 'isolate' ? Math.max(0.12, r * 1.15) : Math.min(2.6, Math.max(0.75, r * 1.5 + 0.3));
  }
  const cam = viewer.camera;
  cam.clearViewOffset();
  if (opts.cam) {
    cam.position.set(...opts.cam);
    viewer.controls.target.set(...(opts.target || center.toArray()));
  } else {
    const d = new THREE.Vector3(...(DIRS[opts.view] || DIRS.iso)).normalize();
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.08;
    cam.position.copy(center).addScaledVector(d, dist);
    viewer.controls.target.copy(center);
    cam.up.set(0, 1, 0);
    if (opts.view === 'top' || opts.view === 'under') cam.up.set(-1, 0, 0);
  }
  cam.near = 0.01;
  cam.far = 100;
  cam.updateProjectionMatrix();
  cam.lookAt(viewer.controls.target);
  viewer.renderer.render(viewer.scene, cam);
  await new Promise((r) => requestAnimationFrame(() => r()));
  viewer.renderer.render(viewer.scene, cam);
  return { ids: ids.length, mode, view: opts.view || 'cam' };
};

boot().catch((e) => { window.__error = String(e?.stack || e); });

// Raycast probe for measuring: rays [{ o: [x,y,z], d: [dx,dy,dz] }], against 'body' (the skin panels), 'all'
// parts, or a list of part ids. Returns the first hit per ray: { p: [x,y,z], id, dist } or null.
window.__probe = (rays, what = 'body') => {
  state.explode = 0;
  state.hiddenSystems = new Set();
  state.bodyMode = 'solid';
  viewer.applyAll({ light: true });
  const objs = [];
  for (const [id, g] of viewer.compGroups) {
    if (!g.visible) continue;
    const ok = what === 'all' || (what === 'body' ? g.userData.shell : Array.isArray(what) && what.includes(id));
    if (ok) g.traverse((o) => { if (o.isMesh) objs.push(o); });
  }
  const rc = new THREE.Raycaster();
  return rays.map((r) => {
    rc.set(new THREE.Vector3(...r.o), new THREE.Vector3(...r.d).normalize());
    const h = rc.intersectObjects(objs, false)[0];
    return h ? { p: h.point.toArray().map((v) => +v.toFixed(4)), id: h.object.userData.compId, dist: +h.distance.toFixed(4) } : null;
  });
};
