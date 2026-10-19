// Parts list / catalog with spinning 3D models, names and part numbers.
import { state, select, emit, track } from '../state.js';
import { el, esc } from './dom.js';
import { previewCanvas } from './preview.js';

/** Part numbers to show for a component: factory first, then race options. */
export function partNumbers(c) {
  const out = [];
  if (c.factory?.partNumber) out.push({ kind: 'GM', pn: String(c.factory.partNumber).replace(/^GM\s*/i, ''), name: c.factory.name || '' });
  for (const o of c.raceOptions) if (o.partNumber) out.push({ kind: o.brand || 'Race', pn: o.partNumber, name: o.name || '' });
  return out;
}

function chosenLabel(c) {
  const ch = track(c.id).choice;
  if (!ch) return '';
  if (ch === 'factory') return c.factory?.name ? `My build: ${c.factory.name}` : 'My build: GM factory';
  const o = c.raceOptions[Number(ch.split('-')[1])];
  return o ? `My build: ${[o.brand, o.name].filter(Boolean).join(' ')}` : '';
}

function card(c, layout) {
  const sys = state.sysById.get(c.system);
  const pns = partNumbers(c);
  const st = track(c.id).status || '';
  const row = el('div', `pl-item ${layout}`);
  const fig = el('div', 'pl-fig');
  fig.appendChild(previewCanvas(c.id, layout === 'grid' ? 220 : 168));
  row.appendChild(fig);
  const info = el('div', 'pl-info', `
    <div class="pl-name"><span class="dot ${st}"></span>${esc(c.name)}${c.qty > 1 ? ` <span class="pl-qty">×${esc(c.qty)}</span>` : ''}</div>
    <div class="pl-sub"><span class="sw" style="background:${sys.color}"></span>${esc(state.subById.get(c.subsystem)?.name || '')}</div>
    ${pns.length ? `<div class="pl-pns">${pns.slice(0, 3).map((p) => `<span class="pl-pn" title="${esc(p.name)}"><b>${esc(p.kind)}</b> ${esc(p.pn)}</span>`).join('')}${pns.length > 3 ? `<span class="pl-more">+${pns.length - 3}</span>` : ''}</div>` : '<div class="pl-pns"><span class="pl-none">No part number on file</span></div>'}
    ${c.modelRef?.dimensions ? `<div class="pl-dims">${esc(c.modelRef.dimensions)}</div>` : ''}
    ${chosenLabel(c) ? `<div class="pl-choice">${esc(chosenLabel(c))}</div>` : ''}`);
  row.appendChild(info);
  info.addEventListener('click', () => {
    emit('close-modal');
    select({ type: 'component', id: c.id });
    emit('frame', { type: 'component', id: c.id });
  });
  return row;
}

/**
 * Render a searchable list of parts.
 * ids: component ids; opts.layout 'list' | 'grid'; opts.groupBySubsystem
 */
export function renderPartsList(container, ids, opts = {}) {
  const layout = opts.layout || 'list';
  const wrap = el('div', 'pl-wrap');
  const bar = el('div', 'pl-bar');
  const q = el('input');
  q.type = 'search';
  q.placeholder = `Filter ${ids.length} parts by name or part number…`;
  bar.appendChild(q);
  if (opts.onOpenCatalog) {
    const b = el('button', 'btn', 'Big view');
    b.title = 'Open as a large grid';
    b.addEventListener('click', opts.onOpenCatalog);
    bar.appendChild(b);
  }
  wrap.appendChild(bar);
  wrap.appendChild(el('div', 'pl-hint', 'Drag a model to turn it by hand. Tap a name to find it on the car.'));
  const listEl = el('div', `pl-list ${layout}`);
  wrap.appendChild(listEl);
  container.appendChild(wrap);

  const comps = ids.map((id) => state.byId.get(id)).filter(Boolean);
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    listEl.replaceChildren();
    let lastSub = null;
    let shown = 0;
    for (const c of comps) {
      if (f) {
        const hay = `${c.name} ${c.id} ${partNumbers(c).map((p) => p.kind + ' ' + p.pn + ' ' + p.name).join(' ')} ${c.factory?.name || ''}`.toLowerCase();
        if (!f.split(/\s+/).every((t) => hay.includes(t))) continue;
      }
      if (opts.groupBySubsystem && c.subsystem !== lastSub) {
        lastSub = c.subsystem;
        listEl.appendChild(el('div', 'pl-group', esc(state.subById.get(c.subsystem)?.name || '')));
      }
      listEl.appendChild(card(c, layout));
      shown++;
    }
    if (!shown) listEl.appendChild(el('div', 'pl-hint', 'No parts match.'));
  };
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 150); });
  draw();
}
