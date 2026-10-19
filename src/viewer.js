// 3D viewer: reference body, procedurally built parts, routes, explode, picking.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { state, on, select, neighbours, track } from './state.js';
import { kindColor } from './kinds.js';
import { makePrimitive, makeWhole, wholeRuleFor, mirrored, makeRoute } from './parts/index.js';
import { finishMaterial } from './parts/finishes.js';

// components that reuse another component's real panel mesh
const PANEL_ALIASES = { 'electrical.lighting.headlights': 'body.lighting-housings.headlamps' };

const STATUS_COLORS = { needed: '#ff4d4d', ordered: '#ffb21f', inhand: '#40a9ff', installed: '#3ddc84', none: '#4a5262' };

// Reference-body node names (from the converted ZL1 1LE mesh) grouped for toggles.
const BODY_GROUPS = {
  Shell: ['BodyShell', 'FrontFasciaLights', 'RearFasciaLights', 'RearLamps', 'DecklidWing', 'LowerTrim', 'Trim_A', 'Trim_B', 'Trim_C', 'Trim_D'],
  Hood: ['Hood'],
  Doors: ['DoorLH', 'DoorRH'],
  Interior: ['Interior'],
  Wheels: ['WheelFL', 'WheelFR', 'WheelsRear'],
};

export class Viewer {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.overlay = overlay; // { labels, tip }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.02, 200);
    this.camera.position.set(-3.6, 2.4, 4.6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.target.set(1.4, 0.45, 0);
    this.controls.minDistance = 0.25;
    this.controls.maxDistance = 25;
    this.controls.maxPolarAngle = Math.PI * 0.97;

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 6, 4);
    this.scene.add(key, new THREE.HemisphereLight(0xbfd4ff, 0x20242c, 0.6));

    // ground
    const grid = new THREE.GridHelper(14, 56, 0x2a313d, 0x1a1f27);
    grid.position.set(1.4, 0, 0);
    this.scene.add(grid);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(1.43, 0.001, 0);
    this.scene.add(shadow);

    this.bodyRoot = new THREE.Group();
    this.partsRoot = new THREE.Group();
    this.routesRoot = new THREE.Group();
    this.scene.add(this.bodyRoot, this.partsRoot, this.routesRoot);

    this.compGroups = new Map(); // comp id -> Group
    this.sysGroups = new Map(); // sys id -> Group
    this.routeMeshes = []; // { mesh, route, system }
    this.pickables = [];
    this.geoCache = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.clock = new THREE.Clock();
    this.hovered = null;
    this.flyAnim = null;

    this._initEvents();
    this._resize();
    const home = this.homePose();
    this.camera.position.copy(home.position);
    this.controls.target.copy(home.target);
    new ResizeObserver(() => this._resize()).observe(canvas.parentElement);
    this.renderer.setAnimationLoop(() => this._tick());
  }

  // ------------------------------------------------------------------ body
  async loadBody(url) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    this.bodyNodes = new Map();
    const paint = new THREE.MeshPhysicalMaterial({ color: 0x8a1712, metalness: 0.6, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
    const mats = {
      paint,
      red: new THREE.MeshStandardMaterial({ color: 0xb3161b, metalness: 0.3, roughness: 0.4 }),
      black: new THREE.MeshStandardMaterial({ color: 0x0e0f12, metalness: 0.2, roughness: 0.6 }),
      carbon: new THREE.MeshStandardMaterial({ color: 0x18191c, metalness: 0.5, roughness: 0.35 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x111820, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35 }),
      rim: new THREE.MeshStandardMaterial({ color: 0x2b2e33, metalness: 0.85, roughness: 0.3 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x151517, metalness: 0, roughness: 0.92 }),
      white: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 }),
      led: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xaa0000, roughness: 0.3 }),
      drl: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x99aabb, roughness: 0.3 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 }),
    };
    const pick = (name = '') => {
      const n = name.toLowerCase();
      if (n.includes('paint')) return mats.paint;
      if (n.includes('glass')) return mats.glass;
      if (n.includes('carbon')) return mats.carbon;
      if (n.includes('rubber')) return mats.rubber;
      if (n === 'rim') return mats.rim;
      if (n.includes('led')) return mats.led;
      if (n.includes('drl') || n.includes('feux')) return mats.drl;
      if (n.includes('leather') || n.includes('calskin')) return mats.leather;
      if (n.includes('white')) return mats.white;
      if (n.includes('red')) return mats.red;
      return mats.black;
    };
    this.ghostMat = new THREE.MeshStandardMaterial({
      color: 0x9fb4d0, transparent: true, opacity: 0.075, depthWrite: false, roughness: 0.4, metalness: 0, side: THREE.DoubleSide,
    });
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.userData.solidMat = pick(o.material?.name);
        o.material = o.userData.solidMat;
        o.userData.isBody = true;
      }
    });
    for (const child of [...gltf.scene.children]) {
      this.bodyNodes.set(child.name, child);
      this.bodyRoot.add(child);
    }
    this.applyBody();
  }

  /** Real panel meshes cut from the reference body, keyed by component id. */
  async loadBodyParts(url) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    this.panelMeshes = new Map();
    try {
      const gltf = await loader.loadAsync(url);
      const finishOf = (name = '') => {
        const n = name.toLowerCase();
        if (n.includes('paint')) return 'paint';
        if (n.includes('glass')) return 'glass';
        if (n.includes('carbon')) return 'carbon';
        if (n.includes('led') || n.includes('drl') || n.includes('feux')) return 'lens';
        if (n === 'white') return 'chrome';
        if (n.includes('red')) return 'red';
        return 'black';
      };
      for (const node of [...gltf.scene.children]) {
        node.traverse((o) => { if (o.isMesh) o.userData.finish = finishOf(o.material?.name); });
        this.panelMeshes.set(node.name, node);
      }
    } catch (e) {
      console.warn('Body panel meshes unavailable', e);
    }
  }

  applyBody() {
    const mode = state.bodyMode;
    for (const [group, names] of Object.entries(BODY_GROUPS)) {
      for (const n of names) {
        const node = this.bodyNodes?.get(n);
        if (!node) continue;
        node.visible = mode !== 'off' && state.bodyParts[group] !== false;
        node.traverse((o) => {
          if (o.isMesh) o.material = mode === 'ghost' ? this.ghostMat : o.userData.solidMat;
        });
      }
    }
  }

  // ------------------------------------------------------------------ parts
  buildParts(db) {
    this.partsRoot.clear();
    this.routesRoot.clear();
    this.compGroups.clear();
    this.sysGroups.clear();
    this.routeMeshes = [];
    this.pickables = [];

    this.sysMats = new Map();
    for (const s of db.systems) {
      const base = new THREE.Color(s.color);
      this.sysMats.set(s.id, {
        normal: s.opacity
          ? new THREE.MeshStandardMaterial({ color: base, metalness: 0.3, roughness: 0.5, transparent: true, opacity: s.opacity, depthWrite: false, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ color: base, metalness: 0.35, roughness: 0.48 }),
        dim: new THREE.MeshStandardMaterial({ color: base, transparent: true, opacity: 0.07, depthWrite: false }),
      });
      const g = new THREE.Group();
      g.name = s.id;
      g.userData.system = s;
      this.sysGroups.set(s.id, g);
      this.partsRoot.add(g);
    }
    this.hlMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, emissive: 0xff4a10, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.nbMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0x6a4300, emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.statusMats = Object.fromEntries(
      Object.entries(STATUS_COLORS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.55 })])
    );

    for (const c of db.components) {
      if (!c.model.length) continue;
      const g = new THREE.Group();
      g.name = c.id;
      g.userData.comp = c;
      const wholeGen = wholeRuleFor(c);
      const panel = this.panelMeshes?.get(PANEL_ALIASES[c.id] || c.id);
      if (panel) this._tag(g, panel.clone(), c, null);
      else if (wholeGen) for (const o of makeWhole(c, wholeGen)) this._tag(g, o, c, null);
      else c.model.forEach((m, i) => this._addPrimitive(g, m, c, i));
      if (!g.children.length) continue;
      const box = new THREE.Box3().setFromObject(g);
      g.userData.center = box.getCenter(new THREE.Vector3());
      g.userData.box = box;
      this.compGroups.set(c.id, g);
      this.sysGroups.get(c.system)?.add(g);
    }

    for (const s of db.systems) {
      const box = new THREE.Box3();
      for (const g of this.sysGroups.get(s.id).children) box.union(g.userData.box);
      this.sysGroups.get(s.id).userData.center = box.isEmpty() ? new THREE.Vector3(1.4, 0.5, 0) : box.getCenter(new THREE.Vector3());
      for (const r of s.routes) this._addRoute(r, s);
    }
    this.applyAll();
  }

  _addPrimitive(group, m, comp, index) {
    const positions = Array.isArray(m.instances) && m.instances.length ? m.instances : [m.pos || null];
    for (const p of positions) {
      const obj = makePrimitive(comp, m, p, index);
      if (!obj) continue;
      this._tag(group, obj, comp, obj.userData.plainColor);
      if (m.mirror) {
        const twin = makePrimitive(comp, m, p, index);
        if (twin) this._tag(group, mirrored(twin), comp, twin.userData.plainColor);
      }
    }
  }

  _tag(group, obj, comp, plainColor) {
    const op = state.sysById.get(comp.system)?.opacity;
    let colorMat = null;
    if (plainColor) {
      colorMat = op
        ? new THREE.MeshStandardMaterial({ color: plainColor, metalness: 0.3, roughness: 0.5, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: plainColor, metalness: 0.35, roughness: 0.5 });
    }
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.compId = comp.id;
      o.userData.system = comp.system;
      o.userData.opacity = op;
      if (colorMat) o.userData.colorMat = colorMat;
      this.pickables.push(o);
    });
    group.add(obj);
  }

  /** Skip a route when its component already draws the same run as a path model. */
  _routeDuplicated(r) {
    const c = r.componentId && state.byId.get(r.componentId);
    if (!c) return false;
    const a = r.points[0], b = r.points[r.points.length - 1];
    const near = (p, q) => p && q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.06;
    return c.model.some((m) => m.path && m.path.length >= 2 && ((near(m.path[0], a) && near(m.path[m.path.length - 1], b)) || (near(m.path[0], b) && near(m.path[m.path.length - 1], a))));
  }

  _addRoute(r, sys) {
    if (this._routeDuplicated(r)) return;
    const body = makeRoute(r, sys.id);
    if (!body) return;
    const pts = r.points.filter((q) => Array.isArray(q) && q.length === 3 && q.every((v) => Number.isFinite(+v))).map((q) => new THREE.Vector3(+q[0], +q[1], +q[2]));
    const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const radius = Math.min(0.06, Math.max(0.003, +r.radius || 0.006));
    const color = new THREE.Color(r.kind === 'mechanical' ? sys.color : kindColor(r.kind));
    const tex = this._flowTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, curve.getLength() / 0.12), 1);
    const flow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.min(300, pts.length * 16), radius * 1.35 + 0.002, 8, false),
      new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.9, depthWrite: false })
    );
    flow.visible = false;
    const root = new THREE.Group();
    root.add(body, flow);
    const kindMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.45 });
    const compId = r.componentId && state.byId.has(r.componentId) ? r.componentId : null;
    const parts = [];
    body.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.compId = compId;
      o.userData.system = sys.id;
      parts.push(o);
      this.pickables.push(o);
    });
    root.userData = { route: r, system: sys.id, compId, parts, flow, kindMat };
    this.routesRoot.add(root);
    this.routeMeshes.push(root);
  }

  _flowTexture() {
    if (this._flowTex) return this._flowTex;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 4;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, '#555'); grad.addColorStop(0.55, '#fff'); grad.addColorStop(0.7, '#fff'); grad.addColorStop(1, '#555');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 4);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this._flowTex = t;
    return t;
  }

  // ------------------------------------------------------------- appearance
  /** Recompute visibility, materials and explode offsets from state. */
  applyAll() {
    const sel = state.selection;
    const focus = this._focusSet(sel);
    const phaseLimit = state.phase >= 12 ? 99 : state.phase;
    const t = state.explode;

    for (const [sid, sg] of this.sysGroups) {
      const sysHidden = state.hiddenSystems.has(sid);
      // a hidden system still shows whatever is currently selected inside it
      const selInside = sel && (sel.type === 'system' ? sel.id === sid : sel.type === 'subsystem' ? state.subById.get(sel.id)?.system === sid : state.byId.get(sel.id)?.system === sid);
      sg.visible = !sysHidden || !!selInside;
      const sys = sg.userData.system;
      const ex = new THREE.Vector3(...sys.explode).multiplyScalar(t * 1.6);
      sg.userData.offset = ex;
      for (const g of sg.children) {
        const c = g.userData.comp;
        const shownBySel = !sysHidden || sel?.type !== 'component' || sel.id === c.id;
        g.visible = (!c.buildPhase || c.buildPhase <= phaseLimit) && shownBySel;
        const spread = g.userData.center.clone().sub(sg.userData.center).multiplyScalar(t * 0.55);
        g.position.copy(ex).add(spread);
        const mode = this._modeFor(c.id, sid, sel, focus);
        g.traverse((o) => {
          if (!o.isMesh) return;
          if (mode === 'hl') o.material = this.hlMat;
          else if (mode === 'nb') o.material = this.nbMat;
          else if (mode === 'dim') o.material = this.sysMats.get(sid).dim;
          else if (state.statusColors) o.material = this.statusMats[track(c.id).status || 'none'];
          else if (state.realColors) o.material = o.userData.colorMat || finishMaterial(o.userData.finish || 'steel', o.userData.opacity);
          else o.material = this.sysMats.get(sid).normal;
        });
      }
    }

    for (const root of this.routeMeshes) {
      const u = root.userData;
      const sid = u.system;
      const comp = u.compId ? state.byId.get(u.compId) : null;
      const phaseOk = !comp || !comp.buildPhase || comp.buildPhase <= phaseLimit;
      root.visible = state.showRoutes && !state.hiddenSystems.has(sid) && phaseOk;
      const off = this.sysGroups.get(sid)?.userData.offset || new THREE.Vector3();
      const cg = comp && this.compGroups.get(comp.id);
      root.position.copy(cg ? cg.position : off);
      const mode = this._modeFor(comp ? comp.id : null, sid, sel, focus);
      for (const o of u.parts) {
        if (mode === 'hl') o.material = this.hlMat;
        else if (mode === 'nb') o.material = this.nbMat;
        else if (mode === 'dim') o.material = this.sysMats.get(sid).dim;
        else if (state.statusColors && comp) o.material = this.statusMats[track(comp.id).status || 'none'];
        else if (state.realColors) o.material = finishMaterial(o.userData.finish || 'steel');
        else o.material = u.kindMat;
      }
      u.flow.visible = state.flow && mode !== 'dim';
    }

    // Lift the body with the body system when exploded
    const bodySys = this.sysGroups.get('body');
    this.bodyRoot.position.copy(bodySys ? bodySys.userData.offset : new THREE.Vector3(0, t * 2, 0));
    this.updateLabels();
  }

  _focusSet(sel) {
    if (!sel) return null;
    if (sel.type === 'component') return new Set(neighbours(sel.id));
    return null;
  }

  _modeFor(compId, sid, sel, focus) {
    if (!sel) return 'normal';
    if (sel.type === 'system') return sid === sel.id ? 'normal' : 'dim';
    if (sel.type === 'subsystem') {
      const c = compId && state.byId.get(compId);
      return c && c.subsystem === sel.id ? 'normal' : 'dim';
    }
    if (sel.type === 'component') {
      if (compId === sel.id) return 'hl';
      if (compId && focus?.has(compId)) return 'nb';
      return 'dim';
    }
    return 'normal';
  }

  // ------------------------------------------------------------- camera
  frame(sel) {
    const box = new THREE.Box3();
    if (!sel) {
      box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(3.85, 1.4, 1));
    } else if (sel.type === 'system') {
      for (const g of this.sysGroups.get(sel.id)?.children || []) if (g.visible) box.expandByObject(g);
    } else if (sel.type === 'subsystem') {
      for (const id of state.subById.get(sel.id)?.componentIds || []) {
        const g = this.compGroups.get(id);
        if (g) box.expandByObject(g);
      }
    } else {
      const g = this.compGroups.get(sel.id);
      if (g) box.expandByObject(g);
      else {
        const r = this.routeMeshes.find((m) => m.userData.compId === sel.id);
        if (r) box.expandByObject(r);
      }
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = Math.max(0.45, size * 1.25);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.y < 0.15) dir.y = 0.35;
    dir.normalize();
    this.flyTo(center, center.clone().add(dir.multiplyScalar(dist)));
  }

  flyTo(target, position, ms = 650) {
    this.flyAnim = {
      t0: performance.now(), ms,
      fromT: this.controls.target.clone(), toT: target,
      fromP: this.camera.position.clone(), toP: position,
    };
  }

  homePose() {
    const target = new THREE.Vector3(1.4, 0.45, 0);
    const k = this.camera.aspect < 1 ? Math.min(2.2, 1.25 / this.camera.aspect) : 1;
    return { target, position: target.clone().add(new THREE.Vector3(-5.0, 1.95, 4.6).multiplyScalar(k)) };
  }

  resetView() {
    const p = this.homePose();
    this.flyTo(p.target, p.position);
  }

  // ------------------------------------------------------------- labels
  updateLabels() {
    const host = this.overlay.labels;
    host.innerHTML = '';
    this.labelItems = [];
    if (!state.labels) return;
    const sel = state.selection;
    const items = [];
    const add = (text, pos, selArg) => items.push({ text, pos, sel: selArg });
    if (!sel) {
      for (const [sid, g] of this.sysGroups) if (g.visible && g.children.length) add(g.userData.system.name.split(' (')[0], g.userData.center.clone().add(g.userData.offset), { type: 'system', id: sid });
    } else if (sel.type === 'system') {
      for (const sub of state.sysById.get(sel.id).subsystems) {
        const box = new THREE.Box3();
        for (const id of sub.componentIds) { const g = this.compGroups.get(id); if (g?.visible) box.expandByObject(g); }
        if (!box.isEmpty()) add(sub.name, box.getCenter(new THREE.Vector3()), { type: 'subsystem', id: sub.id });
      }
    } else if (sel.type === 'subsystem') {
      for (const id of state.subById.get(sel.id).componentIds) {
        const g = this.compGroups.get(id);
        if (g?.visible) add(g.userData.comp.name, new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()), { type: 'component', id });
      }
    } else {
      for (const id of [sel.id, ...neighbours(sel.id)]) {
        const g = this.compGroups.get(id);
        if (g?.visible) add(g.userData.comp.name, new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()), { type: 'component', id });
      }
    }
    for (const it of items.slice(0, 60)) {
      const el = document.createElement('div');
      el.className = 'label3d';
      el.textContent = it.text;
      el.addEventListener('click', () => select(it.sel));
      host.appendChild(el);
      this.labelItems.push({ el, pos: it.pos });
    }
  }

  _positionLabels() {
    if (!this.labelItems?.length) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const it of this.labelItems) {
      v.copy(it.pos).project(this.camera);
      const behind = v.z > 1;
      it.el.style.display = behind ? 'none' : '';
      it.el.style.left = `${((v.x + 1) / 2) * w}px`;
      it.el.style.top = `${((1 - v.y) / 2) * h - 6}px`;
    }
  }

  // ------------------------------------------------------------- picking
  _initEvents() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const hit = this._pick(e);
      if (hit) select({ type: 'component', id: hit });
      else if (e.button === 0) select(null);
    });
    this.canvas.addEventListener('dblclick', (e) => {
      const hit = this._pick(e);
      if (hit) this.frame({ type: 'component', id: hit });
    });
    let pending = false;
    this.canvas.addEventListener('pointermove', (e) => {
      if (pending || e.buttons) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        this._hover(e);
      });
    });
    this.canvas.addEventListener('pointerleave', () => { this.overlay.tip.hidden = true; });
  }

  _pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const vis = this.pickables.filter((o) => this._visibleDeep(o) && !(o.material && o.material.transparent && o.material.opacity < 0.2));
    const hits = this.raycaster.intersectObjects(vis, false);
    for (const h of hits) {
      const id = h.object.userData.compId;
      if (id) return id;
    }
    return null;
  }

  _visibleDeep(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  _hover(e) {
    const id = this._pick(e);
    const tip = this.overlay.tip;
    this.canvas.style.cursor = id ? 'pointer' : '';
    if (!id) { tip.hidden = true; return; }
    const c = state.byId.get(id);
    const r = this.canvas.getBoundingClientRect();
    tip.innerHTML = `<b></b><span></span>`;
    tip.querySelector('b').textContent = c.name;
    tip.querySelector('span').textContent = `${state.sysById.get(c.system)?.name || c.system} › ${state.subById.get(c.subsystem)?.name || ''}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 290)}px`;
    tip.style.top = `${e.clientY - r.top + 14}px`;
  }

  // ------------------------------------------------------------- loop
  _resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _tick() {
    const dt = this.clock.getDelta();
    if (this.flyAnim) {
      const a = this.flyAnim;
      let k = Math.min(1, (performance.now() - a.t0) / a.ms);
      k = 1 - Math.pow(1 - k, 3);
      this.controls.target.lerpVectors(a.fromT, a.toT, k);
      this.camera.position.lerpVectors(a.fromP, a.toP, k);
      if (k >= 1) this.flyAnim = null;
    }
    if (state.flow) for (const r of this.routeMeshes) if (r.visible && r.userData.flow.visible) r.userData.flow.material.map.offset.x -= dt * 1.6;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._positionLabels();
  }
}

export function wireViewer(viewer) {
  on('change', (key) => {
    if (key === 'bodyMode' || key === 'bodyParts') viewer.applyBody();
    else viewer.applyAll();
  });
  on('select', () => viewer.applyAll());
  on('tracker', () => { if (state.statusColors) viewer.applyAll(); });
}
