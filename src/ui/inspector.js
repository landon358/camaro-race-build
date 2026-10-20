// Right panel (bottom sheet on phones): home, system, area, location and part details.
import { state, on, select, emit, set, track, setTrack, neighbours, STATUSES } from '../state.js';
import { el, esc, safeUrl, sourceLinks, toast, announce } from './dom.js';
import { icon, STATUS_ICON } from './icons.js';
import { renderPartsList } from './partslist.js';
import { previewSlot } from './preview.js';
import { carMap } from './carmap.js';
import { printTorqueCard } from './print.js';
import {
  statusBadge, torqueBlock, tqMain, confPill, confirmText, confirmLine, humanize, byPartOrder, systemName, groupTitle, zoneName, zoneCounts, partNumbers, pct, STATUS_WORD, photoOf, photoFig, photoCredit,
} from './present.js';
import { CONFIDENCE, confidenceOf, hasTorque, fastenerSummary, fastenerWords, boltLabel, parseTorque, parseHw, isDuplicateRow } from '../torque.js';

const tabs = { component: 'overview', system: 'areas', subsystem: 'parts', zone: 'parts' };
const host = () => document.getElementById('inspector');

export function initInspector() {
  render();
  on('select', (sel) => {
    render();
    host().scrollTop = 0;
    if (sel) announce(`${labelOf(sel)} selected. Details shown.`);
  });
  on('focus-title', () => requestAnimationFrame(() => host().querySelector('.insp-title')?.focus({ preventScroll: true })));
  on('tracker', (id) => { if (!id || state.selection?.id === id || state.selection?.type !== 'component') render(true); });
}

function labelOf(sel) {
  if (sel.type === 'component') return state.byId.get(sel.id)?.displayName;
  if (sel.type === 'subsystem') return groupTitle(sel.id);
  if (sel.type === 'zone') return zoneName(sel.id);
  return systemName(sel.id);
}

function render(keepScroll) {
  const h = host();
  const scroll = h.scrollTop;
  const sel = state.selection;
  h.replaceChildren();
  if (!sel) renderHome(h);
  else if (sel.type === 'system') renderSystem(h, state.sysById.get(sel.id));
  else if (sel.type === 'subsystem') renderGroup(h, state.subById.get(sel.id));
  else if (sel.type === 'zone') renderZone(h, sel.id);
  else renderComponent(h, state.byId.get(sel.id));
  if (keepScroll) h.scrollTop = scroll;
  emit('inspector-rendered');
}

// ------------------------------------------------------------------ pieces
function sec(title, html = '', extra = '') {
  return el('section', 'sec', `<h3>${esc(title)}${extra}</h3>${html}`);
}

function crumbs(list) {
  const nav = el('nav', 'crumbs');
  nav.setAttribute('aria-label', 'You are here');
  list.forEach((c, i) => {
    if (i) nav.appendChild(el('span', 'sep', '›'));
    const b = el('button', '', esc(c.label));
    b.type = 'button';
    b.addEventListener('click', () => { select(c.sel); emit('frame', c.sel); });
    nav.appendChild(b);
  });
  return nav;
}
const homeCrumb = { label: 'Car', sel: null };

function tabBar(h, kind, items, onSwitch) {
  const bar = el('div', 'insp-tabs');
  bar.setAttribute('role', 'tablist');
  const btns = items.map(([id, label, n], i) => {
    const b = el('button', 'insp-tab', `${esc(label)}${n !== '' && n != null ? `<span class="n">${n}</span>` : ''}`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(tabs[kind] === id));
    b.tabIndex = tabs[kind] === id ? 0 : -1;
    b.addEventListener('click', () => { tabs[kind] = id; onSwitch(); });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length][0];
      tabs[kind] = next;
      onSwitch();
      requestAnimationFrame(() => host().querySelector('.insp-tab[aria-selected="true"]')?.focus());
    });
    return b;
  });
  bar.append(...btns);
  h.appendChild(bar);
  const body = el('div', 'insp-body');
  body.setAttribute('role', 'tabpanel');
  h.appendChild(body);
  return body;
}

function headBlock(h, { crumbList, title, sub, alias, where, aside, actions }) {
  const d = el('header', 'insp-head');
  if (crumbList) d.appendChild(crumbs(crumbList));
  const row = el('div', 'head-row');
  const main = el('div', 'head-main');
  const t = el('h2', 'insp-title', esc(title));
  t.tabIndex = -1;
  main.appendChild(t);
  if (alias) main.appendChild(el('div', 'insp-alias', `Also called: ${esc(alias)}`));
  if (sub) main.appendChild(el('div', 'insp-sub', sub));
  if (where) main.appendChild(el('p', 'where-line', esc(where)));
  row.appendChild(main);
  if (aside) row.appendChild(aside);
  d.appendChild(row);
  if (actions?.length) {
    const a = el('div', 'head-actions');
    a.append(...actions);
    d.appendChild(a);
  }
  h.appendChild(d);
  return d;
}

/** A collapsed section: the detail is one tap away, not on the first screen. */
function fold(title, html = '', { open = false, count = '' } = {}) {
  const d = el('details', 'fold');
  d.open = open;
  d.innerHTML = `<summary><span>${esc(title)}</span>${count !== '' ? `<span class="n">${esc(count)}</span>` : ''}${icon('down', 14)}</summary><div class="fold-body">${html}</div>`;
  return d;
}

/** Square icon button with a visible short label for screen readers and a tooltip. */
function toolBtn(ic, label, onClick, cls = '') {
  const b = el('button', `tool ${cls}`.trim(), `${icon(ic, 16)}<span class="lbl">${esc(label)}</span>`);
  b.type = 'button';
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

function btn(html, onClick, cls = 'btn') {
  const b = el('button', cls, html);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const goZone = (z) => { select({ type: 'zone', id: z }); emit('frame', { type: 'zone', id: z }); };

// ------------------------------------------------------------------ home
function renderHome(h) {
  // nothing picked: the panel is hidden and the car has the room (see body.has-sel)
  h.appendChild(el('p', 'pl-hint home-empty', 'Pick a system or a spot on the car.'));
}

// ------------------------------------------------------------------ system
function renderSystem(h, s) {
  const ids = s.subsystems.flatMap((x) => x.componentIds);
  const actions = [toolBtn('wrench', 'Torque specs', () => emit('open-modal', { name: 'torque', system: s.id }))];
  if (s.schematics.length) actions.push(toolBtn('schematic', `Schematics (${s.schematics.length})`, () => emit('open-modal', { name: 'schematics', system: s.id })));
  actions.push(toolBtn('print', 'Print torque card', () => printTorqueCard({ title: `${systemName(s.id)} — torque card`, ids }), 'no-phone'));
  headBlock(h, {
    crumbList: [homeCrumb],
    title: systemName(s.id),
    sub: `<span>${ids.length} parts</span>`,
    actions,
  });
  const body = tabBar(h, 'system', [['areas', 'Areas', s.subsystems.length], ['parts', 'All parts', ids.length], ['about', 'About', '']], () => render(true));
  if (tabs.system === 'parts') {
    renderPartsList(body, ids, { group: 'subsystem', onOpenCatalog: () => emit('open-modal', { name: 'catalog', system: s.id }) });
  } else if (tabs.system === 'about') {
    if (s.summary) body.appendChild(sec('In short', `<p>${esc(s.summary)}</p>`));
    if (s.overview) {
      const more = el('details', 'more', `<summary>${icon('right', 14)}How it works on this car</summary>${s.overview.split(/\n\n+/).map((p) => `<p>${esc(p)}</p>`).join('')}`);
      body.appendChild(more);
    }
    if (s.buildNotes.length) body.appendChild(sec('Build notes', `<ol class="list-plain">${s.buildNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>`));
    body.appendChild(sourcesSec(s.sources));
  } else {
    // map: areas of this system that are corners are clickable
    const byLoc = new Map(s.subsystems.filter((g) => g.loc || /^(Front|Rear) (Left|Right)$/.test(g.name)).map((g) => [g.loc || { 'Front Left': 'FL', 'Front Right': 'FR', 'Rear Left': 'RL', 'Rear Right': 'RR' }[g.name], g]));
    if (byLoc.size) {
      body.appendChild(carMap({
        size: 'large',
        counts: zoneCounts(ids),
        labelFor: (z) => byLoc.get(z)?.name || zoneName(z),
        onPick: (z) => {
          const g = byLoc.get(z);
          if (g) { select({ type: 'subsystem', id: g.id }); emit('frame', { type: 'subsystem', id: g.id }); } else goZone(z);
        },
      }));
    }
    const list = sec('Areas');
    for (const sub of s.subsystems) {
      list.appendChild(btn(`<span class="name">${esc(sub.name)}</span><span class="count">${sub.componentIds.length}</span>${icon('right', 16)}`, () => {
        select({ type: 'subsystem', id: sub.id });
        emit('frame', { type: 'subsystem', id: sub.id });
      }, 'row grp-card'));
    }
    body.appendChild(list);
  }
}

// ------------------------------------------------------------------ area (group)
function renderGroup(h, sub) {
  const s = state.sysById.get(sub.system);
  const ids = sub.componentIds;
  const torqued = ids.reduce((n, id) => n + state.byId.get(id).hardware.filter(hasTorque).length, 0);
  const zones = new Set(ids.map((id) => state.byId.get(id).zone));
  const onlyZone = zones.size === 1 ? [...zones][0] : null;
  headBlock(h, {
    crumbList: [homeCrumb, { label: systemName(s.id), sel: { type: 'system', id: s.id } }],
    title: groupTitle(sub),
    sub: `<span>${ids.length} parts · ${torqued} torque specs</span>`,
    aside: onlyZone ? carMap({ size: 'small', active: onlyZone }) : null,
    actions: [
      toolBtn('wrench', 'Torque specs', () => emit('open-modal', { name: 'torque', subsystem: sub.id })),
      toolBtn('print', 'Print torque card', () => printTorqueCard({ title: `${groupTitle(sub)} — torque card`, ids }), 'no-phone'),
    ],
  });
  const body = tabBar(h, 'subsystem', [['parts', 'Parts', ids.length], ['about', 'About', '']], () => render(true));
  if (tabs.subsystem === 'about') {
    if (sub.description) body.appendChild(sec('What this area covers', `<p>${esc(sub.description)}</p>`));
    if (s.summary) body.appendChild(sec(`About ${systemName(s.id)}`, `<p>${esc(s.summary)}</p>`));
  } else {
    renderPartsList(body, ids, { group: 'tier', groupId: sub.id, onOpenCatalog: () => emit('open-modal', { name: 'catalog', subsystem: sub.id }) });
  }
}

// ------------------------------------------------------------------ location
function renderZone(h, z) {
  const comps = state.db.components.filter((c) => c.zone === z).sort(byPartOrder);
  const ids = comps.map((c) => c.id);
  headBlock(h, {
    crumbList: [homeCrumb],
    title: zoneName(z),
    sub: `<span>${ids.length} parts from ${new Set(comps.map((c) => c.system)).size} systems</span>`,
    aside: carMap({ size: 'small', active: z }),
    actions: [
      toolBtn('wrench', 'Torque specs', () => emit('open-modal', { name: 'torque', zone: z })),
      toolBtn('print', 'Print torque card', () => printTorqueCard({ title: `${zoneName(z)} — torque card`, ids }), 'no-phone'),
    ],
  });
  const body = el('div', 'insp-body');
  h.appendChild(body);
  renderPartsList(body, ids, { group: 'system', zoneCtx: z, onOpenCatalog: () => emit('open-modal', { name: 'catalog', zone: z }) });
}

function bulkStatus(ids) {
  const s = el('select');
  s.setAttribute('aria-label', 'Set status for every part in this list');
  s.innerHTML = `<option value="">Set all to…</option>${STATUSES.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join('')}<option value="clear">Clear status</option>`;
  s.addEventListener('change', () => {
    if (!s.value) return;
    const before = ids.map((id) => [id, track(id).status || '']);
    for (const id of ids) setTrack(id, { status: s.value === 'clear' ? '' : s.value });
    toast(`${ids.length} parts marked ${s.value === 'clear' ? 'not set' : STATUS_WORD[s.value]}`, { label: 'Undo', run: () => before.forEach(([id, st]) => setTrack(id, { status: st })) });
    s.value = '';
  });
  return s;
}

// ------------------------------------------------------------------ part
function renderComponent(h, c) {
  const s = state.sysById.get(c.system);
  const sub = state.subById.get(c.subsystem);
  const pns = partNumbers(c);
  const sum = fastenerSummary(c);

  const head = headBlock(h, {
    crumbList: [homeCrumb, { label: systemName(s.id), sel: { type: 'system', id: s.id } }, { label: sub?.name || '', sel: { type: 'subsystem', id: c.subsystem } }],
    title: c.short,
    where: (c.location || '').replace(/^(Front|Rear) (Left|Right) corner\.\s*/, '').split(/(?<=\.)\s+/)[0].slice(0, 120),
    sub: `<span class="loc-chip">${icon('pin', 12)}${esc(c.loc ? zoneName(c.loc) : zoneName(c.zone))}</span>${c.qty > 1 ? `<span class="mono-label">QTY ${esc(c.qty)}</span>` : ''}`,
    aside: c.at ? carMap({ size: 'small', dot: c.at, active: c.loc || null }) : null,
  });

  // status first: the thing people do most at the car
  head.appendChild(torqueHero(c));

  // one quiet line of facts instead of tiles
  const phase = state.db.phases.find((p) => p.n === c.buildPhase);
  const meta = el('div', 'meta-line');
  const bits = [];
  if (sum) bits.push(esc(fastenerWords(sum)));
  if (phase) bits.push(`Step ${phase.n}/${state.db.phases.length}`);
  meta.innerHTML = bits.map((b) => `<span>${b}</span>`).join('');
  const pnFact = partNumberFact(c, pns);
  if (pnFact) meta.appendChild(pnFact);
  head.appendChild(meta);

  const acts = el('div', 'head-actions');
  acts.append(
    toolBtn('zoom', 'Zoom in', () => emit('frame-tight', { type: 'component', id: c.id })),
    toolBtn('car', 'Show on car', () => emit('frame', { type: 'component', id: c.id })),
  );
  if (c.hardware.length) acts.appendChild(toolBtn('print', 'Print card', () => printTorqueCard({ title: `${c.displayName} — torque card`, ids: [c.id] }), 'no-phone'));
  head.appendChild(acts);

  const nHw = c.hardware.length;
  const nOpt = (c.factory ? 1 : 0) + c.raceOptions.length;
  const body = tabBar(h, 'component', [
    ['overview', 'Overview', ''],
    ['bolts', 'Torque', nHw],
    ['install', 'Install', c.installNotes.length + c.inspection.length],
    ['options', 'Options', nOpt],
  ], () => render(true));
  if (tabs.component === 'bolts') boltsTab(body, c);
  else if (tabs.component === 'install') installTab(body, c);
  else if (tabs.component === 'options') optionsTab(body, c);
  else overviewTab(body, c);
}

/** Rows that apply to the part the owner runs: the chosen race part's rows when the research has them. */
function rowsForChoice(c) {
  const choice = track(c.id).choice;
  const torqued = c.hardware.filter(hasTorque);
  if (!choice?.startsWith('race-')) return { rows: torqued, choice, opt: null };
  const opt = c.raceOptions[Number(choice.split('-')[1])];
  const brand = (opt?.brand || '').toLowerCase();
  const own = torqued.filter((h) => {
    const t = `${h.item} ${h.notes} ${h.torque} ${h.source}`.toLowerCase();
    return (brand && t.includes(brand)) || /\bkit\b|aftermarket|race/.test(t);
  });
  return { rows: own, choice, opt };
}

/** The headline torque: biggest number on the page, both units, what it is for, and how sure we are. */
function torqueHero(c) {
  const box = el('div', 'fact torque-fact');
  const all = c.hardware.filter(hasTorque);
  if (!all.length) { box.hidden = true; return box; }
  const { rows, choice, opt } = rowsForChoice(c);
  if (opt && !rows.length) {
    box.innerHTML = `<span>Torque · your ${esc(opt.brand || 'race')} part</span><b>Use the ${esc(opt.brand || 'maker')} instructions</b><span class="tq-alt">No values on file for this kit. GM part for reference: ${esc(parseHw(all[0]).primary || all[0].torque)}</span>`;
  } else {
    const h = rows[0];
    const t = parseHw(h);
    const why = confirmText(h, t);
    const whose = choice === 'factory' || (!choice && !c.raceOptions.length) ? '' : !choice && c.factory ? ' · GM part' : '';
    box.innerHTML = `<span>Torque · ${esc(boltLabel(h.item) || 'main fastener')}${whose}</span>
      <span class="tq-hero">${t.multi ? '' : tqMain({ ...t, secondary: null }, h.torque)}${confPill(h)}</span>
      ${t.multi ? tqMain(t) : t.secondary ? `<span class="tq-alt">${esc(t.secondary)}</span>` : ''}
      ${t.aside ? `<span class="tq-alt">${esc(t.aside)}</span>` : ''}
      ${confirmLine(h, t)}`;
  }
  const more = all.length - 1;
  const foot = el('div', 'tq-foot');
  if (more > 0) foot.appendChild(btn(`+${more} more bolt${more > 1 ? 's' : ''} with torque ${icon('right', 14)}`, () => { tabs.component = 'bolts'; render(true); requestAnimationFrame(() => host().querySelector('.insp-tabs')?.scrollIntoView({ block: 'start' })); }, 'link-btn'));
  if (!choice && c.raceOptions.length && c.factory) foot.appendChild(btn(`Running a race part? Pick it in Options ${icon('right', 14)}`, () => { tabs.component = 'options'; render(true); }, 'link-btn muted no-phone'));
  if (foot.children.length) box.appendChild(foot);
  return box;
}

/** Part number with where it comes from; never presents an option as chosen when it is not. */
function partNumberFact(c, pns) {
  if (!pns.length) return null;
  const chosen = pns.find((p) => p.chosen);
  const p = chosen || pns.find((x) => x.key === 'factory');
  const label = chosen ? `My choice · ${chosen.source}` : p ? 'GM part #' : 'Race options';
  const value = p ? p.pn : 'Not chosen yet';
  const short = String(value).split(/\s*[(;]/)[0].slice(0, 34);
  const others = pns.length - (p ? 1 : 0);
  const f = el('span', 'pn-inline', `<span class="mono-label">${esc(label)}</span> <b class="${p ? 'mono ' : ''}" title="${esc(value)}">${esc(short)}${short.length < String(value).length ? '…' : ''}</b>${p?.kit ? ' <span class="pill kit">Kit</span>' : ''}`);
  if (others > 0) f.appendChild(btn(`${p ? `+${others}` : `Compare ${others}`} ${icon('right', 12)}`, () => { tabs.component = 'options'; render(true); }, 'link-btn'));
  return f;
}

function statusControl(c) {
  const wrap = el('div', 'status-group');
  wrap.appendChild(el('span', '', 'My status <span class="sr-only">— saved on this device</span>'));
  const group = el('div', 'status-row');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'My status');
  const cur = track(c.id).status || '';
  for (const st of STATUSES) {
    const b = el('button', '', `${icon(STATUS_ICON[st.id], 16)}<span>${esc(st.label)}</span>`);
    b.type = 'button';
    b.dataset.s = st.id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(cur === st.id));
    b.addEventListener('click', () => {
      const next = cur === st.id ? '' : st.id;
      setTrack(c.id, { status: next });
      toast(next ? `Marked ${st.label} · saved on this device` : 'Status cleared', { label: 'Undo', run: () => setTrack(c.id, { status: cur }) });
      announce(next ? `${c.displayName} marked ${st.label}` : 'Status cleared');
    });
    group.appendChild(b);
  }
  wrap.appendChild(group);
  return wrap;
}

function overviewTab(body, c) {
  const ph = photoOf(c.photo);
  const fig = el('div', 'preview-box');
  const model = () => {
    fig.replaceChildren(previewSlot(c.id, true));
    const pause = el('button', 'icon-btn preview-ctl', icon(state.spin ? 'pause' : 'play', 16));
    pause.type = 'button';
    pause.setAttribute('aria-label', state.spin ? 'Pause rotation' : 'Resume rotation');
    pause.addEventListener('click', () => { set('spin', !state.spin); pause.innerHTML = icon(state.spin ? 'pause' : 'play', 16); pause.setAttribute('aria-label', state.spin ? 'Pause rotation' : 'Resume rotation'); });
    fig.appendChild(pause);
    fig.appendChild(el('div', 'preview-cap', 'Drag to turn'));
  };
  if (!ph) { model(); body.appendChild(fig); }
  else {
    // A real photo identifies a part on the shelf better than the simplified model, so it shows first.
    const seg = el('div', 'seg preview-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Preview');
    const photo = () => { fig.replaceChildren(el('div', 'preview-photo', `<img src="./${esc(ph.file)}" alt="${esc(ph.label)}" decoding="async">`)); };
    const views = [['Photo', photo], ['3D model', model]];
    for (const [label, show] of views) {
      const b = btn(esc(label), () => { show(); seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }, '');
      b.setAttribute('aria-pressed', String(label === 'Photo'));
      seg.appendChild(b);
    }
    photo();
    body.appendChild(seg);
    body.appendChild(fig);
    body.appendChild(el('p', 'photo-note', `${esc(ph.label)} — same kind of part, not necessarily your brand. ${photoCredit(ph)}`));
  }
  if (c.modelRef) {
    const r = c.modelRef;
    const imgs = (r.images || []).map((x) => (typeof x === 'string' ? { url: x, title: x } : x)).map((x) => ({ ...x, url: safeUrl(x.url) })).filter((x) => x.url);
    const est = r.confidence && r.confidence !== 'measured' && r.confidence !== 'published';
    body.appendChild(sec('Identify it', `
      <div class="kv">${r.dimensions ? `<div>Approx. size</div><div>${esc(r.dimensions.replace(/^\s*(approx\.?|approximately|~)\s*/i, ''))}${est ? ' <span class="pill conf-estimate">estimated</span>' : ''}</div>` : ''}${r.features ? `<div>Look for</div><div>${esc(r.features)}</div>` : ''}</div>
      `));
    if (imgs.length) body.appendChild(fold('Reference photos', `<div class="links">${imgs.slice(0, 6).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${icon('camera', 14)}${esc((x.title || new URL(x.url).hostname).slice(0, 48))}</a>`).join('')}</div>`, { count: Math.min(6, imgs.length) }));
  }
  if (c.description) body.appendChild(sec('What it does', `<p>${esc(c.description)}</p>`));
  if (c.alias) body.appendChild(el('p', 'pl-hint', `Also called: ${esc(c.alias)}`));
  if (c.location) body.appendChild(fold('Where it goes', `<p>${esc(c.location)}</p>`));
  const specs = Object.entries(c.specs);
  const tags = c.tags.length ? [['Tags', c.tags.join(', ')]] : [];
  if (specs.length || tags.length) body.appendChild(fold('Specs', `<div class="kv">${[...specs, ...tags].map(([k, v]) => `<div>${esc(k)}</div><div>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</div>`).join('')}</div>`, { count: specs.length }));
  const links = [...new Set([...c.connectsTo, ...neighbours(c.id)])].filter((id) => state.byId.has(id));
  if (links.length) {
    const cs = fold('Connects to', '', { count: links.length });
    const fb = cs.querySelector('.fold-body');
    for (const id of links) {
      const o = state.byId.get(id);
      const chip = btn(`<span class="sw" style="background:${state.sysById.get(o.system).color}"></span>${esc(o.displayName)}`, () => { select({ type: 'component', id }); emit('frame', { type: 'component', id }); }, 'conn');
      chip.addEventListener('mouseenter', () => emit('hover', id));
      chip.addEventListener('mouseleave', () => emit('hover', null));
      fb.appendChild(chip);
    }
    body.appendChild(cs);
  }
  if (c.fluids.length) body.appendChild(fold('Fluids', `<div class="kv">${c.fluids.map((f) => `<div>${esc(f.name || 'Fluid')}</div><div>${esc([f.spec, f.capacity].filter(Boolean).join(' · '))}</div>`).join('')}</div>`, { count: c.fluids.length }));
  const saved = track(c.id).notes || '';
  const notes = fold('My notes', '', { open: !!saved, count: saved ? '1' : '' });
  const ta = el('textarea', 'notes');
  ta.setAttribute('aria-label', 'My notes for this part');
  ta.placeholder = 'Part numbers you bought, measurements, shims used…';
  ta.value = saved;
  let tmr;
  ta.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => setTrack(c.id, { notes: ta.value }), 400); });
  notes.querySelector('.fold-body').appendChild(ta);
  body.appendChild(notes);
  body.appendChild(lookUp(c));
}

function boltsTab(body, c) {
  if (!c.hardware.length) { body.appendChild(el('p', 'pl-hint', 'No bolts or fasteners recorded for this part.')); return; }
  body.appendChild(fold('What the labels mean', `<ul class="list-plain">${['verified', 'typical', 'estimate'].map((k) => `<li>${confPill(k)} ${esc(CONFIDENCE[k].desc)}</li>`).join('')}</ul>`));
  for (const x of c.hardware) {
    const est = confidenceOf(x) === 'estimate';
    const dup = isDuplicateRow(x);
    const rows = [['Size', x.spec], ['Grade', x.grade], ['Part #', x.partNumber], ['Sequence', x.torqueSequence || (hasTorque(x) && Number(x.qty) > 2 ? 'No sequence on file — work in a criss-cross pattern' : '')], ['Threads', x.threadlocker], ['Safety wire', x.safetyWire ? 'Yes' : ''], ['Reuse', x.reuse], ['Tool', x.tool], ['Notes', x.notes]].filter(([, v]) => v);
    const src = safeUrl(x.source);
    const ph = photoOf(x.photo);
    const card = body.appendChild(el('article', `hw${est ? ' est' : ''}${ph ? ' has-photo' : ''}`, `
      <div class="hw-top">${ph ? `<button type="button" class="hw-photo" aria-expanded="false" aria-label="Show photo: ${esc(ph.label)}"><img src="./${esc(ph.file)}" alt="" loading="lazy" decoding="async"></button>` : ''}<span class="hw-qty">${esc(x.qty ?? '')}×</span><span class="hw-item">${esc(x.item || 'Fastener')}</span>${dup ? '<span class="pill">Shared joint — counted once</span>' : ''}</div>
      <div class="hw-torque">${torqueBlock(x)}</div>
      <dl class="hw-grid">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(humanize(v))}</dd>`).join('')}${src ? `<dt>Source</dt><dd><a href="${esc(src)}" target="_blank" rel="noopener">${esc(new URL(src).hostname)}</a></dd>` : ''}</dl>`));
    if (ph) {
      // Tap the thumbnail for a big photo with its credit; tap again to fold it away.
      const b = card.querySelector('.hw-photo');
      let big = null;
      b.addEventListener('click', () => {
        if (big) { big.remove(); big = null; b.setAttribute('aria-expanded', 'false'); return; }
        big = el('div', 'hw-photo-big', photoFig(ph, { cap: `${ph.label} — typical example` }));
        card.querySelector('.hw-top').after(big);
        b.setAttribute('aria-expanded', 'true');
      });
    }
  }
}

function installTab(body, c) {
  if (c.installNotes.length) body.appendChild(sec('Install steps', `<ol class="list-plain">${c.installNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>`));
  if (c.inspection.length) body.appendChild(sec('Check between sessions', `<ul class="list-plain">${c.inspection.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`));
  if (!c.installNotes.length && !c.inspection.length) body.appendChild(el('p', 'pl-hint', 'No install notes recorded for this part.'));
}

function optionsTab(body, c) {
  const t = track(c.id);
  const opts = [];
  if (c.factory) opts.push({ key: 'factory', kind: 'GM factory', ...c.factory });
  c.raceOptions.forEach((o, i) => opts.push({ key: `race-${i}`, kind: o.brand ? `Race · ${o.brand}` : 'Race option', ...o }));
  if (!opts.length) { body.appendChild(el('p', 'pl-hint', 'No options recorded.')); return; }
  body.appendChild(el('p', 'pl-hint', 'Tap the one you are running — the headline torque follows it. Saved on this device.'));
  for (const o of opts) {
    const u = safeUrl(o.url);
    const chosen = t.choice === o.key;
    const card = btn(`
      <span class="opt-kind"><span>${esc(o.kind)}</span>${chosen ? `<span>${icon('check', 14)} My build</span>` : ''}</span>
      <span class="opt-name" style="display:block">${esc(o.name || '')}</span>
      ${o.partNumber ? `<span class="opt-pn" style="display:block">${esc(o.partNumber)}</span>` : ''}
      ${o.notes ? `<span class="opt-notes" style="display:block">${esc(o.notes)}</span>` : ''}`, () => setTrack(c.id, { choice: chosen ? '' : o.key }), 'opt');
    card.setAttribute('aria-pressed', String(chosen));
    body.appendChild(card);
    if (u) body.appendChild(el('div', 'links', `<a href="${esc(u)}" target="_blank" rel="noopener">${icon('external', 14)}${esc(new URL(u).hostname)}</a>`));
  }
}

function lookUp(c) {
  const pn = c.factory?.partNumber && String(c.factory.partNumber).replace(/^GM\s*/i, '');
  const q = encodeURIComponent(`Camaro 2016-2024 ${c.short}`);
  const links = [
    ['Google', `https://www.google.com/search?q=${q}`],
    ['Photos', `https://www.google.com/search?tbm=isch&q=${q}`],
    ['camaro6.com', `https://www.google.com/search?q=${encodeURIComponent(`site:camaro6.com ${c.short}`)}`],
    ['Summit Racing', `https://www.summitracing.com/search?keyword=${encodeURIComponent(c.short)}`],
    ['Install videos', `https://www.youtube.com/results?search_query=${encodeURIComponent(`Camaro gen 6 ${c.short} install`)}`],
  ];
  if (pn) links.unshift([`GM ${pn}`, `https://www.gmpartsdirect.com/search?search_str=${encodeURIComponent(pn)}`]);
  for (const o of c.raceOptions) if (o.partNumber) links.push([`${o.brand || ''} ${o.partNumber}`.trim(), `https://www.google.com/search?q=${encodeURIComponent(`${o.brand || ''} ${o.partNumber}`)}`]);
  const src = sourceLinks(c.sources);
  const s = fold('Look it up', `<div class="links">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${icon('external', 14)}${esc(l)}</a>`).join('')}</div>
    ${src.length ? `<p class="mono-label" style="margin-top:12px">Research sources</p><ul class="list-plain">${src.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || new URL(x.url).hostname)}</a></li>`).join('')}</ul>` : ''}
    <p class="pl-hint">Reference ID <span class="mono">${esc(c.id)}</span></p>`);
  return s;
}

function sourcesSec(sources) {
  const list = sourceLinks(sources);
  if (!list.length) return el('div');
  return sec('Research sources', `<ul class="list-plain">${list.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title || new URL(x.url).hostname)}</a></li>`).join('')}</ul>`);
}
