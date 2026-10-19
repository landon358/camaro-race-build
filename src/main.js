import { state, on, set, select, indexDb } from './state.js';
import { Viewer, wireViewer } from './viewer.js';
import { initSidebar } from './ui/sidebar.js';
import { initInspector } from './ui/inspector.js';
import { initSearch } from './ui/search.js';
import { initModals } from './ui/modals.js';
import { el, esc } from './ui/dom.js';
import { initPreviews } from './ui/preview.js';

const BASE = import.meta.env.BASE_URL;

async function boot() {
  const loadingText = document.getElementById('loading-text');
  const db = await fetch(`${BASE}data/db.json`, { cache: 'no-cache' }).then((r) => r.json());
  indexDb(db);

  const viewer = new Viewer(document.getElementById('c'), {
    labels: document.getElementById('labels'),
    tip: document.getElementById('hover-tip'),
  });
  window.__app = { viewer, state, select, set }; // handy for debugging in the console

  loadingText.textContent = 'Building parts…';
  await viewer.loadBodyParts(`${BASE}models/body-parts.glb`);
  viewer.buildParts(db);
  wireViewer(viewer);
  initPreviews(viewer);

  initSidebar();
  initInspector();
  initSearch();
  initModals();
  initToolbar(viewer);
  initCrumbs();
  initMobile();
  on('frame', (sel) => viewer.frame(sel));

  loadingText.textContent = 'Loading reference body…';
  try {
    await viewer.loadBody(`${BASE}models/camaro.glb`);
  } catch (e) {
    console.error('Body failed to load', e);
  }
  const loading = document.getElementById('loading');
  loading.classList.add('done');
  setTimeout(() => (loading.hidden = true), 450);
}

function initToolbar(viewer) {
  const seg = document.getElementById('seg-body');
  seg.querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      set('bodyMode', b.dataset.v);
    })
  );
  const explode = document.getElementById('explode');
  explode.addEventListener('input', () => set('explode', +explode.value));

  const phase = document.getElementById('phase');
  const phaseVal = document.getElementById('phase-val');
  const showPhase = (v) => {
    const p = state.db.phases.find((x) => x.n === v);
    phaseVal.textContent = p ? `${p.n} · ${p.name}` : 'All';
    phaseVal.title = p ? p.detail : '';
  };
  phase.addEventListener('input', () => set('phase', +phase.value));
  on('change:phase', (v) => { phase.value = v; showPhase(v); });
  showPhase(12);

  const chip = (id, key) => {
    const b = document.getElementById(id);
    b.classList.toggle('on', !!state[key]);
    b.addEventListener('click', () => { set(key, !state[key]); b.classList.toggle('on', !!state[key]); });
  };
  chip('t-routes', 'showRoutes');
  chip('t-flow', 'flow');
  chip('t-status', 'statusColors');
  chip('t-real', 'realColors');
  chip('t-labels', 'labels');
  document.getElementById('t-reset').addEventListener('click', () => {
    select(null);
    explode.value = 0;
    set('explode', 0);
    set('phase', 12);
    viewer.resetView();
  });
}

function initCrumbs() {
  const host = document.getElementById('crumbs');
  const draw = () => {
    host.replaceChildren();
    const sel = state.selection;
    const items = [];
    const hiddenCount = [...state.hiddenSystems].filter((s) => s !== 'body').length;
    if (hiddenCount) {
      const b = el('span', 'crumb', `${hiddenCount} system${hiddenCount > 1 ? 's' : ''} hidden · show all`);
      b.addEventListener('click', () => set('hiddenSystems', new Set(['body'])));
      items.push(b);
    }
    if (sel) {
      const label = sel.type === 'component' ? state.byId.get(sel.id)?.name : sel.type === 'subsystem' ? state.subById.get(sel.id)?.name : state.sysById.get(sel.id)?.name;
      items.push(el('span', 'crumb', `<span style="color:var(--text-3)">${sel.type}:</span> ${esc(label)}`));
      const clr = el('span', 'crumb clear', '✕ Clear selection');
      clr.addEventListener('click', () => select(null));
      items.push(clr);
    }
    host.append(...items);
  };
  on('select', draw);
  on('change:hiddenSystems', draw);
}

function initMobile() {
  const left = document.getElementById('left-panel');
  const right = document.getElementById('right-panel');
  document.getElementById('btn-left').addEventListener('click', () => left.classList.toggle('open'));
  on('select', (sel) => {
    if (window.innerWidth > 1000) return;
    left.classList.remove('open');
    right.classList.toggle('open', !!sel);
  });
  document.getElementById('c').addEventListener('pointerdown', () => left.classList.remove('open'));
  // modal buttons are hidden on phones: mirror them into the left panel foot
  const foot = document.getElementById('left-foot');
  const row = el('div', '', '');
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';
  row.className = 'mobile-actions';
  for (const [name, label] of [['catalog', 'Parts'], ['schematics', 'Schematics'], ['torque', 'Torque'], ['tracker', 'Tracker'], ['help', 'Help']]) {
    const b = el('button', 'btn', label);
    b.dataset.modal = name;
    b.addEventListener('click', () => { left.classList.remove('open'); document.querySelector(`.top-btn[data-modal=${name}]`).click(); });
    row.appendChild(b);
  }
  foot.after(row);
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading-text').textContent = 'Failed to load: ' + e.message;
});
