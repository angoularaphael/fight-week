import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { secret } from './env.js';

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function sha256hex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function hmac(key, value, encoding = 'base64url') {
  return createHmac('sha256', key).update(String(value)).digest(encoding);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  if (x.length !== y.length) {
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

/** Jeton de commande : on ne stocke que son empreinte. */
export function tokenHash(token) {
  return sha256hex(`gala-order|${token}`);
}

/** IP hachee (sel secret) : jamais d'IP en clair en base. */
export function ipHash(ip) {
  return hmac(secret('RATE_SALT'), `ip|${ip}`, 'hex').slice(0, 32);
}

export function emailHash(email) {
  return hmac(secret('RATE_SALT'), `mail|${String(email).trim().toLowerCase()}`, 'hex').slice(0, 32);
}

/** Reference courte lisible, sans caracteres ambigus. */
export function orderRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `FF-${s.slice(0, 4)}-${s.slice(4)}`;
}
