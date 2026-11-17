/**
 * Animations de l'accueil : rideau metallique, titres decoupes (SplitText),
 * scene 3D pilotee au defilement, rounds en defilement horizontal (desktop),
 * metiers du garage, galerie en parallaxe, compte a rebours.
 * Mouvement reduit : tout est affiche sans animation ni 3D.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import './hero-video.js';

gsap.registerPlugin(ScrollTrigger, SplitText);

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
const root = document.documentElement;

// ---------------------------------------------------------------- Compte a rebours
const cd = document.querySelector('[data-countdown]');
if (cd) {
  const target = Date.parse(cd.dataset.countdown);
  const el = (k) => cd.querySelector(`[data-cd="${k}"]`);
  const tick = () => {
    const ms = Math.max(0, target - Date.now());
    const s = Math.floor(ms / 1000);
    el('d').textContent = String(Math.floor(s / 86400));
    el('h').textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
    el('m').textContent = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    el('s').textContent = String(s % 60).padStart(2, '0');
  };
  tick();
  setInterval(tick, 1000);
}

// ---------------------------------------------------------------- Metiers du garage
const tradeImgs = document.querySelectorAll('[data-trade-img]');
document.querySelectorAll('[data-trade]').forEach((li) => {
  const show = () => {
    tradeImgs.forEach((p) => p.classList.toggle('on', p.dataset.tradeImg === li.dataset.trade));
    document.querySelectorAll('[data-trade]').forEach((x) => x.classList.toggle('on', x === li));
  };
  li.addEventListener('mouseenter', show);
  li.addEventListener('focus', show);
  li.addEventListener('click', show);
});

if (reduce) {
  root.classList.add('reduced');
  document.querySelector('.shutter')?.remove();
} else {
  run();
}

async function run() {
  // Defilement doux sur desktop uniquement.
  if (desktop) {
    const { default: Lenis } = await import('lenis');
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((a) =>
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id.length > 1 && document.querySelector(id)) {
          e.preventDefault();
          lenis.scrollTo(id, { offset: -60 });
        }
      })
    );
  }

  // Rideau metallique : les lames remontent, puis le titre arrive.
  const shutter = document.querySelector('.shutter');
  // Filet de securite : onglet en arriere-plan (rAF bride) ou script lent,
  // le rideau ne doit jamais masquer la page.
  setTimeout(() => shutter && (shutter.style.display = 'none'), 3500);
  const intro = gsap.timeline({ defaults: { ease: 'power4.inOut' } });
  if (shutter) {
    intro
      .from('.shutter-bars i', { xPercent: -120, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' })
      .to('.shutter-bars', { opacity: 0, duration: 0.2 }, '+=0.15')
      .to('.shutter span', { yPercent: -100, stagger: { each: 0.035, from: 'end' }, duration: 0.7 }, '<')
      .set(shutter, { display: 'none' });
  }
  const heroSplit = SplitText.create('.hero-title', { type: 'words,chars', mask: 'chars', wordsClass: 'w' });
  intro
    .from(heroSplit.chars, { yPercent: 110, rotate: 6, stagger: 0.025, duration: 0.9, ease: 'power4.out' }, shutter ? '-=0.35' : 0)
    .from('.hero [data-fade], .hero-logos', { y: 24, opacity: 0, stagger: 0.08, duration: 0.7, ease: 'power3.out' }, '-=0.6');

  // Hero : le media recule et s'assombrit en sortant.
  gsap.to('.hero-media', { scale: 1.12, yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-content', { yPercent: -25, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'center center', end: 'bottom top', scrub: true } });

  // Titres geants decoupes, reveles au defilement (facon Payana).
  document.querySelectorAll('[data-split-scroll]').forEach((el) => {
    const split = SplitText.create(el, { type: 'words,chars', mask: 'chars', wordsClass: 'w' });
    gsap.from(split.chars, {
      yPercent: 115,
      stagger: 0.02,
      duration: 1,
      ease: 'power4.out',
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  gsap.utils.toArray('[data-fade]').forEach((el) => {
    if (el.closest('.hero')) return;
    gsap.from(el, { y: 40, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
  });

  // Images : ouverture en volet + parallaxe.
  gsap.utils.toArray('.reveal-img').forEach((fig) => {
    gsap.fromTo(fig, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'power4.inOut', scrollTrigger: { trigger: fig, start: 'top 80%' } });
    const speed = Number(fig.dataset.parallax || 0);
    if (speed) gsap.to(fig.querySelector('img'), { yPercent: speed, ease: 'none', scrollTrigger: { trigger: fig, scrub: true } });
  });

  // Rounds : defilement horizontal epingle sur desktop, cartes empilees sur mobile.
  const track = document.querySelector('.rounds-track');
  if (track) {
    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px)', () => {
      const dist = () => track.scrollWidth - window.innerWidth;
      const tween = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: { trigger: '.rounds-h', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true },
      });
      gsap.utils.toArray('.round-panel').forEach((p) => {
        gsap.from(p.querySelector('.round-big'), { xPercent: 40, opacity: 0, ease: 'none', scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left right', end: 'center center', scrub: true } });
        gsap.fromTo(p.querySelector('.round-bg img'), { xPercent: -8 }, { xPercent: 8, ease: 'none', scrollTrigger: { trigger: p, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
    });
    mm.add('(max-width: 899px)', () => {
      gsap.utils.toArray('.round-panel').forEach((p) => {
        gsap.from(p, { y: 60, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: p, start: 'top 85%' } });
      });
    });
  }

  // Galerie : rail qui glisse au defilement.
  const rail = document.querySelector('[data-rail]');
  if (rail) {
    gsap.fromTo(rail, { x: () => window.innerWidth * 0.1 }, { x: () => -(rail.scrollWidth - window.innerWidth * 0.9), ease: 'none', scrollTrigger: { trigger: '.gallery', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
  }

  setupScene();
  window.addEventListener('load', () => ScrollTrigger.refresh());
}

// ---------------------------------------------------------------- Scene 3D
function webglOk() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}

function setupScene() {
  const section = document.getElementById('scene');
  const canvas = section?.querySelector('.scene-canvas');
  if (!section || !canvas) return;
  const steps = section.querySelectorAll('.scene-step');
  const bar = section.querySelector('.scene-progress i');
  const saveData = navigator.connection?.saveData;
  let scene = null;
  let progress = 0;

  const showStep = (p) => {
    const idx = Math.min(steps.length - 1, Math.floor(p * steps.length * 0.999));
    steps.forEach((s, i) => s.classList.toggle('on', i === idx));
    if (bar) bar.style.transform = `scaleX(${p})`;
  };

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (st) => {
      progress = st.progress;
      scene?.setProgress(progress);
      showStep(progress);
    },
  });
  showStep(0);

  if (!webglOk() || saveData) {
    section.classList.add('no-webgl');
    return;
  }

  // Chargement de three.js seulement a l'approche de la section.
  let started = false;
  const io = new IntersectionObserver(
    async ([e]) => {
      if (e.isIntersecting && !started) {
        started = true;
        const { createScene } = await import('./scene3d.js');
        scene = await createScene(canvas, { mobile: !desktop });
        scene.setProgress(progress);
        section.classList.add('has-webgl');
      }
      // Un seul element anime lourd a la fois : la video du hero est en pause
      // quand la scene tourne (IntersectionObserver de hero-video.js).
      scene?.setVisible(e.isIntersecting);
    },
    { rootMargin: '50% 0px 50% 0px' }
  );
  io.observe(section);
}
