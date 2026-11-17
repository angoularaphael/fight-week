import { DAYS, GARAGE_TRADES } from '../../lib/event.js';
import { FAQ } from './faq.js';

/** Pages publiques : sitemap + index de recherche. */
export const PAGES = [
  { path: '/', title: 'Fight and Furious, gala de boxe Boxing Center x MOTEKA', priority: '1.0', changefreq: 'daily' },
  { path: '/billetterie', title: 'Billetterie du gala', priority: '0.9', changefreq: 'daily' },
  { path: '/cgv', title: 'Conditions de vente', priority: '0.3', changefreq: 'monthly' },
  { path: '/mentions-legales', title: 'Mentions légales', priority: '0.2', changefreq: 'yearly' },
  { path: '/recherche', title: 'Recherche', priority: '0.2', changefreq: 'monthly' },
];

export function searchIndex() {
  const items = [
    ...DAYS.map((d) => ({
      title: `Round ${d.round} : ${d.title}`,
      url: `/#round-${d.round}`,
      text: `${d.label} ${d.summary} boxe gala billets`,
    })),
    ...DAYS.map((d) => ({
      title: `Billets ${d.label}`,
      url: `/billetterie?jour=${d.id}`,
      text: `${d.title} billetterie tarif ${d.tariffs.map((t) => t.label).join(' ')}`,
    })),
    ...GARAGE_TRADES.map((t) => ({ title: `Garage MOTEKA : ${t.name}`, url: '/#garage', text: t.text })),
    ...FAQ.map((f) => ({ title: f.q, url: '/#infos', text: f.a })),
    { title: 'Renvoyer mes billets', url: '/billetterie#renvoi', text: 'billets perdus renvoi e-mail' },
    { title: 'Venir au gala', url: '/#infos', text: 'adresse 14 rue Seveso Fenouillet itinéraire accès' },
    { title: 'Conditions de vente', url: '/cgv', text: 'rétractation remboursement annulation paiement' },
    { title: 'Mentions légales', url: '/mentions-legales', text: 'éditeur hébergeur données personnelles' },
  ];
  return items;
}
