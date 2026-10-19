// Shared presentation: status, confidence, torque, names. One look everywhere.
import { state, track, STATUSES } from '../state.js';
import { esc } from './dom.js';
import { icon, STATUS_ICON } from './icons.js';
import { CONFIDENCE, confidenceOf, parseTorque, parseHw, isDuplicateRow, hasTorque, reuseClass, REUSE_LABEL, REUSE_DESC, fastenerSummary, boltLabel } from '../torque.js';

export const STATUS_WORD = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));

/** Build status as glyph + word. Empty string when not set (unless `always`). */
export function statusBadge(id, always = false) {
  const s = track(id).status;
  if (!s) return always ? `<span class="st">${icon('circle', 14)}Not set</span>` : '';
  return `<span class="st st-${s}">${icon(STATUS_ICON[s], 14)}${esc(STATUS_WORD[s])}</span>`;
}

export function confPill(h) {
  const c = typeof h === 'string' ? h : confidenceOf(h);
  const ic = c === 'verified' ? 'verified' : c === 'estimate' ? 'warn' : 'info';
  return `<span class="pill conf-${c}" title="${esc(CONFIDENCE[c].desc)}">${icon(ic, 13)}${esc(CONFIDENCE[c].label)}</span>`;
}

export function reusePill(h) {
  const r = reuseClass(h?.reuse);
  if (!r) return '';
  return `<span class="pill reuse-${r}" title="${esc(REUSE_DESC[r])} ${esc(h.reuse)}">${esc(REUSE_LABEL[r])}</span>`;
}

/** A verified (GM) value that is only a range is guidance, not an alarm. */
export function confirmIsNote(h, t = parseHw(h)) {
  return confidenceOf(h) === 'verified' && /^Range given/.test(t.confirmWhy || '');
}

/** Why a value needs checking, in words. Empty when it can be used as shown. */
export function confirmText(h, t = parseHw(h)) {
  if (confidenceOf(h) === 'estimate') return 'Confirm before torquing';
  if (confirmIsNote(h, t)) return `GM range — tighten within ${t.angle || 'the range'}`;
  return t.confirmWhy || '';
}

/** The warning line, amber for "check this", grey for GM guidance. */
export function confirmLine(h, t = parseHw(h), tag = 'span') {
  const why = confirmText(h, t);
  if (!why) return '';
  const note = confirmIsNote(h, t);
  return `<${tag} class="tq-confirm${note ? ' note' : ''}">${icon(note ? 'info' : 'warn', 14)}${esc(why)}</${tag}>`;
}

/** The torque itself: one value (+ angle) in big type, or every step of a multi-step sequence. */
export function tqMain(t, raw = '') {
  if (t.multi) return `<${t.alts ? 'ul' : 'ol'} class="tq-steps tq-multi${t.alts ? ' alts' : ''}">${t.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</${t.alts ? 'ul' : 'ol'}>${t.aside ? `<div class="tq-raw">${esc(t.aside)}</div>` : ''}`;
  if (!t.primary) return `<b>${esc(raw)}</b>`;
  return `<span class="tq">${esc(t.primary)}${t.angle ? ` <small>then ${esc(t.angle)}</small>` : ''}</span>${t.secondary ? `<span class="tq-alt">${esc(t.secondary)}</span>` : ''}`;
}

/** Big torque value (N·m first, other unit underneath) with steps, confidence and reuse. */
export function torqueBlock(h, { showRaw = true } = {}) {
  if (!hasTorque(h)) return `<div class="tq-raw">${esc(h?.torque || 'No torque value — hand-tight or per assembly')}</div>`;
  const t = parseHw(h);
  const main = `<div class="tq-main">${tqMain(t, h.torque)}</div>`;
  const confirm = confirmLine(h, t);
  return `${main}<div class="row-pills">${confPill(h)}${reusePill(h)}${confirm}</div>${showRaw && t.raw ? `<div class="tq-raw">As written: ${esc(t.raw)}</div>` : ''}`;
}

/** Compact torque line for lists: "150 N·m · caliper bolt  +1 more  Typical". */
export function torqueLine(c) {
  const s = fastenerSummary(c);
  if (!s?.torque?.primary) return '';
  const needs = s.torqueRow && confirmText(s.torqueRow, s.torque) && !confirmIsNote(s.torqueRow, s.torque);
  return `<span class="pl-tq">${needs ? `<span class="tq-flag" title="${esc(confirmText(s.torqueRow, s.torque))}">${icon('warn', 13)}<span class="sr-only">${esc(confirmText(s.torqueRow, s.torque))}</span></span>` : ''}<b>${s.torque.alts ? `${s.torque.steps.length} values` : s.torque.multi ? `${s.torque.steps.length}-step` : esc(s.torque.primary)}</b>${s.torque.angle ? ` ${esc(s.torque.angle)}` : ''}<span class="pl-tq-item">${esc(boltLabel(s.torqueItem))}${s.more ? ` · +${s.more} more` : ''}</span>${confPill(s.confidence)}${s.replace ? `<span class="pill reuse-REPLACE">${s.replace} must be new</span>` : ''}</span>`;
}

const CORNER_NOUN = { suspension: 'suspension', brakes: 'brakes', wheels: 'wheel', steering: 'tie rod', drivetrain: 'axle' };
/** "Front Left" group in Suspension reads "Front Left suspension". */
export function groupTitle(g) {
  const sub = typeof g === 'string' ? state.subById.get(g) : g;
  if (!sub) return '';
  if (/^(Front|Rear) (Left|Right)$/.test(sub.name) && CORNER_NOUN[sub.system]) return `${sub.name} ${CORNER_NOUN[sub.system]}`;
  return sub.name;
}

export function systemName(id) {
  return (state.sysById.get(id)?.name || id).replace(/\s*\(.*\)\s*$/, '');
}

/** Name to show outside a part's own group (includes its corner). */
export function partName(c) {
  return c.displayName || c.short || c.name;
}

export function zoneName(z) {
  return state.zoneById.get(z)?.name || z;
}

/** { zone: { n, done } } for a list of part ids. */
export function zoneCounts(ids) {
  const out = {};
  for (const id of ids) {
    const c = state.byId.get(id);
    if (!c) continue;
    out[c.zone] ||= { n: 0, done: 0 };
    out[c.zone].n++;
    if (track(id).status === 'installed') out[c.zone].done++;
  }
  return out;
}

/** Part numbers with where they come from. `chosen` marks the option picked in the tracker. */
export function partNumbers(c) {
  const out = [];
  const choice = track(c.id).choice;
  if (c.factory?.partNumber) out.push({ key: 'factory', kind: 'GM', source: 'GM part', pn: String(c.factory.partNumber).replace(/^GM\s*/i, ''), name: c.factory.name || '', chosen: choice === 'factory' });
  c.raceOptions.forEach((o, i) => {
    if (!o.partNumber) return;
    out.push({ key: `race-${i}`, kind: o.brand || 'Race', source: `Race option${o.brand ? ` · ${o.brand}` : ''}`, pn: o.partNumber, name: o.name || '', chosen: choice === `race-${i}`, kit: /\bkit\b|;|\+/i.test(`${o.name || ''} ${o.partNumber}`) });
  });
  return out;
}

export function pct(ids) {
  if (!ids.length) return 0;
  return ids.filter((id) => track(id).status === 'installed').length / ids.length;
}

let order = null;
/** Position of a part in the Systems tree (system order, then area, then main parts first). */
export function partOrder(id) {
  if (!order) {
    order = new Map();
    let n = 0;
    for (const s of state.db.systems) for (const g of s.subsystems) for (const cid of g.componentIds) order.set(cid, n++);
  }
  return order.get(id) ?? 1e6;
}
export const byPartOrder = (a, b) => partOrder(a.id ?? a) - partOrder(b.id ?? b);

/** Research notes sometimes cite other parts by id; show their names instead (never the id). */
export function humanize(text) {
  return String(text ?? '')
    .replace(/listed again here for the [a-z ]+? builder;?\s*/gi, '')
    .replace(/\b[a-z][a-z0-9-]*\.[a-z0-9-]+\.[a-z0-9-]+(?:--[a-z]{2})?\b/g, (id) => {
      const base = id.replace(/--[a-z]{2}$/, '');
      const c = state.byId.get(id) || state.byId.get(base) || state.db.components.find((x) => x.baseId === base);
      if (c) return c.short;
      const last = base.split('.').pop().replace(/-/g, ' ');
      return last.charAt(0).toUpperCase() + last.slice(1);
    });
}
