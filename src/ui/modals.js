// Modal screens: schematics, torque specs, build tracker, help.
import { state, on, select, emit, track, setTrack, STATUSES, exportTracker, importTracker } from '../state.js';
import { el, esc, download } from './dom.js';
import { renderSchematic } from './schematic.js';
import { KINDS } from '../kinds.js';
import { renderPartsList } from './partslist.js';

const modal = () => document.getElementById('modal');
let current = null;
let trackerUnsub = null;

export function initModals() {
  document.querySelectorAll('[data-modal]').forEach((b) => b.addEventListener('click', () => openModal({ name: b.dataset.modal })));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal().addEventListener('click', (e) => { if (e.target === modal()) closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal().hidden) closeModal(); });
  on('open-modal', openModal);
  on('close-modal', () => { if (!modal().hidden) closeModal(); });
}

export function openModal(opts) {
  current = opts;
  modal().hidden = false;
  const title = document.getElementById('modal-title');
  const tools = document.getElementById('modal-tools');
  const body = document.getElementById('modal-body');
  tools.replaceChildren();
  body.replaceChildren();
  if (opts.name === 'schematics') { title.textContent = 'Schematics'; schematics(tools, body, opts); }
  else if (opts.name === 'torque') { title.textContent = 'Torque & fastener specs'; torque(tools, body, opts); }
  else if (opts.name === 'tracker') { title.textContent = 'Build tracker'; tracker(tools, body, opts); }
  else if (opts.name === 'catalog') { title.textContent = 'Parts catalog'; catalog(tools, body, opts); }
  else { title.textContent = 'How to use'; help(body); }
}

export function closeModal() {
  modal().hidden = true;
  current = null;
}

function goTo(id) {
  closeModal();
  select({ type: 'component', id });
  emit('frame', { type: 'component', id });
}

function systemSelect(value, withAll = true) {
  const s = el('select');
  s.innerHTML = (withAll ? '<option value="">All systems</option>' : '') + state.db.systems.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  s.value = value || '';
  return s;
}

// ------------------------------------------------------------ schematics
function schematics(tools, body, opts) {
  const all = state.db.systems.flatMap((s) => s.schematics.map((sc) => ({ s, sc })));
  if (!all.length) { body.appendChild(el('div', 'help', 'Schematics are still being researched.')); return; }
  const wrap = el('div', 'schem-wrap');
  const list = el('div', 'schem-list');
  const view = el('div', 'schem-view');
  wrap.append(list, view);
  body.appendChild(wrap);
  let pick = all.find((x) => x.s.id === opts.system) || all[0];
  const draw = () => {
    list.replaceChildren();
    let last = null;
    for (const item of all) {
      if (item.s !== last) { last = item.s; list.appendChild(el('div', 'schem-sys', `<span class="sw" style="background:${item.s.color}"></span>${esc(item.s.name)}`)); }
      const row = el('div', 'schem-item' + (item === pick ? ' active' : ''), `${esc(item.sc.title || item.sc.id)}<small>${esc(item.sc.type || '')} · ${item.sc.nodes.length} nodes</small>`);
      row.addEventListener('click', () => { pick = item; draw(); });
      list.appendChild(row);
    }
    renderSchematic(view, pick.sc, { onNode: goTo, linked: (id) => state.byId.has(id) });
  };
  draw();
}

// ------------------------------------------------------------ torque
function torque(tools, body, opts) {
  const sys = systemSelect(opts.system);
  const q = el('input');
  q.placeholder = 'Filter (e.g. M12, caliper, TTY)…';
  const conf = el('select');
  conf.innerHTML = '<option value="">Any confidence</option><option value="verified">Verified</option><option value="typical">Typical</option><option value="estimate">Estimate</option>';
  const onlyTq = el('label', '', '<input type="checkbox" checked> Torque values only');
  onlyTq.style.cssText = 'font-size:13px;color:var(--text-2);display:flex;gap:6px;align-items:center';
  const view = el('select');
  view.innerHTML = '<option value="parts">By part</option><option value="totals">Fastener totals (order list)</option>';
  const csv = el('button', 'btn', 'Export CSV');
  const print = el('button', 'btn', 'Print');
  print.addEventListener('click', () => window.print());
  tools.append(view, sys, q, conf, onlyTq, csv, print);

  const rows = () => {
    const out = [];
    const f = q.value.toLowerCase();
    for (const s of state.db.systems) {
      if (sys.value && s.id !== sys.value) continue;
      for (const sub of s.subsystems) for (const id of sub.componentIds) {
        const c = state.byId.get(id);
        for (const h of c.hardware) {
          if (onlyTq.querySelector('input').checked && (!h.torque || /^n\/?a/i.test(h.torque))) continue;
          if (conf.value && h.confidence !== conf.value) continue;
          const text = `${c.name} ${h.item} ${h.spec} ${h.grade} ${h.torque} ${h.reuse} ${h.threadlocker} ${h.notes}`.toLowerCase();
          if (f && !f.split(/\s+/).every((t) => text.includes(t))) continue;
          out.push({ s, c, h });
        }
      }
    }
    return out;
  };
  const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 1; };
  const totals = (r) => {
    const map = new Map();
    for (const { c, h } of r) {
      const key = `${(h.spec || h.item || '').trim().toLowerCase()}|${(h.grade || '').trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, { spec: h.spec || h.item, grade: h.grade || '', qty: 0, parts: new Set(), torques: new Set() });
      const m = map.get(key);
      m.qty += num(h.qty) * num(c.qty);
      m.parts.add(c.name);
      if (h.torque) m.torques.add(h.torque);
    }
    return [...map.values()].sort((a, b) => String(a.spec).localeCompare(String(b.spec)));
  };
  const drawTotals = (r) => {
    const t = el('table', 'data');
    t.innerHTML = '<thead><tr><th>Qty (approx)</th><th>Fastener spec</th><th>Grade</th><th>Torque(s)</th><th>Used on</th></tr></thead>';
    const tb = el('tbody');
    for (const m of totals(r)) tb.appendChild(el('tr', '', `<td class="mono">${Math.round(m.qty)}</td><td class="mono">${esc(m.spec)}</td><td>${esc(m.grade)}</td><td class="mono">${esc([...m.torques].slice(0, 3).join(' / '))}</td><td style="color:var(--text-2)">${esc([...m.parts].slice(0, 6).join(', '))}${m.parts.size > 6 ? ` +${m.parts.size - 6} more` : ''}</td>`));
    t.appendChild(tb);
    body.replaceChildren(el('div', 'warn-note', 'Totals multiply fastener qty × part qty. Use as a starting order list; buy extras of anything marked replace/TTY.'), t);
    body.firstChild.style.margin = '12px 16px';
  };
  const draw = () => {
    const r = rows();
    if (view.value === 'totals') { drawTotals(r); return r; }
    const t = el('table', 'data');
    t.innerHTML = `<thead><tr><th>Part</th><th>Fastener</th><th>Qty</th><th>Spec</th><th>Grade</th><th>Torque</th><th>Sequence / notes</th><th>Threads</th><th>Reuse</th><th>Conf.</th></tr></thead>`;
    const tb = el('tbody');
    let lastC = null;
    for (const { s, c, h } of r) {
      if (c !== lastC) {
        lastC = c;
        const g = el('tr', 'group-row', `<td colspan="10"><span class="sw" style="background:${s.color};display:inline-block;margin-right:8px"></span><a>${esc(c.name)}</a> <span style="color:var(--text-3);font-weight:400">· ${esc(state.subById.get(c.subsystem)?.name || '')}</span></td>`);
        g.querySelector('a').addEventListener('click', () => goTo(c.id));
        tb.appendChild(g);
      }
      tb.appendChild(el('tr', '', `<td></td><td>${esc(h.item)}</td><td class="mono">${esc(h.qty ?? '')}</td><td class="mono">${esc(h.spec)}</td><td>${esc(h.grade)}</td><td class="mono" style="color:var(--text);white-space:nowrap">${esc(h.torque)}</td><td>${esc([h.torqueSequence, h.notes].filter(Boolean).join(' — '))}</td><td>${esc(h.threadlocker)}</td><td>${esc(h.reuse)}</td><td><span class="conf ${esc(h.confidence)}">${esc(h.confidence || '')}</span></td>`));
    }
    t.appendChild(tb);
    body.replaceChildren(t);
    if (!r.length) body.appendChild(el('div', 'help', 'No matching fasteners.'));
    return r;
  };
  [sys, conf, onlyTq, view].forEach((x) => x.addEventListener('change', draw));
  q.addEventListener('input', draw);
  csv.addEventListener('click', () => {
    const r = rows();
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    if (view.value === 'totals') {
      const lines = [['Qty', 'Spec', 'Grade', 'Torques', 'Used on'].map(cell).join(',')];
      for (const m of totals(r)) lines.push([Math.round(m.qty), m.spec, m.grade, [...m.torques].join(' / '), [...m.parts].join('; ')].map(cell).join(','));
      download('camaro-fastener-order-list.csv', lines.join('\n'), 'text/csv');
      return;
    }
    const lines = [['System', 'Subsystem', 'Part', 'Fastener', 'Qty', 'Spec', 'Grade', 'Torque', 'Sequence', 'Threadlocker', 'Reuse', 'Confidence', 'Source'].map(cell).join(',')];
    for (const { s, c, h } of r) lines.push([s.name, state.subById.get(c.subsystem)?.name, c.name, h.item, h.qty, h.spec, h.grade, h.torque, h.torqueSequence, h.threadlocker, h.reuse, h.confidence, h.source].map(cell).join(','));
    download('camaro-torque-specs.csv', lines.join('\n'), 'text/csv');
  });
  draw();
}

// ------------------------------------------------------------ tracker
function tracker(tools, body, opts) {
  const sys = systemSelect(opts.system);
  const st = el('select');
  st.innerHTML = '<option value="">Any status</option><option value="none">Not set</option>' + STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
  const shop = el('button', 'btn', 'Shopping list CSV');
  const backup = el('button', 'btn', 'Back up');
  const restore = el('button', 'btn', 'Restore');
  const file = el('input');
  file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
  tools.append(sys, st, shop, backup, restore, file);

  const choiceLabel = (c, key) => {
    if (!key) return '';
    if (key === 'factory') return c.factory?.name || 'GM factory';
    const o = c.raceOptions[Number(key.split('-')[1])];
    return o ? `${o.brand ? o.brand + ' ' : ''}${o.name || ''}`.trim() : '';
  };
  const draw = () => {
    const comps = state.db.components.filter((c) => (!sys.value || c.system === sys.value) && (!st.value || (track(c.id).status || 'none') === st.value));
    const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
    state.db.components.forEach((c) => { const s = track(c.id).status; if (s) counts[s]++; });
    const summary = el('div', 'stat-grid', STATUSES.map((s) => `<div class="stat"><b>${counts[s.id]}</b><span>${s.label}</span></div>`).join(''));
    summary.style.cssText = 'grid-template-columns:repeat(4,1fr);margin:12px 16px';
    const t = el('table', 'data');
    t.innerHTML = '<thead><tr><th>Part</th><th>System</th><th>Phase</th><th>Qty</th><th>Status</th><th>My choice</th><th>Notes</th></tr></thead>';
    const tb = el('tbody');
    for (const c of comps) {
      const tr = track(c.id);
      const row = el('tr', '', `<td><a>${esc(c.name)}</a></td><td>${esc(state.sysById.get(c.system).name)}</td><td class="mono">${c.buildPhase || ''}</td><td class="mono">${esc(c.qty)}</td><td></td><td>${esc(choiceLabel(c, tr.choice))}</td><td style="color:var(--text-2)">${esc(tr.notes || '')}</td>`);
      row.querySelector('a').addEventListener('click', () => goTo(c.id));
      const sel = el('select');
      sel.innerHTML = '<option value="">—</option>' + STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
      sel.value = tr.status || '';
      sel.addEventListener('change', () => setTrack(c.id, { status: sel.value }));
      row.children[4].appendChild(sel);
      tb.appendChild(row);
    }
    t.appendChild(tb);
    body.replaceChildren(summary, t);
  };
  [sys, st].forEach((x) => x.addEventListener('change', draw));
  shop.addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Status', 'System', 'Part', 'Qty', 'My choice', 'Part number', 'Factory part', 'Factory P/N', 'Notes'].map(cell).join(',')];
    for (const c of state.db.components) {
      const tr = track(c.id);
      if (!['needed', 'ordered'].includes(tr.status)) continue;
      const o = tr.choice?.startsWith('race-') ? c.raceOptions[Number(tr.choice.split('-')[1])] : null;
      lines.push([tr.status, state.sysById.get(c.system).name, c.name, c.qty, choiceLabel(c, tr.choice), o?.partNumber || (tr.choice === 'factory' ? c.factory?.partNumber : ''), c.factory?.name, c.factory?.partNumber, tr.notes].map(cell).join(','));
    }
    download('camaro-shopping-list.csv', lines.join('\n'), 'text/csv');
  });
  backup.addEventListener('click', () => download(`camaro-build-backup-${new Date().toISOString().slice(0, 10)}.json`, exportTracker(), 'application/json'));
  restore.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try { importTracker(await f.text()); draw(); } catch (e) { alert('Could not read that backup file: ' + e.message); }
  });
  trackerUnsub?.();
  trackerUnsub = on('tracker', () => { if (current?.name === 'tracker') draw(); });
  draw();
}

// ------------------------------------------------------------ catalog
function catalog(tools, body, opts) {
  const sys = systemSelect(opts.system || (opts.subsystem && state.subById.get(opts.subsystem)?.system));
  const sub = el('select');
  const fillSubs = () => {
    const s = state.sysById.get(sys.value);
    sub.innerHTML = '<option value="">All subsystems</option>' + (s ? s.subsystems.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('') : '');
  };
  fillSubs();
  if (opts.subsystem) sub.value = opts.subsystem;
  tools.append(sys, sub);
  const draw = () => {
    body.replaceChildren();
    const ids = sub.value
      ? state.subById.get(sub.value).componentIds
      : state.db.systems.filter((s) => !sys.value || s.id === sys.value).flatMap((s) => s.subsystems.flatMap((x) => x.componentIds));
    const inner = el('div', 'pl-modal');
    body.appendChild(inner);
    renderPartsList(inner, ids, { layout: 'grid', groupBySubsystem: !sub.value });
  };
  sys.addEventListener('change', () => { fillSubs(); draw(); });
  sub.addEventListener('change', draw);
  draw();
}

// ------------------------------------------------------------ help
function help(body) {
  body.appendChild(el('div', 'help', `
    <h3>Navigating the car</h3>
    <ul>
      <li><b>Rotate</b>: left-drag · <b>Pan</b>: right-drag or two-finger drag · <b>Zoom</b>: scroll or pinch.</li>
      <li><b>Click</b> a part to select it; <b>double-click</b> to zoom to it. Click empty space to clear the selection.</li>
      <li>When a part is selected it glows orange and the parts it <b>connects to</b> glow gold; everything else fades.</li>
      <li>Click a system or subsystem in the left panel to isolate it.</li>
    </ul>
    <h3>Toolbar</h3>
    <ul>
      <li><b>Body</b> — Solid shows the ZL1 1LE reference body, Ghost makes it see-through, Off hides it. Hood, doors, interior and wheels can be toggled in the left panel.</li>
      <li><b>Explode</b> — pulls each system away from the car so you can see how they stack.</li>
      <li><b>Built through</b> — shows the car as it should look at the end of each build phase (1 = chassis prep … 11 = setup).</li>
      <li><b>Lines</b> — hoses, hard lines, wiring trunks, exhaust and cage tubes. <b>Flow</b> animates them.</li>
      <li><b>Status</b> — colors parts by build status: <span style="color:#ff4d4d">need</span>, <span style="color:#ffb21f">ordered</span>, <span style="color:#40a9ff">in hand</span>, <span style="color:#3ddc84">installed</span>.</li>
    </ul>
    <h3>Line colors</h3>
    <ul style="columns:2">${Object.values(KINDS).map((k) => `<li><span style="display:inline-block;width:18px;height:3px;background:${k.color};vertical-align:middle;margin-right:6px"></span>${esc(k.label)}</li>`).join('')}</ul>
    <h3>About the data</h3>
    <ul>
      <li>Parts are placed at their real locations but drawn as simplified shapes; the reference body is the real car shape.</li>
      <li>Every torque spec is marked <span class="conf verified">verified</span>, <span class="conf typical">typical</span> or <span class="conf estimate">estimate</span>. Always confirm against the GM service manual or the instructions for the part you bought.</li>
      <li>Your statuses, choices and notes are saved in this browser. Use <b>Build tracker → Back up</b> regularly.</li>
    </ul>`));
}
