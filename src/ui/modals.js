// Full-screen tools: torque specs, build tracker + shopping list, inspection checklist, parts catalog,
// schematics and help. One <dialog>, focus goes back to whatever opened it.
import { state, on, select, emit, track, setTrack, STATUSES, exportTracker, importTracker } from '../state.js';
import { el, esc, download, toast } from './dom.js';
import { icon, STATUS_ICON } from './icons.js';
import { renderSchematic } from './schematic.js';
import { KINDS } from '../kinds.js';
import { renderPartsList } from './partslist.js';
import { printTorqueCard, printChecklist } from './print.js';
import { tqMain, humanize, partOrder, byPartOrder, confPill, confirmText, confirmLine, confirmIsNote, reusePill, statusBadge, systemName, groupTitle, zoneName, partNumbers, STATUS_WORD } from './present.js';
import { CONFIDENCE, confidenceOf, hasTorque, parseTorque, parseHw, isDuplicateRow, reuseClass } from '../torque.js';

const dlg = () => document.getElementById('modal');
const ZONE_ORDER = ['FL', 'FR', 'RL', 'RR', 'FRONT', 'ENG', 'CAB', 'REAR', 'UNDER', 'CAR', 'PROC'];
let current = null;
let opener = null;
let unsub = null;

export function initModals() {
  document.getElementById('modal-close').innerHTML = icon('close', 20);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  dlg().addEventListener('click', (e) => { if (e.target === dlg()) closeModal(); });
  dlg().addEventListener('close', () => {
    for (const id of ['layout', 'top']) document.getElementById(id)?.removeAttribute('inert');
    current = null;
    unsub?.();
    unsub = null;
    emit('modal-closed');
    opener?.focus?.();
    opener = null;
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlg().open && dlg().classList.contains('docked')) closeModal(); });
  on('focus-title', () => { opener = null; }); // jumping to a part: the part title takes focus, not the opener
  on('open-modal', openModal);
  on('close-modal', () => { if (dlg().open) closeModal(); });
}

export function isModalOpen() {
  return dlg().open;
}

const TITLES = {
  torque: 'Torque specs', tracker: 'Build tracker', catalog: 'Parts catalog', inspect: 'Between-sessions checklist',
  schematics: 'Schematics', help: 'How to use this',
};

export function openModal(opts) {
  if (!dlg().open) opener = document.activeElement;
  current = opts;
  unsub?.();
  unsub = null;
  const tools = document.getElementById('modal-tools');
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = TITLES[opts.name] || TITLES.help;
  tools.replaceChildren();
  body.replaceChildren();
  body.scrollTop = 0;
  ({ torque, tracker, catalog, inspect: inspectList, schematics }[opts.name] || help)(tools, body, opts);
  if (!dlg().open) {
    // phones: open as a page above the tab bar (not top layer) so the tabs stay usable
    const docked = matchMedia('(max-width: 720px)').matches;
    dlg().classList.toggle('docked', docked);
    if (docked) {
      dlg().show();
      for (const id of ['layout', 'top']) document.getElementById(id)?.toggleAttribute('inert', true);
      document.getElementById('modal-title').focus?.();
    } else dlg().showModal();
  }
  emit('modal-opened', opts.name);
}

export function closeModal() {
  if (dlg().open) dlg().close();
}

function goTo(id) {
  closeModal();
  select({ type: 'component', id });
  emit('frame', { type: 'component', id });
}

function labelled(text, control) {
  const l = el('label', 'tool-field');
  l.appendChild(el('span', 'sr-only', esc(text)));
  l.appendChild(control);
  return l;
}

function selectOf(label, options, value) {
  const s = el('select');
  s.innerHTML = options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  s.value = value || '';
  s.setAttribute('aria-label', label);
  return s;
}
const systemOptions = (all = 'All systems') => [['', all], ...state.db.systems.map((s) => [s.id, systemName(s.id)])];
const zoneOptions = () => [['', 'Everywhere on the car'], ...ZONE_ORDER.filter((z) => state.zoneById.has(z)).map((z) => [z, zoneName(z)])];

function searchBox(placeholder) {
  const q = el('input');
  q.type = 'search';
  q.placeholder = placeholder;
  q.setAttribute('aria-label', placeholder);
  return q;
}

function iconBtn(ic, label, onClick, cls = 'btn') {
  const b = el('button', cls, `${icon(ic, 16)}<span class="lbl">${esc(label)}</span>`);
  b.type = 'button';
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

/** Order within a location: main parts first, then by build step, biggest torque (most critical) first. */
const maxNm = new Map();
function installRank(c) {
  if (!maxNm.has(c.id)) maxNm.set(c.id, Math.max(0, ...c.hardware.filter(hasTorque).map((h) => parseFloat(parseHw(h).primary) || 0)));
  return c.tier * 1e7 + (c.buildPhase || 99) * 1e4 - Math.min(9999, maxNm.get(c.id));
}

/** Compact confidence key: three pills, the meanings one tap away. */
function confKey() {
  const d = el('details', 'conf-key');
  d.innerHTML = `<summary>${confPill('verified')}${confPill('typical')}${confPill('estimate')}<span class="muted">What do these mean?</span></summary>
    <ul class="list-plain">${['verified', 'typical', 'estimate'].map((k) => `<li><b>${esc(CONFIDENCE[k].label)}</b> — ${esc(CONFIDENCE[k].desc)}</li>`).join('')}</ul>`;
  return d;
}

/** Phone: filters fold behind one button that shows how many are set. */
function filterToggle(tools, countFn) {
  const b = el('button', 'btn filter-toggle', '');
  b.type = 'button';
  const draw = () => { const n = countFn(); b.innerHTML = `${icon('sliders', 16)}Filters${n ? ` (${n})` : ''}`; };
  b.setAttribute('aria-expanded', 'false');
  b.addEventListener('click', () => {
    const v = !tools.classList.contains('show-filters');
    tools.classList.toggle('show-filters', v);
    b.setAttribute('aria-expanded', String(v));
  });
  tools.addEventListener('change', draw);
  setTimeout(draw);
  return b;
}

/** Long research notes: first line visible, the rest one tap away. */
function clip(text, n = 170) {
  const t = String(text || '');
  if (t.length <= n) return esc(t);
  const cut = t.slice(0, n).replace(/\s+\S*$/, '');
  return `<details class="clip"><summary>${esc(cut)}… <span class="more-tag">more</span></summary>${esc(t.slice(cut.length))}</details>`;
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\n');

/** Default scope from what is selected right now. */
function scopeFromSelection(opts) {
  if (opts.system || opts.subsystem || opts.zone) return opts;
  const sel = state.selection;
  if (!sel) return opts;
  if (sel.type === 'system') return { ...opts, system: sel.id };
  if (sel.type === 'subsystem') return { ...opts, subsystem: sel.id };
  if (sel.type === 'zone') return { ...opts, zone: sel.id };
  const c = state.byId.get(sel.id);
  return c ? { ...opts, subsystem: c.subsystem } : opts;
}

// ------------------------------------------------------------------ torque
function torque(tools, body, opts0) {
  const opts = scopeFromSelection(opts0);
  const sys = selectOf('System', systemOptions(), opts.system || (opts.subsystem && state.subById.get(opts.subsystem)?.system));
  const zone = selectOf('Location', zoneOptions(), opts.zone || (opts.subsystem && zoneOfGroup(opts.subsystem)));
  const conf = selectOf('Confidence', [['', 'Any confidence'], ['verified', 'Verified only'], ['typical', 'Typical'], ['estimate', 'Estimates (confirm first)']]);
  const view = selectOf('View', [['parts', 'By part'], ['totals', 'Fastener order list']], 'parts');
  const q = searchBox('Filter: M12, caliper, replace…');
  let sub = opts.subsystem || '';
  const scopeChip = el('span');
  tools.append(q, filterToggle(tools, () => [zone, sys, conf].filter((x) => x.value).length + (sub ? 1 : 0)), labelled('Location', zone), labelled('System', sys), labelled('Confidence', conf), labelled('View', view));
  const actions = el('div', 'tool-actions');
  actions.append(
    iconBtn('print', 'Print card', () => printTorqueCard({ title: scopeTitle(), ids: rows().map((r) => r.c.id).filter((v, i, a) => a.indexOf(v) === i) })),
    iconBtn('download', 'CSV', () => exportCsv()),
  );
  tools.append(actions);

  const scopeTitle = () => `${sub ? groupTitle(sub) : [zone.value && zoneName(zone.value), sys.value && systemName(sys.value)].filter(Boolean).join(' · ') || 'Whole car'} — torque card`;

  function rows() {
    const out = [];
    const f = q.value.trim().toLowerCase();
    const comps = sub ? state.subById.get(sub).componentIds.map((id) => state.byId.get(id)) : state.db.components;
    for (const c of comps) {
      if (sys.value && c.system !== sys.value) continue;
      if (zone.value && c.zone !== zone.value) continue;
      for (const h of c.hardware) {
        if (isDuplicateRow(h)) continue; // the same bolts are listed on the other part of the joint
        if (view.value === 'parts' && !hasTorque(h)) continue;
        if (conf.value && confidenceOf(h) !== conf.value) continue;
        if (f) {
          const text = `${c.displayName} ${c.alias} ${h.item} ${h.spec} ${h.grade} ${h.torque} ${h.reuse} ${h.threadlocker} ${h.notes}`.toLowerCase();
          if (!f.split(/\s+/).every((t) => text.includes(t))) continue;
        }
        out.push({ c, h });
      }
    }
    out.sort((a, b) => ZONE_ORDER.indexOf(a.c.zone) - ZONE_ORDER.indexOf(b.c.zone) || installRank(a.c) - installRank(b.c));
    return out;
  }

  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 1; };
  function totals(r) {
    const map = new Map();
    for (const { c, h } of r) {
      const key = `${(h.spec || h.item || '').trim().toLowerCase()}|${(h.grade || '').trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, { spec: h.spec || h.item, grade: h.grade || '', qty: 0, parts: new Set(), replace: false });
      const m = map.get(key);
      m.qty += num(h.qty);
      m.parts.add(c.displayName);
      if (['REPLACE', 'DISPUTED'].includes(reuseClass(h.reuse))) m.replace = true;
    }
    return [...map.values()].sort((a, b) => String(a.spec).localeCompare(String(b.spec)));
  }

  function draw() {
    const r = rows();
    body.replaceChildren();
    const est = r.filter((x) => confidenceOf(x.h) === 'estimate').length;
    scopeChip.textContent = '';
    const strip = el('div', 'summary-strip');
    if (sub) {
      const chip = el('button', 'btn quiet', `${icon('close', 14)}Only ${esc(groupTitle(sub))}`);
      chip.type = 'button';
      chip.addEventListener('click', () => { sub = ''; draw(); });
      strip.appendChild(chip);
    }
    if (view.value === 'totals') {
      const t = totals(r);
      strip.appendChild(el('div', 'note-warn', `<b>Order list.</b> Quantities are per part, before left/right doubling where a part is listed once. Buy spares of anything marked replace.`));
      body.appendChild(strip);
      const table = el('table', 'data collapse');
      table.innerHTML = '<thead><tr><th>Qty</th><th>Fastener</th><th>Grade</th><th>Replace?</th><th>Used on</th></tr></thead>';
      const tb = el('tbody');
      for (const m of t) tb.appendChild(el('tr', '', `<td class="mono">${Math.round(m.qty)}</td><td class="mono">${esc(m.spec)}</td><td>${esc(m.grade)}</td><td>${m.replace ? '<span class="pill reuse-REPLACE">Replace</span>' : ''}</td><td style="color:var(--text-2)">${esc([...m.parts].slice(0, 5).join(', '))}${m.parts.size > 5 ? ` +${m.parts.size - 5} more` : ''}</td>`));
      table.appendChild(tb);
      body.appendChild(table);
      const cards = el('div', 'cards');
      for (const m of t) cards.appendChild(el('div', 'card', `<div class="card-head"><b class="mono">${Math.round(m.qty)}× ${esc(m.spec)}</b>${m.replace ? '<span class="pill reuse-REPLACE">Replace</span>' : ''}</div><div class="card-sub">${esc(m.grade)} · ${esc([...m.parts].slice(0, 3).join(', '))}${m.parts.size > 3 ? '…' : ''}</div>`));
      body.appendChild(cards);
      return;
    }
    strip.appendChild(el('p', 'strip-line', `<b>${r.length}</b> torque specs${est ? ` · <b class="warn-text">${est}</b> estimates to confirm` : ''}`));
    strip.appendChild(confKey());
    body.appendChild(strip);
    if (!r.length) { body.appendChild(el('div', 'help', 'No torque specs match these filters.')); return; }

    const table = el('table', 'data collapse');
    table.innerHTML = '<thead><tr><th>Torque</th><th>Fastener</th><th>Qty</th><th>Size</th><th>Confidence</th><th>Threads</th><th>Reuse</th><th>Sequence / notes</th></tr></thead>';
    const tb = el('tbody');
    const cards = el('div', 'cards');
    let lastZone = null;
    let lastC = null;
    for (const { c, h } of r) {
      if (c.zone !== lastZone) {
        lastZone = c.zone;
        tb.appendChild(el('tr', 'zone-row', `<td colspan="8">${icon('pin', 14)}${esc(zoneName(c.zone))}</td>`));
        cards.appendChild(el('div', 'pl-group', `${icon('pin', 14)}${esc(zoneName(c.zone))}`));
      }
      if (c !== lastC) {
        lastC = c;
        const g = el('tr', 'group-row', `<td colspan="8"><span class="sw" style="background:${state.sysById.get(c.system).color}"></span> <button type="button" class="link">${esc(c.short)}</button> <span class="muted">· ${esc(systemName(c.system))}</span></td>`);
        g.querySelector('button').addEventListener('click', () => goTo(c.id));
        tb.appendChild(g);
      }
      const t = parseHw(h);
      const why = confirmText(h, t);
      const confirm = !!why && !confirmIsNote(h, t);
      const tq = `<div class="tq-main">${tqMain(t, h.torque)}</div>`;
      tb.appendChild(el('tr', confirm ? 'est' : '', `<td class="tq-cell">${tq}${confirmLine(h, t, 'div')}</td><td>${esc(h.item)}</td><td class="mono">${esc(h.qty ?? '')}</td><td class="mono">${esc([h.spec, h.grade].filter(Boolean).join(' · '))}</td><td>${confPill(h)}</td><td class="mono">${esc(h.threadlocker && !/^none/i.test(h.threadlocker) ? h.threadlocker.replace(/\s*\(.*\)/, '') : '—')}</td><td>${reusePill(h)}</td><td class="muted">${clip(humanize([h.torqueSequence, h.notes].filter(Boolean).join(' — ')))}</td>`));
      const card = el('div', `card${confirm ? ' est' : ''}`, `
        <div class="card-head"><b>${esc(h.item || 'Fastener')}${h.qty ? ` <span class="muted">×${esc(h.qty)}</span>` : ''}</b>${confPill(h)}</div>
        <div class="card-sub">${esc(c.short)}${h.spec ? ` · <span class="mono">${esc(h.spec)}</span>` : ''}</div>
        <div class="tq-main">${tqMain(t, h.torque)}</div>
        <div class="row-pills">${reusePill(h)}${confirmLine(h, t)}</div>
        ${h.threadlocker && !/^none/i.test(h.threadlocker) ? `<div class="card-sub">Threads: <b>${esc(h.threadlocker)}</b></div>` : ''}
        ${h.torqueSequence ? `<div class="card-sub">${clip(humanize(h.torqueSequence))}</div>` : ''}`);
      cards.appendChild(card);
    }
    table.appendChild(tb);
    body.append(table, cards);
  }

  function exportCsv() {
    const r = rows();
    if (view.value === 'totals') {
      download('camaro-fastener-order-list.csv', toCsv([['Qty', 'Fastener', 'Grade', 'Replace', 'Used on'], ...totals(r).map((m) => [Math.round(m.qty), m.spec, m.grade, m.replace ? 'yes' : '', [...m.parts].join('; ')])]), 'text/csv');
      return;
    }
    download('camaro-torque-specs.csv', toCsv([
      ['Location', 'System', 'Area', 'Part', 'Fastener', 'Qty', 'Size', 'Grade', 'Torque (N·m first)', 'As written', 'Confidence', 'Confirm first', 'Sequence', 'Threadlocker', 'Reuse', 'Source'],
      ...r.map(({ c, h }) => {
        const t = parseHw(h);
        return [zoneName(c.zone), systemName(c.system), groupTitle(c.subsystem), c.displayName, h.item, h.qty, h.spec, h.grade, t.steps.join(', '), h.torque, CONFIDENCE[confidenceOf(h)].label, confidenceOf(h) === 'estimate' || t.confirm ? 'yes' : '', h.torqueSequence, h.threadlocker, h.reuse, h.source];
      }),
    ]), 'text/csv');
  }

  [sys, zone, conf, view].forEach((x) => x.addEventListener('change', () => { if (x !== conf && x !== view) sub = ''; draw(); }));
  let tm;
  q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(draw, 120); });
  draw();
}

// ------------------------------------------------------------------ tracker + shopping list
function choiceLabel(c, key) {
  if (!key) return '';
  if (key === 'factory') return c.factory?.name ? `GM ${c.factory.name}` : 'GM factory';
  const o = c.raceOptions[Number(key.split('-')[1])];
  return o ? `${o.brand ? `${o.brand} ` : ''}${o.name || ''}`.trim() : '';
}
function choicePn(c, key) {
  if (key === 'factory') return c.factory?.partNumber || '';
  if (key?.startsWith('race-')) return c.raceOptions[Number(key.split('-')[1])]?.partNumber || '';
  return ''; // never fill in a number for an option nobody picked
}
const optionCount = (c) => (c.factory ? 1 : 0) + c.raceOptions.length;

function tracker(tools, body, opts) {
  const view = selectOf('View', [['parts', 'All parts'], ['shop', 'Shopping list']], opts.view || 'parts');
  const sys = selectOf('System', systemOptions(), opts.system);
  const zone = selectOf('Location', zoneOptions(), opts.zone);
  const st = selectOf('Status', [['', 'Any status'], ['none', 'Not set'], ...STATUSES.map((s) => [s.id, s.label])]);
  const q = searchBox('Filter parts');
  const bulk = selectOf('Set status for every part shown', [['', 'Set all shown to…'], ...STATUSES.map((s) => [s.id, s.label]), ['clear', 'Not set']]);
  const file = el('input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.hidden = true;
  const actions = el('div', 'tool-actions');
  actions.append(
    iconBtn('download', 'Shopping CSV', () => shopCsv()),
    iconBtn('download', 'Back up', () => { download(`camaro-build-backup-${new Date().toISOString().slice(0, 10)}.json`, exportTracker(), 'application/json'); toast('Backup saved to your downloads'); }),
    iconBtn('upload', 'Restore', () => file.click()),
    file,
  );
  tools.append(labelled('View', view), q, filterToggle(tools, () => [zone, sys, st].filter((x) => x.value).length), labelled('Location', zone), labelled('System', sys), labelled('Status', st), labelled('Bulk', bulk), actions);

  const shown = () => {
    const f = q.value.trim().toLowerCase();
    return state.db.components.slice().sort(byPartOrder).filter((c) => (!sys.value || c.system === sys.value)
      && (!zone.value || c.zone === zone.value)
      && (!st.value || (track(c.id).status || 'none') === st.value)
      && (!f || `${c.displayName} ${c.alias}`.toLowerCase().includes(f)));
  };

  /** needed/ordered parts, left & right merged into one line with a combined quantity. */
  function shopping() {
    const map = new Map();
    for (const c of state.db.components) {
      const tr = track(c.id);
      if (!['needed', 'ordered'].includes(tr.status)) continue;
      if (sys.value && c.system !== sys.value) continue;
      if (zone.value && c.zone !== zone.value) continue;
      const key = `${c.baseId || c.id}|${tr.status}|${tr.choice || ''}`;
      if (!map.has(key)) map.set(key, { c, status: tr.status, choice: tr.choice, qty: 0, locs: [], notes: [] });
      const m = map.get(key);
      m.qty += Number(c.qty) || 1;
      m.locs.push(c.loc ? zoneName(c.loc) : zoneName(c.zone));
      if (tr.notes) m.notes.push(tr.notes);
    }
    return [...map.values()].sort((a, b) => a.status.localeCompare(b.status) || a.c.system.localeCompare(b.c.system));
  }

  function statusSelect(c) {
    const s = selectOf(`Status for ${c.displayName}`, [['', 'Not set'], ...STATUSES.map((x) => [x.id, x.label])], track(c.id).status || '');
    s.addEventListener('change', () => setTrack(c.id, { status: s.value }));
    return s;
  }

  function draw() {
    const scroll = body.scrollTop;
    body.replaceChildren();
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
    state.db.components.forEach((c) => { const s = track(c.id).status; if (s) counts[s]++; });
    const strip = el('div', 'summary-strip');
    for (const s of STATUSES) strip.appendChild(el('div', 'fact', `<span class="st st-${s.id}">${icon(STATUS_ICON[s.id], 14)}${esc(s.label)}</span><b>${counts[s.id]}</b>`));
    strip.appendChild(el('div', 'fact', `<span>Total parts</span><b>${state.db.components.length}</b>`));
    body.appendChild(strip);
    bulk.disabled = view.value !== 'parts';

    if (view.value === 'shop') {
      const list = shopping();
      body.appendChild(el('p', 'pl-hint m-pad-x', 'Parts you marked <b>Need</b> or <b>Ordered</b>. Left and right sides are combined into one line. Pick a brand in each part’s Options tab to fill in the part number.'));
      if (!list.length) { body.appendChild(el('div', 'help', 'Nothing on the shopping list. Mark parts as Need in the parts list or a part’s page.')); return; }
      const table = el('table', 'data collapse');
      table.innerHTML = '<thead><tr><th>Status</th><th>Part</th><th>Qty</th><th>Where</th><th>My choice</th><th>Part number</th><th>Notes</th></tr></thead>';
      const tb = el('tbody');
      const cards = el('div', 'cards');
      for (const m of list) {
        const name = m.c.short || m.c.displayName;
        const row = el('tr', '', `<td>${statusBadge(m.c.id)}</td><td><button type="button" class="link">${esc(name)}</button><div class="muted">${esc(systemName(m.c.system))}</div></td><td class="mono">${m.qty}</td><td>${esc(m.locs.join(', '))}</td><td>${esc(choiceLabel(m.c, m.choice)) || `<span class="muted">Not chosen — ${optionCount(m.c)} options</span>`}</td><td class="mono">${esc(choicePn(m.c, m.choice))}</td><td class="muted">${esc(m.notes.join(' / '))}</td>`);
        row.querySelector('button').addEventListener('click', () => goTo(m.c.id));
        tb.appendChild(row);
        cards.appendChild(el('div', 'card', `<div class="card-head"><b>${m.qty}× ${esc(name)}</b>${statusBadge(m.c.id)}</div><div class="card-sub">${esc(m.locs.join(', '))}</div><div class="card-sub">${esc(choiceLabel(m.c, m.choice) || `Not chosen — ${optionCount(m.c)} options`)} <span class="mono">${esc(choicePn(m.c, m.choice))}</span></div>`));
      }
      table.appendChild(tb);
      body.append(table, cards);
      return;
    }

    const comps = shown();
    const table = el('table', 'data collapse');
    table.innerHTML = '<thead><tr><th>Part</th><th>Location</th><th>Step</th><th>Qty</th><th>Status</th><th>My choice</th><th>Notes</th></tr></thead>';
    const tb = el('tbody');
    const cards = el('div', 'cards');
    let lastSub = null;
    for (const c of comps) {
      if (c.subsystem !== lastSub) {
        lastSub = c.subsystem;
        const title = `${systemName(c.system)} › ${groupTitle(c.subsystem)}`;
        tb.appendChild(el('tr', 'group-row', `<td colspan="7"><span class="sw" style="background:${state.sysById.get(c.system).color}"></span> ${esc(title)}</td>`));
        cards.appendChild(el('div', 'pl-group', `<span class="sw" style="background:${state.sysById.get(c.system).color}"></span>${esc(title)}`));
      }
      const tr = track(c.id);
      const row = el('tr', '', `<td><button type="button" class="link">${esc(c.short)}</button></td><td>${esc(c.loc ? zoneName(c.loc) : zoneName(c.zone))}</td><td class="mono" title="${esc(state.db.phases.find((p) => p.n === c.buildPhase)?.name || '')}">${c.buildPhase || ''}</td><td class="mono">${esc(c.qty)}</td><td></td><td>${esc(choiceLabel(c, tr.choice))}</td><td class="muted">${esc(tr.notes || '')}</td>`);
      row.querySelector('button').addEventListener('click', () => goTo(c.id));
      row.children[4].appendChild(statusSelect(c));
      tb.appendChild(row);
      const card = el('div', 'card', `<div class="card-head"><button type="button" class="link">${esc(c.displayName)}</button>${c.qty > 1 ? `<span class="muted">×${esc(c.qty)}</span>` : ''}</div>`);
      card.querySelector('button').addEventListener('click', () => goTo(c.id));
      const ss = statusSelect(c);
      ss.style.marginTop = '8px';
      ss.style.width = '100%';
      card.appendChild(ss);
      cards.appendChild(card);
    }
    if (!comps.length) body.appendChild(el('div', 'help', 'No parts match these filters.'));
    table.appendChild(tb);
    body.append(table, cards);
    body.scrollTop = scroll;
  }

  function shopCsv() {
    download('camaro-shopping-list.csv', toCsv([
      ['Status', 'System', 'Part', 'Qty', 'Where', 'My choice', 'Part number', 'GM part', 'GM part number', 'Notes'],
      ...shopping().map((m) => [STATUS_WORD[m.status], systemName(m.c.system), m.c.short || m.c.displayName, m.qty, m.locs.join(', '), choiceLabel(m.c, m.choice), choicePn(m.c, m.choice), m.c.factory?.name, m.c.factory?.partNumber, m.notes.join(' / ')]),
    ]), 'text/csv');
  }

  bulk.addEventListener('change', () => {
    if (!bulk.value) return;
    const comps = shown();
    const before = comps.map((c) => [c.id, track(c.id).status || '']);
    const v = bulk.value === 'clear' ? '' : bulk.value;
    for (const c of comps) setTrack(c.id, { status: v });
    toast(`${comps.length} parts set to ${v ? STATUS_WORD[v] : 'Not set'}`, { label: 'Undo', run: () => before.forEach(([id, s]) => setTrack(id, { status: s })) });
    bulk.value = '';
  });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      importTracker(await f.text());
      toast('Backup restored');
    } catch (e) {
      toast(`Could not read that backup file: ${e.message}`);
    }
    file.value = '';
  });
  [view, sys, zone, st].forEach((x) => x.addEventListener('change', draw));
  let tm;
  q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(draw, 120); });
  let raf = 0;
  unsub = on('tracker', () => { if (current?.name === 'tracker' && !raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); });
  draw();
}

// ------------------------------------------------------------------ inspection checklist
const INSPECT_KEY = 'camaro-inspect-v1';
function loadChecks() {
  try { return JSON.parse(localStorage.getItem(INSPECT_KEY) || '{}') || {}; } catch { return {}; }
}
function saveChecks(v) {
  try { localStorage.setItem(INSPECT_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

function inspectList(tools, body, opts0) {
  const sc = scopeFromSelection(opts0);
  const opts = { ...opts0, zone: sc.zone || (sc.subsystem && zoneOfGroup(sc.subsystem)) || opts0.zone };
  const zone = selectOf('Location', zoneOptions(), opts.zone);
  const sys = selectOf('System', systemOptions(), opts.system);
  let checks = loadChecks();
  const when = selectOf('How often', [['session', 'Every session'], ['event', 'Every event'], ['rebuild', 'Rebuild / annual'], ['', 'All checks']], opts.when ?? 'session');
  const items = () => state.db.components
    .filter((c) => c.inspection.length && (!zone.value || c.zone === zone.value) && (!sys.value || c.system === sys.value))
    .sort((a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone) || partOrder(a.id) - partOrder(b.id))
    .flatMap((c) => c.inspection.map((text, i) => ({ c, text, key: `${c.id}#${i}`, when: interval(text) })))
    .filter((it) => !when.value || it.when === when.value);
  const actions = el('div', 'tool-actions');
  actions.append(
    iconBtn('print', 'Print', () => printChecklist(items(), `${when.selectedOptions[0].text} checks`)),
    iconBtn('reset', 'Start a new event', () => {
      const prev = checks;
      checks = {};
      saveChecks(checks);
      draw();
      toast('Checklist cleared', { label: 'Undo', run: () => { checks = prev; saveChecks(checks); draw(); } });
    }),
  );
  tools.append(labelled('How often', when), labelled('Location', zone), labelled('System', sys), actions);

  function draw() {
    const list = items();
    const done = list.filter((x) => checks[x.key]).length;
    body.replaceChildren();
    const strip = el('div', 'summary-strip');
    strip.appendChild(el('div', 'fact', `<span>Checked</span><b>${done} of ${list.length}</b>`));
    strip.appendChild(el('p', 'pl-hint', 'Walk the car corner by corner. Ticks are saved on this device until you start a new event. Change “How often” for event and rebuild checks.'));
    body.appendChild(strip);
    const wrap = el('div', 'm-pad');
    let lastZone = null;
    let lastC = null;
    for (const it of list) {
      if (it.c.zone !== lastZone) {
        lastZone = it.c.zone;
        const n = list.filter((x) => x.c.zone === lastZone);
        wrap.appendChild(el('h3', 'check-zone', `${icon('pin', 15)}${esc(zoneName(lastZone))}<span class="count">${n.filter((x) => checks[x.key]).length}/${n.length}</span>`));
      }
      if (it.c !== lastC) {
        lastC = it.c;
        const b = el('button', 'check-part link', esc(it.c.short));
        b.type = 'button';
        b.addEventListener('click', () => goTo(it.c.id));
        wrap.appendChild(b);
      }
      const row = el('div', 'check-row');
      const id = `chk-${it.key.replace(/[^a-z0-9]/gi, '-')}`;
      row.innerHTML = `<input type="checkbox" id="${id}" ${checks[it.key] ? 'checked' : ''}><label for="${id}">${esc(it.text)}</label>`;
      row.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) checks[it.key] = Date.now(); else delete checks[it.key];
        saveChecks(checks);
        strip.querySelector('.fact b').textContent = `${list.filter((x) => checks[x.key]).length} of ${list.length}`;
      });
      wrap.appendChild(row);
    }
    if (!list.length) wrap.appendChild(el('div', 'help', 'No inspection items for these filters.'));
    body.appendChild(wrap);
  }
  [when, zone, sys].forEach((x) => x.addEventListener('change', draw));
  draw();
}

/** How often a check is due, from its wording. */
function interval(text) {
  const t = text.toLowerCase();
  if (/annual|yearly|rebuild|season|teardown|overhaul|magnaflux|crack.?(check|test)|every \d+\s*(hours|hrs|events|races|weekends)|replace every|freshen/.test(t)) return 'rebuild';
  if (/each event|every event|weekend|race day|after (each|every) (race|event)|per event/.test(t)) return 'event';
  return 'session';
}

/** The one location an area sits in, if it is all at one spot. */
function zoneOfGroup(gid) {
  const zs = new Set((state.subById.get(gid)?.componentIds || []).map((id) => state.byId.get(id)?.zone));
  return zs.size === 1 ? [...zs][0] : '';
}

// ------------------------------------------------------------------ catalog
function catalog(tools, body, opts0) {
  const opts = scopeFromSelection(opts0);
  const sys = selectOf('System', systemOptions(), opts.system || (opts.subsystem && state.subById.get(opts.subsystem)?.system));
  const sub = el('select');
  sub.setAttribute('aria-label', 'Area');
  const zone = selectOf('Location', zoneOptions(), opts.zone);
  const fillSubs = () => {
    const s = state.sysById.get(sys.value);
    sub.innerHTML = `<option value="">All areas</option>${s ? s.subsystems.map((x) => `<option value="${x.id}">${esc(groupTitle(x.id))}</option>`).join('') : ''}`;
    sub.disabled = !s;
  };
  fillSubs();
  if (opts.subsystem) sub.value = opts.subsystem;
  tools.append(labelled('Location', zone), labelled('System', sys), labelled('Area', sub));
  const draw = () => {
    body.replaceChildren();
    let ids = sub.value
      ? state.subById.get(sub.value).componentIds
      : state.db.systems.filter((s) => !sys.value || s.id === sys.value).flatMap((s) => s.subsystems.flatMap((x) => x.componentIds));
    if (zone.value) ids = ids.filter((id) => state.byId.get(id)?.zone === zone.value);
    const inner = el('div', 'pl-modal');
    body.appendChild(inner);
    renderPartsList(inner, ids, { layout: 'grid', group: sub.value ? 'tier' : 'subsystem', groupId: sub.value || null, showLoc: true });
  };
  sys.addEventListener('change', () => { fillSubs(); draw(); });
  [sub, zone].forEach((x) => x.addEventListener('change', draw));
  draw();
}

// ------------------------------------------------------------------ schematics
function schematics(tools, body, opts) {
  const all = state.db.systems.flatMap((s) => s.schematics.map((sc) => ({ s, sc })));
  if (!all.length) { body.appendChild(el('div', 'help', 'Schematics are still being researched.')); return; }
  const wrap = el('div', 'schem-wrap');
  const list = el('nav', 'schem-list');
  list.setAttribute('aria-label', 'Schematics');
  const view = el('div', 'schem-view');
  wrap.append(list, view);
  body.appendChild(wrap);
  let pick = all.find((x) => x.s.id === opts.system) || all[0];
  const draw = () => {
    list.replaceChildren();
    let last = null;
    for (const item of all) {
      if (item.s !== last) { last = item.s; list.appendChild(el('div', 'schem-sys', `<span class="sw" style="background:${item.s.color}"></span>${esc(systemName(item.s.id))}`)); }
      const row = el('button', 'schem-item', `${esc(item.sc.title || item.sc.id)}<small>${esc(item.sc.type || '')} · ${item.sc.nodes.length} parts</small>`);
      row.type = 'button';
      if (item === pick) row.setAttribute('aria-current', 'true');
      row.addEventListener('click', () => { pick = item; draw(); });
      list.appendChild(row);
    }
    renderSchematic(view, pick.sc, { onNode: goTo, linked: (id) => state.byId.has(id) });
  };
  draw();
}

// ------------------------------------------------------------------ help
function help(tools, body) {
  body.appendChild(el('div', 'help', `
    <h3>Finding a part</h3>
    <ul>
      <li><b>Systems</b> (left panel) lists every part by system, then by area. Corner parts are split per corner: <i>Suspension › Front Left</i> has every suspension part on that wheel.</li>
      <li><b>Locations</b> shows everything at one spot from every system — e.g. the whole front left corner: suspension, brakes, wheel, tie rod.</li>
      <li><b>Build order</b> walks the 11 steps from a bare shell. Opening a step shows the car built up to that point.</li>
      <li><b>Search</b> (press <kbd>/</kbd>) finds names, nicknames, bolt sizes like “M12” and part numbers.</li>
    </ul>
    <h3>Using the 3D car</h3>
    <ul>
      <li><b>Turn</b>: drag · <b>Move</b>: right-drag or two fingers · <b>Zoom</b>: scroll or pinch.</li>
      <li><b>Tap</b> a part to select it; <b>double-tap</b> to zoom right in. The selected part is orange and the parts it connects to are teal.</li>
      <li><b>Body</b> shows, fades or hides the shell, and hides the hood, doors, interior or wheels so you can see in.</li>
      <li><b>Colours</b>: Part colours look like the real finish; System colours tell systems apart; Build status shows your progress.</li>
      <li><b>Explode</b> pulls systems apart. <b>Hoses &amp; wiring</b> shows lines; <b>Flow</b> animates what runs through them.</li>
    </ul>
    <h3>Line colours</h3>
    <ul style="columns:2">${Object.values(KINDS).map((k) => `<li><span style="display:inline-block;width:18px;height:3px;background:${k.color};vertical-align:middle;margin-right:6px"></span>${esc(k.label)}</li>`).join('')}</ul>
    <h3>Torque values</h3>
    <ul>
      <li>${confPill('verified')} ${esc(CONFIDENCE.verified.desc)}</li>
      <li>${confPill('typical')} ${esc(CONFIDENCE.typical.desc)}</li>
      <li>${confPill('estimate')} ${esc(CONFIDENCE.estimate.desc)}</li>
      <li>Values show N·m first, then ft-lb. Angle steps (“then +90°”) come after the torque step.</li>
    </ul>
    <h3>Your progress</h3>
    <ul>
      <li>Statuses, brand choices, notes and checklist ticks are saved <b>in this browser on this device</b>. Helpers on another phone have their own copy.</li>
      <li>Use <b>Build tracker › Back up</b> often, and <b>Restore</b> to move your progress to another device.</li>
      <li>3D shapes are simplified models placed at their real positions; sizes marked “Approx.” are estimates.</li>
    </ul>`));
}
