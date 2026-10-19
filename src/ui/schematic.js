// Layered auto-layout + SVG renderer for system schematics.
import { KINDS, kindColor } from '../kinds.js';
import { esc } from './dom.js';

const NODE_H = 46;
const GAP_X = 90;
const GAP_Y = 26;

function wrap(label, max = 24) {
  const words = String(label).split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w);
    else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  if (lines.length > 3) { lines.length = 3; lines[2] += '…'; }
  return lines;
}

export function layout(schem) {
  const nodes = schem.nodes.filter((n) => n && n.id != null).map((n) => ({ ...n, id: String(n.id), lines: wrap(n.label || n.id) }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (schem.edges || []).filter((e) => byId.has(String(e.from)) && byId.has(String(e.to)) && String(e.from) !== String(e.to))
    .map((e) => ({ ...e, from: String(e.from), to: String(e.to) }));

  // break cycles with DFS
  const out = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e, i) => out.get(e.from).push(i));
  const color = new Map();
  const back = new Set();
  const dfs = (id) => {
    color.set(id, 1);
    for (const i of out.get(id)) {
      const t = edges[i].to;
      if (color.get(t) === 1) back.add(i);
      else if (!color.get(t)) dfs(t);
    }
    color.set(id, 2);
  };
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  edges.forEach((e) => indeg.set(e.to, indeg.get(e.to) + 1));
  for (const n of nodes) if (!indeg.get(n.id) && !color.get(n.id)) dfs(n.id);
  for (const n of nodes) if (!color.get(n.id)) dfs(n.id);

  // longest-path ranking on the DAG
  const rank = new Map(nodes.map((n) => [n.id, 0]));
  const dag = edges.filter((_, i) => !back.has(i));
  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false;
    for (const e of dag) {
      if (rank.get(e.to) < rank.get(e.from) + 1) { rank.set(e.to, rank.get(e.from) + 1); changed = true; }
    }
    if (!changed) break;
  }
  const maxRank = Math.max(0, ...rank.values());
  const cols = Array.from({ length: maxRank + 1 }, () => []);
  nodes.forEach((n) => cols[rank.get(n.id)].push(n));

  // barycentric ordering sweeps
  const pos = new Map();
  const setPos = () => cols.forEach((c) => c.forEach((n, i) => pos.set(n.id, i)));
  setPos();
  const nbrs = (id, dir) => dag.filter((e) => (dir < 0 ? e.to === id : e.from === id)).map((e) => (dir < 0 ? e.from : e.to));
  for (let sweep = 0; sweep < 6; sweep++) {
    const dir = sweep % 2 ? 1 : -1;
    const order = dir < 0 ? cols.slice(1) : cols.slice(0, -1).reverse();
    for (const col of order) {
      const bc = new Map(col.map((n) => {
        const ns = nbrs(n.id, dir);
        return [n.id, ns.length ? ns.reduce((a, b) => a + pos.get(b), 0) / ns.length : pos.get(n.id)];
      }));
      col.sort((a, b) => bc.get(a.id) - bc.get(b.id));
      col.forEach((n, i) => pos.set(n.id, i));
    }
  }

  // coordinates
  const widths = cols.map((c) => Math.max(120, ...c.map((n) => Math.min(230, Math.max(...n.lines.map((l) => l.length)) * 7 + 28))));
  const heights = cols.map((c) => c.reduce((h, n) => h + nodeH(n) + GAP_Y, -GAP_Y));
  const H = Math.max(...heights, NODE_H);
  let x = 40;
  cols.forEach((c, ci) => {
    let y = 40 + (H - heights[ci]) / 2;
    for (const n of c) {
      n.w = widths[ci];
      n.h = nodeH(n);
      n.x = x;
      n.y = y;
      y += n.h + GAP_Y;
    }
    x += widths[ci] + GAP_X;
  });
  return { nodes, edges, back, width: x - GAP_X + 40, height: H + 80 };
}

function nodeH(n) {
  return Math.max(NODE_H, n.lines.length * 15 + 18);
}

export function renderSchematic(container, schem, { onNode, linked }) {
  const L = layout(schem);
  const kinds = new Set();
  const byId = new Map(L.nodes.map((n) => [n.id, n]));
  let edgesSvg = '';
  let labelsSvg = '';
  L.edges.forEach((e, i) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    const col = kindColor(e.kind);
    kinds.add(e.kind || 'mechanical');
    let d, lx, ly;
    if (b.x > a.x) {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
      const dx = Math.max(40, (x2 - x1) * 0.5);
      d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
      lx = (x1 + x2) / 2; ly = (y1 + y2) / 2 - 5;
    } else {
      // back / same-column edge: loop below
      const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y + b.h;
      const drop = Math.max(y1, y2) + 40 + (i % 4) * 12;
      d = `M${x1},${y1} C${x1},${drop} ${x2},${drop} ${x2},${y2}`;
      lx = (x1 + x2) / 2; ly = drop - 8;
    }
    edgesSvg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-opacity=".85" marker-end="url(#ar-${esc(e.kind || 'mechanical')})" class="sedge"/>`;
    if (e.label) labelsSvg += `<text class="sedge-label" x="${lx}" y="${ly}" text-anchor="middle">${esc(String(e.label).slice(0, 40))}</text>`;
  });
  const markers = [...kinds].map((k) => `<marker id="ar-${esc(k)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${kindColor(k)}"/></marker>`).join('');
  const nodesSvg = L.nodes.map((n) => {
    const isLinked = n.componentId && linked(n.componentId);
    const lines = n.lines.map((l, i) => `<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + (i - (n.lines.length - 1) / 2) * 15 + 4}" text-anchor="middle">${esc(l)}</text>`).join('');
    return `<g class="snode${isLinked ? ' linked' : ''}" data-comp="${isLinked ? esc(n.componentId) : ''}"><rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" ${isLinked ? 'style="stroke:#5a6578"' : ''}/>${lines}${isLinked ? `<circle cx="${n.x + n.w - 8}" cy="${n.y + 8}" r="3" fill="#ff5a1f"/>` : ''}</g>`;
  }).join('');

  container.innerHTML = `<svg viewBox="0 0 ${L.width} ${L.height}" preserveAspectRatio="xMidYMid meet"><defs>${markers}</defs><g class="pz">${edgesSvg}${labelsSvg}${nodesSvg}</g></svg>
    ${schem.description ? `<div class="schem-desc">${esc(schem.description)}</div>` : ''}
    <div class="schem-legend">${[...kinds].map((k) => `<span><i style="background:${kindColor(k)}"></i>${esc(KINDS[k]?.label || k)}</span>`).join('')}<span><i style="background:#ff5a1f;width:6px;height:6px;border-radius:50%"></i>Click to find in 3D</span></div>`;

  const svg = container.querySelector('svg');
  svg.querySelectorAll('.snode.linked').forEach((g) => g.addEventListener('click', () => onNode(g.dataset.comp)));

  // pan & zoom via viewBox — open at a readable scale (never shrink text more than ~1.5x)
  const apply = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const fitAll = () => ({ x: 0, y: 0, w: L.width, h: L.height });
  const readable = () => {
    const r = container.getBoundingClientRect();
    const cw = r.width || 1000, ch = r.height || 700;
    const s = Math.min(1.5, Math.max(L.width / cw, L.height / ch));
    if (s <= 1.5 && L.width <= cw * 1.5 && L.height <= ch * 1.5) return fitAll();
    const w = cw * s, h = ch * s;
    return { x: -20, y: (L.height - h) / 2 - 30, w, h };
  };
  let vb = readable();
  apply();
  const tools = document.createElement('div');
  tools.className = 'schem-zoom';
  tools.innerHTML = '<button class="btn" data-z="in">+</button><button class="btn" data-z="out">−</button><button class="btn" data-z="fit">Fit</button><button class="btn" data-z="read">1:1</button>';
  container.appendChild(tools);
  tools.addEventListener('click', (e) => {
    const z = e.target.dataset.z;
    if (!z) return;
    if (z === 'fit') vb = fitAll();
    else if (z === 'read') vb = readable();
    else {
      const k = z === 'in' ? 1 / 1.25 : 1.25;
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
      vb = { x: cx - (vb.w * k) / 2, y: cy - (vb.h * k) / 2, w: vb.w * k, h: vb.h * k };
    }
    apply();
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const mx = vb.x + ((e.clientX - r.left) / r.width) * vb.w;
    const my = vb.y + ((e.clientY - r.top) / r.height) * vb.h;
    vb = { x: mx - (mx - vb.x) * k, y: my - (my - vb.y) * k, w: vb.w * k, h: vb.h * k };
    apply();
  }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.snode.linked')) return; drag = { x: e.clientX, y: e.clientY, vb: { ...vb } }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const s = Math.max(vb.w / r.width, vb.h / r.height);
    vb.x = drag.vb.x - (e.clientX - drag.x) * s;
    vb.y = drag.vb.y - (e.clientY - drag.y) * s;
    apply();
  });
  svg.addEventListener('pointerup', () => (drag = null));
}
