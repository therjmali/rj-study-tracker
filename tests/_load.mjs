// Loads the app's own TypeScript modules for tests (no extra dependency: Vite already ships with the project).
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let server;

export async function loadTs(relPath) {
  server ??= await createServer({
    root, configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return server.ssrLoadModule('/' + relPath.replace(/^\//, ''));
}
export async function closeLoader() { if (server) { await server.close(); server = undefined; } }

// ── tiny data builders ──
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const daysAgo = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return iso(d); };
export const topic = (over = {}) => ({ id: 't' + Math.random().toString(36).slice(2, 8), name: 'T', completed: false, status: 'todo', timeSpent: 0, timeEntries: [], difficulty: 'Medium', ...over });
export const subject = (topics, id = 's1') => ({ id, name: 'Subj', shortName: 'S', color: '#00f', units: [{ id: 'u1', name: 'U', subTopics: topics }] });
