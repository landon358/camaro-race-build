// Merges the research files in data/systems/<system>/*.json into public/data/db.json
// and prints a validation report. Run with `npm run data`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyLayout } from './layout.mjs';
import { loadPhotos, attachPhotos } from './photos.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sysDir = path.join(root, 'data', 'systems');
const outFile = path.join(root, 'public', 'data', 'db.json');

// Display order, colors and explode direction for each system.
export const SYSTEMS = [
  { id: 'chassis', name: 'Chassis', color: '#8a94a6', explode: [0, -0.15, 0], opacity: 0.38 },
  { id: 'safety', name: 'Safety & Roll Cage', color: '#f5c518', explode: [0, 0.9, 0] },
  { id: 'suspension', name: 'Suspension', color: '#3fb8ff', explode: [0, -0.2, 0.55] },
  { id: 'steering', name: 'Steering', color: '#7c5cff', explode: [-0.35, 0.25, 0.25] },
  { id: 'brakes', name: 'Brakes', color: '#ff4d4d', explode: [0, 0.05, 0.85] },
  { id: 'wheels', name: 'Wheels, Tires & Hubs', color: '#c9ced6', explode: [0, 0, 1.25] },
  { id: 'engine', name: 'Engine', color: '#ff8a1f', explode: [-0.9, 0.7, 0] },
  { id: 'engine-support', name: 'Engine Support (oil, cooling, fuel, intake, exhaust)', color: '#18c29c', explode: [-0.3, -0.25, -0.55] },
  { id: 'drivetrain', name: 'Drivetrain', color: '#e055c8', explode: [0.2, -0.45, 0] },
  { id: 'electrical', name: 'Electrical & Electronics', color: '#40e0ff', explode: [0.2, 0.5, -0.6] },
  { id: 'interior', name: 'Interior', color: '#b08968', explode: [0.3, 0.6, 0.4] },
  { id: 'body', name: 'Body & Glass', color: '#e8e8e8', explode: [0, 1.4, 0], opacity: 0.3 },
  { id: 'aero', name: 'Aero', color: '#9be15d', explode: [0.4, -0.1, 0] },
];

export const PHASES = [
  { n: 1, name: 'Chassis prep', detail: 'Strip, seam weld, roll cage, mounts, paint' },
  { n: 2, name: 'Fuel cell & hard lines', detail: 'Fuel, brake and plumbing runs through the chassis' },
  { n: 3, name: 'Suspension & steering', detail: 'Cradles, links, dampers, steering rack & column' },
  { n: 4, name: 'Brakes, hubs & wheels', detail: 'Hubs, rotors, calipers, lines, wheels' },
  { n: 5, name: 'Engine assembly', detail: 'Long block built on the stand' },
  { n: 6, name: 'Engine & drivetrain install', detail: 'Engine, clutch, trans, driveshaft, diff, halfshafts' },
  { n: 7, name: 'Engine support systems', detail: 'Cooling, oiling, exhaust, intake, fuel delivery' },
  { n: 8, name: 'Electrical & electronics', detail: 'Harness, PDM, ECU, dash, sensors' },
  { n: 9, name: 'Safety & interior', detail: 'Seat, belts, fire system, nets, controls' },
  { n: 10, name: 'Body & aero', detail: 'Panels, glass, splitter, wing, diffuser' },
  { n: 11, name: 'Fluids, startup & setup', detail: 'Fill, prime, start, alignment, corner weights' },
];

const problems = [];
const warn = (m) => problems.push(m);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    warn(`PARSE ERROR ${path.relative(root, file)}: ${e.message}`);
    return null;
  }
}

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function normModel(m) {
  return asArray(m).filter((x) => x && typeof x === 'object' && (x.shape || x.path));
}

const systems = [];
const components = [];
const ids = new Set();
const known = new Set(SYSTEMS.map((s) => s.id));

const dirs = fs.existsSync(sysDir) ? fs.readdirSync(sysDir).filter((d) => fs.statSync(path.join(sysDir, d)).isDirectory()) : [];
for (const d of dirs) if (!known.has(d)) warn(`Unknown system folder: ${d}`);

for (const meta of SYSTEMS) {
  const dir = path.join(sysDir, meta.id);
  const sys = { ...meta, summary: '', overview: '', buildNotes: [], schematics: [], routes: [], sources: [], subsystems: [] };
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    const sysFile = files.find((f) => f === '_system.json');
    if (sysFile) {
      const s = readJson(path.join(dir, sysFile));
      if (s) {
        sys.summary = s.summary || '';
        sys.overview = s.overview || '';
        sys.buildNotes = asArray(s.buildNotes);
        sys.schematics = asArray(s.schematics).filter((x) => x && Array.isArray(x.nodes));
        sys.routes = asArray(s.routes).filter((r) => r && Array.isArray(r.points) && r.points.length >= 2);
        sys.sources = asArray(s.sources);
      }
    }
    for (const f of files) {
      if (f === '_system.json') continue;
      let sub = readJson(path.join(dir, f));
      if (!sub) continue;
      // tolerate a file that holds an array of subsystems
      for (const s of asArray(sub)) {
        if (!s || !Array.isArray(s.components)) { warn(`No components array in ${meta.id}/${f}`); continue; }
        const subId = s.id || `${meta.id}.${f.replace(/\.json$/, '')}`;
        const subsystem = { id: subId, name: s.name || subId, description: s.description || '', componentIds: [] };
        for (const c of s.components) {
          if (!c || !c.id) { warn(`Component without id in ${meta.id}/${f}`); continue; }
          let id = c.id;
          if (ids.has(id)) { warn(`Duplicate id ${id} (${meta.id}/${f}) — suffixed`); let i = 2; while (ids.has(`${c.id}-${i}`)) i++; id = `${c.id}-${i}`; }
          ids.add(id);
          const comp = {
            id,
            system: meta.id,
            subsystem: subId,
            name: c.name || id,
            qty: c.qty ?? 1,
            description: c.description || '',
            location: c.location || '',
            connectsTo: asArray(c.connectsTo).filter((x) => typeof x === 'string'),
            factory: c.factory || null,
            raceOptions: asArray(c.raceOptions),
            specs: c.specs && typeof c.specs === 'object' ? c.specs : {},
            hardware: asArray(c.hardware).filter((h) => h && typeof h === 'object'),
            fluids: asArray(c.fluids),
            installNotes: asArray(c.installNotes),
            inspection: asArray(c.inspection),
            buildPhase: Number.isInteger(c.buildPhase) ? c.buildPhase : 0,
            installOrder: c.installOrder ?? 999,
            tags: asArray(c.tags),
            sources: asArray(c.sources),
            model: normModel(c.model),
            modelRef: c.modelRef && typeof c.modelRef === "object" ? c.modelRef : null,
          };
          components.push(comp);
          subsystem.componentIds.push(id);
        }
        sys.subsystems.push(subsystem);
      }
    }
  }
  sys.subsystems.sort((a, b) => {
    const pa = Math.min(...a.componentIds.map((id) => components.find((c) => c.id === id)?.buildPhase || 99), 99);
    const pb = Math.min(...b.componentIds.map((id) => components.find((c) => c.id === id)?.buildPhase || 99), 99);
    return pa - pb || a.name.localeCompare(b.name);
  });
  systems.push(sys);
}

// Resolve cross-team references that guessed an id slightly wrong (e.g.
// `engine.engine-sensors.crank-sensor` vs `engine.engine-sensors.crankshaft-position-sensor`).
const tokens = (s) => new Set(s.toLowerCase().split(/[.\-_]+/).filter((t) => t && t.length > 1));
const bySystem = new Map();
for (const id of ids) {
  const sys = id.split('.')[0];
  if (!bySystem.has(sys)) bySystem.set(sys, []);
  bySystem.get(sys).push({ id, tok: tokens(id) });
}
const resolved = new Map();
const aliasFile = path.join(root, 'data', 'aliases.json');
const aliases = fs.existsSync(aliasFile) ? readJson(aliasFile) || {} : {};
function resolveRef(ref) {
  if (ids.has(ref)) return ref;
  if (aliases[ref] && ids.has(aliases[ref])) return aliases[ref];
  if (resolved.has(ref)) return resolved.get(ref);
  const sys = ref.split('.')[0];
  const want = tokens(ref);
  let best = null;
  let bestScore = 0;
  for (const cand of bySystem.get(sys) || []) {
    let inter = 0;
    for (const t of want) if (cand.tok.has(t)) inter++;
    const score = inter / (want.size + cand.tok.size - inter);
    if (score > bestScore) { bestScore = score; best = cand.id; }
  }
  const out = bestScore >= 0.5 ? best : null;
  resolved.set(ref, out);
  if (process.env.DEBUG_REFS && out) console.log(`    ~ ${ref} -> ${out} (${bestScore.toFixed(2)})`);
  return out;
}
let fixed = 0;
for (const c of components) {
  c.connectsTo = c.connectsTo.map((t) => { const r = resolveRef(t); if (r && r !== t) fixed++; return r || t; });
  c.connectsTo = [...new Set(c.connectsTo)].filter((t) => t !== c.id);
}
for (const s of systems) {
  for (const r of s.routes) if (r.componentId) r.componentId = resolveRef(r.componentId) || r.componentId;
  for (const sc of s.schematics) for (const n of sc.nodes) if (n && n.componentId) n.componentId = resolveRef(n.componentId) || n.componentId;
}

// Cross-reference report
let dangling = 0;
for (const c of components) for (const t of c.connectsTo) if (!ids.has(t)) dangling++;
console.log(`  fuzzy-resolved refs: ${fixed}`);
const noModel = components.filter((c) => !c.model.length).length;
const hw = components.reduce((n, c) => n + c.hardware.length, 0);
const noPhase = components.filter((c) => !c.buildPhase).length;

/** Top-down outline of the reference body (for the car map), from data/body-envelope.json. */
function carPlan() {
  const f = path.join(root, 'data', 'body-envelope.json');
  if (!fs.existsSync(f)) return null;
  const e = JSON.parse(fs.readFileSync(f, 'utf8'));
  const left = [], right = [];
  for (let i = 0; i < e.nx; i++) {
    const x = e.x0 + (i + 0.5) * e.dx;
    let zl = 0, zr = 0;
    for (let k = 0; k < e.nz; k++) if (e.top[i][k] > 0.3) { const z = e.z0 + (k + 0.5) * e.dz; zl = Math.max(zl, z); zr = Math.min(zr, z); }
    if (zl > 0.05) { left.push([+x.toFixed(3), +zl.toFixed(3)]); right.push([+x.toFixed(3), +zr.toFixed(3)]); }
  }
  return { outline: [...left, ...right.reverse()], wheels: e.wheels };
}

// Present research subsystems as a few groups per system, split by physical location.
const layoutFile = path.join(root, 'data', 'layout.json');
let split = { splitCount: 0, splitMap: {} };
if (fs.existsSync(layoutFile)) split = applyLayout(systems, components, readJson(layoutFile) || {}, warn);
console.log(`  layout: ${split.splitCount} parts split into per-corner parts`);

const photos = loadPhotos(root, path.join(root, 'public'), warn);
const pm = attachPhotos(components, photos);
console.log(`  photos: ${Object.keys(photos).length} on file, ${pm.parts}/${components.length} parts and ${pm.rows}/${pm.total} fasteners matched`);

const fitFile = path.join(root, 'data', 'fit.json');
const db = {
  photos,
  fit: fs.existsSync(fitFile) ? readJson(fitFile) : {},
  splitMap: split.splitMap,
  zones: split.zones,
  tierNames: split.tierNames,
  plan: carPlan(),
  generated: new Date().toISOString(),
  vehicle: {
    name: 'Chevrolet Camaro — 6th Gen (2016–2024) Road-Race Build',
    platform: 'GM Alpha',
    wheelbase_m: 2.811,
  },
  phases: PHASES,
  systems,
  components,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(db));

console.log(`db.json: ${systems.length} systems, ${systems.reduce((n, s) => n + s.subsystems.length, 0)} subsystems, ${components.length} components, ${hw} hardware entries, ${systems.reduce((n, s) => n + s.schematics.length, 0)} schematics, ${systems.reduce((n, s) => n + s.routes.length, 0)} routes`);
for (const s of systems) console.log(`  ${s.id.padEnd(15)} ${String(s.subsystems.length).padStart(3)} subsystems ${String(s.subsystems.reduce((n, x) => n + x.componentIds.length, 0)).padStart(4)} components`);
console.log(`  dangling connectsTo refs: ${dangling}, components without model: ${noModel}, without buildPhase: ${noPhase}`);
for (const p of problems) console.log('  ! ' + p);
