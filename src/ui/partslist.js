// Parts list / catalog: spinning 3D model, name, location, part numbers and torque at a glance.
import { state, select, emit, set } from '../state.js';
import { el, esc } from './dom.js';
import { icon } from './icons.js';
import { previewSlot } from './preview.js';
import { statusBadge, partNumbers, torqueLine, systemName, zoneName, groupTitle, photoOf } from './present.js';

export { partNumbers };

/** Part number with its source; an option nobody chose is never shown as "the" number. */
function pnLine(pns) {
  if (!pns.length) return '';
  const p = pns.find((x) => x.chosen) || pns.find((x) => x.key === 'factory');
  if (!p) return `<span class="pl-pns"><span class="pl-pn"><b>Race options</b>${pns.length} on file · none chosen</span></span>`;
  const label = p.chosen ? 'My choice' : 'GM';
  return `<span class="pl-pns"><span class="pl-pn${p.chosen ? ' chosen' : ''}"><b>${label}</b>${esc(String(p.pn).split(/\s*[(;]/)[0].slice(0, 24))}</span></span>`;
}

const dims = (d) => {
  const v = String(d).replace(/^\s*(approx\.?|approximately|~)\s*/i, '');
  return v.length > 90 ? `${v.slice(0, 88)}…` : v;
};

function card(c, layout, opts) {
  const pns = partNumbers(c);
  const item = el('div', `pl-item ${layout}`);
  const ph = photoOf(c.photo);
  // a real photo when there is one (easier to match to the part on the shelf), else the 3D model
  const fig = el('div', `pl-fig${ph ? ' photo-fig' : ''}`, ph ? `<img src="./${esc(ph.file)}" alt="" loading="lazy" decoding="async">` : '');
  if (!ph) fig.appendChild(previewSlot(c.id));
  item.appendChild(fig);
  // inside an area or a location the corner is already known: short name, no chip
  const inContext = (opts.groupId && c.subsystem === opts.groupId) || (opts.zoneCtx && c.zone === opts.zoneCtx);
  const name = inContext ? c.short : c.displayName;
  const loc = !inContext ? `<span class="loc-chip">${icon('pin', 12)}${esc(c.loc ? zoneName(c.loc) : zoneName(c.zone))}</span>` : '';
  const where = opts.showSystem ? `<span>${esc(systemName(c.system))} › ${esc(groupTitle(c.subsystem))}</span>` : '';
  // the card shows what you need to spot it and fit it; everything else is on the part page
  const info = el('button', 'pl-info', `
    <span class="pl-name">${esc(name)}${c.qty > 1 ? ` <span class="count">×${esc(c.qty)}</span>` : ''}</span>
    ${torqueLine(c)}
    ${loc || where || statusBadge(c.id) ? `<span class="pl-meta">${loc}${where}${statusBadge(c.id)}</span>` : ''}
    ${pnLine(pns)}`);
  info.type = 'button';
  info.setAttribute('aria-label', `${c.displayName}${c.qty > 1 ? `, quantity ${c.qty}` : ''}. Show on the car`);
  info.addEventListener('click', () => {
    emit('close-modal');
    select({ type: 'component', id: c.id });
    emit('frame', { type: 'component', id: c.id });
    emit('focus-title');
  });
  item.addEventListener('mouseenter', () => emit('hover', c.id));
  item.addEventListener('mouseleave', () => emit('hover', null));
  item.appendChild(info);
  return item;
}

/**
 * Searchable list of parts.
 * opts: layout 'list'|'grid', group: 'tier'|'system', groupId (the group being shown),
 *       showSystem, showLoc, onOpenCatalog
 */
export function renderPartsList(container, ids, opts = {}) {
  const layout = opts.layout || 'list';
  const bar = el('div', 'pl-bar');
  const q = el('input');
  q.type = 'search';
  q.placeholder = 'Filter these parts';
  q.setAttribute('aria-label', 'Filter these parts by name or part number');
  bar.appendChild(q);
  const spin = el('button', 'tool');
  spin.type = 'button';
  const drawSpin = () => {
    spin.innerHTML = `${icon(state.spin ? 'pause' : 'play', 16)}<span class="lbl">${state.spin ? 'Stop spin' : 'Spin'}</span>`;
    spin.title = state.spin ? 'Stop the 3D models turning' : 'Turn the 3D models';
    spin.setAttribute('aria-pressed', String(!state.spin));
  };
  drawSpin();
  spin.addEventListener('click', () => { set('spin', !state.spin); drawSpin(); });
  bar.appendChild(spin);
  if (opts.onOpenCatalog) {
    const b = el('button', 'tool', `${icon('parts', 16)}<span class="lbl">Big view</span>`);
    b.type = 'button';
    b.title = 'Open these parts as a large grid';
    b.addEventListener('click', opts.onOpenCatalog);
    bar.appendChild(b);
  }
  container.appendChild(bar);
  const listEl = el('div', `pl-list ${layout}`);
  container.appendChild(listEl);

  const comps = ids.map((id) => state.byId.get(id)).filter(Boolean);
  const heading = (txt, color) => el('div', 'pl-group', `${color ? `<span class="sw" style="background:${color}"></span>` : ''}${esc(txt)}`);
  const draw = () => {
    const f = q.value.trim().toLowerCase();
    listEl.replaceChildren();
    let last = null;
    let shown = 0;
    for (const c of comps) {
      if (f) {
        const hay = `${c.displayName} ${c.name} ${c.alias} ${partNumbers(c).map((p) => `${p.kind} ${p.pn} ${p.name}`).join(' ')} ${c.factory?.name || ''}`.toLowerCase();
        if (!f.split(/\s+/).every((t) => hay.includes(t))) continue;
      }
      const key = opts.group === 'system' ? c.system : opts.group === 'subsystem' ? c.subsystem : c.tier;
      if (opts.group && key !== last) {
        last = key;
        if (opts.group === 'system') listEl.appendChild(heading(systemName(c.system), state.sysById.get(c.system).color));
        else if (opts.group === 'subsystem') listEl.appendChild(heading(groupTitle(c.subsystem)));
        else listEl.appendChild(heading(state.db.tierNames?.[c.tier] || ''));
      }
      listEl.appendChild(card(c, layout, opts));
      shown++;
    }
    if (!shown) listEl.appendChild(el('p', 'pl-hint', 'No parts match that filter.'));
  };
  let t;
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 120); });
  draw();
}

