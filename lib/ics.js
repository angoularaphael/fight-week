import { SITE, VENUE, dayEndIso, dayStartIso, getDay } from './event.js';

function stamp(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Fichier ICS pour le jour de la commande. */
export function buildOrderIcs(order) {
  const day = getDay(order.day);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Boxing Center//Fight and Furious//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${order.id}@gala.boxingcenter.fr`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(dayStartIso(day))}`,
    `DTEND:${stamp(dayEndIso(day))}`,
    `SUMMARY:${esc(`${SITE.name} - Round ${day.round} : ${day.title}`)}`,
    `LOCATION:${esc(`${VENUE.name}, ${VENUE.street}, ${VENUE.postalCode} ${VENUE.city}`)}`,
    `DESCRIPTION:${esc(`Commande ${order.ref}. Ouverture des portes ${day.doors}. Vos billets QR sont joints au mail.`)}`,
    `URL:${SITE.url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT3H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(`${SITE.name} aujourd'hui`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
