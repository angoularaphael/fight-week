/**
 * Pipeline medias : etalonnage rouge et noir commun, images WebP/AVIF, video
 * hero (plans 3D generes + garage MOTEKA + vrai gala Boxing Center 2023), versions
 * 16:9 et 9:16, H.264 + AV1, sans piste audio, posters AVIF.
 * Usage : npm run media   (ffmpeg dans le PATH)
 * Sources : media-src/ (photos) et ../tmbc/public/assets/media/gala-boxe-toulouse-2023.mp4
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'media-src');
const out = path.join(root, 'public', 'media');
const tmp = path.join(root, '.media-tmp');
const GALA_VIDEO = process.env.GALA_VIDEO || path.join(root, '..', 'tmbc', 'public', 'assets', 'media', 'gala-boxe-toulouse-2023.mp4');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const only = process.argv[2] || 'all';

// ---------------------------------------------------------------- Images
// Etalonnage : desaturation partielle, contraste, ombres ecrasees, voile rouge
// en soft-light et vignette. Meme recette pour garage et boxe.
async function grade(file, name, widths = [1600, 800]) {
  const meta = await sharp(file).metadata();
  for (const w of widths) {
    const width = Math.min(w, meta.width);
    const base = await sharp(file)
      .resize({ width })
      .modulate({ saturation: 0.55, brightness: 0.92 })
      .linear(1.22, -22)
      .toBuffer({ resolveWithObject: true });
    const { width: W, height: H } = base.info;
    const overlay = Buffer.from(
      `<svg width="${W}" height="${H}"><defs>
        <radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.75"/></radialGradient>
        <linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d11414" stop-opacity="0.55"/><stop offset="1" stop-color="#7a0000" stop-opacity="0.25"/></linearGradient>
      </defs><rect width="100%" height="100%" fill="url(#r)"/></svg>`
    );
    const vignette = Buffer.from(
      `<svg width="${W}" height="${H}"><defs><radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.7"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`
    );
    const graded = sharp(base.data).composite([
      { input: overlay, blend: 'soft-light' },
      { input: vignette, blend: 'over' },
    ]);
    const buf = await graded.toBuffer();
    await sharp(buf).webp({ quality: 74 }).toFile(path.join(out, `${name}-${w}.webp`));
    if (w === widths[0]) await sharp(buf).avif({ quality: 50 }).toFile(path.join(out, `${name}-${w}.avif`));
  }
}

async function images() {
  for (const dir of ['moteka', 'gala', 'rendu']) {
    for (const f of readdirSync(path.join(src, dir))) {
      const name = `${dir}-${f.replace(/\.(jpe?g|webp|png)$/i, '').replace(/-1200$/, '')}`;
      await grade(path.join(src, dir, f), name);
      console.log('image', name);
    }
  }
}

// ---------------------------------------------------------------- Video
function ff(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

// Etalonnage video : meme intention que les photos.
const GRADE =
  'eq=contrast=1.25:saturation=0.6:brightness=-0.04,colorbalance=rs=0.18:gs=-0.06:bs=-0.08:rm=0.12:bm=-0.06:rh=0.05,vignette=PI/4.2';

/** Plan photo anime (Ken Burns) : zoom lent + derive. */
function photoShot(file, dur, w, h, i, dir = 1) {
  const o = path.join(tmp, `s${i}-${w}x${h}.mp4`);
  const fps = 30;
  const frames = Math.round(dur * fps);
  const z = `zoompan=z='min(1.0+0.0016*on,1.25)':x='iw/2-(iw/zoom/2)+${dir}*on*0.9':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${fps}`;
  ff(['-loop', '1', '-i', file, '-vf', `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2},${z},${GRADE},format=yuv420p`, '-t', String(dur), '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', o]);
  return o;
}

/** Plan extrait du vrai gala 2023, legerement ralenti. */
function clipShot(start, dur, w, h, i) {
  const o = path.join(tmp, `s${i}-${w}x${h}.mp4`);
  ff(['-ss', String(start), '-t', String(dur / 0.8), '-i', GALA_VIDEO, '-vf', `setpts=PTS/0.8,scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,${GRADE},format=yuv420p`, '-t', String(dur), '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', o]);
  return o;
}

/** Plan 3D rendu image par image (scripts/render-3d.mjs). */
function seqShot(name, dur, w, h, i) {
  const o = path.join(tmp, `s${i}-${w}x${h}.mp4`);
  const dir = path.join(src, 'seq', name);
  if (!existsSync(path.join(dir, '0001.png'))) throw new Error(`Sequence 3D absente : ${name} (lancer scripts/render-3d.mjs)`);
  ff(['-framerate', '30', '-i', path.join(dir, '%04d.png'), '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},${GRADE},format=yuv420p`, '-t', String(dur), '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', o]);
  return o;
}

function heroVideo(w, h, tag) {
  const D = 1.7;
  const M = (f) => path.join(src, 'moteka', f);
  const shots = [
    () => seqShot('barres', D, w, h, 0),
    () => clipShot(25.5, D, w, h, 1),
    () => seqShot('voiture', D, w, h, 2),
    () => clipShot(37.2, D, w, h, 3),
    () => photoShot(M('atelier-rouge.jpg'), D, w, h, 4, 1),
    () => clipShot(18.0, D, w, h, 5),
    () => seqShot('ring', D, w, h, 6),
    () => clipShot(42.6, D, w, h, 7),
  ].map((fn) => fn());
  // Enchainement en fondus rapides, dont un flash rouge au milieu.
  const T = 0.35;
  const trans = ['fadeblack', 'slideleft', 'fadewhite', 'smoothleft', 'fadeblack', 'slideright', 'fadewhite'];
  let filter = '';
  let last = '[0:v]';
  let offset = 0;
  for (let i = 1; i < shots.length; i += 1) {
    offset += D - T;
    const label = i === shots.length - 1 ? '[vx]' : `[x${i}]`;
    filter += `${last}[${i}:v]xfade=transition=${trans[i - 1]}:duration=${T}:offset=${offset.toFixed(2)}${label};`;
    last = label;
  }
  const total = D * shots.length - T * (shots.length - 1);
  // Boucle : fondu au noir en entree et en sortie (debut = fin).
  filter += `[vx]fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.4).toFixed(2)}:d=0.4,format=yuv420p[v]`;
  const master = path.join(tmp, `hero-${tag}-master.mp4`);
  ff([...shots.flatMap((s) => ['-i', s]), '-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', master]);

  ff(['-i', master, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', path.join(out, `hero-${tag}.h264.mp4`)]);
  ff(['-i', master, '-an', '-c:v', 'libsvtav1', '-crf', '38', '-preset', '6', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', path.join(out, `hero-${tag}.av1.mp4`)]);
  // Poster = combat du gala (image LCP, doit claquer).
  const png = path.join(tmp, `poster-${tag}.png`);
  ff(['-ss', '2.8', '-i', master, '-frames:v', '1', png]);
  return sharp(png).avif({ quality: 48 }).toFile(path.join(out, `hero-${tag}.avif`)).then(() => sharp(png).jpeg({ quality: 78 }).toFile(path.join(out, `hero-${tag}.jpg`)));
}

if (only === 'all' || only === 'images') await images();
if (only === 'all' || only === 'video') {
  if (!existsSync(GALA_VIDEO)) throw new Error(`Video du gala introuvable : ${GALA_VIDEO}`);
  await heroVideo(1280, 720, '16x9');
  await heroVideo(720, 1280, '9x16');
  console.log('videos hero OK');
}
rmSync(tmp, { recursive: true, force: true });
