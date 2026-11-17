/**
 * Preuve de travail (PoW) pour les routes publiques sans session.
 *
 * Defi = base64url(JSON {id, s: scope, d: difficulte, exp}) + "." + HMAC.
 * Le navigateur cherche un nonce tel que SHA-256(defi + ":" + nonce) commence
 * par d bits a zero (Web Worker, pendant la saisie). Le serveur verifie la
 * signature, l'expiration, le scope, la difficulte bornee, le hash, puis
 * consomme l'id en base (usage unique).
 */
import { createHash } from 'node:crypto';
import { env, secret } from './env.js';
import { hmac, randomToken, safeEqual } from './crypto.js';
import { httpError } from './http.js';

export const POW_TTL_SEC = 10 * 60;
export const POW_MIN_BITS = 12;
export const POW_MAX_BITS = 22;
export const POW_SCOPES = ['checkout', 'resend', 'waitlist', 'admin', 'enroll'];

export function powDifficulty(scope) {
  const base = Number(env('POW_BITS', '16'));
  const extra = scope === 'admin' ? 2 : 0;
  const d = (Number.isFinite(base) ? base : 16) + extra;
  return Math.min(POW_MAX_BITS, Math.max(POW_MIN_BITS, Math.round(d)));
}

function powKey() {
  return secret('POW_SECRET');
}

export function issueChallenge(scope, now = Date.now()) {
  if (!POW_SCOPES.includes(scope)) throw httpError(400, 'Scope PoW inconnu');
  const payload = {
    id: randomToken(16),
    s: scope,
    d: powDifficulty(scope),
    exp: Math.floor(now / 1000) + POW_TTL_SEC,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const challenge = `${body}.${hmac(powKey(), `pow|${body}`)}`;
  return { challenge, difficulty: payload.d, expires_at: payload.exp };
}

export function leadingZeroBits(buf) {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

export function powHash(challenge, nonce) {
  return createHash('sha256').update(`${challenge}:${nonce}`).digest();
}

/** Verification sans effet de bord. Renvoie le payload ou leve 403. */
export function checkChallenge(pow, scope, now = Date.now()) {
  const fail = (why) => httpError(403, 'Verification anti-robot invalide, rechargez la page.', `pow_${why}`);
  const challenge = String(pow?.challenge || '');
  const nonce = String(pow?.nonce ?? '');
  if (!challenge || !nonce || nonce.length > 32 || challenge.length > 400) throw fail('missing');
  const [body, sig] = challenge.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(powKey(), `pow|${body}`))) throw fail('signature');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw fail('payload');
  }
  if (payload.s !== scope) throw fail('scope');
  if (!(Number(payload.exp) > Math.floor(now / 1000))) throw fail('expired');
  const d = Number(payload.d);
  if (!Number.isInteger(d) || d < POW_MIN_BITS || d > POW_MAX_BITS || d < powDifficulty(scope)) {
    throw fail('difficulty');
  }
  if (leadingZeroBits(powHash(challenge, nonce)) < d) throw fail('work');
  return payload;
}

/** Verification + consommation (usage unique) via la base. */
export async function verifyPow(db, pow, scope, now = Date.now()) {
  const payload = checkChallenge(pow, scope, now);
  const first = await db.consumePow(`${scope}:${payload.id}`, new Date(payload.exp * 1000).toISOString());
  if (!first) throw httpError(403, 'Verification anti-robot deja utilisee, rechargez la page.', 'pow_replay');
  return payload;
}

/** Resolution cote Node (tests, scripts). Le navigateur a sa propre version. */
export function solveChallenge(challenge, difficulty) {
  for (let n = 0; n < 2 ** 30; n += 1) {
    if (leadingZeroBits(powHash(challenge, String(n))) >= difficulty) return String(n);
  }
  throw new Error('PoW non resolue');
}
