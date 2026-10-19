// Spinning 3D previews of single parts, drawn by one shared offscreen renderer into many
// 2D canvases (part lists, catalog grid, the inspector's big preview).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { finishMaterial } from '../parts/finishes.js';

let viewer = null;
let renderer, scene, camera;
const cards = new Set(); // { canvas, ctx, id, obj, visible, angle, drag, size }
const objCache = new Map();
let observer;
let last = performance.now();

export function initPreviews(v) {
  viewer = v;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(2, 3, 2);
  scene.add(key, new THREE.HemisphereLight(0xdde6ff, 0x30343c, 0.7));
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) for (const c of cards) if (c.canvas === e.target) c.visible = e.isIntersecting;
  });
  requestAnimationFrame(loop);
}

/** A normalized clone of a component's 3D model (unit-sized, centred, real materials). */
function partObject(id) {
  if (objCache.has(id)) return objCache.get(id);
  const sources = [];
  const g = viewer.compGroups.get(id);
  if (g && g.children.length) {
    // Show ONE physical copy: the first piece plus anything within 35 cm of it
    // (so a pair of calipers or 20 lug nuts previews as one part; qty is listed separately).
    const centre = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
    const first = centre(g.children[0]);
    for (const child of g.children) if (child === g.children[0] || centre(child).distanceTo(first) < 0.35) sources.push(child);
  }
  for (const r of viewer.routeMeshes) if (r.userData.compId === id) sources.push(r.children[0]);
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
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  holder.position.copy(center).multiplyScalar(-1);
  pivot.add(holder);
  pivot.userData.radius = Math.max(size.length() / 2, 0.01);
  pivot.userData.size = size;
  objCache.set(id, pivot);
  return pivot;
}

export function clearPreviewCache() {
  objCache.clear();
}

/**
 * Create a canvas that shows the part spinning. Drag on it to turn the part by hand.
 * Returns the canvas element (sized via CSS; internal resolution `px`).
 */
export function previewCanvas(id, px = 160, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = px; canvas.height = Math.round(px * (opts.aspect || 1));
  canvas.className = 'part-preview';
  const card = { canvas, ctx: canvas.getContext('2d'), id, visible: false, angle: Math.random() * Math.PI * 2, tilt: 0.42, drag: null, px, aspect: opts.aspect || 1, speed: opts.speed ?? 0.6, dirty: true };
  canvas.addEventListener('pointerdown', (e) => { card.drag = { x: e.clientX, y: e.clientY, a: card.angle, t: card.tilt }; canvas.setPointerCapture(e.pointerId); e.stopPropagation(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!card.drag) return;
    card.angle = card.drag.a + (e.clientX - card.drag.x) * 0.012;
    card.tilt = Math.max(-1.2, Math.min(1.2, card.drag.t + (e.clientY - card.drag.y) * 0.01));
  });
  const end = () => { card.drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  cards.add(card);
  observer?.observe(canvas);
  return canvas;
}

function drawCard(c) {
  const obj = partObject(c.id);
  const w = c.canvas.width, h = c.canvas.height;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) renderer.setSize(w, h, false);
  c.ctx.clearRect(0, 0, w, h);
  if (!obj) {
    c.ctx.fillStyle = '#6d7686';
    c.ctx.font = `${Math.round(w / 14)}px Inter, sans-serif`;
    c.ctx.textAlign = 'center';
    c.ctx.fillText('No 3D model', w / 2, h / 2);
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
  camera.near = dist / 50; camera.far = dist * 4;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  scene.remove(obj);
  c.ctx.drawImage(renderer.domElement, 0, 0);
}

let rr = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // forget canvases that left the page
  for (const c of cards) if (!c.canvas.isConnected) { observer.unobserve(c.canvas); cards.delete(c); }
  const vis = [...cards].filter((c) => c.visible);
  // the large (inspector) preview every frame; small ones round-robin, ~10 per frame
  const big = vis.filter((c) => c.px >= 300);
  const small = vis.filter((c) => c.px < 300);
  for (const c of vis) if (!c.drag) c.angle += dt * c.speed;
  for (const c of big) drawCard(c);
  const n = Math.min(small.length, 10);
  for (let i = 0; i < n; i++) drawCard(small[(rr + i) % small.length]);
  rr = small.length ? (rr + n) % small.length : 0;
  requestAnimationFrame(loop);
}
