// Remove the measured fit offsets (data/fit.json) of parts whose model you repositioned, safely while
// other tools edit the same file. Usage: node scripts/fit-drop.mjs <part id> [<part id> ...]
import fs from 'node:fs';
const LOCK = 'data/.fit.lock';
const ids = process.argv.slice(2);
for (let i = 0; ; i++) {
  try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); break; } catch {
    if (i > 200) { console.error('fit.json is locked'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 100));
  }
}
try {
  const fit = JSON.parse(fs.readFileSync('data/fit.json', 'utf8'));
  const gone = Object.keys(fit).filter((k) => ids.some((id) => k.startsWith(`${id}|`) || k.startsWith(`${id}--`)));
  for (const k of gone) delete fit[k];
  fs.writeFileSync('data/fit.json.tmp', JSON.stringify(fit, null, 1));
  fs.renameSync('data/fit.json.tmp', 'data/fit.json');
  console.log(gone.length ? `removed ${gone.join(', ')}` : 'no fit entries for those parts');
} finally {
  fs.rmSync(LOCK, { force: true });
}
