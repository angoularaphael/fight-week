import { getDb } from '../lib/db.js';
import { httpError, json, readBody, route } from '../lib/http.js';
import { orderByToken, publicOrder } from '../lib/orders.js';
import { enforceRate } from '../lib/ratelimit.js';

/** POST { ref, token } : etat de la commande et QR si payee. Jeton jamais dans l'URL. */
export default route(['POST'], async (req, res) => {
  const db = getDb();
  await enforceRate(db, req, 'order');
  const body = await readBody(req);
  const order = await orderByToken(db, body.ref, body.token);
  if (!order) throw httpError(404, 'Commande introuvable.', 'not_found');
  return json(res, 200, { ok: true, order: await publicOrder(db, order, { withCodes: true }) }, { 'Referrer-Policy': 'no-referrer' });
});
