import { after } from '../lib/after.js';
import { getDb } from '../lib/db.js';
import { httpError, json, readBody, route } from '../lib/http.js';
import { confirmWithProvider, deliverTickets, orderByToken, publicOrder } from '../lib/orders.js';
import { enforceRate } from '../lib/ratelimit.js';

/**
 * Retour du prestataire : on relit le paiement avec l'id STOCKE en base.
 * Rien de ce que le navigateur envoie (token PayPal, payment_id...) n'est utilise.
 */
export default route(['POST'], async (req, res) => {
  const db = getDb();
  await enforceRate(db, req, 'confirm');
  const body = await readBody(req);
  let order = await orderByToken(db, body.ref, body.token);
  if (!order) throw httpError(404, 'Commande introuvable.', 'not_found');
  if (order.status !== 'paid' && order.provider_id) {
    const changed = await confirmWithProvider(db, order);
    if (changed) {
      await db.audit('order.confirmed', order.ref, { via: 'return' });
      after(() => deliverTickets(db, order.id), 'mail confirm');
    }
    order = await db.getOrder(order.id);
  }
  return json(res, 200, { ok: true, order: await publicOrder(db, order, { withCodes: true }) });
});
