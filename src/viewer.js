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

export const STATUS_COLORS = { needed: '#e6e9ee', ordered: '#60a5fa', inhand: '#fbbf24', installed: '#4ade80', none: '#3a414d' };

// Reference-body node names (from the converted ZL1 1LE mesh) grouped for toggles.
export const BODY_GROUPS = {
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
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse || window.devicePixelRatio < 2, powerPreference: coarse ? 'default' : 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
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
    this.controls.addEventListener('change', () => this.invalidate());

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 6, 4);
    this.scene.add(key, new THREE.HemisphereLight(0xbfd4ff, 0x20242c, 0.6));

    // ground
    const grid = new THREE.GridHelper(14, 56, 0x2c2c2c, 0x171717);
    grid.position.set(1.4, 0, 0);
    this.scene.add(grid);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 2.4),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(1.43, 0.001, 0);
    this.scene.add(shadow);

    this._addGroundLabels();

    this.bodyRoot = new THREE.Group();
    this.partsRoot = new THREE.Group();
    this.routesRoot = new THREE.Group();
    this.xrayRoot = new THREE.Group();
    this.scene.add(this.bodyRoot, this.partsRoot, this.routesRoot, this.xrayRoot);
    this.xrayMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.38, depthTest: false, depthWrite: false });
    this.xrayGroupMat = new THREE.MeshBasicMaterial({ color: 0xdfe8f5, transparent: true, opacity: 0.1, depthTest: false, depthWrite: false });
    this.xrayNbMat = new THREE.MeshBasicMaterial({ color: 0x5fd4c8, transparent: true, opacity: 0.15, depthTest: false, depthWrite: false });
    this.needsRender = true;

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
      color: 0x9fb4d0, transparent: true, opacity: 0.035, depthWrite: false, roughness: 0.4, metalness: 0, side: THREE.DoubleSide,
    });
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x8ea0ba, transparent: true, opacity: 0.32, depthWrite: false });
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
        this.panelMeshes.set(node.name.replace(/[^a-z0-9-]/gi, ''), node); // glTF strips the dots from ids
      }
    } catch (e) {
      console.warn('Body panel meshes unavailable', e);
    }
  }

  /** FRONT / REAR / DRIVER / PASSENGER painted on the floor around the car. */
  _addGroundLabels() {
    const mk = (text, x, z, rot) => {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(155,170,192,0.55)';
      g.font = '600 56px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 50);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(x, 0.003, z);
      this.scene.add(m);
    };
    mk('FRONT', -2.05, 0, Math.PI / 2);
    mk('REAR', 4.4, 0, -Math.PI / 2);
    mk('LEFT · DRIVER', 1.4, 1.45, 0);
    mk('RIGHT · PASSENGER', 1.4, -1.45, Math.PI);
  }

  applyBody() {
    const mode = state.bodyMode;
    for (const [group, names] of Object.entries(BODY_GROUPS)) {
      for (const n of names) {
        const node = this.bodyNodes?.get(n);
        if (!node) continue;
        node.visible = mode !== 'off' && state.bodyParts[group] !== false;
        node.traverse((o) => {
          if (!o.isMesh) return;
          o.material = mode === 'ghost' ? this.ghostMat : o.userData.solidMat;
          // see-through mode draws crisp feature lines instead of stacked transparent skins
          if (mode === 'ghost' && !o.userData.edges) {
            const edges = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), this.edgeMat);
            edges.raycast = () => {};
            o.add(edges);
            o.userData.edges = edges;
          }
          if (o.userData.edges) o.userData.edges.visible = mode === 'ghost';
        });
      }
    }
    this.invalidate();
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
        // a selected system / area / location: solid, slightly self-lit so it reads against the dark rest
        focus: new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.28, metalness: 0.2, roughness: 0.5 }),
        focusGhost: new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.2, transparent: true, opacity: 0.22, depthWrite: false }),
      });
      const g = new THREE.Group();
      g.name = s.id;
      g.userData.system = s;
      this.sysGroups.set(s.id, g);
      this.partsRoot.add(g);
    }
    // selected = warm amber glow, connected parts = cool teal, everything else = quiet graphite
    this.hlMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a1f, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.nbMat = new THREE.MeshStandardMaterial({ color: 0x5fd4c8, emissive: 0x0c4a45, emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.hoverMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9ab4d8, emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.5 });
    this.dimMat = new THREE.MeshStandardMaterial({ color: 0x2a303a, metalness: 0, roughness: 0.95 });
    // areas and locations: the rest fades right back so parts behind a wheel or panel still show
    this.dimGhostMat = new THREE.MeshStandardMaterial({ color: 0x3a414d, metalness: 0, roughness: 0.95, transparent: true, opacity: 0.16, depthWrite: false });
    this.statusMats = Object.fromEntries(
      Object.entries(STATUS_COLORS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, metalness: 0.2, roughness: 0.55 })])
    );

    for (const c of db.components) {
      if (!c.model.length) continue;
      const g = new THREE.Group();
      g.name = c.id;
      g.userData.comp = c;
      const wholeGen = wholeRuleFor(c);
      // paint, wrap, numbers and decals are finishes on the shell, not shapes of their own
      if (/^body\.paint-wrap\./.test(c.baseId || c.id)) continue;
      const panel = this.panelMeshes?.get((PANEL_ALIASES[c.baseId || c.id] || c.baseId || c.id).replace(/[^a-z0-9-]/gi, ''));
      if (panel) this._tag(g, panel.clone(), c, null, 'panel');
      else if (wholeGen) makeWhole(c, wholeGen).forEach((o, k) => this._tag(g, o, c, null, `w|${k}`));
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
    positions.forEach((p, k) => {
      const obj = makePrimitive(comp, m, p, index);
      if (!obj) return;
      // a per-corner part split from a mirrored pair keeps the left geometry, reflected
      this._tag(group, m.mirrored ? mirrored(obj) : obj, comp, obj.userData.plainColor, `${index}|${k}|0`);
      if (m.mirror) {
        const twin = makePrimitive(comp, m, p, index);
        if (twin) this._tag(group, mirrored(twin), comp, twin.userData.plainColor, `${index}|${k}|1`);
      }
    });
  }

  _tag(group, obj, comp, plainColor, key = '') {
    // measured fit (data/fit.json): shrink about the piece's centre and nudge it inside the body
    const fit = state.db.fit?.[`${comp.id}|${key}`] || state.db.fit?.[`${comp.baseId || comp.id}|${key}`];
    obj.userData.fitKey = key;
    if (fit) {
      obj.updateMatrixWorld(true);
      const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      const m = new THREE.Matrix4().makeTranslation(c.x + fit.t[0], c.y + fit.t[1], c.z + fit.t[2])
        .multiply(new THREE.Matrix4().makeScale(fit.s, fit.s, fit.s))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      obj.applyMatrix4(m);
    }
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
  applyAll(opts = {}) {
    const sel = state.selection;
    const focus = this._focusSet(sel);
    const phaseLimit = state.phase >= 12 ? 99 : state.phase;
    const t = state.explode;
    const colorMode = state.colorMode; // 'real' | 'system' | 'status'

    for (const [sid, sg] of this.sysGroups) {
      const sysHidden = state.hiddenSystems.has(sid);
      const selInside = sel && (sel.type === 'system' ? sel.id === sid : sel.type === 'subsystem' ? state.subById.get(sel.id)?.system === sid : sel.type === 'component' ? state.byId.get(sel.id)?.system === sid : false);
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
        let mode = this._modeFor(c, sid, sel, focus);
        if (this.hoverId === c.id && mode !== 'hl') mode = 'hover';
        // a selected system / area / location stands out in its system colour against the dimmed rest
        const groupSel = sel && sel.type !== 'component' && mode === 'normal' && colorMode !== 'status';
        g.traverse((o) => {
          if (!o.isMesh) return;
          if (mode === 'hl') o.material = this.hlMat;
          else if (mode === 'hover') o.material = this.hoverMat;
          else if (mode === 'nb') o.material = this.nbMat;
          else if (mode === 'dim') o.material = sel.type === 'component' ? this.dimMat : this.dimGhostMat;
          else if (groupSel) o.material = sel.type === 'zone' && sid === 'wheels' ? this.sysMats.get(sid).focusGhost : this.sysMats.get(sid).focus;
          else if (colorMode === 'status') o.material = this.statusMats[track(c.id).status || 'none'];
          else if (colorMode === 'real') o.material = o.userData.colorMat || finishMaterial(o.userData.finish || 'steel', o.userData.opacity);
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
      let mode = this._modeFor(comp, sid, sel, focus);
      if (comp && this.hoverId === comp.id && mode !== 'hl') mode = 'hover';
      for (const o of u.parts) {
        if (mode === 'hl') o.material = this.hlMat;
        else if (mode === 'hover') o.material = this.hoverMat;
        else if (mode === 'nb') o.material = this.nbMat;
        else if (mode === 'dim') o.material = sel?.type === 'component' ? this.dimMat : this.dimGhostMat;
        else if (colorMode === 'status' && comp) o.material = this.statusMats[track(comp.id).status || 'none'];
        else if (colorMode === 'real') o.material = finishMaterial(o.userData.finish || 'steel');
        else o.material = u.kindMat;
      }
      u.flow.visible = state.flow && mode !== 'dim';
    }

    // Lift the body with the body system when exploded
    const bodySys = this.sysGroups.get('body');
    this.bodyRoot.position.copy(bodySys ? bodySys.userData.offset : new THREE.Vector3(0, t * 2, 0));
    if (this.edgeMat) this.edgeMat.opacity = sel ? 0.13 : 0.32;
    if (!opts.light) {
      this._updateXray(sel);
      this.updateLabels();
    }
    this._followExplode(sel);
    this.invalidate();
  }

  /** Explode moves parts; keep the selected one where the camera is looking. */
  _followExplode(sel) {
    const g = sel?.type === 'component' ? this.compGroups.get(sel.id) : null;
    const key = g ? sel.id : null;
    const pos = g ? g.position.clone() : null;
    if (key && this._follow?.id === key && !pos.equals(this._follow.pos)) {
      const d = pos.clone().sub(this._follow.pos);
      this.controls.target.add(d);
      this.camera.position.add(d);
      if (this.flyAnim) { this.flyAnim.toT.add(d); this.flyAnim.toP.add(d); }
    }
    this._follow = key ? { id: key, pos } : null;
  }

  /** Draw the selected part again on top of everything, so it is never fully hidden. */
  _updateXray(sel) {
    this.xrayRoot.clear();
    if (!sel || sel.type === 'system') return;
    // a part: strong ghost; an area or location: a faint one, so parts behind a wheel still read
    const ids = sel.type === 'component' ? [sel.id]
      : sel.type === 'subsystem' ? state.subById.get(sel.id)?.componentIds || []
        : state.db.components.filter((c) => c.zone === sel.id && c.tier === 0).map((c) => c.id);
    if (ids.length > 60) return;
    const isPart = sel.type === 'component';
    // areas: leave wheels and tyres out (big shells that would stack into a white blob)
    const list = isPart ? ids : ids.filter((id) => state.byId.get(id)?.system !== 'wheels');
    const layers = [[this.xrayMat, isPart ? list : []], [this.xrayGroupMat, isPart ? [] : list], [this.xrayNbMat, isPart ? neighbours(sel.id) : []]];
    for (const [mat, lids] of layers) {
      const sources = [];
      for (const id of lids) { const g = this.compGroups.get(id); if (g?.visible) sources.push(g); }
      for (const r of this.routeMeshes) if (r.visible && lids.includes(r.userData.compId)) sources.push(r.children[0]);
      this._addXray(sources, mat, mat === this.xrayNbMat ? 998 : mat === this.xrayMat ? 1000 : 999);
    }
  }

  _addXray(sources, mat, order = 999) {
    for (const src of sources) {
      src.updateMatrixWorld(true);
      src.traverse((o) => {
        if (!o.isMesh || !this._visibleDeep(o)) return;
        const m = new THREE.Mesh(o.geometry, mat);
        m.matrixAutoUpdate = false;
        m.matrix.copy(o.matrixWorld);
        m.renderOrder = order; // the selected part always draws over connected parts
        this.xrayRoot.add(m);
      });
    }
  }

  setHover(id) {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.applyAll({ light: true }); // materials only: labels and x-ray stay as they are
  }

  _focusSet(sel) {
    if (!sel) return null;
    if (sel.type === 'component') return new Set(neighbours(sel.id));
    return null;
  }

  _modeFor(c, sid, sel, focus) {
    if (!sel) return 'normal';
    if (sel.type === 'system') return sid === sel.id ? 'normal' : 'dim';
    if (sel.type === 'subsystem') return c && c.subsystem === sel.id ? 'normal' : 'dim';
    if (sel.type === 'zone') return c && c.zone === sel.id ? 'normal' : 'dim';
    if (sel.type === 'component') {
      if (c?.id === sel.id) return 'hl';
      if (c && focus?.has(c.id)) return 'nb';
      return 'dim';
    }
    return 'normal';
  }

  // ------------------------------------------------------------- camera
  /** Screen areas covered by panels/toolbars (px), so framing centres in what is visible. */
  setObstruction(o) {
    this.obstruct = { top: 0, bottom: 0, left: 0, right: 0, ...o };
    this._applyViewOffset();
  }

  _applyViewOffset() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    const o = this.obstruct || { top: 0, bottom: 0, left: 0, right: 0 };
    const cx = (o.left + (W - o.right)) / 2;
    const cy = (o.top + (H - o.bottom)) / 2;
    this.camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  /** Distance that fits a sphere of radius r inside the visible part of the view. */
  _fitDistance(r) {
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1;
    const o = this.obstruct || { top: 0, bottom: 0, left: 0, right: 0 };
    const visW = Math.max(120, W - o.left - o.right), visH = Math.max(120, H - o.top - o.bottom);
    const tv = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const vHalf = Math.atan(tv * (visH / H));
    const hHalf = Math.atan(tv * (W / H) * (visW / W));
    return (r / Math.sin(Math.min(vHalf, hHalf))) * 1.12;
  }

  /** View direction that looks at an area of the car from outside it. */
  _dirFor(zone, center) {
    const d = {
      FL: [-0.75, 0.6, 0.85], FR: [-0.75, 0.6, -0.85], RL: [0.8, 0.6, 0.85], RR: [0.8, 0.6, -0.85],
      FRONT: [-1, 0.55, 0.5], ENG: [-0.9, 0.95, 0.55], CAB: [0.15, 1.5, 0.8], REAR: [1, 0.7, 0.6], UNDER: [0.35, 0.22, 1],
    }[zone];
    if (d) return new THREE.Vector3(...d).normalize();
    if (center) {
      // outside of whichever side the target is on
      const side = Math.abs(center.z) > 0.15 ? Math.sign(center.z) : 1;
      return new THREE.Vector3(center.x < 1.4 ? -0.7 : 0.7, 0.75, 0.9 * side).normalize();
    }
    return this.camera.position.clone().sub(this.controls.target).normalize();
  }

  /**
   * Fly to a selection. Parts land on a context view of their area with the part highlighted;
   * opts.tight zooms right in on the part itself.
   */
  frame(sel, opts = {}) {
    const box = new THREE.Box3();
    let zone = null;
    if (!sel) { this.resetView(); return; }
    if (sel.type === 'system') {
      for (const g of this.sysGroups.get(sel.id)?.children || []) if (g.visible) box.expandByObject(g);
    } else if (sel.type === 'subsystem') {
      const ids = state.subById.get(sel.id)?.componentIds || [];
      const zones = new Set();
      for (const id of ids) {
        const g = this.compGroups.get(id);
        if (g?.visible) box.expandByObject(g);
        zones.add(state.byId.get(id)?.zone);
      }
      if (zones.size === 1) zone = [...zones][0];
    } else if (sel.type === 'zone') {
      zone = sel.id;
      for (const g of this.compGroups.values()) if (g.userData.comp.zone === sel.id && g.visible) box.expandByObject(g);
    } else {
      const c = state.byId.get(sel.id);
      zone = c?.zone;
      const g = this.compGroups.get(sel.id);
      if (g) box.expandByObject(g);
      for (const r of this.routeMeshes) if (r.userData.compId === sel.id) box.expandByObject(r);
      if (!box.isEmpty() && !opts.tight) {
        // context: at least ~1.6 m around the part so you can see where it sits on the car
        const c0 = box.getCenter(new THREE.Vector3());
        const s = box.getSize(new THREE.Vector3());
        const half = Math.max(this.canvas.clientWidth < 500 ? 0.5 : 0.8, s.length() / 2); // phones: closer, part reads bigger
        box.expandByPoint(c0.clone().addScalar(half)).expandByPoint(c0.clone().addScalar(-half));
      }
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(opts.tight ? 0.12 : sel.type === 'component' ? 0.35 : 0.85, box.getSize(new THREE.Vector3()).length() / 2);
    const dist = this._fitDistance(r);
    const dir = zone === 'CAR' || !zone ? this._dirFor(null, center) : this._dirFor(zone, center);
    const pos = center.clone().add(dir.multiplyScalar(dist));
    pos.y = Math.max(pos.y, 0.15);
    this.flyTo(center, pos);
  }

  flyTo(target, position, ms = 650) {
    if (state.reducedMotion) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.flyAnim = null;
      this.invalidate();
      return;
    }
    this.flyAnim = {
      t0: performance.now(), ms,
      fromT: this.controls.target.clone(), toT: target,
      fromP: this.camera.position.clone(), toP: position,
    };
    this.invalidate();
  }

  homePose() {
    const target = new THREE.Vector3(1.4, 0.45, 0);
    const dir = new THREE.Vector3(-5.0, 1.95, 4.6).normalize();
    return { target, position: target.clone().add(dir.multiplyScalar(this._fitDistance(2.6))) };
  }

  resetView() {
    const p = this.homePose();
    this.flyTo(p.target, p.position);
  }

  /** Preset camera views. */
  setView(name) {
    const target = new THREE.Vector3(1.4, 0.45, 0);
    const dirs = {
      front: [-1, 0.25, 0.001], rear: [1, 0.3, 0.001], left: [0.001, 0.25, 1], right: [0.001, 0.25, -1],
      top: [0.001, 1, 0.0001], corner: [-5.0, 1.95, 4.6],
    };
    const d = new THREE.Vector3(...(dirs[name] || dirs.corner)).normalize();
    this.flyTo(target, target.clone().add(d.multiplyScalar(this._fitDistance(2.6))));
  }

  // ------------------------------------------------------------- labels
  updateLabels() {
    const host = this.overlay.labels;
    host.innerHTML = '';
    this.labelItems = [];
    const sel = state.selection;
    const items = [];
    const add = (text, pos, selArg, main = false) => items.push({ text, pos, sel: selArg, main });
    const centerOf = (g) => new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    // the selected part is always labelled
    if (sel?.type === 'component') {
      const g = this.compGroups.get(sel.id);
      if (g?.visible) {
        // above the part, not on it, so the highlighted shape stays visible
        const b = new THREE.Box3().setFromObject(g);
        const p = b.getCenter(new THREE.Vector3());
        p.y = b.max.y + 0.06;
        add(state.byId.get(sel.id).displayName, p, sel, true);
      }
    }
    if (state.labels) {
      if (!sel) {
        for (const [sid, g] of this.sysGroups) if (g.visible && g.children.length) add(g.userData.system.name.split(' (')[0], g.userData.center.clone().add(g.userData.offset), { type: 'system', id: sid });
      } else if (sel.type === 'system') {
        for (const sub of state.sysById.get(sel.id).subsystems) {
          const box = new THREE.Box3();
          for (const id of sub.componentIds) { const g = this.compGroups.get(id); if (g?.visible) box.expandByObject(g); }
          if (!box.isEmpty()) add(sub.name, box.getCenter(new THREE.Vector3()), { type: 'subsystem', id: sub.id });
        }
      } else if (sel.type === 'subsystem' || sel.type === 'zone') {
        const ids = sel.type === 'zone' ? state.db.components.filter((c) => c.zone === sel.id && c.tier === 0).map((c) => c.id) : state.subById.get(sel.id).componentIds;
        for (const id of ids.slice(0, 40)) {
          const g = this.compGroups.get(id);
          if (g?.visible) add(state.byId.get(id).short, centerOf(g), { type: 'component', id });
        }
      } else {
        for (const id of neighbours(sel.id)) {
          const g = this.compGroups.get(id);
          if (g?.visible) add(state.byId.get(id).short, centerOf(g), { type: 'component', id });
        }
      }
    }
    for (const it of items.slice(0, 60)) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'label3d' + (it.main ? ' main' : '');
      el.tabIndex = -1; // the parts list is the keyboard path to the same parts
      el.textContent = it.text;
      el.addEventListener('click', () => select(it.sel));
      host.appendChild(el);
      this.labelItems.push({ el, pos: it.pos });
    }
    this.invalidate();
  }

  _positionLabels() {
    if (!this.labelItems?.length) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const v = new THREE.Vector3();
    for (const it of this.labelItems) {
      v.copy(it.pos).project(this.camera);
      const behind = v.z > 1;
      it.el.style.display = behind ? 'none' : '';
      const lift = it.main ? 34 : 8; // the selected part's label floats above it on a leader line
      const y = Math.max(lift + 30, ((1 - v.y) / 2) * h);
      it.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${y - lift}px) translate(-50%, -100%)`;
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
      if (moved > 6) return;
      const hit = this._pick(e);
      if (hit) select({ type: 'component', id: hit });
    });
    this.canvas.addEventListener('dblclick', (e) => {
      const hit = this._pick(e);
      if (hit) this.frame({ type: 'component', id: hit }, { tight: true });
    });
    let pending = false;
    this.canvas.addEventListener('pointermove', (e) => {
      if (pending || e.buttons || e.pointerType === 'touch') return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        this._hover(e);
      });
    });
    this.canvas.addEventListener('pointerleave', () => { this.overlay.tip.hidden = true; });
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      document.body.classList.add('gl-lost');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      document.body.classList.remove('gl-lost');
      this.invalidate();
    });
  }

  _pick(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const vis = this.pickables.filter((o) => this._visibleDeep(o) && o.material !== this.dimMat && o.material !== this.dimGhostMat);
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
    tip.querySelector('b').textContent = c.displayName;
    tip.querySelector('span').textContent = `${state.sysById.get(c.system)?.name || c.system} › ${state.subById.get(c.subsystem)?.name || ''}`;
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 290)}px`;
    tip.style.top = `${e.clientY - r.top + 14}px`;
  }

  // ------------------------------------------------------------- loop
  invalidate() {
    this.needsRender = true;
  }

  _resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth, h = p.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._applyViewOffset();
    this.invalidate();
  }

  _tick() {
    const dt = this.clock.getDelta();
    if (this.contextLost) return;
    let animating = false;
    if (this.flyAnim) {
      const a = this.flyAnim;
      let k = Math.min(1, (performance.now() - a.t0) / a.ms);
      k = 1 - Math.pow(1 - k, 3);
      this.controls.target.lerpVectors(a.fromT, a.toT, k);
      this.camera.position.lerpVectors(a.fromP, a.toP, k);
      if (k >= 1) this.flyAnim = null;
      animating = true;
    }
    if (state.flow && !state.reducedMotion) {
      for (const r of this.routeMeshes) if (r.visible && r.userData.flow.visible) r.userData.flow.material.map.offset.x -= dt * 1.6;
      animating = true;
    }
    const moved = this.controls.update();
    if (!animating && !moved && !this.needsRender) return; // nothing changed: draw nothing
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
    this._positionLabels();
  }
}

export function wireViewer(viewer) {
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; viewer.applyAll(); });
  };
  on('change', (key) => {
    if (key === 'bodyMode' || key === 'bodyParts') { viewer.applyBody(); viewer.invalidate(); }
    else schedule();
  });
  on('select', () => viewer.applyAll());
  on('tracker', () => { if (state.colorMode === 'status') schedule(); });
}
