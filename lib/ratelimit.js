/**
 * Debit par IP hachee et par e-mail hache, compteurs en base (fenetre fixe).
 * Les limites sont volontairement larges pour un public reel derriere une
 * meme box 4G, et serrees sur les actions sensibles (login, renvoi).
 */
import { emailHash, ipHash } from './crypto.js';
import { clientIp, httpError } from './http.js';

export const LIMITS = {
  pow: { window: 600, ip: 60 },
  checkout: { window: 600, ip: 20, email: 6 },
  confirm: { window: 600, ip: 60 },
  order: { window: 600, ip: 120 },
  resend: { window: 3600, ip: 10, email: 3 },
  waitlist: { window: 3600, ip: 10, email: 3 },
  login: { window: 900, ip: 10 },
  scan: { window: 60, ip: 240 },
};

export async function enforceRate(db, req, action, { email } = {}) {
  const rule = LIMITS[action];
  if (!rule) throw new Error(`Limite inconnue: ${action}`);
  const checks = [];
  if (rule.ip) checks.push(db.rateHit(`${action}:ip:${ipHash(clientIp(req))}`, rule.window, rule.ip));
  if (rule.email && email) checks.push(db.rateHit(`${action}:mail:${emailHash(email)}`, rule.window, rule.email));
  const results = await Promise.all(checks);
  if (results.some((ok) => ok === false)) {
    throw httpError(429, 'Trop de tentatives. Patientez quelques minutes puis reessayez.', 'rate_limited');
  }
}
