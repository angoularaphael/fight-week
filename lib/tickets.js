/**
 * QR des billets : FF<kid>.<billet>.<jour>.<signature>
 * signature = HMAC-SHA-256(TICKET_HMAC_SECRET, "billet|jour"), tronquee a
 * 128 bits, base64url. Cle dediee et versionnee (TICKET_HMAC_KID) : la cle
 * precedente reste acceptee via TICKET_HMAC_SECRET_PREVIOUS pendant la rotation.
 */
import { env, secret } from './env.js';
import { hmac, safeEqual } from './crypto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^(ven|sam|dim)$/;

function keys() {
  const list = [{ kid: env('TICKET_HMAC_KID', '1'), key: secret('TICKET_HMAC_SECRET') }];
  const prev = env('TICKET_HMAC_SECRET_PREVIOUS');
  const prevKid = env('TICKET_HMAC_KID_PREVIOUS');
  if (prev && prevKid) list.push({ kid: prevKid, key: prev });
  return list;
}

function sign(key, ticketId, day) {
  return hmac(key, `${ticketId}|${day}`, 'base64url').slice(0, 22);
}

export function ticketCode(ticketId, day) {
  const { kid, key } = keys()[0];
  return `FF${kid}.${ticketId}.${day}.${sign(key, ticketId, day)}`;
}

/** Renvoie { ticketId, day } si le code est authentique, sinon null. */
export function parseTicketCode(code) {
  const m = String(code || '').trim().match(/^FF([0-9]{1,3})\.([0-9a-f-]{36})\.([a-z]{3})\.([A-Za-z0-9_-]{22})$/);
  if (!m) return null;
  const [, kid, ticketId, day, sig] = m;
  if (!UUID.test(ticketId) || !DAY.test(day)) return null;
  const k = keys().find((x) => x.kid === kid);
  if (!k) return null;
  if (!safeEqual(sig, sign(k.key, ticketId, day))) return null;
  return { ticketId: ticketId.toLowerCase(), day, kid };
}

/** Jour courant a Paris, au format des ids (ven / sam / dim) ou null. */
export function todayDayId(now = new Date(), days) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
  return days.find((d) => d.date === ymd)?.id || null;
}
