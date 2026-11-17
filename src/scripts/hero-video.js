// Video du hero chargee APRES le premier affichage, et jamais si :
// mouvement reduit, Save-Data, reseau 2G/3G, ou batterie faible (proxy du mode
// economie d'energie, que le web ne peut pas lire directement sur iOS).
// Si la lecture automatique est refusee (economie d'energie iOS), on garde le
// poster et on affiche un bouton lecture.
const box = document.querySelector('[data-hero-video]');

async function allowed() {
  if (!box) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)(2g|3g)$/.test(String(c.effectiveType || '')))) return false;
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      if (!b.charging && b.level < 0.2) return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

function pick() {
  const mobile = window.matchMedia('(max-width: 899px) and (orientation: portrait)').matches;
  const raw = box.dataset[mobile ? 'videoMobile' : 'video'] || box.dataset.video;
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showPlayButton(video) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost hero-play';
  btn.textContent = 'Lancer la video';
  btn.addEventListener('click', () => {
    video.play().catch(() => {});
    btn.remove();
  });
  box.closest('.hero')?.querySelector('.cta-row')?.append(btn);
}

async function start() {
  if (!(await allowed())) return;
  const src = pick();
  if (!src) return;
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.preload = 'auto';
  if (src.av1) {
    const s = document.createElement('source');
    s.src = src.av1;
    s.type = 'video/mp4; codecs="av01.0.05M.08"';
    video.append(s);
  }
  if (src.h264) {
    const s = document.createElement('source');
    s.src = src.h264;
    s.type = 'video/mp4';
    video.append(s);
  }
  video.addEventListener('playing', () => box.classList.add('has-video'), { once: true });
  box.append(video);
  // Une seule source d'animation lourde : on met la video en pause hors ecran.
  new IntersectionObserver(([e]) => (e.isIntersecting ? video.play().catch(() => {}) : video.pause())).observe(box);
  video.play().catch(() => showPlayButton(video));
}

if (box) {
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2500 }) : setTimeout(start, 1200));
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}
