// Dev tool: renders design-review images of parts with the app's own renderer (review.html) in headless Chrome.
// Needs the dev server running (npm run dev). Usage:
//   node scripts/review-shot.mjs --out <dir> --name <prefix> --ids id1,id2 | --re '<regex>' \
//        [--views iso,side,front,top,under] [--modes context,isolate,solid] [--explode 0] [--size 1100x720]
//   node scripts/review-shot.mjs --batch jobs.json   ([{ out, name, ids, views, modes }, ...] in one browser)
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:5178');
const CHROME = arg('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const [W, H] = arg('size', '1100x720').split('x').map(Number);
const db = JSON.parse(fs.readFileSync(path.resolve('public/data/db.json'), 'utf8'));

function idsFor(job) {
  if (job.ids?.length) return job.ids;
  const rx = new RegExp(job.re);
  return db.components.filter((c) => rx.test(c.id)).map((c) => c.id);
}

const jobs = arg('batch') ? JSON.parse(fs.readFileSync(arg('batch'), 'utf8')) : [{
  out: arg('out', 'review-shots'), name: arg('name', 'shot'),
  ids: arg('ids') ? arg('ids').split(',') : null, re: arg('re', '^$'),
  views: arg('views', 'iso,side,front,top').split(','), modes: arg('modes', 'context,isolate').split(','),
  explode: +arg('explode', 0),
}];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.goto(`${BASE}/review.html`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready || window.__error', { timeout: 120000 });
  const err = await page.evaluate('window.__error');
  if (err) throw new Error(err);
  for (const job of jobs) {
    const ids = idsFor(job);
    fs.mkdirSync(job.out, { recursive: true });
    for (const mode of job.modes || ['context', 'isolate']) {
      for (const view of job.views || ['iso', 'side', 'front', 'top']) {
        await page.evaluate((o) => window.__render(o), { ids, view, mode, explode: job.explode || 0, cam: job.cam, target: job.target });
        const file = path.join(job.out, `${job.name}-${mode}-${view}.png`);
        await page.screenshot({ path: file });
        console.log(file);
      }
    }
  }
} finally {
  await browser.close();
}
