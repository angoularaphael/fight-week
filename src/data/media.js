/**
 * Medias generes par scripts/media.mjs (npm run media).
 * - rendu-* : images 3D generees depuis la scene du site (voiture concept,
 *   ring, barres MOTEKA), rendues par scripts/render-3d.mjs.
 * - gala-* : images extraites du film du gala Boxing Center 2023.
 * - moteka-* : visuels du site MOTEKA.
 * Tout est etalonne rouge et noir avec la meme recette.
 */
export const HERO_MEDIA = {
  poster: '/media/hero-16x9.avif',
  posterJpg: '/media/hero-16x9.jpg',
  posterMobile: '/media/hero-9x16.avif',
  video: { av1: '/media/hero-16x9.av1.mp4', h264: '/media/hero-16x9.h264.mp4' },
  videoMobile: { av1: '/media/hero-9x16.av1.mp4', h264: '/media/hero-9x16.h264.mp4' },
};

/** Image etalonnee : srcset 800 / 1600. */
export const img = (name) => ({
  src: `/media/${name}-1600.webp`,
  srcset: `/media/${name}-800.webp 800w, /media/${name}-1600.webp 1600w`,
  avif: `/media/${name}-1600.avif`,
});

export const ROUND_IMAGES = {
  ven: 'boxe-ring-projecteurs-action',
  sam: 'boxe-combat-violet',
  dim: 'rendu-ring-face',
};

export const SCENE_FALLBACK = 'rendu-garage-large';

export const MANIFESTO_IMAGES = {
  big: { name: 'boxe-combat-rideau-rouge', alt: 'Échange devant un rideau rouge de scène' },
  small: { name: 'boxe-gants-rouges-ombre', alt: "Gants rouges en garde, sortant de l'ombre" },
};

/** Image associee a chaque metier (meme ordre que GARAGE_TRADES). */
export const TRADE_IMAGES = [
  'moteka-voiture-pont',
  'moteka-atelier',
  'moteka-pluie',
  'moteka-huile',
  'moteka-jante',
  'moteka-lavage',
  'moteka-pieces',
  'moteka-garage-facade',
];

export const GALLERY = [
  { name: 'boxe-coin-rouge-crochet', alt: 'Crochet décoché dans le coin rouge, gants levés' },
  { name: 'rendu-barres', alt: 'Rendu 3D : les trois barres MOTEKA en relief' },
  { name: 'boxe-ring-scene-arena', alt: "Ring surélevé sous les projecteurs, l'arbitre entre les deux boxeurs" },
  { name: 'boxe-gant-noir-blanc', alt: 'Gant noir et buste en noir et blanc, en gros plan' },
  { name: 'rendu-voiture-profil', alt: 'Rendu 3D : voiture concept de profil devant les cordes' },
  { name: 'boxe-echange-cordes', alt: 'Échange de coups contre les cordes' },
  { name: 'boxe-vainqueur-projecteurs', alt: 'Bras levé du vainqueur sous les faisceaux blancs' },
  { name: 'boxe-echange-sombre', alt: 'Deux boxeurs au corps à corps, dans le noir' },
  { name: 'rendu-poteau', alt: 'Rendu 3D : coin du ring et cordes rouges' },
  { name: 'boxe-coup-droit-ring', alt: 'Direct du droit qui touche, devant les drapeaux' },
  { name: 'boxe-duel-ring-sombre', alt: 'Duel sous la lumière, sur un ring plongé dans la pénombre' },
];
