// Real-part photos (free-licensed, from Wikimedia Commons) matched to parts and fasteners by keyword.
// data/part-images.*.json: { key: { file, kind: 'part' | 'fastener', label, keywords[], ids?[], title, author, license, licenseUrl, source } }
import fs from 'node:fs';
import path from 'node:path';

const norm = (s) => ` ${String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
// Whole-word match, so "nut" does not hit "walnut" and "pin" does not hit "spinning".
const has = (text, kw) => {
  const k = norm(kw);
  if (k.trim().length < 3 && !/\d/.test(k)) return false;
  return text.includes(k) || text.includes(k.replace(/ $/, 's '));
};

export function loadPhotos(root, publicDir, warn) {
  const dir = path.join(root, 'data');
  const photos = {};
  for (const f of fs.readdirSync(dir).filter((n) => /^part-images\..+\.json$/.test(n)).sort()) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { warn(`${f}: ${e.message}`); continue; }
    for (const [key, p] of Object.entries(j)) {
      if (!p?.file || !fs.existsSync(path.join(publicDir, p.file))) { warn(`${f}: ${key} has no image file`); continue; }
      if (!/^https:\/\/commons\.wikimedia\.org\//.test(p.source || '')) { warn(`${f}: ${key} is not from Wikimedia Commons`); continue; }
      photos[key] = {
        file: p.file, kind: p.kind === 'fastener' ? 'fastener' : 'part', label: String(p.label || key),
        keywords: (p.keywords || []).map(String).filter(Boolean), ids: (p.ids || []).map(String),
        author: String(p.author || 'Unknown'), license: String(p.license || ''), licenseUrl: String(p.licenseUrl || ''), source: p.source,
      };
    }
  }
  return photos;
}

// Words that do not say what a part is.
const FILLER = new Set(['front', 'rear', 'left', 'right', 'and', 'the', 'of', 'for', 'with', 'to', 'a', 'kit', 'set', 'assembly', 'lf', 'rf', 'lr', 'rr']);
const words = (t) => t.trim().split(' ').filter((w) => w && !FILLER.has(w));

/** Best photo for a text: fields are tried in order (name before notes); within a field the longest keyword wins.
 *  For parts the keyword must cover at least half the name, so "plugs" does not label "Oil galley plugs". */
// Hardware that only ever comes along with a bolt; it labels a row only when the row's own name says so.
const SECONDARY = /washer|thread ?lock|loctite|safety wire|lock ?wire|sealant/;

function best(photos, kind, fields) {
  for (const [fi, text] of fields.entries()) {
    let win = null; let score = 0;
    const n = words(text).length || 1;
    for (const [key, p] of Object.entries(photos)) {
      if (p.kind !== kind) continue;
      for (const kw of p.keywords) {
        const s = norm(kw).trim().length;
        if (s <= score || !has(text, kw)) continue;
        if (kind === 'fastener' && fi > 0 && SECONDARY.test(kw)) continue;
        if (kind === 'part' && words(norm(kw)).length / n < 0.5) continue;
        score = s; win = key;
      }
    }
    if (win) return win;
  }
  return null;
}

// A photo only labels a part when it shows what the part *is*: the head noun of the part's name
// ("plates" in "Captured nut plates for …") must be in the photo's label or keywords. Generic heads
// (plate, bracket, tank…) must be in the photo's own label and share a second word, so a coolant tank never labels a fuel tank.
const stem = (w) => w.replace(/(es|s)$/, '');
const STOP = new Set(['front', 'rear', 'left', 'right', 'with', 'and', 'the', 'for', 'factory', 'race', 'racing', 'assembly', 'driver', 'passenger']);
const sig = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);
const GENERIC = new Set(['plat', 'bracket', 'mount', 'decal', 'tank', 'control', 'sensor', 'lin', 'line', 'plug', 'drain', 'bolt', 'power', 'marking', 'panel', 'tower', 'structure', 'path', 'member', 'floor', 'datum', 'point', 'cap', 'fitting', 'hos', 'brace', 'pump', 'filter', 'cooler', 'pip', 'block', 'pin', 'interface', 'delivery', 'conversion', 'reinforcement', 'mounting', 'seal', 'gasket', 'cable', 'handle', 'rod', 'pull', 'dam', 'cover']);
function fits(c, p) {
  const first = c.displayName.replace(/\s+—.*$/, '').split(/\s*(?:\/|&|,|\(|\s-\s|–|\sfor\s|\sto\s|\sat\s|\son\s|\sor\s)\s*/)[0];
  const name = sig(first);
  const head = name[name.length - 1];
  if (!head) return false;
  const pw = new Set([...sig(p.label), ...p.keywords.flatMap(sig)]);
  if (!pw.has(head)) return false;
  // a generic head has to be what the photo itself is titled, not just one of its search words
  return !GENERIC.has(head) || (sig(p.label).includes(head) && name.filter((w) => w !== head && pw.has(w)).length >= 1);
}

export function attachPhotos(components, photos) {
  const byId = new Map();
  for (const [key, p] of Object.entries(photos)) for (const id of p.ids) byId.set(id, key);
  let parts = 0; let rows = 0; let total = 0;
  for (const c of components) {
    const pk = byId.get(c.id) || best(photos, 'part', [norm(c.displayName.replace(/\s+—.*$/, '')), norm(c.short), norm(c.name), norm(c.alias)]);
    if (pk && fits(c, photos[pk])) { c.photo = pk; parts++; }
    for (const h of c.hardware) {
      total++;
      // item name first, then size/grade; never notes, which mention other hardware ("use a new washer")
      // "steering wheel bolt" is not a wheel (lug) bolt
      const own = (t) => norm(t).replace(/ steering wheel /g, ' steeringwheel ');
      const fk = best(photos, 'fastener', [own(h.item), own(`${h.spec || ''} ${h.grade || ''}`)]);
      if (fk) { h.photo = fk; rows++; }
    }
  }
  return { parts, rows, total };
}
