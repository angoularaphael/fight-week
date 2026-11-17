/**
 * Genere favicons (ICO, PNG 48/96/180/192/512, SVG), manifeste et image
 * Open Graph 1200x630 a partir du motif des 3 barres MOTEKA.
 * Usage : npm run icons (fichiers commites dans public/).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'public');
mkdirSync(path.join(pub, 'img'), { recursive: true });
GlobalFonts.registerFromPath(path.join(root, 'lib/fonts/michroma-latin-400-normal.woff'), 'Michroma');
GlobalFonts.registerFromPath(path.join(root, 'lib/fonts/jost-latin-wght-normal.woff2'), 'Jost');

const CARBON = '#141414';
const RED = '#d11414';

/** 3 barres obliques dans un carre unite (0..1), centrees. */
function drawBars(ctx, x, y, size) {
  const h = size * 0.56;
  const w = size * 0.16;
  const slant = size * 0.26;
  const gap = size * 0.07;
  const total = slant + 3 * w + 2 * gap;
  const ox = x + (size - total) / 2;
  const oy = y + (size - h) / 2;
  ctx.fillStyle = RED;
  for (let i = 0; i < 3; i += 1) {
    const bx = ox + i * (w + gap);
    ctx.beginPath();
    ctx.moveTo(bx + slant, oy);
    ctx.lineTo(bx + slant + w, oy);
    ctx.lineTo(bx + w, oy + h);
    ctx.lineTo(bx, oy + h);
    ctx.closePath();
    ctx.fill();
  }
}

function icon(size, { radius = 0.18 } = {}) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const r = size * radius;
  ctx.fillStyle = CARBON;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fill();
  drawBars(ctx, 0, 0, size);
  return c.encodeSync('png');
}

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...pngs.map((p) => p.data)]);
}

for (const [name, size] of [
  ['favicon-48x48.png', 48],
  ['favicon-96x96.png', 96],
  ['favicon-192.png', 192],
  ['favicon-512.png', 512],
]) {
  writeFileSync(path.join(pub, name), icon(size));
}
writeFileSync(path.join(pub, 'apple-touch-icon.png'), icon(180, { radius: 0 }));
writeFileSync(path.join(pub, 'favicon.ico'), ico([16, 32, 48].map((s) => ({ size: s, data: icon(s) }))));

writeFileSync(
  path.join(pub, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="${CARBON}"/><g fill="${RED}"><path d="M32 22h16L22 78H6z"/><path d="M55 22h16L45 78H29z"/><path d="M78 22h16L68 78H52z"/></g></svg>\n`
);

writeFileSync(
  path.join(pub, 'site.webmanifest'),
  `${JSON.stringify(
    {
      name: 'Fight and Furious',
      short_name: 'Fight & Furious',
      lang: 'fr-FR',
      start_url: '/',
      display: 'standalone',
      background_color: CARBON,
      theme_color: CARBON,
      icons: [
        { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2
  )}\n`
);

// Open Graph 1200x630
const og = createCanvas(1200, 630);
const ctx = og.getContext('2d');
ctx.fillStyle = CARBON;
ctx.fillRect(0, 0, 1200, 630);
const glow = ctx.createRadialGradient(900, 320, 40, 900, 320, 520);
glow.addColorStop(0, 'rgba(209,20,20,0.45)');
glow.addColorStop(1, 'rgba(209,20,20,0)');
ctx.fillStyle = glow;
ctx.fillRect(0, 0, 1200, 630);
drawBars(ctx, 690, 70, 480);
ctx.fillStyle = '#ffffff';
ctx.font = '64px Michroma';
ctx.fillText('FIGHT AND', 64, 230);
ctx.fillText('FURIOUS', 64, 315);
ctx.fillStyle = '#999b9a';
ctx.font = '500 34px Jost';
ctx.fillText('Boxing Center x MOTEKA', 66, 385);
ctx.fillStyle = '#ffffff';
ctx.font = '600 40px Jost';
ctx.fillText('11, 12, 13 décembre 2026', 66, 470);
ctx.fillStyle = '#999b9a';
ctx.font = '400 30px Jost';
ctx.fillText('Garage MOTEKA, Fenouillet', 66, 520);
ctx.fillStyle = RED;
ctx.fillRect(0, 610, 1200, 20);
writeFileSync(path.join(pub, 'img/og-fight-and-furious.jpg'), og.encodeSync('jpeg', 88));

console.log('icones et OG generes');
