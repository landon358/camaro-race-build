// Tiny app store: shared state + change events, and the persisted build tracker.

const listeners = new Map();

export const state = {
  db: null,
  byId: new Map(), // component id -> component
  sysById: new Map(),
  subById: new Map(),
  reverseLinks: new Map(), // component id -> [component ids that connect to it]
  selection: null, // { type: 'system'|'subsystem'|'component', id }
  hiddenSystems: new Set(['body']), // body panels duplicate the reference mesh; shown when selected
  bodyMode: 'ghost',
  bodyParts: { Hood: true, Doors: true, Interior: true, Wheels: true, Shell: true },
  explode: 0,
  phase: 12, // 12 = everything
  showRoutes: true,
  flow: false,
  statusColors: false,
  realColors: true,
  labels: false,
};

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}

export function emit(evt, payload) {
  for (const fn of listeners.get(evt) || []) fn(payload);
}

export function set(key, value) {
  state[key] = value;
  emit('change', key);
  emit(`change:${key}`, value);
}

export function select(sel) {
  const same = sel && state.selection && sel.type === state.selection.type && sel.id === state.selection.id;
  state.selection = same ? state.selection : sel;
  emit('select', state.selection);
}

export function indexDb(db) {
  state.db = db;
  for (const s of db.systems) {
    state.sysById.set(s.id, s);
    for (const sub of s.subsystems) state.subById.set(sub.id, { ...sub, system: s.id });
  }
  for (const c of db.components) state.byId.set(c.id, c);
  for (const c of db.components) {
    for (const t of c.connectsTo) {
      if (!state.byId.has(t)) continue;
      if (!state.reverseLinks.has(t)) state.reverseLinks.set(t, []);
      state.reverseLinks.get(t).push(c.id);
    }
  }
}

/** Components linked to `id` in either direction (only ids that exist). */
export function neighbours(id) {
  const c = state.byId.get(id);
  const out = new Set();
  if (c) for (const t of c.connectsTo) if (state.byId.has(t)) out.add(t);
  for (const r of state.reverseLinks.get(id) || []) out.add(r);
  out.delete(id);
  return [...out];
}

// ---------------------------------------------------------------- tracker
const KEY = 'camaro-build-tracker-v1';
let tracker = {};
try {
  tracker = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  tracker = {};
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(tracker));
  } catch {
    /* storage unavailable — keep in memory */
  }
}

export const STATUSES = [
  { id: 'needed', label: 'Need' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'inhand', label: 'In hand' },
  { id: 'installed', label: 'Installed' },
];

export function track(id) {
  return tracker[id] || {};
}

export function setTrack(id, patch) {
  tracker[id] = { ...(tracker[id] || {}), ...patch };
  for (const k of Object.keys(tracker[id])) if (tracker[id][k] === '' || tracker[id][k] == null) delete tracker[id][k];
  if (!Object.keys(tracker[id]).length) delete tracker[id];
  persist();
  emit('tracker', id);
}

export function exportTracker() {
  return JSON.stringify({ version: 1, exported: new Date().toISOString(), tracker }, null, 2);
}

export function importTracker(text) {
  const obj = JSON.parse(text);
  tracker = obj.tracker || obj;
  persist();
  emit('tracker', null);
}

export function progressFor(ids) {
  let done = 0;
  for (const id of ids) if (track(id).status === 'installed') done++;
  return ids.length ? done / ids.length : 0;
}
