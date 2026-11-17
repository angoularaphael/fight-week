import { DAYS, SITE, VENUE, dayEndIso, dayStartIso, sellableCapacity } from '../../lib/event.js';

export const KNOWS_ABOUT = [
  'gala de boxe',
  'gala de boxe Toulouse',
  'boxe anglaise amateur',
  'boxe amateur elites',
  'boxe loisirs',
  'boxe educative',
  'billetterie gala de boxe',
  'evenement boxe Fenouillet',
  'Boxing Center',
  'MOTEKA',
  'garage Fenouillet',
  'inauguration garage Toulouse nord',
];

export const ORG_ID = `${SITE.url}/#organisation`;

export function organizationLd() {
  return {
    '@type': 'SportsOrganization',
    '@id': ORG_ID,
    name: SITE.organizer,
    url: 'https://boxingcenter.fr',
    logo: `${SITE.url}/favicon-512.png`,
    sport: 'Boxe anglaise',
    email: SITE.contactEmail,
    knowsAbout: KNOWS_ABOUT,
    sameAs: ['https://boxingcenter.fr'],
  };
}

export function websiteLd() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE.url}/#site`,
    url: SITE.url,
    name: SITE.name,
    inLanguage: 'fr-FR',
    publisher: { '@id': ORG_ID },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/recherche?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function placeLd() {
  return {
    '@type': 'Place',
    name: VENUE.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: VENUE.street,
      postalCode: VENUE.postalCode,
      addressLocality: VENUE.city,
      addressRegion: VENUE.region,
      addressCountry: VENUE.country,
    },
  };
}

export function eventLd(day) {
  return {
    '@type': 'SportsEvent',
    '@id': `${SITE.url}/#round-${day.round}`,
    name: `${SITE.name} - ${day.title}`,
    description: `${day.summary} Round ${day.round} du gala ${SITE.name}, Boxing Center x MOTEKA, ${day.label} 2026 au garage MOTEKA de Fenouillet.`,
    startDate: dayStartIso(day),
    endDate: dayEndIso(day),
    doorTime: `${day.date}T${day.doors}:00+01:00`,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: 'Boxe anglaise',
    location: placeLd(),
    image: [`${SITE.url}/img/og-fight-and-furious.jpg`],
    organizer: { '@id': ORG_ID },
    maximumAttendeeCapacity: sellableCapacity(day),
    inLanguage: 'fr-FR',
    offers: day.tariffs.map((t) => ({
      '@type': 'Offer',
      name: t.label,
      price: (t.price_cents / 100).toFixed(2),
      priceCurrency: 'EUR',
      url: `${SITE.url}/billetterie?jour=${day.id}`,
      availability: 'https://schema.org/InStock',
      validFrom: '2026-11-21T10:00:00+01:00',
    })),
  };
}

export function homeGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationLd(), websiteLd(), ...DAYS.map(eventLd)],
  };
}

export function baseGraph(extra = []) {
  return { '@context': 'https://schema.org', '@graph': [organizationLd(), websiteLd(), ...extra] };
}
