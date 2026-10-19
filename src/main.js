import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import { state, on, set, select, emit, indexDb, STATUSES } from './state.js';
import { initSidebar } from './ui/sidebar.js';
import { initInspector } from './ui/inspector.js';
import { initSearch } from './ui/search.js';
import { initModals, isModalOpen } from './ui/modals.js';
import { el, esc, announce, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { initPreviews } from './ui/preview.js';
import { systemName, groupTitle, zoneName } from './ui/present.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);
const phone = () => matchMedia('(max-width: 720px)').matches && !matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
const drawerMode = () => matchMedia('(max-width: 1180px)').matches;
let viewer = null;

// ------------------------------------------------------------------ loading
function progress(frac, text) {
  $('load-bar').style.transform = `scaleX(${(5 + frac * 95) / 100})`;
  if (text) $('loading-text').textContent = text;
}

async function fetchJson(url, onProgress) {
  const res = await fetch(url); // the service worker keeps it fresh; reuses the <link rel=preload>
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const total = +res.headers.get('content-length') || 2.6e6;
  if (!res.body?.getReader) return res.json();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}

async function boot() {
  // offline copy: registered once the page has loaded (so the first visit doesn't download twice);
  // the worker's list holds every built file, so nothing is missed
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data === 'updated') toast('A newer version of the parts list is ready', { label: 'Reload', run: () => location.reload() });
    });
    navigator.serviceWorker.startMessages?.();
    const reg = () => navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
    // tell the crew once when everything is stored and it is safe to lose signal
    navigator.serviceWorker.ready.then(() => {
      try {
        if (localStorage.getItem('camaro-offline-ok')) return;
        localStorage.setItem('camaro-offline-ok', '1');
      } catch { return; }
      toast('Saved on this device — works without signal now');
    });
    if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
  }
  initChrome();
  const viewerModule = import('./viewer.js'); // fetch the 3D code while the parts list downloads
  viewerModule.catch(() => {}); // handled where it is awaited
  const db = await fetchJson(`${BASE}data/db.json`, (f) => progress(f * 0.45, 'Loading the parts list…'));
  indexDb(db);

  // the parts list, search and tools work without 3D
  initSidebar();
  initSearch();
  initModals();
  initTopActions();
  initDrawer();
  initSheet();
  initHistory();

  progress(0.5, 'Starting 3D…');
  try {
    const { Viewer, wireViewer } = await viewerModule;
    viewer = new Viewer($('c'), { labels: $('labels'), tip: $('hover-tip') });
    window.__app = { viewer, state, select, set, emit };
    progress(0.55, 'Loading body panels…');
    await viewer.loadBodyParts(`${BASE}models/body-parts.glb`);
    progress(0.7, 'Building parts…');
    await new Promise((r) => setTimeout(r, 0));
    viewer.buildParts(db);
    wireViewer(viewer);
    initPreviews(viewer);
    initViewbar();
    initStageOverlays();
    on('frame', (sel) => viewer.frame(sel));
    on('frame-tight', (sel) => viewer.frame(sel, { tight: true }));
    on('hover', (id) => viewer.setHover(id));
  } catch (e) {
    console.error('3D unavailable', e);
    viewer = null;
    initPreviews(null);
    showNo3d();
  }
  initInspector();
  applyHash();

  if (viewer) {
    progress(0.8, 'Loading the car body…');
    try {
      await viewer.loadBody(`${BASE}models/camaro.glb`);
    } catch (e) {
      console.error('Body failed to load', e);
    }
    progress(1, 'Ready');
  }
  const loading = $('loading');
  loading.classList.add('done');
  setTimeout(() => (loading.hidden = true), 350);
  updateObstruction();

  navigator.storage?.persist?.().catch(() => {});
}

function showNo3d() {
  const f = $('gl-fallback');
  f.hidden = false;
  f.innerHTML = `<h3>3D view not available</h3><p>This device or browser could not start 3D graphics.<br>Everything else works: browse parts, torque specs and your tracker.</p>`;
  const b = el('button', 'btn primary', `${icon('list', 16)}Browse parts`);
  b.type = 'button';
  b.addEventListener('click', () => openDrawer(true));
  const wrap = el('div');
  wrap.appendChild(b);
  f.appendChild(wrap);
  $('viewbar').hidden = true;
}

// ------------------------------------------------------------------ top bar
function initChrome() {
  $('btn-browse').innerHTML = icon('menu', 20);
  const f = $('gl-fallback');
  f.innerHTML = `<h3>3D view paused</h3><p>The graphics on this device stopped. Your place and progress are safe.</p>`;
  const b = el('button', 'btn primary', `${icon('reset', 16)}Reload 3D`);
  b.type = 'button';
  b.addEventListener('click', () => location.reload());
  f.appendChild(b);
}

function initTopActions() {
  // two daily tools up front; the rest one tap deeper
  const host = $('top-actions');
  const main = [['torque', 'wrench', 'Torque'], ['inspect', 'inspect', 'Checklist'], ['tracker', 'installed', 'Progress']];
  for (const [name, ic, label] of main) {
    const b = el('button', 'btn', `${icon(ic, 16)}<span class="lbl">${esc(label)}</span>`);
    b.type = 'button';
    b.title = label;
    b.addEventListener('click', () => emit('open-modal', { name }));
    host.appendChild(b);
  }
  const more = el('button', 'btn', `<span class="lbl">More</span>${icon('down', 14)}`);
  more.type = 'button';
  more.setAttribute('aria-label', 'More tools');
  popover(more, (pop, close) => moreMenu(pop, close, { skip: ['inspect'] }), { host: document.body, alignRight: true });
  host.appendChild(more);
}

/** The tools that are not on the bar: a plain list of buttons (a disclosure, not an ARIA menu). */
function moreMenu(pop, close, { skip = [] } = {}) {
  pop.classList.add('menu');
  for (const [name, ic, label, sub] of [
    ['catalog', 'parts', 'Catalog', 'Every part as a 3D card'],
    ['schematics', 'schematic', 'Schematics', 'System diagrams'],
    ['inspect', 'inspect', 'Checklist', 'Between sessions'],
    ['help', 'help', 'Help', 'How this works'],
  ].filter(([n]) => !skip.includes(n))) {
    const b = el('button', 'menu-item', `${icon(ic, 16)}<span><b>${esc(label)}</b><small>${esc(sub)}</small></span>`);
    b.type = 'button';
    b.addEventListener('click', () => { close(); emit('open-modal', { name }); });
    pop.appendChild(b);
  }
}

// ------------------------------------------------------------------ view bar
function seg(label, options, get, onPick) {
  const g = el('div', 'seg');
  g.setAttribute('role', 'radiogroup');
  g.setAttribute('aria-label', label);
  const draw = () => g.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(get()))));
  for (const [v, t] of options) {
    const b = el('button', '', esc(t));
    b.type = 'button';
    b.dataset.v = v;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { onPick(v); draw(); });
    g.appendChild(b);
  }
  draw();
  g.redraw = draw;
  return g;
}

function toggleBtn(label, key, title) {
  const b = el('button', 'toggle', esc(label));
  b.type = 'button';
  if (title) b.title = title;
  const draw = () => b.setAttribute('aria-pressed', String(!!state[key]));
  b.addEventListener('click', () => { set(key, !state[key]); draw(); });
  draw();
  return b;
}

function popover(anchor, build, opts = {}) {
  let pop = null;
  const close = () => {
    if (!pop) return;
    pop.remove();
    pop = null;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc_, true);
  };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc_ = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); }
    else if (e.key === 'Tab' && pop) requestAnimationFrame(() => { if (pop && !pop.contains(document.activeElement)) close(); });
  };
  anchor.setAttribute('aria-expanded', 'false');
  anchor.setAttribute('aria-haspopup', 'dialog');
  anchor.addEventListener('click', () => {
    if (pop) { close(); return; }
    pop = el('div', 'popover');
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', anchor.getAttribute('aria-label') || anchor.textContent.trim());
    build(pop, close);
    const host = opts.host || $('viewport');
    host.appendChild(pop);
    const a = anchor.getBoundingClientRect();
    const h = host === document.body ? { top: 0, left: 0, width: innerWidth } : host.getBoundingClientRect();
    if (host === document.body) pop.style.position = 'fixed';
    if (opts.sheet) pop.classList.add('sheet');
    pop.style.top = `${a.bottom - h.top + 6}px`;
    const left = opts.alignRight ? a.right - h.left - pop.offsetWidth : a.left - h.left;
    pop.style.left = `${Math.max(8, Math.min(left, h.width - pop.offsetWidth - 8))}px`;
    anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc_, true);
    pop.querySelector('button')?.focus();
  });
  return close;
}

function initViewbar() {
  // a small floating toolbar over the car: three menus and reset — everything else one tap deeper
  const bar = $('viewbar');
  bar.replaceChildren();
  const tool = (ic, label) => {
    const b = el('button', 'tool', `${icon(ic, 16)}<span class="lbl">${esc(label)}</span>`);
    b.type = 'button';
    b.title = label;
    return b;
  };

  const bodyBtn = tool('car', 'Body');
  popover(bodyBtn, (pop) => {
    pop.appendChild(el('h3', '', 'Body shell'));
    pop.appendChild(seg('Body shell', [['solid', 'Solid'], ['ghost', 'See-through'], ['off', 'Hidden']], () => state.bodyMode, (v) => set('bodyMode', v)));
    pop.appendChild(el('h3', '', 'Panels on the shell'));
    const row = el('div', 'pop-row');
    for (const k of Object.keys(state.bodyParts)) {
      const b = el('button', 'toggle', esc(k));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.bodyParts[k] !== false));
      b.addEventListener('click', () => {
        set('bodyParts', { ...state.bodyParts, [k]: state.bodyParts[k] === false });
        b.setAttribute('aria-pressed', String(state.bodyParts[k] !== false));
      });
      row.appendChild(b);
    }
    pop.appendChild(row);
    const b = el('button', 'toggle', 'Body & glass parts as their own pieces');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(!state.hiddenSystems.has('body')));
    b.addEventListener('click', () => {
      const h = new Set(state.hiddenSystems);
      h.has('body') ? h.delete('body') : h.add('body');
      set('hiddenSystems', h);
      b.setAttribute('aria-pressed', String(!h.has('body')));
    });
    pop.appendChild(b);
  }, { alignRight: true });

  const colourBtn = tool('layers', 'Colour');
  popover(colourBtn, (pop) => {
    pop.appendChild(el('h3', '', 'Colour parts by'));
    pop.appendChild(seg('Colour parts by', [['real', 'Real finish'], ['system', 'System'], ['status', 'Build status']], () => state.colorMode, (v) => set('colorMode', v)));
  }, { alignRight: true });

  const viewBtn = tool('sliders', 'View');
  const closeView = popover(viewBtn, (pop) => {
    const ex = el('div', 'pop-range');
    ex.innerHTML = `<label for="explode">Explode</label><input id="explode" type="range" min="0" max="1" step="0.01" value="${state.explode}">`;
    ex.querySelector('input').addEventListener('input', (e) => set('explode', +e.target.value));
    const ph = el('div', 'pop-range');
    ph.innerHTML = `<label for="phase">Built to</label><input id="phase" type="range" min="1" max="12" step="1" value="${state.phase}"><output id="phase-val"></output>`;
    const phase = ph.querySelector('input');
    const val = ph.querySelector('output');
    const show = (v) => {
      const p = state.db.phases.find((x) => x.n === v);
      val.textContent = p ? `Step ${p.n} · ${p.name}` : 'All steps';
      phase.setAttribute('aria-valuetext', val.textContent);
    };
    phase.addEventListener('input', () => { set('phase', +phase.value); show(+phase.value); });
    show(state.phase);
    pop.append(ex, ph);
    pop.appendChild(el('h3', '', 'Show'));
    const row = el('div', 'pop-row');
    row.append(
      toggleBtn('Hoses & wiring', 'showRoutes', 'Fluid lines, hoses, wiring and exhaust'),
      toggleBtn('Flow', 'flow', 'Animate what runs through each line'),
      toggleBtn('Labels', 'labels', 'Name the parts in view'),
    );
    pop.appendChild(row);
    const look = el('details', 'fold');
    look.innerHTML = `<summary><span>Look from</span>${icon('down', 14)}</summary>`;
    const views = el('div', 'pop-grid fold-body');
    for (const [v, t] of [['corner', '3/4'], ['front', 'Front'], ['rear', 'Rear'], ['left', 'Driver'], ['right', 'Passenger'], ['top', 'Top']]) {
      const b = el('button', 'btn', esc(t));
      b.type = 'button';
      b.addEventListener('click', () => { viewer.setView(v); closeView(); });
      views.appendChild(b);
    }
    look.appendChild(views);
    pop.appendChild(look);
  }, { alignRight: true });

  const reset = tool('reset', 'Reset');
  reset.title = 'Whole car: clear the selection, explode and build step';
  reset.addEventListener('click', resetAll);
  bar.append(bodyBtn, colourBtn, viewBtn, reset);
}

function resetAll() {
  select(null);
  set('explode', 0);
  set('phase', 12);
  const e = $('explode');
  if (e) e.value = 0;
  viewer?.resetView();
  announce('View reset');
}

// ------------------------------------------------------------------ stage overlays: path chip + legend
function initStageOverlays() {
  const chip = $('path-chip');
  const draw = () => {
    chip.replaceChildren();
    const sel = state.selection;
    const hidden = [...state.hiddenSystems].filter((s) => s !== 'body');
    if (sel) {
      let label = '';
      let kind = '';
      if (sel.type === 'component') { label = state.byId.get(sel.id)?.displayName; kind = 'Part'; }
      else if (sel.type === 'subsystem') { label = groupTitle(sel.id); kind = systemName(state.subById.get(sel.id)?.system); }
      else if (sel.type === 'zone') { label = zoneName(sel.id); kind = 'Location'; }
      else { label = systemName(sel.id); kind = 'System'; }
      const pill = el('div', 'path-pill', `<span>${esc(kind)}</span><b>${esc(label)}</b>${sel.type === 'component' ? '<span class="key" aria-label="Orange: this part. Teal: parts it connects to."><i class="k-sel"></i>this part <i class="k-nb"></i>connects to</span>' : ''}`);
      const clr = el('button', 'icon-btn', icon('close', 16));
      clr.type = 'button';
      clr.setAttribute('aria-label', 'Clear selection and show the whole car');
      clr.title = 'Show the whole car';
      clr.addEventListener('click', () => select(null));
      pill.appendChild(clr);
      chip.appendChild(pill);
    }
    if (hidden.length) {
      const b = el('button', 'path-pill', `${icon('eyeOff', 14)}<span>${hidden.length} system${hidden.length > 1 ? 's' : ''} hidden</span><b>Show all</b>`);
      b.type = 'button';
      b.addEventListener('click', () => set('hiddenSystems', new Set(state.hiddenSystems.has('body') ? ['body'] : [])));
      chip.appendChild(b);
    }
    chip.hidden = !chip.children.length;
  };
  on('select', draw);
  on('change:hiddenSystems', draw);
  draw();

  const legend = $('legend');
  const drawLegend = async () => {
    if (state.colorMode === 'real') { legend.hidden = true; return; }
    legend.hidden = false;
    if (state.colorMode === 'system') {
      legend.innerHTML = state.db.systems.filter((s) => s.id !== 'body').map((s) => `<span><i style="background:${s.color}"></i>${esc(systemName(s.id))}</span>`).join('');
    } else {
      const { STATUS_COLORS } = await import('./viewer.js');
      legend.innerHTML = [...STATUSES.map((s) => [s.label, STATUS_COLORS[s.id]]), ['Not set', STATUS_COLORS.none]].map(([t, c]) => `<span><i style="background:${c}"></i>${esc(t)}</span>`).join('');
    }
  };
  on('change:colorMode', drawLegend);
  drawLegend();
}

// ------------------------------------------------------------------ drawer (tablet & phone)
function syncInert() {
  const open = $('browse').classList.contains('open');
  const drawer = drawerMode();
  $('browse').inert = drawer && !open; // hidden drawer: out of the tab order
  for (const id of ['viewport', 'details']) $(id).inert = drawer && open; // open drawer: the rest waits
}

function openDrawer(v) {
  const left = $('browse');
  left.classList.toggle('open', v);
  syncInert();
  $('scrim').hidden = !v;
  $('btn-browse').setAttribute('aria-expanded', String(v));
  if (v) requestAnimationFrame(() => left.querySelector('.tab[aria-selected="true"]')?.focus());
  emit('drawer', v);
}

function initDrawer() {
  $('btn-browse').addEventListener('click', () => openDrawer(!$('browse').classList.contains('open')));
  matchMedia('(max-width: 1180px)').addEventListener('change', syncInert);
  syncInert();
  $('scrim').addEventListener('click', () => openDrawer(false));
  on('select', (sel) => {
    if (!drawerMode() || !$('browse').classList.contains('open')) return;
    // stay open while drilling into systems/areas; close when a part or location is picked
    if (sel && (sel.type === 'component' || sel.type === 'zone')) openDrawer(false);
  });
  on('open-drawer', () => openDrawer(true));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || isModalOpen() || document.activeElement?.id === 'search') return;
    if ($('browse').classList.contains('open') && drawerMode()) { openDrawer(false); $('btn-browse').focus(); return; }
    if (state.selection) select(null);
  });
}

// ------------------------------------------------------------------ phone: tab bar + bottom sheet
const SNAP = ['peek', 'half', 'full'];
let snap = 'peek';

function sheetPx(s) {
  const avail = window.innerHeight - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) - $('tabbar').offsetHeight;
  return { closed: 0, peek: Math.min(172, avail * 0.3), half: Math.round(avail * 0.64), full: avail - 6 }[s];
}

function setSnap(s, opts = {}) {
  snap = s;
  const p = $('details');
  p.dataset.snap = s;
  p.style.setProperty('--sheet-h', `${sheetPx(s)}px`);
  const h = $('sheet-handle');
  h.setAttribute('aria-label', s === 'full' ? 'Shrink details' : 'Expand details');
  h.setAttribute('aria-expanded', String(s !== 'peek'));
  if (!opts.silent) updateObstruction();
  drawTabbar();
}

function updateObstruction() {
  if (!viewer) return;
  const chipH = state.selection ? 100 : 56; // floating toolbar, and the path chip under it
  if (phone()) viewer.setObstruction({ top: chipH, bottom: snap === 'full' ? 0 : sheetPx(snap) });
  else viewer.setObstruction({ top: chipH });
}

function initSheet() {
  const handle = $('sheet-handle');
  handle.removeAttribute('aria-hidden');
  handle.setAttribute('role', 'button');
  handle.tabIndex = 0;
  handle.setAttribute('aria-controls', 'inspector');
  const p = $('details');
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, h: p.getBoundingClientRect().height, moved: false };
    handle.setPointerCapture(e.pointerId);
    p.classList.add('dragging');
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    p.style.setProperty('--sheet-h', `${Math.max(60, Math.min(sheetPx('full'), drag.h + dy))}px`);
  });
  const end = (e) => {
    if (!drag) return;
    p.classList.remove('dragging');
    const h = p.getBoundingClientRect().height;
    if (!drag.moved) setSnap(SNAP[(SNAP.indexOf(snap) + 1) % SNAP.length]);
    else setSnap(SNAP.reduce((best, s) => (Math.abs(sheetPx(s) - h) < Math.abs(sheetPx(best) - h) ? s : best), 'peek'));
    drag = null;
    e.preventDefault();
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSnap(SNAP[(SNAP.indexOf(snap) + 1) % SNAP.length]); }
    if (e.key === 'ArrowUp') setSnap(SNAP[Math.min(2, SNAP.indexOf(snap) + 1)]);
    if (e.key === 'ArrowDown') setSnap(SNAP[Math.max(0, SNAP.indexOf(snap) - 1)]);
  });

  // the whole sheet drags: down from the top of its content collapses, up expands
  const insp = $('inspector');
  let touch = null;
  insp.addEventListener('touchstart', (e) => {
    if (!phone() || e.touches.length !== 1 || e.target.closest('input, select, textarea, canvas, .insp-tabs')) { touch = null; return; }
    touch = { y: e.touches[0].clientY, top: insp.scrollTop, done: false };
  }, { passive: true });
  insp.addEventListener('touchmove', (e) => {
    if (!touch || touch.done) return;
    const dy = e.touches[0].clientY - touch.y;
    const i = SNAP.indexOf(snap);
    if (dy > 60 && touch.top <= 0 && insp.scrollTop <= 0 && i > 0) { touch.done = true; setSnap(SNAP[i - 1]); }
    else if (dy < -60 && i < 2 && snap !== 'full' && touch.top <= 0) { touch.done = true; setSnap(SNAP[i + 1]); }
  }, { passive: true });

  on('select', (sel) => {
    if (!phone()) { updateObstruction(); return; }
    if (sel && snap === 'peek') setSnap('half', { silent: true });
    if (!sel) setSnap('peek', { silent: true });
    updateObstruction();
  });
  on('search-chosen', () => { if (phone() && snap === 'full') setSnap('half'); });
  window.addEventListener('resize', () => setSnap(snap));
  setSnap('peek');
  initTabbar();
}

let tabbarItems = [];
function initTabbar() {
  const bar = $('tabbar');
  const items = [
    ['car', 'car', 'Car', () => { openDrawer(false); emit('close-modal'); setSnap('peek'); }],
    ['browse', 'list', 'Browse', () => { emit('close-modal'); openDrawer(!$('browse').classList.contains('open')); }],
    ['inspect', 'inspect', 'Checks', () => { openDrawer(false); emit('open-modal', { name: 'inspect' }); }],
    ['torque', 'wrench', 'Torque', () => { openDrawer(false); emit('open-modal', { name: 'torque' }); }],
    ['tracker', 'installed', 'Progress', () => { openDrawer(false); emit('open-modal', { name: 'tracker' }); }],
    ['more', 'menu', 'More', null],
  ];
  tabbarItems = items.map(([id, ic, label, fn]) => {
    const b = el('button', '', `${icon(ic, 22)}<span>${esc(label)}</span>`);
    b.type = 'button';
    b.dataset.tab = id;
    if (fn) b.addEventListener('click', fn);
    else popover(b, (pop, close) => { emit('close-modal'); openDrawer(false); moreMenu(pop, close, { skip: ['inspect'] }); }, { host: document.body, sheet: true });
    bar.appendChild(b);
    return b;
  });
  on('drawer', drawTabbar);
  on('modal-opened', drawTabbar);
  on('modal-closed', drawTabbar);
  drawTabbar();
}

function drawTabbar() {
  if (!tabbarItems.length) return;
  const modal = $('modal').open ? document.getElementById('modal-title').textContent : '';
  const cur = $('browse').classList.contains('open') ? 'browse' : modal === 'Torque specs' ? 'torque' : modal === 'Build tracker' ? 'tracker' : modal === 'Between-sessions checklist' ? 'inspect' : modal ? 'more' : 'car';
  for (const b of tabbarItems) b.setAttribute('aria-current', String(b.dataset.tab === cur));
}

// ------------------------------------------------------------------ history: Back steps through selections
const CODES = { component: 'part', subsystem: 'area', system: 'system', zone: 'at' };
const TYPES = Object.fromEntries(Object.entries(CODES).map(([k, v]) => [v, k]));
let fromHistory = false;

function hashFor(sel) {
  return sel ? `#${CODES[sel.type]}/${encodeURIComponent(sel.id)}` : '#';
}

function parseHash() {
  const m = location.hash.match(/^#(\w+)\/(.+)$/);
  if (!m || !TYPES[m[1]]) return null;
  const sel = { type: TYPES[m[1]], id: decodeURIComponent(m[2]) };
  const ok = sel.type === 'component' ? state.byId.has(sel.id) : sel.type === 'subsystem' ? state.subById.has(sel.id) : sel.type === 'zone' ? state.zoneById.has(sel.id) : state.sysById.has(sel.id);
  return ok ? sel : null;
}

function initHistory() {
  on('select', (sel) => {
    if (fromHistory) return;
    const h = hashFor(sel);
    if (h === (location.hash || '#')) return;
    history.pushState({ sel }, '', h === '#' ? location.pathname + location.search : h);
  });
  window.addEventListener('popstate', () => {
    if (isModalOpen()) emit('close-modal');
    fromHistory = true;
    const sel = parseHash();
    select(sel);
    emit('frame', sel);
    fromHistory = false;
  });
}

function applyHash() {
  const sel = parseHash();
  if (!sel) return;
  fromHistory = true;
  select(sel);
  fromHistory = false;
  setTimeout(() => emit('frame', sel), 50);
}

// clearing the selection shows the whole car again
on('select', (sel) => { if (!sel && viewer) viewer.resetView(); });

boot().catch((e) => {
  console.error(e);
  $('loading-text').textContent = `Could not load the parts list: ${e.message}. Check your connection and reload.`;
});
