// Client for scripts/review-server.mjs. Usage:
//   node scripts/review-render.mjs --out <dir> --name <prefix> (--ids a,b | --re '<regex>') [--views iso,side] [--modes context,isolate] [--explode 0]
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const job = {
  out: arg('out', 'review-shots'), name: arg('name', 'shot'),
  ids: arg('ids') ? arg('ids').split(',') : undefined, re: arg('re'),
  views: arg('views', 'iso,side').split(','), modes: arg('modes', 'context,isolate').split(','),
  explode: +arg('explode', 0),
};
const res = await fetch(`http://127.0.0.1:${arg('port', 5191)}/render`, { method: 'POST', body: JSON.stringify(job) });
const out = await res.json();
if (out.error) { console.error(out.error); process.exit(1); }
console.log(`${out.parts} parts`);
for (const f of out.files) console.log(f);
