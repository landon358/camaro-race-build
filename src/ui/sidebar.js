// Left panel: browse by System (system › area › part), by Location (corner/area › system › part),
// or by Build order (phase › area › part). Every row is a real button.
import { state, on, select, set, emit, track } from '../state.js';
import { el, esc } from './dom.js';
import { icon } from './icons.js';
import { statusBadge, byPartOrder, systemName, groupTitle, partName, pct, zoneName, zoneCounts } from './present.js';
import { carMap } from './carmap.js';
import { reuseClass } from '../torque.js';

const open = new Set();
let tab = 'systems';
const ZONE_ORDER = ['FL', 'FR', 'RL', 'RR', 'FRONT', 'ENG', 'CAB', 'REAR', 'UNDER', 'CAR', 'PROC'];

export function initSidebar() {
  const tabs = [...document.querySelectorAll('.panel.left .tab')];
  const show = (t, focus) => {
    tab = t.dataset.tab;
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', on);
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) t.focus();
    render();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        show(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
      }
    });
  });
  on('show-tab', (name) => show(tabs.find((t) => t.dataset.tab === name)));
  on('select', (sel) => {
    if (sel) {
      open.clear(); // only the branch you are on stays open
      const c = sel.type === 'component' ? state.byId.get(sel.id) : null;
      if (c) { open.add(c.system); open.add(c.subsystem); open.add(`zone:${c.zone}`); open.add(`zone:${c.zone}:${c.system}`); }
      if (sel.type === 'system') open.add(sel.id);
      if (sel.type === 'subsystem') { open.add(state.subById.get(sel.id)?.system); open.add(sel.id); }
      if (sel.type === 'zone') open.add(`zone:${sel.id}`);
    }
    render();
    requestAnimationFrame(() => document.querySelector('.panel.left .tab-body:not([hidden]) [aria-current="true"]')?.scrollIntoView({ block: 'nearest' }));
  });
  on('tracker', () => { render(); renderFoot(); });
  on('change:hiddenSystems', render);
  on('change:phase', render);
  render();
  renderFoot();
}

function isSel(type, id) {
  return state.selection && state.selection.type === type && state.selection.id === id;
}

function row(cls, html, { expanded, current, onClick, label } = {}) {
  const b = el('button', `row ${cls}`, html);
  b.type = 'button';
  if (expanded !== undefined) b.setAttribute('aria-expanded', expanded);
  if (current) b.setAttribute('aria-current', 'true');
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

const chev = () => `<span class="chev" aria-hidden="true">${icon('right', 16)}</span>`;
const count = (n) => `<span class="count">${n} part${n === 1 ? '' : 's'}</span>`;

function partRow(c, extra = '') {
  const b = row('part', `${statusBadge(c.id) ? `<span class="sr-only">${esc(track(c.id).status)}</span>` : ''}<span class="name">${esc(c.short)}</span>${c.qty > 1 ? `<span class="count">×${esc(c.qty)}</span>` : ''}${extra}${statusBadge(c.id)}`, {
    current: isSel('component', c.id),
    onClick: () => { select({ type: 'component', id: c.id }); emit('frame', { type: 'component', id: c.id }); if (matchMedia('(max-width: 1180px)').matches) emit('focus-title'); },
  });
  b.addEventListener('mouseenter', () => emit('hover', c.id));
  b.addEventListener('mouseleave', () => emit('hover', null));
  return b;
}

/** Parts of a list with "Main parts / Hardware / Service" headings. */
function partsWithTiers(host, ids, mkRow = partRow) {
  let last = -1;
  for (const id of ids) {
    const c = state.byId.get(id);
    if (!c) continue;
    if (c.tier !== last) {
      last = c.tier;
      host.appendChild(el('div', 'tier-head', esc(state.db.tierNames?.[c.tier] || '')));
    }
    host.appendChild(mkRow(c));
  }
}

function toggle(key) {
  open.has(key) ? open.delete(key) : open.add(key);
  render();
}

export function render() {
  if (tab === 'systems') renderSystems();
  else if (tab === 'locations') renderLocations();
  else renderPhases();
}

function keepScroll(host, frag) {
  const top = host.scrollTop;
  host.replaceChildren(frag);
  host.scrollTop = top;
}

// ------------------------------------------------------------------ systems
function renderSystems() {
  const host = document.getElementById('tab-systems');
  const frag = document.createDocumentFragment();
  for (const s of state.db.systems) {
    const ids = s.subsystems.flatMap((x) => x.componentIds);
    const box = el('div', 'tree-sys');
    const line = el('div', 'sys-line');
    const isOpen = open.has(s.id);
    line.appendChild(row('sys', `${chev()}<span class="sw" style="background:${s.color}" aria-hidden="true"></span><span class="name">${esc(systemName(s.id))}</span>${count(ids.length)}`, {
      expanded: isOpen,
      current: isSel('system', s.id),
      onClick: () => {
        if (isSel('system', s.id)) toggle(s.id);
        else { open.add(s.id); select({ type: 'system', id: s.id }); emit('frame', { type: 'system', id: s.id }); }
      },
    }));
    const hidden = state.hiddenSystems.has(s.id);
    const eye = el('button', 'eye', icon(hidden ? 'eyeOff' : 'eye', 18));
    eye.type = 'button';
    eye.setAttribute('aria-pressed', String(!hidden));
    eye.setAttribute('aria-label', `Show ${systemName(s.id)} in 3D`);
    eye.title = hidden ? 'Hidden in 3D — click to show' : 'Shown in 3D — click to hide';
    eye.addEventListener('click', () => {
      const h = new Set(state.hiddenSystems);
      h.has(s.id) ? h.delete(s.id) : h.add(s.id);
      set('hiddenSystems', h);
    });
    line.appendChild(eye);
    box.appendChild(line);
    if (isOpen) {
      for (const sub of s.subsystems) {
        const gOpen = open.has(sub.id);
        box.appendChild(row('grp', `${chev()}<span class="name">${esc(sub.name)}</span>${count(sub.componentIds.length)}`, {
          expanded: gOpen,
          current: isSel('subsystem', sub.id),
          onClick: () => {
            if (isSel('subsystem', sub.id)) toggle(sub.id);
            else { open.add(sub.id); select({ type: 'subsystem', id: sub.id }); emit('frame', { type: 'subsystem', id: sub.id }); }
          },
        }));
        if (gOpen) partsWithTiers(box, sub.componentIds);
      }
    }
    frag.appendChild(box);
  }
  keepScroll(host, frag);
}

// ------------------------------------------------------------------ locations
function renderLocations() {
  // the car is the menu: tap a corner or an area; only the spot you picked opens below
  const host = document.getElementById('tab-locations');
  const frag = document.createDocumentFragment();
  const cur = state.selection?.type === 'zone' ? state.selection.id
    : state.selection?.type === 'component' ? state.byId.get(state.selection.id)?.zone : null;
  const pickZone = (z) => { open.add(`zone:${z}`); select({ type: 'zone', id: z }); emit('frame', { type: 'zone', id: z }); };
  const mapBox = el('div', 'loc-map');
  mapBox.appendChild(carMap({ size: 'large', counts: zoneCounts(state.db.components.map((c) => c.id)), active: cur, onPick: pickZone }));
  frag.appendChild(mapBox);
  const chips = el('div', 'loc-chips');
  for (const z of ['UNDER', 'CAR', 'PROC']) {
    const n = state.db.components.filter((c) => c.zone === z).length;
    if (!n) continue;
    const b = el('button', `chip${cur === z ? ' on' : ''}`, `${esc(zoneName(z))} <span class="n">${n}</span>`);
    b.type = 'button';
    if (cur === z) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => pickZone(z));
    chips.appendChild(b);
  }
  frag.appendChild(chips);
  if (cur) {
    const comps = state.db.components.filter((c) => c.zone === cur);
    const box = el('div', 'tree-sys loc-open');
    box.appendChild(el('div', 'loc-head', `${icon('pin', 14)}<b>${esc(zoneName(cur))}</b><span class="count">${comps.length} parts</span>`));
    for (const s of state.db.systems) {
      const ids = comps.filter((c) => c.system === s.id).sort(byPartOrder).map((c) => c.id);
      if (!ids.length) continue;
      const sk = `zone:${cur}:${s.id}`;
      const sOpen = open.has(sk);
      box.appendChild(row('grp', `${chev()}<span class="sw" style="background:${s.color}" aria-hidden="true"></span><span class="name">${esc(systemName(s.id))}</span>${count(ids.length)}`, {
        expanded: sOpen,
        onClick: () => toggle(sk),
      }));
      if (sOpen) partsWithTiers(box, ids);
    }
    frag.appendChild(box);
  } else {
    frag.appendChild(el('p', 'sub-note', 'Tap a corner or an area of the car to list everything there, from every system.'));
  }
  keepScroll(host, frag);
}

// ------------------------------------------------------------------ build order
function renderPhases() {
  const host = document.getElementById('tab-phases');
  const frag = document.createDocumentFragment();
  frag.appendChild(el('p', 'sub-note', 'Recommended order from a bare shell. Open a step to see the car built up to that point and the parts to fit, by location.'));
  for (const p of state.db.phases) {
    const comps = state.db.components.filter((c) => c.buildPhase === p.n);
    const isOpen = state.phase === p.n;
    const box = el('div', 'phase');
    box.dataset.open = String(isOpen);
    box.appendChild(row('sys', `<span class="phase-n" aria-hidden="true">${p.n}</span><span class="name"><span>${esc(p.name)}</span><br><span class="count">${esc(p.detail)}</span></span><span class="count">${comps.length}</span>`, {
      expanded: isOpen,
      label: `Step ${p.n} of ${state.db.phases.length}: ${p.name}, ${comps.length} parts`,
      onClick: () => set('phase', isOpen ? 12 : p.n),
    }));
    if (isOpen) {
      const body = el('div', 'phase-body');
      for (const z of ZONE_ORDER) {
        const zs = comps.filter((c) => c.zone === z).sort(byPartOrder);
        if (!zs.length) continue;
        body.appendChild(el('div', 'phase-zone', `${icon('pin', 14)}${esc(zoneName(z))}`));
        for (const c of zs) {
          const rep = c.hardware.filter((h) => reuseClass(h.reuse) === 'REPLACE').length;
          body.appendChild(partRow(c, rep ? `<span class="pill reuse-REPLACE" title="Fasteners to replace">${rep} replace</span>` : ''));
        }
      }
      box.appendChild(body);
    }
    frag.appendChild(box);
  }
  keepScroll(host, frag);
}

export function renderFoot() {
  const total = state.db.components.length;
  const installed = state.db.components.filter((c) => track(c.id).status === 'installed').length;
  document.getElementById('left-foot').innerHTML = `<span>${total} parts</span><span>${state.db.systems.length} systems</span>`;
  const bar = document.querySelector('#brand-progress i');
  if (bar) bar.style.width = `${(installed / total) * 100}%`;
  document.getElementById('brand-progress')?.setAttribute('title', `${installed} of ${total} parts installed`);
}

export { groupTitle, partName };
