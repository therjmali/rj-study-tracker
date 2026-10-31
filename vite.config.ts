import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

/** GitHub Pages serves the site from /<repo>/; the deploy workflow passes it in as VITE_BASE. */
function normaliseBase(raw: string | undefined): string {
  let b = (raw ?? '/').trim();
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Post-build step:
 *  • injects the precache manifest + build id into sw.js
 *  • emits 404.html so deep links keep working on GitHub Pages (static hosting)
 */
function pwaAndPagesPlugin(): Plugin {
  let outDir = '';
  let base = '/';
  return {
    name: 'rj-pwa-and-pages',
    apply: 'build',
    configResolved(cfg) {
      outDir = path.resolve(cfg.root, cfg.build.outDir);
      base = cfg.base;
    },
    closeBundle() {
      const files = walk(outDir)
        .map(f => path.relative(outDir, f).split(path.sep).join('/'))
        .filter(f => f !== 'sw.js' && f !== '404.html' && !f.endsWith('.map') && f !== '.nojekyll');

      const hash = crypto.createHash('sha256');
      for (const f of files.sort()) {
        hash.update(f);
        hash.update(fs.readFileSync(path.join(outDir, f)));
      }
      const buildId = hash.digest('hex').slice(0, 12);

      // Precache everything except bulky, rarely used extras.
      const precache = ['./', ...files.filter(f => f !== 'index.html')];
      precache.splice(1, 0, 'index.html');

      const swPath = path.join(outDir, 'sw.js');
      if (fs.existsSync(swPath)) {
        const sw = fs.readFileSync(swPath, 'utf8')
          .replace('__BUILD_ID__', buildId)
          .replace('__PRECACHE_MANIFEST__', JSON.stringify(precache));
        fs.writeFileSync(swPath, sw);
      }

      // SPA fallback for GitHub Pages: /<repo>/profile -> /<repo>/?__p=/profile
      const segmentsToKeep = base === '/' ? 0 : base.split('/').filter(Boolean).length;
      const html404 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RJ Tracker Pro</title>
<script>
  // Single-page-app redirect for static hosting. See index.html for the decoder.
  (function () {
    var keep = ${segmentsToKeep};
    var l = window.location;
    var segs = l.pathname.split('/');
    var root = segs.slice(0, 1 + keep).join('/') + '/';
    var rest = '/' + segs.slice(1 + keep).join('/');
    l.replace(l.protocol + '//' + l.host + root + '?__p=' + encodeURIComponent(rest + l.search) + l.hash);
  })();
</script></head><body></body></html>`;
      fs.writeFileSync(path.join(outDir, '404.html'), html404);
      fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    },
  };
}

export default defineConfig(() => ({
  base: normaliseBase(process.env.VITE_BASE),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react(), pwaAndPagesPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@project/components': path.resolve(__dirname, 'packages/components'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
