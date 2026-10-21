// Printable sheets for the garage wall: torque cards with tick boxes, and the between-sessions checklist.
import { state } from '../state.js';
import { esc } from './dom.js';
import { CONFIDENCE, confidenceOf, hasTorque, parseTorque, parseHw, isDuplicateRow, reuseClass, REUSE_LABEL } from '../torque.js';
import { systemName, zoneName } from './present.js';

function printHtml(html) {
  const root = document.getElementById('print-root');
  root.innerHTML = html;
  const done = () => { root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** One row per torqued fastener, grouped by location then part. Tick box + initials for sign-off. */
export function printTorqueCard({ title, ids }) {
  const comps = ids.map((id) => state.byId.get(id)).filter(Boolean)
    .sort((a, b) => a.tier - b.tier || (a.buildPhase || 99) - (b.buildPhase || 99));
  const byZone = new Map();
  for (const c of comps) {
    const rows = c.hardware.filter((h) => hasTorque(h) && !isDuplicateRow(h));
    if (!rows.length) continue;
    if (!byZone.has(c.zone)) byZone.set(c.zone, []);
    byZone.get(c.zone).push({ c, rows });
  }
  let n = 0;
  const body = [...byZone].map(([z, list]) => `
    <h2>${esc(zoneName(z))}</h2>
    <table><thead><tr><th style="width:26%">Part</th><th>Fastener</th><th>Qty</th><th>Torque</th><th>Confidence</th><th>Threads</th><th>Reuse</th><th style="width:9mm">Done</th><th style="width:10mm">Mark</th><th style="width:16mm">Initials</th></tr></thead><tbody>
    ${list.map(({ c, rows }) => rows.map((h, i) => {
      n++;
      const t = parseHw(h);
      const conf = confidenceOf(h);
      const r = reuseClass(h.reuse);
      return `<tr>
        <td>${i ? '' : `<b>${esc(c.short)}</b><br><small>${esc(systemName(c.system))}</small>`}</td>
        <td>${esc(h.item || '')}${h.spec ? `<br><small>${esc(h.spec)}</small>` : ''}</td>
        <td>${esc(h.qty ?? '')}</td>
        <td class="p-tq">${t.multi ? t.steps.map((x, i) => `${t.alts ? '•' : `${i + 1}.`} ${esc(x)}`).join('<br>') : `${esc(t.primary || h.torque)}${t.angle ? ` then ${t.angleHedged || (t.angleRange && confidenceOf(h) !== 'verified') ? '+____°' : `${esc(t.angle)}${t.angleRange ? ' (GM range)' : ''}`}` : ''}`}${t.secondary ? `<br><small>${esc(t.secondary)}</small>` : ''}${t.angleHedged || (t.angleRange && confidenceOf(h) !== 'verified') ? `<br><small>Range on file ${esc(t.angle)} — write the confirmed angle</small>` : ''}${h.torqueSequence ? `<br><small>${esc(h.torqueSequence)}</small>` : ''}</td>
        <td class="${conf === 'estimate' ? 'p-est' : ''}">${esc(CONFIDENCE[conf].label)}${conf === 'estimate' ? '<br><small>Confirm before torquing</small>' : t.confirmWhy ? `<br><small>${esc(t.confirmWhy)}</small>` : ''}</td>
        <td>${esc(h.threadlocker && !/^none/i.test(h.threadlocker) ? h.threadlocker : '—')}</td>
        <td>${r ? esc(REUSE_LABEL[r]) : ''}</td>
        <td><span class="p-box"></span></td><td><span class="p-box"></span></td><td></td></tr>`;
    }).join('')).join('')}
    </tbody></table>`).join('');
  printHtml(`
    <h1>${esc(title)}</h1>
    <div class="p-sub">TPR Racing · ${n} torque specs · printed ${esc(today())}.
      Verified = from GM or the part maker. Typical = common published value. Estimate = confirm before torquing. Mark = witness mark painted after torquing.</div>
    ${body || '<p>No torque values recorded for these parts.</p>'}`);
}

/** Between-sessions inspection checklist, by location. */
export function printChecklist(items, title = 'Between-sessions inspection') {
  const byZone = new Map();
  for (const it of items) {
    if (!byZone.has(it.c.zone)) byZone.set(it.c.zone, []);
    byZone.get(it.c.zone).push(it);
  }
  printHtml(`
    <h1>${esc(title)}</h1>
    <div class="p-sub">TPR Racing · ${items.length} checks · printed ${esc(today())}. Event: ____________________</div>
    ${[...byZone].map(([z, list]) => `<h2>${esc(zoneName(z))}</h2><table><thead><tr><th style="width:30%">Part</th><th>Check</th><th style="width:8mm">OK</th><th style="width:30mm">Notes</th></tr></thead><tbody>
      ${list.map((it) => `<tr><td>${esc(it.c.displayName)}</td><td>${esc(it.text)}</td><td><span class="p-box"></span></td><td></td></tr>`).join('')}
    </tbody></table>`).join('')}`);
}
