// 3D previews of single parts, drawn by one shared offscreen renderer into 2D canvases.
// Canvases are only created for cards near the screen (big catalogs stay light), only visible
// ones are drawn, and nothing animates when rotation is paused or reduced motion is on.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { finishMaterial } from '../parts/finishes.js';
import { state, on } from '../state.js';

let viewer = null;
let renderer, scene, camera;
const cards = new Set();
const objCache = new Map();
let visObserver, nearObserver;
let last = performance.now();
let running = false;
const SMALL = 176; // one fixed size for all thumbnails (no renderer resizing per card)
const BIG_W = 640, BIG_H = 384;

export function initPreviews(v) {
  viewer = v;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    renderer = null;
    return;
  }
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 3, 2);
  scene.add(key, new THREE.HemisphereLight(0xdde6ff, 0x30343c, 0.7));
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  visObserver = new IntersectionObserver((entries) => {
    for (const e of entries) for (const c of cards) if (c.canvas === e.target) { c.visible = e.isIntersecting; c.dirty = true; }
    wake();
  });
  nearObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const slot = e.target;
      if (e.isIntersecting && !slot.firstChild) attach(slot);
      else if (!e.isIntersecting && slot.firstChild) detach(slot);
    }
  }, { rootMargin: '300px' });
  on('change:spin', wake);
  document.addEventListener('visibilitychange', wake);
  wake();
}

/** A normalized clone of one physical copy of a part (real materials). */
function partObject(id) {
  if (objCache.has(id)) return objCache.get(id);
  const sources = [];
  const g = viewer?.compGroups.get(id);
  if (g && g.children.length) {
    const centre = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const first = centre(g.children[0]);
    for (const child of g.children) if (child === g.children[0] || centre(child).distanceTo(first) < 0.35) sources.push(child);
  }
  if (viewer) for (const r of viewer.routeMeshes) if (r.userData.compId === id) sources.push(r.children[0]);
  if (!sources.length) { objCache.set(id, null); return null; }
  const holder = new THREE.Group();
  for (const src of sources) {
    const c = src.clone(true);
    c.traverse((o) => {
      if (!o.isMesh) return;
      o.visible = true;
      o.material = o.userData.colorMat && !o.userData.finish ? o.userData.colorMat : finishMaterial(o.userData.finish || 'steel');
    });
    c.visible = true;
    holder.add(c);
  }
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  holder.position.copy(center).multiplyScalar(-1);
  pivot.add(holder);
  pivot.userData.radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.01);
  objCache.set(id, pivot);
  return pivot;
}

export function clearPreviewCache() {
  objCache.clear();
}

function makeCard(id, big) {
  const canvas = document.createElement('canvas');
  canvas.width = big ? BIG_W : SMALL;
  canvas.height = big ? BIG_H : SMALL;
  canvas.className = 'part-preview';
  canvas.setAttribute('role', 'img');
  const name = state.byId.get(id)?.displayName || 'part';
  canvas.setAttribute('aria-label', `3D view of ${name}. Drag sideways to turn it.`);
  const card = { canvas, ctx: canvas.getContext('2d'), id, big, visible: false, angle: 0.6 + Math.random() * 1.2, tilt: 0.42, drag: null, dirty: true };
  // horizontal drags turn the part; vertical swipes scroll the page
  canvas.addEventListener('pointerdown', (e) => { card.drag = { x: e.clientX, y: e.clientY, a: card.angle, t: card.tilt, active: false }; });
  canvas.addEventListener('pointermove', (e) => {
    const d = card.drag;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { card.drag = null; return; }
      d.active = true;
      canvas.setPointerCapture(e.pointerId);
    }
    card.angle = d.a + dx * 0.012;
    card.tilt = Math.max(-1.2, Math.min(1.2, d.t + dy * 0.008));
    card.dirty = true;
    wake();
  });
  const end = () => { card.drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { card.angle += e.key === 'ArrowLeft' ? -0.3 : 0.3; card.dirty = true; wake(); e.preventDefault(); }
  });
  canvas.tabIndex = 0;
  return card;
}

function attach(slot) {
  const card = makeCard(slot.dataset.id, slot.dataset.big === '1');
  slot.appendChild(card.canvas);
  cards.add(card);
  visObserver?.observe(card.canvas);
}

function detach(slot) {
  for (const c of cards) if (c.canvas.parentNode === slot) { visObserver.unobserve(c.canvas); cards.delete(c); }
  slot.replaceChildren();
}

/** A slot that gets its 3D canvas only when it scrolls near the screen. */
export function previewSlot(id, big = false) {
  const slot = document.createElement('div');
  slot.className = 'preview-slot';
  slot.style.cssText = 'width:100%;height:100%';
  slot.dataset.id = id;
  slot.dataset.big = big ? '1' : '';
  if (!renderer) {
    slot.innerHTML = '<span style="font-size:12px;color:var(--text-3)">3D preview unavailable</span>';
    return slot;
  }
  if (big) attach(slot);
  else {
    nearObserver.observe(slot);
    // sheets that resize or slide in do not always re-trigger the observer: check once it is laid out
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (slot.firstChild || !slot.isConnected) return;
      const r = slot.getBoundingClientRect();
      if (r.width && r.bottom > -300 && r.top < innerHeight + 300) attach(slot);
    }));
  }
  return slot;
}

function drawCard(c) {
  const obj = partObject(c.id);
  const w = c.canvas.width, h = c.canvas.height;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) renderer.setSize(w, h, false);
  c.ctx.clearRect(0, 0, w, h);
  if (!obj) {
    c.ctx.fillStyle = '#8b94a5';
    c.ctx.font = `${Math.round(w / 13)}px Inter, sans-serif`;
    c.ctx.textAlign = 'center';
    c.ctx.fillText('No 3D shape', w / 2, h / 2);
    return;
  }
  scene.add(obj);
  obj.rotation.set(0, c.angle, 0);
  const r = obj.userData.radius;
  camera.aspect = w / h;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = (r / Math.sin(fov / 2)) * (camera.aspect < 1 ? 1 / camera.aspect : 1) * 0.92;
  camera.position.set(0, Math.sin(c.tilt) * dist, Math.cos(c.tilt) * dist);
  camera.lookAt(0, 0, 0);
  camera.near = dist / 50;
  camera.far = dist * 4;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  scene.remove(obj);
  c.ctx.drawImage(renderer.domElement, 0, 0);
  c.dirty = false;
}

function wake() {
  if (!running && renderer) { running = true; last = performance.now(); requestAnimationFrame(loop); }
}

let rr = 0;
let bigClock = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (const c of cards) if (!c.canvas.isConnected) { visObserver.unobserve(c.canvas); cards.delete(c); }
  const spin = state.spin && !state.reducedMotion && !document.hidden;
  const vis = [...cards].filter((c) => c.visible);
  if (spin) for (const c of vis) if (!c.drag) { c.angle += dt * (c.big ? 0.45 : 0.6); c.dirty = true; }
  bigClock += dt;
  const bigFrame = bigClock >= 1 / 30; // the big preview runs at 30 fps
  if (bigFrame) bigClock = 0;
  for (const c of vis) if (c.big && c.dirty && (bigFrame || !spin)) drawCard(c);
  const small = vis.filter((c) => !c.big && c.dirty);
  const n = Math.min(small.length, 8);
  for (let i = 0; i < n; i++) drawCard(small[(rr + i) % small.length]);
  rr = small.length ? (rr + n) % small.length : 0;
  if (vis.some((c) => c.dirty) || (spin && vis.length)) requestAnimationFrame(loop);
  else running = false;
}
