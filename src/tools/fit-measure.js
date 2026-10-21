// Dev tool (not shipped): measures every part piece against the body skin and proposes a fit
// (uniform shrink about the piece centre + small shift) so nothing pokes through the shell.
// The body is rendered from five sides into position maps (front, rear, top, left, right);
// openings such as the grille or wheel arches are bridged, so parts behind them count as inside.
// Run on the dev server: await __app.viewer.loadBody('./models/camaro.glb'); (await import('/src/tools/fit-measure.js')).measure()
import * as THREE from 'three';
import { BODY_GROUPS } from '../viewer.js';

const R = 0.005; // metres per pixel
const B = { x0: -1.3, x1: 4.2, y0: -0.05, y1: 1.6, z0: -1.15, z1: 1.15 };
const EXEMPT = /^(body\.(panels|glass-and-lexan|mirrors|paint-wrap)\.|body\.lighting-housings\.(headlamps|tail-lamps)|wheels\.)|^aero\.(rear-wing|side-skirts|rear-diffuser|undertray|dive-planes-canards)\.|^aero\.front-splitter\.(splitter-blade|air-dam|skid-blocks)|^aero\.ducts-and-vents\.(hood-extractor|fender-louvers)|^safety\.tow-hooks\.|tow-(point|eye)|antenna|exhaust-tip|tailpipe/;

const posMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: 'varying vec3 vw; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vw = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'varying vec3 vw; void main(){ gl_FragColor = vec4(vw, 1.0); }',
});

function renderPos(renderer, scene, cam, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType });
  const prev = renderer.getRenderTarget();
  const tm = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  scene.overrideMaterial = posMat;
  renderer.render(scene, cam);
  scene.overrideMaterial = null;
  const buf = new Float32Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  renderer.setRenderTarget(prev);
  renderer.toneMapping = tm;
  rt.dispose();
  return buf;
}

/**
 * Depth along one axis per pixel (the skin facing that direction). Pixels that look deep into an opening
 * (or see nothing but lie inside the outline) take the shallowest skin in a window around them.
 */
function skin(buf, w, h, axis, sign, win) {
  const d = new Float32Array(w * h).fill(NaN);
  for (let i = 0; i < w * h; i++) if (buf[i * 4 + 3] > 0) d[i] = buf[i * 4 + axis];
  // shallowest = most toward the viewer: sign -1 => min value (front, looking +x), +1 => max (top, looking -y)
  const better = sign < 0 ? Math.min : Math.max;
  const out = new Float32Array(d);
  const near = new Float32Array(w * h).fill(NaN);
  // separable window extreme
  const tmp = new Float32Array(w * h).fill(NaN);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = NaN;
    for (let k = -win; k <= win; k++) { const v = d[y * w + Math.min(w - 1, Math.max(0, x + k))]; if (!Number.isNaN(v)) m = Number.isNaN(m) ? v : better(m, v); }
    tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = NaN;
    for (let k = -win; k <= win; k++) { const v = tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]; if (!Number.isNaN(v)) m = Number.isNaN(m) ? v : better(m, v); }
    near[y * w + x] = m;
  }
  for (let i = 0; i < w * h; i++) {
    const nb = near[i];
    if (Number.isNaN(nb)) continue;
    const deep = Number.isNaN(d[i]) || Math.abs(d[i] - nb) > 0.12;
    if (deep) out[i] = nb; // bridge the opening at the level of the skin around it
  }
  return out;
}

export function measure(opts = {}) {
  const v = window.__app.viewer;
  // the app no longer loads the single reference mesh; load it first: await __app.viewer.loadBody('./models/camaro.glb')
  if (!v.bodyNodes) throw new Error("Reference body not loaded: await __app.viewer.loadBody('./models/camaro.glb')");
  const scene = new THREE.Scene();
  const wheelNames = new Set(BODY_GROUPS.Wheels || []);
  v.bodyRoot.updateMatrixWorld(true);
  for (const [name, node] of v.bodyNodes) {
    if (wheelNames.has(name)) continue;
    node.traverse((o) => {
      if (!o.isMesh) return;
      const mm = new THREE.Mesh(o.geometry);
      mm.matrixAutoUpdate = false;
      mm.matrix.copy(o.matrixWorld);
      mm.matrixWorld.copy(o.matrixWorld);
      scene.add(mm);
    });
  }
  const NX = Math.round((B.x1 - B.x0) / R), NY = Math.round((B.y1 - B.y0) / R), NZ = Math.round((B.z1 - B.z0) / R);
  const ortho = (l, r, t, b) => new THREE.OrthographicCamera(l, r, t, b, 0.01, 20);
  const views = {};
  const mk = (name, cam, w, h, axis, sign, win) => { cam.updateProjectionMatrix(); cam.updateMatrixWorld(); views[name] = { w, h, skin: skin(renderPos(v.renderer, scene, cam, w, h), w, h, axis, sign, win) }; };
  // front: camera at -x looking +x. screen right = -z? set up so that column = z index ascending
  let c = ortho(B.z0, B.z1, B.y1, B.y0); c.position.set(-10, 0, 0); c.up.set(0, 1, 0); c.lookAt(0, 0, 0);
  mk('front', c, NZ, NY, 0, -1, 12);
  c = ortho(B.z0, B.z1, B.y1, B.y0); c.position.set(10, 0, 0); c.up.set(0, 1, 0); c.lookAt(0, 0, 0);
  mk('rear', c, NZ, NY, 0, 1, 12);
  c = ortho(B.x0, B.x1, B.z1, B.z0); c.position.set(0, 10, 0); c.up.set(0, 0, -1); c.lookAt(0, 0, 0);
  mk('top', c, NX, NZ, 1, 1, 8);
  c = ortho(B.x0, B.x1, B.y1, B.y0); c.position.set(0, 0, 10); c.up.set(0, 1, 0); c.lookAt(0, 0, 0);
  mk('left', c, NX, NY, 2, 1, 14);
  c = ortho(-B.x1, -B.x0, B.y1, B.y0); c.position.set(0, 0, -10); c.up.set(0, 1, 0); c.lookAt(0, 0, 0);
  mk('right', c, NX, NY, 2, -1, 14);

  // pixel lookups, orientation found by probing the rendered maps with world coordinates
  const px = (u, lo, hi, n) => Math.round(((u - lo) / (hi - lo)) * (n - 1));
  const look = {
    // camera at -x looking +x with up +y: screen right is -z (left-handed view), so column = flipped z
    front: (x, y, z) => views.front.skin[px(y, B.y0, B.y1, NY) * NZ + px(z, B.z0, B.z1, NZ)],
    rear: (x, y, z) => views.rear.skin[px(y, B.y0, B.y1, NY) * NZ + (NZ - 1 - px(z, B.z0, B.z1, NZ))],
    top: (x, y, z) => views.top.skin[(NZ - 1 - px(z, B.z0, B.z1, NZ)) * NX + px(x, B.x0, B.x1, NX)],
    left: (x, y, z) => views.left.skin[px(y, B.y0, B.y1, NY) * NX + px(x, B.x0, B.x1, NX)],
    right: (x, y, z) => views.right.skin[px(y, B.y0, B.y1, NY) * NX + (NX - 1 - px(x, B.x0, B.x1, NX))],
  };
  const TOL = 0.012;
  const ok = (v2) => v2 !== undefined;
  /** how far a point sits outside the skin (0 = inside). Underbody (below the skin line) only checks top. */
  const outside = (p) => {
    const [x, y, z] = p;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1 || y > B.y1) return 1;
    if (y < 0.01) return 0.01 - y;
    let e = 0;
    const t = look.top(x, y, z);
    if (!ok(t) || Number.isNaN(t)) return 0.2; // outside the footprint
    e = Math.max(e, y - t - TOL);
    // each view only counts where it hits the near end/side of the car (under the car it sees the far end)
    const f = look.front(x, y, z);
    if (!Number.isNaN(f) && f < 0.3) e = Math.max(e, f - x - TOL);
    const r = look.rear(x, y, z);
    if (!Number.isNaN(r) && r > 2.5) e = Math.max(e, x - r - TOL);
    // wheel arches: suspension and brakes live there; only the outer tyre line limits them
    const arch = [0, 2.811].some((xc) => Math.hypot(x - xc, y - 0.37) < 0.5) && Math.abs(z) < 1.0;
    if (arch) return Math.max(0, e);
    if (z >= 0) { const l = look.left(x, y, z); if (!Number.isNaN(l) && l > 0.4) e = Math.max(e, z - l - TOL); }
    else { const s = look.right(x, y, z); if (!Number.isNaN(s) && s < -0.4) e = Math.max(e, s - z - TOL); }
    return Math.max(0, e);
  };
  window.__fitOutside = outside;
  window.__fitLook = look;
  if (opts.probeOnly) return {};

  const out = {};
  const report = [];
  const tmp = new THREE.Vector3();
  for (const [id, g] of v.compGroups) {
    if (EXEMPT.test(id)) continue;
    g.updateMatrixWorld(true);
    for (const piece of g.children) {
      const pts = [];
      piece.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        const step = Math.max(1, Math.floor(pos.count / 160));
        for (let i = 0; i < pos.count; i += step) { tmp.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); pts.push([tmp.x, tmp.y, tmp.z]); }
      });
      if (!pts.length) continue;
      const score = (arr) => { let n = 0, m = 0; for (const p of arr) { const e = outside(p); if (e > 0) n++; if (e > m) m = e; } return { f: n / arr.length, m }; };
      const s0 = score(pts);
      if (s0.f <= 0.03 && s0.m < 0.03) continue;
      const cen = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
      const toward = [1.4 - cen[0], 0.55 - cen[1], -cen[2]];
      const tl = Math.hypot(...toward) || 1;
      const sz = Math.sign(cen[2]) || 1;
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -sz], toward.map((q) => q / tl), [0.7, -0.7, 0], [-0.7, -0.7, 0], [0, -0.7, -0.7 * sz]];
      let best = { cost: 9, s: 1, t: [0, 0, 0], ...s0 };
      const good = (r2) => r2.f <= 0.02 && r2.m < 0.02;
      for (let s = 1; s >= 0.45; s -= 0.05) {
        for (const d of dirs) {
          for (let k = 0; k <= 30; k++) {
            const dist = k * 0.01;
            const cost = dist + (1 - s) * 0.6;
            if (good(best) && cost >= best.cost) break;
            const moved = pts.map((p) => [cen[0] + s * (p[0] - cen[0]) + d[0] * dist, cen[1] + s * (p[1] - cen[1]) + d[1] * dist, cen[2] + s * (p[2] - cen[2]) + d[2] * dist]);
            const r2 = score(moved);
            if ((good(r2) && (!good(best) || cost < best.cost)) || (!good(best) && r2.f + r2.m < best.f + best.m)) best = { cost, s, t: d.map((q) => q * dist), ...r2 };
            if (good(r2)) break;
          }
        }
      }
      if (best.s === 1 && best.t.every((q) => Math.abs(q) < 0.005)) continue;
      const key = `${id}|${piece.userData.fitKey}`;
      out[key] = { s: Math.round(best.s * 100) / 100, t: best.t.map((q) => Math.round(q * 1000) / 1000) };
      report.push(`${(s0.f * 100).toFixed(0).padStart(3)}% out (max ${(s0.m * 100).toFixed(0)}cm) -> ${(best.f * 100).toFixed(0)}%  s=${out[key].s} t=${out[key].t}  ${key}`);
    }
  }
  return { out, report };
}
