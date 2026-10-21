import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Write every built file into dist/sw.js so the app works offline from the first visit.
function precache() {
  return {
    name: 'precache',
    apply: 'build',
    closeBundle() {
      const dist = path.join(__dirname, 'dist');
      const files = [];
      const walk = (d) => {
        for (const f of fs.readdirSync(d)) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else files.push(path.relative(dist, p).split(path.sep).join('/'));
        }
      };
      walk(dist);
      // the reference body mesh is only for the dev measuring tools
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !/\.woff$/.test(f) && f !== 'models/camaro.glb');
      const hash = crypto.createHash('sha1');
      for (const f of list.sort()) hash.update(f).update(fs.readFileSync(path.join(dist, f)));
      const version = hash.digest('hex').slice(0, 10);
      const swPath = path.join(dist, 'sw.js');
      const sw = fs.readFileSync(swPath, 'utf8')
        .replace('__BUILD_VERSION__', version)
        .replace("self.__PRECACHE__ ||", `${JSON.stringify(['./', ...list.map((f) => `./${f}`)])} ||`);
      fs.writeFileSync(swPath, sw);
      console.log(`[precache] ${list.length} files, version ${version}`);
    },
  };
}

// Rebuild public/data/db.json whenever a research file in data/systems changes.
function partsDb() {
  const rebuild = () => {
    try {
      execFileSync(process.execPath, ['scripts/build-data.mjs'], { cwd: __dirname, stdio: 'inherit' });
    } catch (e) {
      console.error('[parts-db] rebuild failed', e.message);
    }
  };
  let timer;
  return {
    name: 'parts-db',
    configureServer(server) {
      const dir = path.join(__dirname, 'data', 'systems');
      server.watcher.add(dir);
      server.watcher.on('all', (_evt, file) => {
        if (!file.startsWith(dir) || !file.endsWith('.json')) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          rebuild();
          server.ws.send({ type: 'full-reload' });
        }, 1500);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [partsDb(), precache()],
  server: { watch: { ignored: ['**/public/data/**'] } },
  build: { chunkSizeWarningLimit: 1500 },
});
