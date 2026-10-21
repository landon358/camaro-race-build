// Dev tool: one headless Chrome that renders design-review images on request, one at a time, so many
// reviewers can share it. Needs the dev server (npm run dev). Start: node scripts/review-server.mjs [port]
// Request: POST /render  {"out": dir, "name": prefix, "ids": [...] | "re": "regex", "views": [...], "modes": [...], "explode": 0}
//          → {"files": [...]}.  POST /probe {"rays": [{"o": [x,y,z], "d": [dx,dy,dz]}], "what": "body"|"all"|[ids]}
//          → {"hits": [{p, id, dist} | null]}. GET /health → ok. Reloads the page when public/data/db.json changes.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = +(process.argv[2] || 5191);
const BASE = process.env.REVIEW_BASE || 'http://localhost:5178';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DB = path.resolve('public/data/db.json');
const W = 1100, H = 720;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 600000,
  args: (process.env.REVIEW_GL === 'soft' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']).concat([`--window-size=${W},${H}`]),
});
let page = null, loadedAt = 0, db = null;

async function ready() {
  const m = fs.statSync(DB).mtimeMs;
  if (page && m === loadedAt) return;
  // the parts list was rebuilt: load it fresh
  for (let i = 0; i < 5; i++) {
    try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); break; } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  if (page) await page.close();
  page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(`${BASE}/review.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready || window.__error', { timeout: 180000 });
  const err = await page.evaluate('window.__error');
  if (err) { page = null; throw new Error(err); }
  loadedAt = m;
}

let queue = Promise.resolve();
function render(job) {
  const run = async () => {
    await ready();
    const ids = job.ids?.length ? job.ids : db.components.filter((c) => new RegExp(job.re).test(c.id)).map((c) => c.id);
    fs.mkdirSync(job.out, { recursive: true });
    const files = [];
    for (const mode of job.modes || ['context', 'isolate']) {
      for (const view of job.views || ['iso', 'side']) {
        await page.evaluate((o) => window.__render(o), { ids, view, mode, explode: job.explode || 0, cam: job.cam, target: job.target });
        const file = path.join(job.out, `${job.name || 'shot'}-${mode}-${view}.png`);
        await page.screenshot({ path: file });
        files.push(file);
      }
    }
    return { files, parts: ids.length };
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

function probe(job) {
  const run = async () => { await ready(); return page.evaluate((j) => window.__probe(j.rays, j.what || 'body'), job); };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

http.createServer((req, res) => {
  if (req.method === 'GET') { res.end('ok'); return; }
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', async () => {
    try {
      const job = JSON.parse(body);
      const out = req.url.startsWith('/probe') ? { hits: await probe(job) } : await render(job);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(out));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e?.stack || e) }));
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`review renderer on http://127.0.0.1:${PORT}`));
