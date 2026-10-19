// Maps research components to realistic part generators and builds their 3D objects.
import * as THREE from 'three';
import { axial as baseAxial, boxes as baseBoxes, paths as basePaths, whole as baseWhole } from './generators.js';
import { CUSTOM } from './custom/index.js';
import { PartBuilder, box, cylX, sphere, latheX, ringX, torusX, V } from './geo.js';

// Built-in generators merged with the per-group precise models in ./custom
const axial = Object.assign({}, baseAxial, ...CUSTOM.map((c) => c.axial || {}));
const boxes = Object.assign({}, baseBoxes, ...CUSTOM.map((c) => c.boxes || {}));
const paths = Object.assign({}, basePaths, ...CUSTOM.map((c) => c.paths || {}));
const whole = Object.assign({}, baseWhole, ...CUSTOM.map((c) => c.whole || {}));

const WHEEL_CENTRES = [0, 2.811];
const WHEEL_Y = 0.369;

// [pattern on component id, generator name, options]
//   prim: only replace the first primitive (others are drawn plainly)
//   shapes: only apply to these primitive shapes
const BASE_RULES = [
  [/wheels\.tires\./, 'tire'],
  [/wheels\.wheels\.(front|rear)-wheel$/, 'rim'],
  [/hub-bearing$/, 'hub', { prim: true }],
  [/(lug-nuts|axle-nut|jam-nut|phaser-center-bolt|balancer-bolt)$/, 'nut'],
  [/wheel-studs$/, 'stud'],
  [/-rotors\.rotor$/, 'rotor'],
  [/-rotors\.hat$/, 'hat'],
  [/calipers\.caliper$/, 'caliper', { prim: true }],
  [/-pads\.pads$/, 'pads'],
  [/coil-spring$/, 'spring'],
  [/(struts-springs\.strut|dampers-springs\.shock)$/, 'damper'],
  [/sway-bar\.bar$/, 'swaybar'],
  [/sway-bar\.end-links$/, 'link'],
  [/(lower-control-arm|upper-control-arm|radius-rod|trailing-arm|toe-link|tie-rod|outer-tie-rod-end|inner-tie-rod)$/, 'link'],
  [/knuckles?\.knuckle$/, 'knuckle', { prim: true }],
  [/steering-wheel$/, 'steeringWheel'],
  [/rack\.eps-gear$/, 'rack'],
  [/(rack-boots|cv-boots|flex-joints)$/, 'boot'],
  [/column-and-shaft\.(column|upper-intermediate-shaft|lower-intermediate-shaft)$/, 'shaft'],
  [/block\.cylinder-block$/, 'block'],
  [/cylinder-heads\.cylinder-head$/, 'head'],
  [/valve-covers\.valve-cover$/, 'valveCover'],
  [/supercharger-assembly$/, 'supercharger', { prim: true }],
  [/na-intake-manifold$/, 'intake'],
  [/throttle-body$/, 'throttle'],
  [/crankshaft$/, 'crank', { prim: true }],
  [/\.camshaft$/, 'camshaft'],
  [/\.pistons$/, 'piston'],
  [/harmonic-balancer$/, 'balancer', { prim: true }],
  [/(idler-pulleys|belt-tensioner|crank-drive-pulley|pump-pulley)$/, 'pulley'],
  [/(serpentine-belt|supercharger-belt|drive-belt)$/, 'belt'],
  [/(alternator|alternator-mount)$/, 'motor'],
  [/starter-motor$/, 'motor', { variant: 'starter' }],
  [/wiper-motor$/, 'motor'],
  [/accessory-drive\.water-pump$/, 'canister', { variant: 'can', prim: true }],
  [/(wet-sump-oil-pan|factory-wet-sump-pan|dry-sump-pan)$/, 'oilPan', { prim: true }],
  [/(cooling\.radiator|heat-exchanger|oil-cooler|trans-cooler|diff-cooler)$/, 'cooler'],
  [/(fan-assembly|radiator-fan)$/, 'fan'],
  [/exhaust\.headers$/, 'header'],
  [/exhaust\.mufflers$/, 'muffler'],
  [/(x-pipe|mid-pipes|tailpipes|connection-pipes|side-exit-option)$/, 'exhaust'],
  [/induction\.air-filter$/, 'coneFilter'],
  [/fuel-cell\.container$/, 'fuelCell'],
  [/fuel-cell\.bladder$/, 'skip'],
  [/(lift-pump|feed-pumps|ic-pump|trans-cooler-pump|diff-cooler-pump|intercooler-pump|cooler-pumps)$/, 'canister', { variant: 'pump', shapes: ['cylinder'] }],
  [/(filter|prefilter|screens|oil-filter)$/, 'canister', { variant: 'filter', shapes: ['cylinder'] }],
  [/(catch-can|accumulator|surge-tank|oil-tank|remote-reservoirs|ic-reservoir|clutch-hydraulics\.reservoir|breather-filter)$/, 'canister', { variant: 'tank', shapes: ['cylinder'] }],
  [/dry-sump-pump$/, 'dryPump'],
  [/fire-suppression\.bottle$/, 'canister', { variant: 'bottle' }],
  [/extinguisher\.handheld$/, 'canister', { variant: 'extinguisher' }],
  [/seat-shell$/, 'seat', { whole: true }],
  [/pedal-box\.pedal-assembly$/, 'pedals', { whole: true }],
  [/(front-mc|rear-mc|factory-tandem-mc|clutch-hydraulics\.master-cylinder)$/, 'masterCyl', { prim: true }],
  [/factory-booster$/, 'booster'],
  [/battery-and-cutoff\.battery$/, 'battery'],
  [/dash-display$/, 'electronics', { variant: 'display' }],
  [/(\.ecu|gdi-controller|\.pdm|\.logger|keypad|io-expander|aux-fuse-block|relay-panel|fan-control|fuel-pump-control|shift-controller|bosch-motorsport-abs|factory-bpmv-ebcm|elsd-control-module|\.radio|transponder|solid-state-isolator|epb-actuator-module|fan-controller|gps-imu)$/, 'electronics', { prim: true }],
  [/flywheel-clutch\.flywheel$/, 'flywheel'],
  [/pressure-plate$/, 'pressurePlate'],
  [/clutch-disc-pack$/, 'clutchDisc'],
  [/bellhousing\.bellhousing$/, 'bellhousing', { prim: true }],
  [/transmission\.transmission$/, 'gearbox', { prim: true }],
  [/differential-assembly$/, 'diff', { prim: true }],
  [/(front-driveshaft|rear-driveshaft|one-piece-driveshaft)$/, 'driveshaft'],
  [/halfshafts\.halfshaft$/, 'halfshaft'],
  [/(inner-cv-joint|outer-cv-joint)$/, 'cvJoint'],
  [/harness\.harness-assembly$/, 'strap'],
  [/roll-cage\./, 'cage', { shapes: ['tube'] }],
  [/window-net\.net$/, 'net'],
  [/(sensor|sender|probes|switch)$/, 'canister', { variant: 'sensor', shapes: ['cylinder'] }],
  [/(cable|harness|wiring|strap)$/, 'cable', { shapes: ['tube'] }],
];

// Custom (precise) rules win over the generic ones.
const RULES = [...CUSTOM.flatMap((c) => c.rules || []), ...BASE_RULES];

// Finish for plain primitives that have no dedicated generator.
const FINISH_RULES = [
  [/(seal|gasket|o-ring|boot|bushing|grommet|isolator|insulator|bumper|jounce|padding|knee-padding)/, 'rubber'],
  [/(decal|marker|sticker|numbers)/, 'yellow'],
  [/(fitting|adaptor|adapter|tee|bulkhead-fitting|quick-disconnect)/, 'blue'],
  [/(bolt|nut|stud|dowel|pin|plug|screw|bleeder|circlip|clamp)/, 'chrome'],
  [/(sensor|switch|connector|module|controller|solenoid|camera|antenna|button|lamp|light|receiver|resistor|fuse|breaker|relay)/, 'plastic'],
  [/(bracket|plate|mount|brace|crossmember|cradle|rail|gusset|tab|hanger|perch|seat|eccentric|shim|spacer|flange)/, 'steel'],
  [/(panel|floor|firewall|shelf|bulkhead|shield|tray|deflector|ducting|duct)/, 'aluminum'],
  [/(hose|line|tube)/, 'rubber'],
];
const SYSTEM_FINISH = {
  chassis: 'chassis', safety: 'cage', suspension: 'black', steering: 'black', brakes: 'steel', wheels: 'steel',
  engine: 'cast', 'engine-support': 'aluminum', drivetrain: 'cast', electrical: 'satin', interior: 'plastic', body: 'paint', aero: 'carbon',
};

export function finishFor(comp, m) {
  const id = comp.id.split('.').slice(1).join('.');
  for (const [re, f] of FINISH_RULES) if (re.test(id)) return f;
  if (comp.system === 'safety' && m.path) return 'cage';
  return SYSTEM_FINISH[comp.system] || 'steel';
}

function ruleFor(comp, m, index) {
  for (const [re, gen, opt = {}] of RULES) {
    if (!re.test(comp.id)) continue;
    const shape = m.path ? 'tube' : m.shape || 'box';
    if (opt.shapes && !opt.shapes.includes(shape)) continue;
    if (opt.prim && index > 0) return null;
    // a path model can only use a path generator and vice versa
    if (m.path && !paths[gen]) continue;
    if (!m.path && paths[gen] && !axial[gen] && !boxes[gen]) continue;
    return { gen, ...opt };
  }
  return null;
}

export function wholeRuleFor(comp) {
  for (const [re, gen, opt = {}] of RULES) if (opt.whole && re.test(comp.id)) return gen;
  return null;
}

// ------------------------------------------------------------------ caching
const templates = new Map();
function memo(key, make) {
  if (!templates.has(key)) templates.set(key, make());
  return templates.get(key).clone();
}
const r3 = (v) => Math.round(v * 1000) / 1000;

function axisOf(m) {
  if (['x', 'y', 'z'].includes(m.axis)) return m.axis;
  if (m.shape === 'torus' || m.shape === 'disc') return 'z';
  return 'y';
}

/** Rotation that maps canonical X onto the given world axis, plus the dims in canonical order. */
function canonical(axis, s) {
  if (axis === 'x') return { rot: [0, 0, 0], L: s[0], D1: s[1], D2: s[2] };
  if (axis === 'y') return { rot: [0, 0, Math.PI / 2], L: s[1], D1: s[0], D2: s[2] };
  return { rot: [0, -Math.PI / 2, 0], L: s[2], D1: s[1], D2: s[0] };
}

function plainAxial(shape, L, D1, D2, finish) {
  const D = Math.max(D1, D2);
  const b = new PartBuilder();
  if (shape === 'cone') {
    const g = new THREE.CylinderGeometry(0.0001, D / 2, L, 24);
    g.rotateZ(-Math.PI / 2);
    b.add(g, finish);
  } else if (shape === 'torus') {
    const k = Math.min(0.5, Math.max(0.04, Math.min(L / 2, D / 4) / (D / 2)));
    b.add(torusX(1 - k, k, 12, 32), finish, [0, 0, 0], [0, 0, 0], [L / (2 * k), D / 2, D / 2]);
  } else if (shape === 'disc') {
    b.add(ringX(D / 2, D * 0.16, Math.max(L, 0.002), 32), finish);
  } else {
    b.add(cylX(1, 1, 24), finish, [0, 0, 0], [0, 0, 0], [L, D1 / 2, D2 / 2]);
  }
  return b.build();
}

function primitiveDims(m) {
  const clampv = (v) => Math.min(8, Math.max(0.002, Math.abs(Number.isFinite(+v) ? +v : 0.05)));
  return Array.isArray(m.size) && m.size.length === 3 ? m.size.map(clampv) : [0.05, 0.05, 0.05];
}

/**
 * Build one primitive of a component at `pos` (unmirrored world coords).
 * Returns an Object3D placed in world space.
 */
export function makePrimitive(comp, m, pos, index) {
  const rule = ruleFor(comp, m, index);
  if (rule?.gen === 'skip') return null;
  const finish = finishFor(comp, m);

  // ---- horizontal plate from an [x, z] outline (splitters, undertrays)
  if (m.shape === 'plate' && Array.isArray(m.outline) && m.outline.length >= 3) {
    const shape = new THREE.Shape(m.outline.map(([x, z]) => new THREE.Vector2(+x, +z)));
    const t = Math.max(0.002, +m.thickness || 0.01);
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1 });
    g.rotateX(Math.PI / 2); // shape (x, z) -> world (x, z); extrusion goes down
    g.translate(0, (+m.y || 0.1) + t / 2, 0);
    return new PartBuilder().add(g, finish).build();
  }
  // ---- vertical wall along an [x, z] edge (air dams, lips)
  if (m.shape === 'wall' && Array.isArray(m.edge) && m.edge.length >= 2) {
    const y0 = +m.y0 || 0.1, h = Math.max(0.005, +m.height || 0.05);
    const pos = [];
    for (let i = 0; i < m.edge.length - 1; i++) {
      const [ax, az] = m.edge[i], [bx, bz] = m.edge[i + 1];
      pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0, az, bx, y0 + h, bz, ax, y0 + h, az);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return new PartBuilder().add(g, finish).build();
  }

  // ---- path models
  if (m.path) {
    const pts = m.path.filter((q) => Array.isArray(q) && q.length === 3).map((q) => V(+q[0] || 0, +q[1] || 0, +q[2] || 0));
    if (pts.length < 2) return null;
    const r = Math.min(0.2, Math.max(0.003, +m.radius || 0.012));
    const gen = rule && paths[rule.gen] ? rule.gen : null;
    const obj = gen ? paths[gen](pts, r, { finish, comp, m, variant: rule.variant }) : paths.tube(pts, r, { finish });
    obj.userData.plainColor = m.color && !gen ? m.color : null;
    obj.userData.generator = gen || 'tube';
    return obj;
  }

  // ---- shaped primitives
  const s = primitiveDims(m);
  const p = Array.isArray(pos) && pos.length === 3 ? pos.map((v) => +v || 0) : [1.4, 0.4, 0];
  const outer = new THREE.Object3D();
  outer.position.set(p[0], p[1], p[2]);
  if (Array.isArray(m.rot)) outer.rotation.set(...m.rot.map((v) => THREE.MathUtils.degToRad(+v || 0)));
  const shape = m.shape || 'box';
  let inner;
  const gen = rule?.gen;

  if (gen && boxes[gen]) {
    const ctx = { comp, m, pos: p, side: Math.sign(p[2]) || 1, variant: rule.variant, finish };
    let key = `${gen}|${s.map(r3)}|${rule.variant || ''}|${ctx.side}|${rule.perPart ? comp.id : ''}`;
    const wc = WHEEL_CENTRES.reduce((a, b) => (Math.abs(b - p[0]) < Math.abs(a - p[0]) ? b : a));
    ctx.wheelOffset = { x: wc - p[0], y: WHEEL_Y - p[1] };
    if (gen === 'caliper' || rule.usesPos) key += `|${r3(ctx.wheelOffset.x)}|${r3(ctx.wheelOffset.y)}|${p.map(r3)}`;
    inner = memo(key, () => boxes[gen](s[0], s[1], s[2], ctx));
  } else if (gen && axial[gen]) {
    // axial generator on any shape: use the primitive axis (boxes: longest dimension)
    let axis = axisOf(m);
    if (shape === 'box' || shape === 'sphere') axis = ['x', 'y', 'z'][s.indexOf(Math.max(...s))];
    if (rule.axis) axis = rule.axis;
    if (!rule.axis && ['rim', 'tire', 'rotor', 'hat', 'hub', 'flywheel', 'pressurePlate', 'clutchDisc', 'pulley', 'balancer', 'fan', 'steeringWheel', 'disc'].includes(gen) && shape === 'box') {
      axis = ['x', 'y', 'z'][s.indexOf(Math.min(...s))];
    }
    const c = canonical(axis, s);
    const key = `${gen}|${r3(c.L)}|${r3(c.D1)}|${r3(c.D2)}|${rule.variant || ''}|${rule.perPart ? comp.id : ''}`;
    const wc = WHEEL_CENTRES.reduce((a, b) => (Math.abs(b - p[0]) < Math.abs(a - p[0]) ? b : a));
    const actx = { variant: rule.variant, comp, m, pos: p, side: Math.sign(p[2]) || 1, axis, wheelOffset: { x: wc - p[0], y: WHEEL_Y - p[1] } };
    inner = memo(rule.usesPos ? `${key}|${p.map(r3)}` : key, () => axial[gen](c.L, c.D1, c.D2, actx));
    inner.rotation.set(...c.rot);
  } else if (shape === 'box') {
    inner = memo(`box|${s.map(r3)}|${finish}`, () => new PartBuilder().add(box(s[0], s[1], s[2]), finish).build());
  } else if (shape === 'sphere') {
    inner = memo(`sph|${s.map(r3)}|${finish}`, () => new PartBuilder().add(sphere(0.5, 24, 16), finish, [0, 0, 0], [0, 0, 0], s).build());
  } else {
    const c = canonical(axisOf(m), s);
    inner = memo(`${shape}|${r3(c.L)}|${r3(c.D1)}|${r3(c.D2)}|${finish}`, () => plainAxial(shape, c.L, c.D1, c.D2, finish));
    inner.rotation.set(...c.rot);
  }
  outer.add(inner);
  outer.userData.plainColor = m.color && !gen ? m.color : null;
  outer.userData.generator = gen || shape;
  return outer;
}

/** Build a whole-component generator (seat, pedal box) from the union of its primitives. */
export function makeWhole(comp, gen) {
  const min = V(Infinity, Infinity, Infinity), max = V(-Infinity, -Infinity, -Infinity);
  let mirror = false;
  for (const m of comp.model) {
    if (m.mirror) mirror = true;
    const s = primitiveDims(m);
    for (const p of m.instances?.length ? m.instances : [m.pos || [0, 0, 0]]) {
      min.min(V(p[0] - s[0] / 2, p[1] - s[1] / 2, p[2] - s[2] / 2));
      max.max(V(p[0] + s[0] / 2, p[1] + s[1] / 2, p[2] + s[2] / 2));
    }
  }
  if (!Number.isFinite(min.x)) return [];
  const center = min.clone().add(max).multiplyScalar(0.5);
  const make = () => {
    const g = whole[gen](min.clone().sub(center), max.clone().sub(center), { comp, center });
    g.position.copy(center);
    return g;
  };
  return mirror ? [make(), mirrored(make())] : [make()];
}

export function mirrored(obj) {
  const g = new THREE.Group();
  g.scale.z = -1;
  g.add(obj);
  return g;
}

// ------------------------------------------------------------------ routes
export function routeGenerator(route, systemId) {
  const id = `${route.id} ${route.name || ''}`.toLowerCase();
  switch (route.kind) {
    case 'brake-fluid':
    case 'clutch-fluid':
      return /flex|hose|braided/.test(id) ? 'braided' : 'hardline';
    case 'fuel':
    case 'oil':
    case 'fuel-vapor':
      return 'braided';
    case 'coolant':
    case 'water':
    case 'vacuum':
    case 'air':
    case 'boost':
      return 'hose';
    case 'exhaust':
      return /header|primary/.test(id) ? 'header' : 'exhaust';
    case 'power':
      return 'cable';
    case 'ground':
      return 'cableBlack';
    case 'signal':
    case 'can':
    case 'ethernet':
      return 'harness';
    case 'fire-suppressant':
      return 'hardline';
    default:
      if (systemId === 'safety') return /cable|pull/.test(id) ? 'cableBlack' : 'cage';
      if (systemId === 'suspension') return /bar/.test(id) ? 'swaybar' : 'link';
      if (systemId === 'steering') return /tie/.test(id) ? 'link' : 'shaft';
      if (systemId === 'drivetrain') return /half|axle/.test(id) ? 'halfshaft' : /drive ?shaft|driveshaft/.test(id) ? 'driveshaft' : 'shaft';
      if (systemId === 'engine' && /belt/.test(id)) return 'belt';
      if (/cable/.test(id)) return 'cableBlack';
      if (systemId === 'aero') return 'tube';
      return 'tube';
  }
}

export function makeRoute(route, systemId) {
  const pts = route.points.filter((q) => Array.isArray(q) && q.length === 3 && q.every((v) => Number.isFinite(+v))).map((q) => V(+q[0], +q[1], +q[2]));
  if (pts.length < 2) return null;
  const r = Math.min(0.06, Math.max(0.003, +route.radius || 0.006));
  const gen = routeGenerator(route, systemId);
  if (gen === 'cableBlack') return paths.cable(pts, r, { finish: 'harness' });
  return (paths[gen] || paths.tube)(pts, r, { finish: 'steel' });
}

export { latheX };
