// Fails the build when a torque value would be shown without its final step.
// Every row whose text mentions an angle or a "first pass" must parse to an angle step
// (from the torque text or its sequence notes), or carry an explicit "check" warning.
import fs from 'node:fs';
import { parseHw, hasTorque } from '../src/torque.js';

const db = JSON.parse(fs.readFileSync(new URL('../public/data/db.json', import.meta.url)));
const problems = [];
let angled = 0;
for (const c of db.components) {
  for (const h of c.hardware) {
    if (!hasTorque(h)) continue;
    const t = parseHw(h);
    const all = `${h.torque} ${h.torqueSequence || ''}`; // notes are never a source for steps
    const mentionsAngle = /(\+\s*\d+\s*(°|deg)|then\s+\+?\d+\s*(°|deg)|final\s+\+?\d+\s*(°|deg))/i.test(all);
    const firstPass = /first pass/i.test(h.torque || '');
    if (t.angle) angled++;
    if (/loosen/i.test(h.torque || '') && !t.multi) problems.push(`${c.id}: loosen step collapsed — "${h.torque}"`);
    if ((String(h.torque).match(/\+\s*\d+\s*°/g) || []).length > 1 && !t.multi) problems.push(`${c.id}: several angle steps collapsed — "${h.torque}"`);
    const valuedPieces = String(h.torque).split(/;\s*|\.\s+(?=[A-Z])/).filter((x) => /\d\s*(N[·.\s-]?m|Nm|ft[-·.\s]?lb|lb[-·.\s]?ft|in[-·.\s]?lb)/i.test(x));
    if (valuedPieces.length > 1 && !t.multi) problems.push(`${c.id}: alternative values dropped — "${h.torque.slice(0, 100)}"`);
    if (mentionsAngle && !t.angle && !t.multi) problems.push(`${c.id}: angle in text but not parsed — "${all.slice(0, 120)}"`);
    if (firstPass && !t.angle && !t.firstPassOnly && !(t.multi && t.steps.some((x) => /°/.test(x)))) problems.push(`${c.id}: "first pass" with no final step or warning — "${all.slice(0, 120)}"`);
  }
}
// no research ids in any text the app shows
const ID = /\b(chassis|safety|suspension|steering|brakes|wheels|engine|engine-support|drivetrain|electrical|interior|body|aero)\.[a-z0-9-]+\.[a-z0-9-]+/;
const KEEP = new Set(['id', 'baseId', 'sameAs', 'system', 'subsystem', 'connectsTo', 'sources', 'source', 'url', 'zone', 'loc', 'model', 'images']);
const strings = (v, key, out = []) => {
  if (KEEP.has(key)) return out;
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, key, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) strings(v[k], k, out);
  return out;
};
for (const c of db.components) for (const t of strings(c)) if (ID.test(t)) problems.push(`${c.id}: research id in shown text — "${t.match(ID)[0]}"`);

// fits are keyed by piece (model index | copy | mirror): a key that no longer matches a piece means the data moved
for (const key of Object.keys(db.fit || {})) {
  const [id, a, b, c] = key.split('|');
  const comp = db.components.find((x) => x.id === id) || db.components.find((x) => x.baseId === id);
  if (!comp) { problems.push(`fit: no part "${id}"`); continue; }
  if (a === 'w' || a === 'panel') continue;
  const m = comp.model[Number(a)];
  const copies = m ? (m.instances?.length || 1) : 0;
  if (!m || Number(b) >= copies || (c === '1' && !m.mirror)) problems.push(`fit: stale key ${key} — re-run src/tools/fit-measure.js`);
}

// alternative values must read cleanly: no stray "≈", no dangling dash
for (const c of db.components) for (const h of c.hardware) {
  if (!hasTorque(h)) continue;
  for (const st of parseHw(h).steps) if (/—\s*$|≈\s*(for|—)|^\s*-\s/.test(st)) problems.push(`${c.id}: garbled step "${st}"`);
}

// sources that disagree must never read as a choice of part
for (const c of db.components) for (const h of c.hardware) {
  if (!hasTorque(h)) continue;
  const t = parseHw(h);
  if (t.alts && !t.disagree && /unresolved|owner.?(reported|posted)|read as|sources? (differ|disagree)/i.test(h.torque)) problems.push(`${c.id}: disagreement shown as a choice — "${h.torque.slice(0, 90)}"`);
}

console.log(`torque check: ${angled} rows with an angle step, ${problems.length} problems`);
for (const p of problems) console.log('  ' + p);
if (problems.length) process.exit(1);
