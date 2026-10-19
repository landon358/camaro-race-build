// Top-down map of THIS car (outline traced from the ZL1 1LE body), front at the top.
// Areas are buttons: the four wheel corners, front & engine bay, cockpit, rear & trunk.
import { state } from '../state.js';
import { esc } from './dom.js';

const AREAS = [
  // tx: where the label sits (clear of the tyres)
  { id: 'FRONT', x0: -1.05, x1: -0.45, tx: -0.74, label: 'Front end' },
  { id: 'ENG', x0: -0.45, x1: 0.62, tx: 0.08, label: 'Engine bay' },
  { id: 'CAB', x0: 0.62, x1: 2.4, tx: 1.5, label: 'Cockpit' },
  { id: 'REAR', x0: 2.4, x1: 3.95, tx: 3.42, label: 'Rear & trunk' },
];
const CORNERS = [
  { id: 'FL', x: 0, z: 0.776 }, { id: 'FR', x: 0, z: -0.776 },
  { id: 'RL', x: 2.811, z: 0.776 }, { id: 'RR', x: 2.811, z: -0.776 },
];

let uid = 0;

/**
 * opts: { size: 'large'|'small', active: zoneId|null, dot: [x,y,z]|null,
 *         counts: { zoneId: { n, done } }, onPick(zoneId), labelFor(zoneId) }
 */
export function carMap(opts = {}) {
  const plan = state.db.plan;
  const wrap = document.createElement('div');
  wrap.className = `carmap ${opts.size || 'large'}`;
  if (!plan?.outline?.length) return wrap;
  const s = opts.size === 'small' ? 30 : 62; // px per metre
  const pad = opts.size === 'small' ? 10 : 56;
  const top = opts.size === 'small' ? 12 : 26;
  const W = 2.1 * s + pad * 2, H = 5.0 * s + top + 12;
  const X = (z) => W / 2 - z * s; // car left (driver) is screen left
  const Y = (x) => top + (x + 1.05) * s; // front at the top
  const id = `cm${++uid}`;
  const outline = plan.outline.map(([x, z]) => `${X(z).toFixed(1)},${Y(x).toFixed(1)}`).join(' ');
  const counts = opts.counts || {};
  const name = (z) => state.zoneById.get(z)?.name || z;
  const label = (z) => (opts.labelFor ? opts.labelFor(z) : name(z));
  const pick = !!opts.onPick;

  const areaSvg = AREAS.map((a) => {
    const c = counts[a.id];
    const on = opts.active === a.id ? ' on' : '';
    const y0 = Y(a.x0), y1 = Y(a.x1);
    return `<g class="cm-area${on}" data-zone="${a.id}" ${pick ? `role="button" tabindex="0" aria-label="${esc(label(a.id))}${c ? `, ${c.n} parts` : ''}"` : ''}>
      <rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" clip-path="url(#${id}-clip)"/>
      ${opts.size !== 'small' ? `<text x="${W / 2}" y="${Y(a.tx) - 2}" class="cm-t">${esc(a.label)}</text>${c ? `<text x="${W / 2}" y="${Y(a.tx) + 14}" class="cm-n">${c.n} part${c.n === 1 ? '' : 's'}${c.done ? ` · ${Math.round((c.done / c.n) * 100)}% in` : ''}</text>` : ''}` : ''}
    </g>`;
  }).join('');

  const tw = 0.34 * s, th = 0.7 * s;
  const cornerSvg = CORNERS.map((k) => {
    const c = counts[k.id];
    const on = opts.active === k.id ? ' on' : '';
    const cx = X(k.z), cy = Y(k.x);
    const left = k.z > 0;
    const tx = left ? cx - tw / 2 - 12 : cx + tw / 2 + 12;
    return `<g class="cm-corner${on}" data-zone="${k.id}" ${pick ? `role="button" tabindex="0" aria-label="${esc(label(k.id))}${c ? `, ${c.n} parts` : ''}"` : ''}>
      <rect x="${cx - tw / 2 - 6}" y="${cy - th / 2 - 6}" width="${tw + 12}" height="${th + 12}" rx="8" class="cm-hit"/>
      <rect x="${cx - tw / 2}" y="${cy - th / 2}" width="${tw}" height="${th}" rx="${tw * 0.35}" class="cm-tyre"/>
      ${opts.size !== 'small' ? `<text x="${tx}" y="${cy - 4}" class="cm-k" text-anchor="${left ? 'end' : 'start'}">${k.id}</text>${c ? `<text x="${tx}" y="${cy + 12}" class="cm-n" text-anchor="${left ? 'end' : 'start'}">${c.n}</text>` : ''}` : ''}
    </g>`;
  }).join('');

  const dot = opts.dot ? `<g class="cm-dot"><circle cx="${X(opts.dot[2])}" cy="${Y(opts.dot[0])}" r="${opts.size === 'small' ? 4 : 6}"/><circle cx="${X(opts.dot[2])}" cy="${Y(opts.dot[0])}" r="${opts.size === 'small' ? 8 : 12}" class="cm-ring"/></g>` : '';

  wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${pick ? '' : 'aria-hidden="true"'} focusable="false">
    <defs><clipPath id="${id}-clip"><polygon points="${outline}"/></clipPath></defs>
    ${areaSvg}
    <polygon points="${outline}" class="cm-body"/>
    ${cornerSvg}
    ${opts.size !== 'small' ? `<text x="${W / 2}" y="11" class="cm-front">FRONT</text>` : ''}
    ${dot}
  </svg>`;
  if (pick) {
    wrap.querySelectorAll('[data-zone]').forEach((g) => {
      const go = () => opts.onPick(g.dataset.zone);
      g.addEventListener('click', go);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }
  return wrap;
}
