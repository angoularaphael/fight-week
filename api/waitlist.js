import { getDb } from '../lib/db.js';
import { DAYS } from '../lib/event.js';
import { httpError, json, readBody, route } from '../lib/http.js';
import { verifyPow } from '../lib/pow.js';
import { enforceRate } from '../lib/ratelimit.js';

export default route(['POST'], async (req, res) => {
  const db = getDb();
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw httpError(400, 'Adresse e-mail invalide.', 'validation');
  const day = DAYS.some((d) => d.id === body.day) ? body.day : null;
  await enforceRate(db, req, 'waitlist', { email });
  await verifyPow(db, body.pow, 'waitlist');
  await db.addWaitlist(email, day);
  return json(res, 200, { ok: true });
});
