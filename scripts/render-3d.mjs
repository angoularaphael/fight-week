/**
 * Rendu image par image de sequences 3D (scene three.js) pour la video hero.
 * Prerequis : `npm run dev` (page /studio-3d) et Microsoft Edge installe.
 * Usage : node scripts/render-3d.mjs [largeur] [hauteur]
 * Sortie : media-src/seq/<nom>/0001.png ...
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [W = '1280', H = '720'] = process.argv.slice(2);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const FPS = 30;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (A, B, t) => A.map((v, i) => lerp(v, B[i], t));

// Chaque sequence : duree (s) et fonction t (0..1) -> plan.
const SEQ = {
  barres: {
    dur: 1.9,
    shot: (t) => ({ p: lerp(0.02, 0.5, ease(t)), pos: mix([0.4, 3.4, 9.5], [2.8, 2.6, 8.2], ease(t)), look: mix([0, 3.3, 3.2], [0, 2.0, 2.7], ease(t)), fov: 34, t: t * 2 }),
  },
  voiture: {
    dur: 1.9,
    shot: (t) => ({ p: 1, pos: mix([-1.2, 0.7, 8.6], [-4.2, 0.9, 7.6], ease(t)), look: mix([-4.8, 0.7, 1.8], [-5.8, 0.6, 1.6], ease(t)), fov: 30, t: 3 + t * 2 }),
  },
  ring: {
    dur: 1.9,
    shot: (t) => {
      const a = lerp(0.3, 1.25, ease(t));
      return { p: 1, pos: [Math.sin(a) * 10, lerp(6.5, 3.2, ease(t)), Math.cos(a) * 10], look: [-0.6, 1.2, 0], fov: 40, t: 6 + t * 2 };
    },
  },
};

const port = 9700 + Math.floor(Math.random() * 90);
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(os.tmpdir(), `edge-r3d-${port}`)}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250);
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m);
    pend.delete(m.id);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: process.env.STUDIO_URL || 'http://localhost:5640/studio-3d' });
for (let i = 0; i < 120 && !(await ev('window.__ready === true')); i++) await sleep(500);

const only = process.env.SEQ ? process.env.SEQ.split(',') : Object.keys(SEQ);
for (const name of only) {
  const { dur, shot } = SEQ[name];
  const dir = path.join(root, 'media-src', 'seq', name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const n = Math.round(dur * FPS);
  for (let f = 0; f < n; f++) {
    await ev(`window.__still(${JSON.stringify(shot(f / (n - 1)))})`);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(dir, `${String(f + 1).padStart(4, '0')}.png`), Buffer.from(r.result.data, 'base64'));
  }
  console.log('sequence', name, n, 'images');
}
ws.close();
edge.kill();
process.exit(0);
