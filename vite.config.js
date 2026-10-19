import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

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
  plugins: [partsDb()],
  server: { watch: { ignored: ['**/public/data/**'] } },
  build: { chunkSizeWarningLimit: 1500 },
});
