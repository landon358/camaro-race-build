// Global search across parts, part numbers and bolts (combobox + listbox).
import { state, select, emit, on } from '../state.js';
import { el, esc, announce } from './dom.js';
import { confPill } from './present.js';
import { hasTorque, parseTorque, parseHw, isDuplicateRow } from '../torque.js';
import { systemName, groupTitle, zoneName } from './present.js';

let index = [];
let results = [];
let active = 0;

const norm = (s) => String(s ?? '').toLowerCase();

function buildIndex() {
  index = state.db.components.map((c) => {
    const pns = [c.factory?.partNumber, ...c.raceOptions.map((o) => `${o.brand || ''} ${o.name || ''} ${o.partNumber || ''}`)].filter(Boolean).join(' ');
    return {
      c,
      name: norm(`${c.displayName} ${c.short}`),
      alias: norm(`${c.alias || ''} ${c.name}`),
      where: norm(`${groupTitle(c.subsystem)} ${systemName(c.system)} ${zoneName(c.zone)}`),
      tags: norm(c.tags.join(' ')),
      pns: norm(`${c.factory?.name || ''} ${pns}`),
      desc: norm(`${c.description} ${c.location}`),
      hw: c.hardware.map((h) => ({ h, text: norm(`${h.item} ${h.spec} ${h.grade} ${h.partNumber} ${h.torque}`) })),
    };
  });
}

function search(q) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const out = [];
  for (const e of index) {
    let score = 0;
    let hit = null;
    let all = true;
    for (const t of toks) {
      let s = 0;
      if (e.name.includes(t)) s += e.name.startsWith(t) ? 14 : 10;
      if (e.alias.includes(t)) s += 7;
      if (e.where.includes(t)) s += 4;
      if (e.tags.includes(t)) s += 5;
      if (e.pns.includes(t)) s += 7;
      if (e.desc.includes(t)) s += 1.5;
      const hh = e.hw.find((x) => x.text.includes(t));
      if (hh) { s += 4; hit = hit || hh.h; }
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) out.push({ c: e.c, score: score - e.c.tier * 2, hit });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

export function initSearch() {
  buildIndex();
  const input = document.getElementById('search');
  const box = document.getElementById('search-results');
  const open = (v) => { box.hidden = !v; input.setAttribute('aria-expanded', String(v)); };
  const render = () => {
    if (!input.value.trim()) { open(false); input.removeAttribute('aria-activedescendant'); return; }
    open(true);
    box.replaceChildren();
    if (!results.length) {
      box.appendChild(el('div', 'sr-empty', 'No parts match. Try a bolt size like “M12”, a part number, or a corner like “front left”.'));
      return;
    }
    results.forEach((r, i) => {
      const sys = state.sysById.get(r.c.system);
      let hit = '';
      if (r.hit) {
        const t = hasTorque(r.hit) ? parseHw(r.hit) : null;
        hit = `<div class="sr-hit"><span>${esc(r.hit.qty ?? '')}× ${esc(r.hit.spec || r.hit.item)}</span>${t?.primary ? `<b class="mono">${esc(t.primary)}${t.angle ? ` ${esc(t.angle)}` : ''}</b>${confPill(r.hit)}` : ''}</div>`;
      }
      const row = el('div', 'sr-item', `
        <span class="sw" style="background:${sys.color}" aria-hidden="true"></span>
        <div><div class="sr-name">${esc(r.c.displayName)}</div>
        <div class="sr-meta">${esc(systemName(r.c.system))} › ${esc(groupTitle(r.c.subsystem))}${r.c.alias ? ` · also called ${esc(r.c.alias)}` : ''}</div>${hit}</div>`);
      row.id = `sr-${i}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(i === active));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
      row.addEventListener('mouseenter', () => emit('hover', r.c.id));
      row.addEventListener('mouseleave', () => emit('hover', null));
      box.appendChild(row);
    });
    input.setAttribute('aria-activedescendant', `sr-${active}`);
    box.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const r = results[i];
    if (!r) return;
    select({ type: 'component', id: r.c.id });
    emit('frame', { type: 'component', id: r.c.id });
    emit('hover', null);
    open(false);
    emit('search-chosen');
    emit('focus-title');
  };
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      results = search(input.value);
      active = 0;
      render();
      if (input.value.trim()) announce(`${results.length} result${results.length === 1 ? '' : 's'}`);
    }, 80);
  });
  input.addEventListener('focus', () => { if (input.value) render(); });
  input.addEventListener('blur', () => setTimeout(() => open(false), 150));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { choose(active); e.preventDefault(); }
    else if (e.key === 'Escape') { input.value = ''; open(false); input.blur(); }
  });
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !document.getElementById('modal').open) {
      e.preventDefault();
      input.focus();
    }
  });
  on('focus-search', () => { input.focus(); input.select(); });
}
