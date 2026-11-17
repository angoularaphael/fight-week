/**
 * Section collision : la 3D (three.js + voiture) est prechargee en tache de
 * fond des que la page est chargee, puis l'animation se JOUE TOUTE SEULE
 * (environ 3 s) quand la section est a l'ecran : approche, impact, flash,
 * offre. Plus de dependance au defilement : on voit toujours le choc.
 * Rendu uniquement quand la section est visible.
 */
import { gsap } from 'gsap';

const IMPACT = 0.42;
const DURATION = 3.2;

function webglOk() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export function setupCrash(section = document.getElementById('offre-crash')) {
  if (!section || section.dataset.ready) return;
  section.dataset.ready = '1';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData;
  if (reduce || saveData || !webglOk()) {
    section.classList.add('is-static');
    return;
  }

  const canvas = section.querySelector('.crash-canvas');
  const flash = section.querySelector('.crash-flash');
  const caps = section.querySelectorAll('.crash-cap');
  const offer = section.querySelector('.crash-offer');
  const bar = section.querySelector('.crash-progress i');
  const mobile = !window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
  const price = Number(section.dataset.price || 40);
  const state = { p: 0 };
  let crash = null;
  let loading = null;
  let inView = false;
  let played = false;

  const ui = (p) => {
    const idx = p < IMPACT - 0.02 ? 0 : p < 0.62 ? 1 : 2;
    caps.forEach((c, i) => c.classList.toggle('on', i === idx && p > 0.02 && p < 0.86));
    offer.classList.toggle('on', p >= 0.8);
    const f = p < IMPACT ? 0 : Math.max(0, 1 - (p - IMPACT) / 0.07);
    flash.style.opacity = String(f * 0.95);
    if (bar) bar.style.transform = `scaleX(${p})`;
  };
  ui(0);

  // Prechargement : module 3D + voiture, sans bloquer le reste de la page.
  function load() {
    if (!loading) {
      loading = import('./crash3d.js')
        .then(({ createCrash }) => createCrash(canvas, { mobile, price }))
        .then((c) => {
          crash = c;
          crash.setProgress(state.p);
          section.classList.add('has-webgl');
          crash.setVisible(inView);
          maybePlay();
          return c;
        })
        .catch((err) => {
          console.warn('[crash] 3D indisponible', err);
          section.classList.add('is-static');
        });
    }
    return loading;
  }

  function maybePlay() {
    if (played || !crash || !inView) return;
    played = true;
    gsap.to(state, {
      p: 1,
      duration: DURATION,
      ease: 'none',
      onUpdate: () => {
        crash.setProgress(state.p);
        ui(state.p);
      },
    });
  }

  const idle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 2500));
  if (document.readyState === 'complete') idle(load);
  else window.addEventListener('load', () => idle(load), { once: true });

  // Visible a 45 % : on lance (ou on chargera puis lancera).
  const io = new IntersectionObserver(
    ([e]) => {
      inView = e.isIntersecting;
      if (inView) load();
      crash?.setVisible(inView);
      maybePlay();
    },
    { threshold: 0.45 }
  );
  io.observe(section);

  // Rejouer au clic sur la scene.
  canvas.addEventListener('click', () => {
    if (!crash) return;
    played = false;
    state.p = 0;
    maybePlay();
  });
}

setupCrash();
