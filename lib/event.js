/**
 * Source unique de verite de l'evenement : utilisee par les pages Astro
 * (affichage) ET par l'API (prix, jauges). Le client n'envoie que le jour,
 * le tarif et la quantite ; le prix est toujours recalcule ici cote serveur.
 *
 * Prix confirmes : 15 EUR vendredi, 10 EUR samedi, 5 EUR dimanche.
 * A CONFIRMER : jauges, horaires, pass 3 jours.
 */

export const SITE = {
  name: 'Fight and Furious',
  url: 'https://gala.boxingcenter.fr',
  tagline: 'Trois rounds. Un garage.',
  description:
    "Fight and Furious, gala de boxe Boxing Center x MOTEKA à Fenouillet : 3 jours pour l'inauguration du garage, du 11 au 13 décembre 2026.",
  organizer: 'Boxing Center',
  partner: 'MOTEKA',
  contactEmail: 'boxingcenter31@gmail.com',
};

export const VENUE = {
  name: 'Garage MOTEKA',
  street: '14 rue Seveso',
  postalCode: '31150',
  city: 'Fenouillet',
  region: 'Occitanie',
  country: 'FR',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=14+rue+Seveso+31150+Fenouillet',
};

export const PRICES_CONFIRMED = true;

export const MAX_TICKETS_PER_ORDER = 6;
export const RESERVATION_MINUTES = 15;
/** On ne vend que 97 % de la jauge : 3 % de marge (paiements tardifs, invites). */
export const CAPACITY_MARGIN = 0.03;

/** Jours = rounds. Les ids sont aussi ceux de la table gala_days. */
export const DAYS = [
  {
    id: 'ven',
    round: 1,
    date: '2026-12-11',
    weekday: 'Vendredi',
    label: 'Vendredi 11 décembre',
    title: 'Gala amateur élites',
    summary: "Les meilleurs amateurs de la région montent sur le ring installé au milieu de l'atelier.",
    doors: '19:00',
    start: '19:30',
    end: '23:30',
    capacity: 300,
    theme: 'dark',
    tariffs: [{ id: 'entree', label: 'Entrée', price_cents: 1500 }],
  },
  {
    id: 'sam',
    round: 2,
    date: '2026-12-12',
    weekday: 'Samedi',
    label: 'Samedi 12 décembre',
    title: 'Boxe loisirs',
    summary: "Les adhérents loisirs des salles Boxing Center s'affrontent en assauts sans KO.",
    doors: '14:00',
    start: '14:30',
    end: '19:00',
    capacity: 300,
    theme: 'dark',
    tariffs: [{ id: 'entree', label: 'Entrée', price_cents: 1000 }],
  },
  {
    id: 'dim',
    round: 3,
    date: '2026-12-13',
    weekday: 'Dimanche',
    label: 'Dimanche 13 décembre',
    title: 'Boxe éducative',
    summary: 'Les jeunes boxeurs découvrent la compétition, en toute sécurité et sans frappe appuyée.',
    doors: '10:00',
    start: '10:30',
    end: '17:00',
    capacity: 300,
    theme: 'light',
    tariffs: [{ id: 'entree', label: 'Entrée', price_cents: 500 }],
  },
];

export const GARAGE_TRADES = [
  { name: 'Mécanique', text: 'Distribution, embrayage, freinage, diagnostic électronique, moteur.' },
  { name: 'Dépannage', text: "Prise en charge du véhicule jusqu'à l'atelier de Fenouillet." },
  { name: 'Pare-brise', text: 'Impact, remplacement, calibrage caméra ADAS.' },
  { name: 'Révision et entretien', text: 'Vidange, filtres, climatisation, préparation au contrôle technique.' },
  { name: 'Pneumatique', text: 'Montage, équilibrage, parallélisme, stockage saisonnier.' },
  { name: 'Nettoyage', text: 'Intérieur, extérieur, rénovation des optiques.' },
  { name: 'Pièces auto', text: "Neuves ou d'occasion, d'origine ou équivalentes, toutes marques." },
  { name: 'Achat-vente', text: "Auto et moto d'occasion garanties, reprise, recherche personnalisée." },
];

export function getDay(id) {
  return DAYS.find((d) => d.id === id) || null;
}

export function getTariff(day, tariffId) {
  const d = typeof day === 'string' ? getDay(day) : day;
  return d?.tariffs.find((t) => t.id === tariffId) || null;
}

export function sellableCapacity(day) {
  const d = typeof day === 'string' ? getDay(day) : day;
  if (!d) return 0;
  return Math.floor(d.capacity * (1 - CAPACITY_MARGIN));
}

export function formatEuros(cents) {
  if (!cents) return 'Gratuit';
  const v = cents / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')} EUR`;
}

/** Datetime ISO avec fuseau Paris (decembre = UTC+1). */
export function dayStartIso(day) {
  return `${day.date}T${day.start}:00+01:00`;
}

export function dayEndIso(day) {
  return `${day.date}T${day.end}:00+01:00`;
}

/**
 * Calcule une commande a partir de ce que le client envoie.
 * input : { day, items: [{ tariff, qty }] }
 * Leve une erreur code 'validation' si quoi que ce soit est hors bornes.
 */
export function priceOrder(input) {
  const fail = (msg) => Object.assign(new Error(msg), { code: 'validation' });
  const day = getDay(String(input?.day || ''));
  if (!day) throw fail('Jour inconnu.');
  const raw = Array.isArray(input?.items) ? input.items : [];
  if (!raw.length || raw.length > day.tariffs.length) throw fail('Panier invalide.');
  const seen = new Set();
  const items = [];
  let quantity = 0;
  let amount = 0;
  for (const it of raw) {
    const tariff = getTariff(day, String(it?.tariff || ''));
    if (!tariff) throw fail('Tarif inconnu.');
    if (seen.has(tariff.id)) throw fail('Tarif en double.');
    seen.add(tariff.id);
    const qty = Number(it?.qty);
    if (!Number.isInteger(qty) || qty < 0 || qty > MAX_TICKETS_PER_ORDER) throw fail('Quantité invalide.');
    if (qty === 0) continue;
    quantity += qty;
    amount += qty * tariff.price_cents;
    items.push({ tariff: tariff.id, label: tariff.label, qty, unit_cents: tariff.price_cents });
  }
  if (quantity < 1) throw fail('Choisissez au moins un billet.');
  if (quantity > MAX_TICKETS_PER_ORDER) throw fail(`${MAX_TICKETS_PER_ORDER} billets maximum par commande.`);
  return { day: day.id, items, quantity, amount_cents: amount, currency: 'EUR' };
}
