// Serveur API local (meme handlers que les fonctions Vercel api/).
// Sans Supabase configure, la base memoire est utilisee (vente ouverte).
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import '../lib/load-env.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.API_PORT || 5641);
process.env.GALA_SALES_OPEN = process.env.GALA_SALES_OPEN || '1';
process.env.PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || 'http://localhost:5640';

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const rel = url.pathname.replace(/\/+$/, '').replace(/^\/api\//, '');
    if (!/^[a-z0-9/-]+$/.test(rel)) throw Object.assign(new Error('not found'), { status: 404 });
    const file = path.join(root, 'api', `${rel}.js`);
    if (!file.startsWith(path.join(root, 'api')) || !existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    const mod = await import(pathToFileURL(file).href);
    await mod.default(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.statusCode = err.status || 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'Server error' }));
    }
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`[gala api] http://127.0.0.1:${PORT}`));

if (process.argv.includes('--astro')) {
  const astroBin = path.join(root, 'node_modules', 'astro', 'astro.js');
  const child = spawn(process.execPath, [astroBin, 'dev', '--port', '5640', '--host', '127.0.0.1'], { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}
