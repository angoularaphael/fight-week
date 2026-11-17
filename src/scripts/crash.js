/**
 * Section collision : progression au defilement (GSAP ScrollTrigger), flash,
 * legendes, apparition de l'offre. three.js n'est charge qu'a l'approche de la
 * section et ne rend que lorsqu'elle est visible.
 * S'initialise seule ; setupCrash est aussi exporte.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const IMPACT = 0.42;

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
  let crash = null;
  let progress = 0;

  const ui = (p) => {
    // Legendes : approche, impact, offre.
    const idx = p < IMPACT - 0.02 ? 0 : p < 0.62 ? 1 : 2;
    caps.forEach((c, i) => c.classList.toggle('on', i === idx && p > 0.02 && p < 0.86));
    offer.classList.toggle('on', p >= 0.8);
    // Flash : pic juste apres l'impact, decroissance rapide.
    const f = p < IMPACT ? 0 : Math.max(0, 1 - (p - IMPACT) / 0.07);
    flash.style.opacity = String(f * 0.95);
    if (bar) bar.style.transform = `scaleX(${p})`;
  };

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (st) => {
      progress = st.progress;
      crash?.setProgress(progress);
      ui(progress);
    },
  });
  ui(0);

  let started = false;
  const io = new IntersectionObserver(
    async ([e]) => {
      if (e.isIntersecting && !started) {
        started = true;
        try {
          const { createCrash } = await import('./crash3d.js');
          crash = await createCrash(canvas, { mobile, price });
          crash.setProgress(progress);
          section.classList.add('has-webgl');
        } catch (err) {
          console.warn('[crash] 3D indisponible', err);
          section.classList.add('is-static');
          return;
        }
      }
      crash?.setVisible(e.isIntersecting);
    },
    { rootMargin: '25% 0px 25% 0px' }
  );
  io.observe(section);
}

setupCrash();
