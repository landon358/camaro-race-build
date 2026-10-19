// Left panel: systems tree and build-order (phase) list.
import { state, on, select, set, emit, track, progressFor } from '../state.js';
import { el, esc } from './dom.js';

const open = new Set();

export function initSidebar() {
  const tabs = document.querySelectorAll('.panel.left .tab');
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      document.getElementById('tab-systems').hidden = t.dataset.tab !== 'systems';
      document.getElementById('tab-phases').hidden = t.dataset.tab !== 'phases';
    })
  );
  renderTree();
  renderPhases();
  renderFoot();
  on('select', (sel) => {
    if (sel) {
      const c = sel.type === 'component' ? state.byId.get(sel.id) : null;
      const sys = c ? c.system : sel.type === 'system' ? sel.id : state.subById.get(sel.id)?.system;
      if (sys) open.add(sys);
      if (c) open.add(c.subsystem);
      if (sel.type === 'subsystem') open.add(sel.id);
    }
    renderTree();
    scrollSelected();
  });
  on('tracker', () => { renderTree(); renderFoot(); });
  on('change:hiddenSystems', renderTree);
  on('change:phase', renderPhases);
}

function scrollSelected() {
  requestAnimationFrame(() => {
    const s = document.querySelector('#tab-systems .comp.selected, #tab-systems .sub-head.selected, #tab-systems .sys-head.selected');
    s?.scrollIntoView({ block: 'nearest' });
  });
}

function isSel(type, id) {
  return state.selection && state.selection.type === type && state.selection.id === id;
}

export function renderTree() {
  const host = document.getElementById('tab-systems');
  const frag = document.createDocumentFragment();

  // reference body toggles
  const bodyBox = el('div', 'sys');
  bodyBox.innerHTML = `<div class="sys-head" style="cursor:default"><span class="caret"></span><span class="sw" style="background:#8a1712"></span><span class="sys-name">Reference body (ZL1 1LE)</span></div>`;
  const bodyRow = el('div', 'sys-body');
  bodyRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 8px 38px';
  for (const part of Object.keys(state.bodyParts)) {
    const b = el('button', 'chip' + (state.bodyParts[part] ? ' on' : ''), part);
    b.addEventListener('click', () => set('bodyParts', { ...state.bodyParts, [part]: !state.bodyParts[part] }));
    bodyRow.appendChild(b);
  }
  bodyBox.appendChild(bodyRow);
  frag.appendChild(bodyBox);

  for (const s of state.db.systems) {
    const ids = s.subsystems.flatMap((x) => x.componentIds);
    const box = el('div', 'sys' + (open.has(s.id) ? ' open' : ''));
    const head = el('div', 'sys-head' + (isSel('system', s.id) ? ' selected' : ''));
    head.innerHTML = `<span class="caret">▶</span><span class="sw" style="background:${s.color}"></span><span class="sys-name" title="${esc(s.name)}">${esc(s.name)}</span><span class="count">${ids.length}</span>`;
    const eye = el('button', 'eye' + (state.hiddenSystems.has(s.id) ? ' off' : ''), state.hiddenSystems.has(s.id) ? '◌' : '◉');
    eye.title = 'Show / hide in 3D';
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      const h = new Set(state.hiddenSystems);
      h.has(s.id) ? h.delete(s.id) : h.add(s.id);
      set('hiddenSystems', h);
    });
    head.appendChild(eye);
    head.addEventListener('click', (e) => {
      if (e.target.closest('.caret') || isSel('system', s.id)) toggle(s.id);
      else { open.add(s.id); select({ type: 'system', id: s.id }); emit('frame', { type: 'system', id: s.id }); }
    });
    box.appendChild(head);
    if (ids.length) {
      const prog = el('div', 'prog');
      prog.innerHTML = `<i style="width:${(progressFor(ids) * 100).toFixed(1)}%"></i>`;
      box.appendChild(prog);
    }
    if (open.has(s.id)) {
      const body = el('div', 'sys-body');
      if (!s.subsystems.length) body.appendChild(el('div', 'comp', '<span class="comp-name" style="color:var(--text-3)">Research in progress…</span>'));
      for (const sub of s.subsystems) {
        const sb = el('div', 'sub' + (open.has(sub.id) ? ' open' : ''));
        const sh = el('div', 'sub-head' + (isSel('subsystem', sub.id) ? ' selected' : ''));
        sh.innerHTML = `<span class="caret">▶</span><span class="sub-name" title="${esc(sub.name)}">${esc(sub.name)}</span><span class="count">${sub.componentIds.length}</span>`;
        sh.addEventListener('click', (e) => {
          if (e.target.closest('.caret') || isSel('subsystem', sub.id)) toggle(sub.id);
          else { open.add(sub.id); select({ type: 'subsystem', id: sub.id }); emit('frame', { type: 'subsystem', id: sub.id }); }
        });
        sb.appendChild(sh);
        if (open.has(sub.id)) {
          const list = el('div', 'comp-list');
          for (const id of sub.componentIds) {
            const c = state.byId.get(id);
            const st = track(id).status || '';
            const row = el('div', 'comp' + (isSel('component', id) ? ' selected' : ''));
            row.innerHTML = `<span class="dot ${st}"></span><span class="comp-name" title="${esc(c.name)}">${esc(c.name)}</span>${c.qty > 1 ? `<span class="count">×${esc(c.qty)}</span>` : ''}`;
            row.addEventListener('click', () => { select({ type: 'component', id }); emit('frame', { type: 'component', id }); });
            list.appendChild(row);
          }
          sb.appendChild(list);
        }
        body.appendChild(sb);
      }
      box.appendChild(body);
    }
    frag.appendChild(box);
  }
  const scroll = host.scrollTop;
  host.replaceChildren(frag);
  host.scrollTop = scroll;
}

function toggle(id) {
  open.has(id) ? open.delete(id) : open.add(id);
  renderTree();
}

let activePhase = null;
export function renderPhases() {
  const host = document.getElementById('tab-phases');
  host.replaceChildren();
  const intro = el('div', '', `<p style="color:var(--text-2);font-size:13px;margin:4px 6px 10px">Recommended build order from a bare shell. Click a phase to see the car assembled up to that point and its parts in install order.</p>`);
  host.appendChild(intro);
  for (const p of state.db.phases) {
    const comps = state.db.components.filter((c) => c.buildPhase === p.n).sort((a, b) => a.system.localeCompare(b.system) || a.installOrder - b.installOrder);
    const prog = progressFor(comps.map((c) => c.id));
    const box = el('div', 'phase' + (activePhase === p.n ? ' active' : ''));
    box.innerHTML = `<div class="phase-top"><span class="phase-n">${p.n}</span><span class="phase-name">${esc(p.name)}</span><span class="count">${Math.round(prog * 100)}% · ${comps.length}</span></div><div class="phase-detail">${esc(p.detail)}</div>`;
    const steps = el('div', 'phase-steps');
    let lastSys = null;
    for (const c of comps) {
      if (c.system !== lastSys) {
        lastSys = c.system;
        const sys = state.sysById.get(c.system);
        steps.appendChild(el('div', 'schem-sys', `<span class="sw" style="background:${sys.color}"></span>${esc(sys.name)}`));
      }
      const st = track(c.id).status || '';
      const row = el('div', 'phase-step', `<span class="dot ${st}"></span><span>${esc(c.name)}</span>`);
      row.addEventListener('click', (e) => { e.stopPropagation(); select({ type: 'component', id: c.id }); emit('frame', { type: 'component', id: c.id }); });
      steps.appendChild(row);
    }
    box.appendChild(steps);
    box.addEventListener('click', () => {
      activePhase = activePhase === p.n ? null : p.n;
      set('phase', activePhase ?? 12);
    });
    host.appendChild(box);
  }
}

export function renderFoot() {
  const total = state.db.components.length;
  const installed = state.db.components.filter((c) => track(c.id).status === 'installed').length;
  const hw = state.db.components.reduce((n, c) => n + c.hardware.reduce((m, h) => m + (Number(h.qty) || 1), 0), 0);
  const foot = document.getElementById('left-foot');
  foot.innerHTML = `<div style="display:flex;justify-content:space-between"><span>${total} parts · ~${hw.toLocaleString()} fasteners</span><span>${installed}/${total} installed</span></div>
  <div class="only-narrow" style="margin-top:8px;display:none;gap:6px;flex-wrap:wrap" id="foot-actions"></div>`;
}
