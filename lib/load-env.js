import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Charge .env en local uniquement (jamais sur Vercel).
if (process.env.VERCEL !== '1' && !process.env.GALA_NO_DOTENV) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.join(root, '.env');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
