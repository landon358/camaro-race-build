// Right panel: details for the selected system / subsystem / component.
import { state, on, select, emit, track, setTrack, neighbours, STATUSES, progressFor } from '../state.js';
import { el, esc, safeUrl, sourceLinks } from './dom.js';
import { renderPartsList, partNumbers } from './partslist.js';
import { previewCanvas } from './preview.js';

let activeTab = 'overview';
let groupTab = 'overview'; // system / subsystem view: 'overview' | 'parts'
const host = () => document.getElementById('inspector');

export function initInspector() {
  render();
  on('select', () => { render(); host().scrollTop = 0; });
  on('tracker', (id) => { if (!id || state.selection?.id === id || state.selection?.type !== 'component') render(true); });
}

function render(keepScroll) {
  const h = host();
  const scroll = h.scrollTop;
  const sel = state.selection;
  h.replaceChildren();
  if (!sel) renderWelcome(h);
  else if (sel.type === 'system') renderSystem(h, state.sysById.get(sel.id));
  else if (sel.type === 'subsystem') renderSubsystem(h, state.subById.get(sel.id));
  else renderComponent(h, state.byId.get(sel.id));
  if (keepScroll) h.scrollTop = scroll;
  const head = h.querySelector('.insp-head');
  if (head) h.style.setProperty('--insp-head-h', `${head.offsetHeight}px`);
}

function renderWelcome(h) {
  const comps = state.db.components;
  const hw = comps.reduce((n, c) => n + c.hardware.length, 0);
  const torques = comps.reduce((n, c) => n + c.hardware.filter((x) => x.torque && !/^n\/?a/i.test(x.torque)).length, 0);
  const sch = state.db.systems.reduce((n, s) => n + s.schematics.length, 0);
  const done = progressFor(comps.map((c) => c.id));
  h.appendChild(el('div', 'insp-empty', `
    <h3>Gen 6 Camaro — road-race build</h3>
    <p>Built from a bare chassis. Every part is the GM factory piece or a racing alternative, placed on the car where it goes.</p>
    <div class="stat-grid">
      <div class="stat"><b>${comps.length}</b><span>Components</span></div>
      <div class="stat"><b>${hw}</b><span>Hardware entries</span></div>
      <div class="stat"><b>${torques}</b><span>Torque specs</span></div>
      <div class="stat"><b>${sch}</b><span>Schematics</span></div>
    </div>
    <div class="stat" style="margin-bottom:14px"><b>${Math.round(done * 100)}%</b><span>Build installed</span></div>
    <ul>
      <li><b>Click</b> a part to identify it; <b>double-click</b> to zoom to it.</li>
      <li>Selecting a part highlights everything it <b>connects to</b>.</li>
      <li>Use <b>Explode</b> to pull systems apart and <b>Built through</b> to see the car at each build phase.</li>
      <li>Set <b>Body</b> to Ghost / Off to see inside; toggle hood, doors, interior in the left panel.</li>
      <li><b>Lines</b> shows hoses, wiring and cage tubes; <b>Flow</b> animates what runs through them.</li>
      <li>Press <kbd>/</kbd> to search — try a bolt size like <code>M12</code> or a part number.</li>
      <li>Mark parts Need → Ordered → In hand → Installed. Progress saves in this browser; back it up from <b>Build tracker</b>.</li>
    </ul>`));
}

function head(h, crumbs, title, sub, badges = '') {
  const d = el('div', 'insp-head');
  const path = el('div', 'insp-path');
  crumbs.forEach((c, i) => {
    if (i) path.appendChild(el('span', '', '›'));
    const a = el('a', '', esc(c.label));
    a.addEventListener('click', () => { select(c.sel); emit('frame', c.sel); });
    path.appendChild(a);
  });
  d.appendChild(path);
  d.appendChild(el('div', 'insp-title', esc(title)));
  if (sub) d.appendChild(el('div', 'insp-id', esc(sub)));
  if (badges) d.appendChild(el('div', 'insp-badges', badges));
  h.appendChild(d);
  return d;
}

const homeCrumb = { label: 'Car', sel: null };

function renderSystem(h, s) {
  const ids = s.subsystems.flatMap((x) => x.componentIds);
  const hw = ids.reduce((n, id) => n + state.byId.get(id).hardware.length, 0);
  const d = head(h, [homeCrumb], s.name, `${s.subsystems.length} subsystems · ${ids.length} components · ${hw} hardware entries`);
  const actions = el('div', 'insp-actions');
  if (s.schematics.length) {
    const b = el('button', 'btn primary', `Open schematics (${s.schematics.length})`);
    b.addEventListener('click', () => emit('open-modal', { name: 'schematics', system: s.id }));
    actions.appendChild(b);
  }
  const tq = el('button', 'btn', 'Torque specs');
  tq.addEventListener('click', () => emit('open-modal', { name: 'torque', system: s.id }));
  actions.appendChild(tq);
  d.appendChild(actions);
  const body = groupTabs(h, ids, { type: 'system', id: s.id });
  if (!body) return;
  if (!ids.length) body.appendChild(el('div', 'warn-note', 'Research for this system is still being compiled.'));
  if (s.summary) body.appendChild(sec('Summary', `<p>${esc(s.summary)}</p>`));
  if (s.overview) body.appendChild(sec('Overview', s.overview.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')));
  if (s.buildNotes.length) body.appendChild(sec('Build notes', `<ol class="steps">${s.buildNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>`));
  const subs = sec('Subsystems', '');
  for (const sub of s.subsystems) {
    const row = el('div', 'comp', `<span class="sw" style="background:${s.color}"></span><span class="comp-name">${esc(sub.name)}</span><span class="count">${Math.round(progressFor(sub.componentIds) * 100)}% · ${sub.componentIds.length}</span>`);
    row.addEventListener('click', () => { select({ type: 'subsystem', id: sub.id }); emit('frame', { type: 'subsystem', id: sub.id }); });
    subs.appendChild(row);
  }
  body.appendChild(subs);
  body.appendChild(sourcesSec(s.sources));
}

function renderSubsystem(h, sub) {
  const s = state.sysById.get(sub.system);
  head(h, [homeCrumb, { label: s.name, sel: { type: 'system', id: s.id } }], sub.name, `${sub.componentIds.length} components`);
  const body = groupTabs(h, sub.componentIds, { type: 'subsystem', id: sub.id });
  if (!body) return;
  if (sub.description) body.appendChild(sec('Description', `<p>${esc(sub.description)}</p>`));
  const list = sec('Components', '');
  for (const id of sub.componentIds) {
    const c = state.byId.get(id);
    const row = el('div', 'comp', `<span class="dot ${track(id).status || ''}"></span><span class="comp-name">${esc(c.name)}</span><span class="count">${c.qty > 1 ? '×' + esc(c.qty) + ' · ' : ''}${c.hardware.length} hw</span>`);
    row.addEventListener('click', () => { select({ type: 'component', id }); emit('frame', { type: 'component', id }); });
    list.appendChild(row);
  }
  body.appendChild(list);
}

function renderComponent(h, c) {
  const s = state.sysById.get(c.system);
  const sub = state.subById.get(c.subsystem);
  const phase = state.db.phases.find((p) => p.n === c.buildPhase);
  const badges = [
    c.qty > 1 ? `<span class="badge">Qty ${esc(c.qty)}</span>` : '',
    phase ? `<span class="badge phase">Phase ${phase.n} · ${esc(phase.name)}</span>` : '',
    ...c.tags.slice(0, 5).map((t) => `<span class="badge">${esc(t)}</span>`),
  ].join('');
  const d = head(h, [homeCrumb, { label: s.name, sel: { type: 'system', id: s.id } }, { label: sub?.name || '', sel: { type: 'subsystem', id: c.subsystem } }], c.name, c.id, badges);

  const t = track(c.id);
  const statusRow = el('div', 'status-row');
  for (const st of STATUSES) {
    const b = el('button', t.status === st.id ? 'on' : '', st.label);
    b.dataset.s = st.id;
    b.addEventListener('click', () => setTrack(c.id, { status: t.status === st.id ? '' : st.id }));
    statusRow.appendChild(b);
  }
  d.appendChild(statusRow);
  const actions = el('div', 'insp-actions');
  const f = el('button', 'btn', 'Zoom to part');
  f.addEventListener('click', () => emit('frame', { type: 'component', id: c.id }));
  actions.appendChild(f);
  d.appendChild(actions);

  const tabs = [
    ['overview', 'Overview', ''],
    ['hardware', 'Hardware', c.hardware.length],
    ['options', 'Options', (c.factory ? 1 : 0) + c.raceOptions.length],
    ['install', 'Install', c.installNotes.length + c.inspection.length],
    ['links', 'Look up', ''],
  ];
  const tabBar = el('div', 'insp-tabs');
  const body = el('div', 'insp-body');
  for (const [id, label, n] of tabs) {
    const b = el('button', 'insp-tab' + (activeTab === id ? ' active' : ''), `${label}${n !== '' ? `<span class="n">${n}</span>` : ''}`);
    b.addEventListener('click', () => { activeTab = id; render(true); });
    tabBar.appendChild(b);
  }
  h.appendChild(tabBar);
  h.appendChild(body);

  if (activeTab === 'overview') overviewTab(body, c);
  else if (activeTab === 'hardware') hardwareTab(body, c);
  else if (activeTab === 'options') optionsTab(body, c);
  else if (activeTab === 'install') installTab(body, c);
  else linksTab(body, c);
}

/** Overview / Parts tabs for systems and subsystems. Returns the overview body, or null when Parts is shown. */
function groupTabs(h, ids, sel) {
  const bar = el('div', 'insp-tabs');
  for (const [id, label, n] of [['overview', 'Overview', ''], ['parts', 'Parts', ids.length]]) {
    const b = el('button', 'insp-tab' + (groupTab === id ? ' active' : ''), `${label}${n !== '' ? `<span class="n">${n}</span>` : ''}`);
    b.addEventListener('click', () => { groupTab = id; render(); });
    bar.appendChild(b);
  }
  h.appendChild(bar);
  const body = el('div', 'insp-body');
  h.appendChild(body);
  if (groupTab !== 'parts') return body;
  renderPartsList(body, ids, {
    groupBySubsystem: sel.type === 'system',
    onOpenCatalog: () => emit('open-modal', { name: 'catalog', [sel.type]: sel.id }),
  });
  return null;
}

function sec(title, html) {
  const s = el('div', 'sec', `<h4>${esc(title)}</h4>${html}`);
  return s;
}

function overviewTab(body, c) {
  const fig = el('div', 'insp-preview');
  fig.appendChild(previewCanvas(c.id, 760, { aspect: 0.6, speed: 0.45 }));
  const pns = partNumbers(c);
  fig.appendChild(el('div', 'insp-preview-cap', `${pns.length ? pns.slice(0, 2).map((p) => `<b>${esc(p.kind)}</b> ${esc(p.pn)}`).join(' · ') + ' — ' : ''}drag to turn it and compare with the part in your hand`));
  body.appendChild(fig);
  if (c.modelRef) {
    const r = c.modelRef;
    const imgs = (r.images || []).map((x) => (typeof x === 'string' ? { url: x, title: x } : x)).map((x) => ({ ...x, url: safeUrl(x.url) })).filter((x) => x.url);
    body.appendChild(sec('Identify it', `
      ${r.dimensions ? `<div class="kv"><div>Real size</div><div>${esc(r.dimensions)}</div>${r.features ? `<div>Look for</div><div>${esc(r.features)}</div>` : ''}</div>` : r.features ? `<p>${esc(r.features)}</p>` : ''}
      ${imgs.length ? `<div class="links" style="margin-top:8px">${imgs.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">📷 ${esc((x.title || new URL(x.url).hostname).slice(0, 60))} ↗</a>`).join('')}</div>` : ''}`));
  }
  if (c.description) body.appendChild(sec('What it is', `<p>${esc(c.description)}</p>`));
  if (c.location) body.appendChild(sec('Where it goes', `<p>${esc(c.location)}</p>`));
  const specs = Object.entries(c.specs);
  if (specs.length) body.appendChild(sec('Specs', `<div class="kv">${specs.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('')}</div>`));
  const links = [...new Set([...c.connectsTo, ...neighbours(c.id)])];
  if (links.length) {
    const s = sec('Connects to', '');
    for (const id of links) {
      const other = state.byId.get(id);
      const chip = el('span', 'conn' + (other ? '' : ' dangling'), other ? `<span class="sw" style="background:${state.sysById.get(other.system).color}"></span>${esc(other.name)}` : esc(id));
      if (other) chip.addEventListener('click', () => { select({ type: 'component', id }); emit('frame', { type: 'component', id }); });
      s.appendChild(chip);
    }
    body.appendChild(s);
  }
  if (c.fluids.length) {
    body.appendChild(sec('Fluids', `<div class="kv">${c.fluids.map((f) => `<div>${esc(f.name || 'Fluid')}</div><div>${esc([f.spec, f.capacity].filter(Boolean).join(' · '))}</div>`).join('')}</div>`));
  }
  const notes = sec('My notes', '');
  const ta = el('textarea', 'notes');
  ta.placeholder = 'Part numbers you bought, measurements, shims used…';
  ta.value = track(c.id).notes || '';
  let tmr;
  ta.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => setTrack(c.id, { notes: ta.value }), 400); });
  notes.appendChild(ta);
  body.appendChild(notes);
}

function hardwareTab(body, c) {
  if (!c.hardware.length) { body.appendChild(el('p', '', '<span style="color:var(--text-3)">No fasteners recorded for this part.</span>')); return; }
  body.appendChild(el('div', 'warn-note', 'Check every torque against the instructions for the exact part you bought. <b>Verified</b> = from GM or manufacturer documentation, <b>typical</b> = commonly published, <b>estimate</b> = engineering estimate.'));
  for (const x of c.hardware) {
    const conf = ['verified', 'typical', 'estimate'].includes(x.confidence) ? x.confidence : 'estimate';
    const rows = [
      ['Spec', x.spec], ['Grade', x.grade], ['Part #', x.partNumber],
      ['Torque', x.torque ? `<span class="torque">${esc(x.torque)}</span>` : ''],
      ['Sequence', x.torqueSequence], ['Threads', x.threadlocker], ['Safety wire', x.safetyWire ? 'Yes' : ''],
      ['Reuse', x.reuse], ['Tool', x.tool], ['Notes', x.notes],
    ].filter(([, v]) => v);
    const src = safeUrl(x.source);
    const card = el('div', 'hw', `
      <div class="hw-top"><span class="hw-qty">${esc(x.qty ?? '')}×</span><span class="hw-item">${esc(x.item || 'Fastener')}</span><span class="conf ${conf}">${conf}</span></div>
      <dl class="hw-grid">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'Torque' ? v : esc(v)}</dd>`).join('')}${src ? `<dt>Source</dt><dd><a href="${esc(src)}" target="_blank" rel="noopener">${esc(new URL(src).hostname)}</a></dd>` : ''}</dl>`);
    body.appendChild(card);
  }
}

function optionsTab(body, c) {
  const t = track(c.id);
  const opts = [];
  if (c.factory) opts.push({ key: 'factory', kind: 'GM factory', ...c.factory });
  c.raceOptions.forEach((o, i) => opts.push({ key: `race-${i}`, kind: o.brand ? `Race · ${o.brand}` : 'Race option', ...o }));
  if (!opts.length) { body.appendChild(el('p', '', '<span style="color:var(--text-3)">No options recorded.</span>')); return; }
  body.appendChild(el('p', '', '<span style="color:var(--text-2);font-size:13px">Tap the option you are running — it is saved with your build.</span>'));
  for (const o of opts) {
    const u = safeUrl(o.url);
    const card = el('div', 'opt' + (t.choice === o.key ? ' chosen' : ''), `
      ${t.choice === o.key ? '<span class="opt-pick">✓ My build</span>' : ''}
      <div class="opt-kind">${esc(o.kind)}</div>
      <div class="opt-name">${esc(o.name || '')}</div>
      ${o.partNumber ? `<div class="opt-pn">${esc(o.partNumber)}</div>` : ''}
      ${o.notes ? `<div class="opt-notes">${esc(o.notes)}</div>` : ''}
      ${u ? `<div style="margin-top:6px"><a href="${esc(u)}" target="_blank" rel="noopener">${esc(new URL(u).hostname)} ↗</a></div>` : ''}`);
    card.addEventListener('click', (e) => { if (e.target.closest('a')) return; setTrack(c.id, { choice: t.choice === o.key ? '' : o.key }); });
    body.appendChild(card);
  }
}

function installTab(body, c) {
  if (c.installNotes.length) body.appendChild(sec('Install steps', `<ol class="steps">${c.installNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>`));
  if (c.inspection.length) body.appendChild(sec('Between events — inspect', `<ul class="plain">${c.inspection.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`));
  if (!c.installNotes.length && !c.inspection.length) body.appendChild(el('p', '', '<span style="color:var(--text-3)">No install notes recorded.</span>'));
}

function linksTab(body, c) {
  const pn = c.factory?.partNumber && String(c.factory.partNumber).replace(/^GM\s*/i, '');
  const q = encodeURIComponent(`Camaro 2016-2024 ${c.name}`);
  const links = [
    ['Google', `https://www.google.com/search?q=${q}`],
    ['camaro6.com', `https://www.google.com/search?q=${encodeURIComponent(`site:camaro6.com ${c.name}`)}`],
    ['Summit Racing', `https://www.summitracing.com/search?keyword=${encodeURIComponent(c.name)}`],
    ['YouTube install', `https://www.youtube.com/results?search_query=${encodeURIComponent(`Camaro gen 6 ${c.name} install`)}`],
    ['Images', `https://www.google.com/search?tbm=isch&q=${q}`],
  ];
  if (pn) {
    links.unshift(['GM part ' + pn, `https://www.google.com/search?q=${encodeURIComponent(`GM ${pn}`)}`]);
    links.push(['GM Parts Direct', `https://www.gmpartsdirect.com/search?search_str=${encodeURIComponent(pn)}`]);
  }
  for (const o of c.raceOptions) if (o.partNumber) links.push([`${o.brand || ''} ${o.partNumber}`.trim(), `https://www.google.com/search?q=${encodeURIComponent(`${o.brand || ''} ${o.partNumber}`)}`]);
  body.appendChild(sec('Search', `<div class="links">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join('')}</div>`));
  body.appendChild(sourcesSec(c.sources));
}

function sourcesSec(sources) {
  const list = sourceLinks(sources);
  if (!list.length) return el('div');
  return sec('Research sources', `<ul class="plain">${list.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || new URL(s.url).hostname)}</a></li>`).join('')}</ul>`);
}
