// Re-presents research subsystems as a few groups per system (data/layout.json), splits corner
// parts (suspension, brakes, wheels, tie rods, halfshafts) into one part per physical location,
// gives every part a car "zone" for the Locations view, short display names, and a sensible order.

const MID_X = 2.811 / 2; // front vs rear: half the wheelbase
const CORNER_Z = 0.4; // a part belongs to a wheel corner when it is this far outboard…
const CORNER_X = 0.7; // …and within this distance of that axle
const WHEEL_WELL_Z = 0.62; // unsplit parts: must be out in the wheel well to belong to a corner

export const ZONES = [
  { id: 'FL', name: 'Front Left', short: 'FL' },
  { id: 'FR', name: 'Front Right', short: 'FR' },
  { id: 'RL', name: 'Rear Left', short: 'RL' },
  { id: 'RR', name: 'Rear Right', short: 'RR' },
  { id: 'FRONT', name: 'Front end', short: 'Front' },
  { id: 'ENG', name: 'Engine bay', short: 'Engine' },
  { id: 'CAB', name: 'Cockpit', short: 'Cockpit' },
  { id: 'REAR', name: 'Rear & trunk', short: 'Rear' },
  { id: 'UNDER', name: 'Underbody', short: 'Under' },
  { id: 'CAR', name: 'Across the car', short: 'Across', note: 'Runs the length of the car or sits in several places: shell, frame rails, harness, long lines.' },
  { id: 'PROC', name: 'Procedures & supplies', short: 'Supplies', note: 'Fluids, coatings, set-up and service procedures — no single spot on the car.' },
];
const ZONE_NAME = Object.fromEntries(ZONES.map((z) => [z.id, z.name]));
const LABEL_NAME = { FL: 'Front Left', FR: 'Front Right', RL: 'Rear Left', RR: 'Rear Right', FC: 'Front Center', RC: 'Rear Center' };

function centroid(points) {
  const n = points.length || 1;
  return points.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]);
}

/** Corner label only when the point is out at a wheel; otherwise front/rear centre. */
function labelAt(at, sideOnly = false) {
  const front = at[0] < MID_X;
  const axle = front ? 0 : 2.811;
  const atCorner = sideOnly ? Math.abs(at[2]) > 0.05 : Math.abs(at[2]) > CORNER_Z && Math.abs(at[0] - axle) < CORNER_X;
  if (!atCorner) return front ? 'FC' : 'RC';
  return (front ? 'F' : 'R') + (at[2] > 0 ? 'L' : 'R');
}

/** Every physical copy of a component's model with its centre. */
function pieces(c) {
  const out = [];
  for (const m of c.model) {
    const copies = [];
    if (m.path) { if (m.path.length) copies.push({ m, at: centroid(m.path), span: Math.abs(m.path[0][0] - m.path[m.path.length - 1][0]) }); }
    else if (m.outline) copies.push({ m, at: centroid(m.outline.map(([x, z]) => [x, m.y || 0.1, z])) });
    else if (m.edge) copies.push({ m, at: centroid(m.edge.map(([x, z]) => [x, m.y0 || 0.1, z])) });
    else for (const p of m.instances?.length ? m.instances : [m.pos || [1.4, 0.4, 0]]) copies.push({ m, at: p, pos: p });
    for (const cp of copies) {
      const at = m.mirrored ? [cp.at[0], cp.at[1], -cp.at[2]] : cp.at;
      out.push({ ...cp, at, mirrored: false });
      if (m.mirror) out.push({ ...cp, at: [cp.at[0], cp.at[1], -cp.at[2]], mirrored: true });
    }
  }
  return out;
}

function pieceModel(p) {
  const m = { ...p.m };
  delete m.instances;
  m.mirror = false;
  if (p.pos) m.pos = p.pos;
  if (p.mirrored) m.mirrored = true;
  return m;
}

/** Where on the car a set of pieces sits, for the Locations view. */
function zoneOf(c, ps) {
  if (c.loc && /^(FL|FR|RL|RR)$/.test(c.loc)) return c.loc;
  if (!ps.length) return 'PROC'; // fluids, coatings, procedures
  const at = centroid(ps.map((p) => p.at));
  const lbl = labelAt(at);
  // parts not split per wheel only count as a corner when they sit out in the wheel well,
  // outboard of the frame rails and strut towers (ABS unit, booster etc. stay in the engine bay)
  if (/^(FL|FR|RL|RR)$/.test(lbl) && ps.every((p) => labelAt(p.at) === lbl && Math.abs(p.at[2]) > WHEEL_WELL_Z)) return lbl;
  // every piece (both ends of a line, every copy) must fall in one area; otherwise it runs across the car
  const zs = new Set();
  for (const p of ps) {
    const ends = p.m.path?.length ? [p.m.path[0], p.m.path[p.m.path.length - 1]] : [p.at];
    for (const e of ends) zs.add(areaAt(p.mirrored ? [e[0], e[1], -e[2]] : e));
  }
  if (zs.size === 1) return [...zs][0];
  if (zs.size === 2 && zs.has('UNDER')) return 'UNDER'; // low parts reaching into a neighbour area
  return zs.size > 1 && ps.length > 0 && Math.max(...ps.map((p) => p.at[0])) - Math.min(...ps.map((p) => p.at[0])) < 0.9 ? areaAt(at) : 'CAR';
}

const COORD = /\b[xyz]\s*(approx\.?|≈|~|=|:)?\s*[-+−±/]*\s*\d/i;
/** Human "where it goes" text without the model coordinates the research added. */
function cleanLocation(text) {
  const FILL = /(\s*\b(at|centered|centre|center|around|approx\.?|approximately|near|to|about|and|or|with)\b\.?)+\s*$/i;
  const t = String(text).replace(/\([^()]*\b[xyz]\b[^()]*\d[^()]*\)/gi, '');
  const sentences = t.split(/(?<=\.)\s+/).map((sentence) => {
    const parts = sentence.replace(/\.$/, '').split(/,\s*/).map((part) => {
      const i = part.search(COORD);
      return (i < 0 ? part : part.slice(0, i)).replace(FILL, '').replace(/[\s–-]+$/, '').replace(/\s{2,}/g, ' ').trim();
    }).filter(Boolean);
    const out = parts.join(', ').replace(FILL, '').trim();
    return out ? `${out}.` : '';
  });
  return sentences.filter(Boolean).join(' ');
}

function areaAt(p) {
  if (p[0] < -0.45) return 'FRONT';
  if (p[0] < 0.65) return 'ENG';
  if (p[1] < 0.3 && p[0] < 2.6) return 'UNDER';
  if (p[0] > 2.45) return 'REAR';
  return 'CAB';
}

const SIDE_WORDS = /^(front|rear|left|right|lh|rh|driver|passenger)[\s-]+(?:(left|right|lh|rh)[\s-]+)?/i;
function stripSide(name) {
  const n = name.replace(SIDE_WORDS, '').replace(/\s*\((front|rear|left|right|lh|rh|l\/r|lh\/rh|x\d+)\)\s*/gi, ' ').trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** "Strut top mount (strut mount / bearing) and rod nut" -> short "Strut top mount and rod nut", alias "strut mount / bearing". */
function shortName(name) {
  const aliases = [];
  let short = name.replace(/\s*\(([^)]*)\)/g, (_, a) => { aliases.push(a.trim()); return ''; }).replace(/\s{2,}/g, ' ').trim();
  short = short.replace(/\s*[-–—]\s*$/, '');
  if (short.length < 4) { short = name; aliases.length = 0; }
  return { short: short.charAt(0).toUpperCase() + short.slice(1), alias: aliases.join('; ') };
}

// Tiers by what the part is (name rules, then layout.json "tier" overrides), never by size.
const SERVICE = /(procedure|fluid|\boil\b|coolant|^fuel$|paint|coating|sealer|wax|removal|deadener|bedding|bleed|alignment target|targets|final torque|ride height|corner weight|gauge|fixture|\btool|decal|balance weights|service kit|insulation|undercoat|primer|wrap|blanket)/i;
const HARDWARE = /(bolt|\bnut|stud|washer|clip|clamp|fitting|adaptor|adapter|grommet|o-ring|gasket|shim|spacer|dowel|\bpins?\b|rivet|rivnut|screw|fastener|\btee\b|bracket|strap|\btabs?\b|hardware|plug|valve stem|\bcaps?\b|\brings?\b|hose|\blines?\b|cable|wire|sleev|hanger|isolator|stand-off|seals?\b|boot\b|insulators?|bushings?)/i;
function tierOf(c, overrides = {}) {
  const base = c.baseId || c.id;
  if (overrides[base] != null) return overrides[base];
  if (SERVICE.test(c.name)) return 2;
  if (/wheel speed sensor|brake duct|dust shield|backing plate/i.test(c.name)) return 1; // ancillaries, not the corner's main parts
  const head = c.short.split(/\s+(?:and|with|&)\s+|,\s*/i)[0]; // "Strut top mount and rod nut" -> "Strut top mount"
  return HARDWARE.test(head) ? 1 : 0;
}
function volumeOf(c) {
  let v = 0;
  for (const m of c.model) {
    if (m.size) v = Math.max(v, m.size[0] * m.size[1] * m.size[2]);
    else if (m.path) {
      let len = 0;
      for (let i = 1; i < m.path.length; i++) len += Math.hypot(...m.path[i].map((q, k) => q - m.path[i - 1][k]));
      v = Math.max(v, len * Math.PI * (m.radius || 0.01) ** 2);
    } else if (m.outline) v = Math.max(v, 0.01);
  }
  return v;
}
export const TIER_NAMES = ['Main parts', 'Hardware, lines & fittings', 'Service items & supplies'];

export function applyLayout(systems, components, layout, log = () => {}) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const splitMap = new Map(); // original id -> [{ id, label }]
  const newComps = [];
  let splitCount = 0;

  // same physical part researched in two systems: keep one, link the other to it
  for (const [dup, keep] of Object.entries(layout.hide || {})) if (byId.has(dup) && byId.has(keep)) byId.get(dup)._hide = keep;

  for (const sys of systems) {
    const cfg = layout.systems?.[sys.id];
    if (!cfg) continue;
    const subName = new Map(sys.subsystems.map((s) => [s.id, s.name]));
    const groups = cfg.groups.map((g) => ({ id: `${sys.id}.${g.id}`, key: g.id, name: g.name, description: g.desc || '', loc: g.loc || null, componentIds: [] }));
    const gByKey = new Map(groups.map((g) => [g.key, g]));
    const subToGroup = new Map();
    for (const g of cfg.groups) for (const s of g.subs || []) subToGroup.set(`${sys.id}.${s}`, g.id);
    const corner = cfg.corners || {};
    const cornerSubs = new Set((corner.subs || []).map((s) => `${sys.id}.${s}`));
    const sideOnlySubs = new Set((corner.sideOnlySubs || []).map((s) => `${sys.id}.${s}`));
    const groupForLabel = (label) => {
      if (corner[label]) return corner[label];
      if (label === 'FC') return corner.centerFront || corner.center;
      if (label === 'RC') return corner.centerRear || corner.center;
      return corner.center;
    };
    const place = (c, g) => { c.subsystem = g.id; g.componentIds.push(c.id); };

    for (const sub of sys.subsystems) {
      for (const id of sub.componentIds) {
        const c = byId.get(id);
        c.category = subName.get(sub.id) || '';
        if (c._hide) continue;
        const moved = (cfg.move || []).find((mv) => c.id.includes(mv.match));
        if (moved) { place(c, gByKey.get(moved.to)); continue; }
        if (!cornerSubs.has(sub.id)) {
          const key = subToGroup.get(sub.id);
          const g = gByKey.get(key) || groups[groups.length - 1];
          if (!key) log(`no group for ${sub.id} — put in ${g.name}`);
          place(c, g);
          continue;
        }
        // corner subsystem: split by physical location
        let ps;
        if (!c.model.length) {
          const hint = `${c.name} ${c.id.split('.').slice(1).join(' ')}`.toLowerCase();
          const ends = /\bfront\b|front-/.test(hint) ? ['F'] : /\brear\b|rear-/.test(hint) ? ['R'] : [];
          const q = Number(c.qty);
          const procedure = /procedure|alignment|setup|torque at|fixture|tool|module|receiver|fluid/.test(hint);
          const corners = (ends.length ? ends : q % 4 === 0 ? ['F', 'R'] : []).flatMap((e) => [e + 'L', e + 'R']).filter((l) => groupForLabel(l) && groupForLabel(l) !== corner.center);
          if (procedure || !corners.length || !(q >= corners.length)) { place(c, gByKey.get(corner.noModel) || groups[groups.length - 1]); continue; }
          ps = corners.map((label) => ({ label, virtual: true }));
        } else {
          ps = pieces(c);
          const sideOnly = corner.sideOnly || sideOnlySubs.has(sub.id);
          for (const p of ps) p.label = labelAt(p.at, sideOnly);
        }
        if ((corner.pinCenter || []).some((pat) => c.id.includes(pat))) for (const p of ps) p.label = p.label[0] === 'F' ? 'FC' : 'RC';

        // pieces bound for the same group become one part
        const byGroup = new Map();
        for (const p of ps) {
          const gk = groupForLabel(p.label);
          if (!byGroup.has(gk)) byGroup.set(gk, { labels: new Set(), list: [] });
          byGroup.get(gk).labels.add(p.label);
          byGroup.get(gk).list.push(p);
        }
        const groupKeys = [...byGroup.keys()];
        const labelFor = (labels) => (labels.size === 1 ? [...labels][0] : [...labels].every((l) => l[0] === 'F') ? 'FC' : [...labels].every((l) => l[0] === 'R') ? 'RC' : 'C');
        if (groupKeys.length === 1) {
          const label = labelFor(byGroup.get(groupKeys[0]).labels);
          if (/^(FL|FR|RL|RR)$/.test(label)) { c.loc = label; c.name = stripSide(c.name); }
          place(c, gByKey.get(groupKeys[0]));
          continue;
        }
        splitCount++;
        c._remove = true;
        const total = ps.length;
        const q = Number(c.qty);
        const entries = [];
        for (const [gk, { labels, list }] of byGroup) {
          const label = labelFor(labels);
          const nid = `${c.id}--${label.toLowerCase()}`;
          const qty = Number.isFinite(q) && q > 0 ? Math.max(1, Math.round((q * list.length) / total)) : list.length;
          const corner4 = /^(FL|FR|RL|RR)$/.test(label);
          const d = {
            ...c,
            id: nid,
            baseId: c.id,
            name: corner4 ? stripSide(c.name) : c.name,
            loc: corner4 ? label : null,
            location: corner4 ? `${LABEL_NAME[label]} corner. ${c.location || ''}`.trim() : c.location,
            qty,
            model: list.filter((p) => !p.virtual).map(pieceModel),
          };
          delete d._remove;
          newComps.push(d);
          place(d, gByKey.get(gk));
          entries.push({ id: nid, label });
        }
        splitMap.set(c.id, entries);
      }
    }
    sys.subsystems = groups.filter((g) => g.componentIds.length);
    for (const g of sys.subsystems) delete g.key;
  }

  // drop originals that were split, and duplicates
  const hiddenIds = new Map();
  for (let i = components.length - 1; i >= 0; i--) {
    const c = components[i];
    if (c._hide) { hiddenIds.set(c.id, c._hide); components.splice(i, 1); continue; }
    if (c._remove) components.splice(i, 1);
  }
  components.push(...newComps);
  const all = new Map(components.map((c) => [c.id, c]));

  // names, zones, ordering
  for (const c of components) {
    const { short, alias } = shortName(c.name);
    c.short = short;
    c.alias = alias;
    const ps = c.model.length ? pieces(c) : [];
    c.zone = zoneOf(c, ps);
    if (ps.length) c.at = centroid(ps.map((p) => p.at)).map((v) => Math.round(v * 1000) / 1000);
    c.zoneName = ZONE_NAME[c.zone];
    const corner4 = c.loc && /^(FL|FR|RL|RR)$/.test(c.loc);
    c.displayName = corner4 ? `${short} — ${LABEL_NAME[c.loc]}` : short;
    c._vol = volumeOf(c);
    c.tier = tierOf(c, layout.tier);
    if (c.location) c.location = cleanLocation(c.location);
  }
  // parts with no 3D shape: real parts take the usual spot of their area; procedures and supplies stay apart
  for (const sys of systems) {
    for (const g of sys.subsystems) {
      const counts = {};
      for (const id of g.componentIds) { const z = all.get(id)?.zone; if (z && z !== 'PROC' && z !== 'CAR') counts[z] = (counts[z] || 0) + 1; }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      for (const id of g.componentIds) {
        const c = all.get(id);
        if (layout.zone?.[c.baseId || c.id]) { c.zone = layout.zone[c.baseId || c.id]; c.zoneName = ZONE_NAME[c.zone]; continue; }
        if (c.zone === 'PROC' && top && !SERVICE.test(c.name)) { c.zone = top; c.zoneName = ZONE_NAME[top]; }
      }
    }
  }
  for (const sys of systems) {
    for (const g of sys.subsystems) {
      g.componentIds.sort((a, b) => {
        const ca = all.get(a), cb = all.get(b);
        return ca.tier - cb.tier || cb._vol - ca._vol || (ca.buildPhase || 99) - (cb.buildPhase || 99);
      });
    }
  }
  for (const c of components) delete c._vol;

  // research text cites other parts by id: show the part's name instead
  const nameOf = new Map();
  for (const c of components) { nameOf.set(c.id, c.short); if (c.baseId && !nameOf.has(c.baseId)) nameOf.set(c.baseId, c.short); }
  const ID = /\b[a-z][a-z0-9-]*\.[a-z0-9-]+\.[a-z0-9-]+(?:--[a-z]{2})?\b/g;
  const words = (id) => { const w = id.split('.').pop().replace(/--[a-z]{2}$/, '').replace(/-/g, ' '); return w.charAt(0).toUpperCase() + w.slice(1); };
  const fix = (t) => (typeof t === 'string' ? t.replace(/\(?see (route )?([a-z][a-z0-9-]*\.[a-z0-9.-]+)\)?/gi, (m, r, id) => `(see ${nameOf.get(id) || words(id)})`)
    .replace(ID, (id) => nameOf.get(id) || nameOf.get(id.replace(/--[a-z]{2}$/, '')) || words(id))
    .replace(/listed again here for the [a-z ]+? builder;?\s*/gi, '') : t);
  // every shown string of a part, however deep (fluids, specs, options …); ids, links and sources stay as they are
  const KEEP = new Set(['id', 'baseId', 'sameAs', 'system', 'subsystem', 'connectsTo', 'sources', 'source', 'url', 'zone', 'loc', 'model', 'images', 'modelRef_images']);
  const deep = (v, key) => {
    if (KEEP.has(key)) return v;
    if (typeof v === 'string') return fix(v);
    if (Array.isArray(v)) return v.map((x) => deep(x, key));
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = deep(v[k], k); return v; }
    return v;
  };
  for (const c of components) {
    for (const k of Object.keys(c)) c[k] = deep(c[k], k);
    // "Where it goes" that lost everything but a fragment: lead with the area
    if (!c.location || /^[a-z]/.test(c.location)) c.location = `${ZONE_NAME[c.zone] || 'On the car'}${c.location ? ` — ${c.location}` : '.'}`;
  }

  // re-point links at the per-location parts and the kept duplicate
  const resolve = (ref, fromLoc) => {
    if (hiddenIds.has(ref)) ref = hiddenIds.get(ref);
    const e = splitMap.get(ref);
    if (!e) return [ref];
    const same = e.find((x) => x.label === fromLoc);
    if (same) return [same.id];
    if (fromLoc && /^(F|R)/.test(fromLoc)) {
      const sameEnd = e.filter((x) => x.label[0] === fromLoc[0]);
      if (sameEnd.length) return sameEnd.map((x) => x.id);
    }
    return e.map((x) => x.id);
  };
  for (const c of components) {
    c.connectsTo = [...new Set(c.connectsTo.flatMap((t) => resolve(t, c.loc)))].filter((t) => t !== c.id && all.has(t));
  }
  for (const sys of systems) {
    for (const r of sys.routes) if (r.componentId) r.componentId = resolve(r.componentId, labelAt(centroid(r.points)))[0];
    for (const sc of sys.schematics) for (const n of sc.nodes) if (n?.componentId) n.componentId = resolve(n.componentId, null)[0];
  }
  const splitOut = Object.fromEntries([...splitMap].map(([k, v]) => [k, v.map((x) => x.id)]));
  for (const [dup, keep] of hiddenIds) splitOut[dup] = resolve(keep, null);
  return { splitCount, splitMap: splitOut, zones: ZONES, tierNames: TIER_NAMES };
}
