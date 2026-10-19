// Global search across components, part numbers and hardware.
import { state, select, emit } from '../state.js';
import { el, esc } from './dom.js';

let index = [];
let results = [];
let active = 0;

function norm(s) {
  return String(s ?? '').toLowerCase();
}

function buildIndex() {
  index = state.db.components.map((c) => {
    const pns = [c.factory?.partNumber, ...c.raceOptions.map((o) => `${o.brand || ''} ${o.name || ''} ${o.partNumber || ''}`)].filter(Boolean).join(' ');
    return {
      c,
      name: norm(c.name),
      id: norm(c.id),
      sub: norm(state.subById.get(c.subsystem)?.name),
      tags: norm(c.tags.join(' ')),
      pns: norm(`${c.factory?.name || ''} ${pns}`),
      desc: norm(`${c.description} ${c.location} ${Object.entries(c.specs).join(' ')}`),
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
      if (e.sub.includes(t)) s += 4;
      if (e.id.includes(t)) s += 3;
      if (e.tags.includes(t)) s += 5;
      if (e.pns.includes(t)) s += 7;
      if (e.desc.includes(t)) s += 1.5;
      const hh = e.hw.find((x) => x.text.includes(t));
      if (hh) { s += 4; hit = hit || hh.h; }
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) out.push({ c: e.c, score, hit });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

export function initSearch() {
  buildIndex();
  const input = document.getElementById('search');
  const box = document.getElementById('search-results');
  const render = () => {
    if (!input.value.trim()) { box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren();
    if (!results.length) { box.appendChild(el('div', 'sr-empty', 'No matches.')); return; }
    results.forEach((r, i) => {
      const sys = state.sysById.get(r.c.system);
      const row = el('div', 'sr-item' + (i === active ? ' active' : ''), `
        <span class="sw" style="background:${sys.color}"></span>
        <div><div class="sr-name">${esc(r.c.name)}</div>
        <div class="sr-meta">${esc(sys.name)} › ${esc(state.subById.get(r.c.subsystem)?.name || '')}</div>
        ${r.hit ? `<div class="sr-hit">${esc(r.hit.qty ?? '')}× ${esc(r.hit.spec || r.hit.item)}${r.hit.torque ? ' · ' + esc(r.hit.torque) : ''}</div>` : ''}</div>`);
      row.addEventListener('mousedown', (e) => { e.preventDefault(); choose(i); });
      box.appendChild(row);
    });
  };
  const choose = (i) => {
    const r = results[i];
    if (!r) return;
    select({ type: 'component', id: r.c.id });
    emit('frame', { type: 'component', id: r.c.id });
    box.hidden = true;
    input.blur();
  };
  input.addEventListener('input', () => { results = search(input.value); active = 0; render(); });
  input.addEventListener('focus', () => { if (input.value) render(); });
  input.addEventListener('blur', () => setTimeout(() => (box.hidden = true), 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') choose(active);
    else if (e.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      input.focus();
    }
  });
}
