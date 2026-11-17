import { getDb } from '../../lib/db.js';
import { env } from '../../lib/env.js';
import { safeEqual } from '../../lib/crypto.js';
import { header, json, route } from '../../lib/http.js';
import { confirmWithProvider, deliverTickets } from '../../lib/orders.js';

/**
 * Toutes les 10 min (Vercel Cron, Authorization: Bearer CRON_SECRET) :
 * relit les commandes en attente chez le prestataire (webhook perdu) et
 * envoie les billets des commandes qui passent a payees.
 */
export default route(['GET'], async (req, res) => {
  const expected = env('CRON_SECRET');
  if (!expected || !safeEqual(header(req, 'authorization'), `Bearer ${expected}`)) {
    return json(res, 401, { ok: false });
  }
  const db = getDb();
  const pending = await db.listPendingOrders({ olderThanSec: 120, limit: 40 });
  let paid = 0;
  for (const o of pending) {
    try {
      if (await confirmWithProvider(db, o)) {
        paid += 1;
        await db.audit('order.confirmed', o.ref, { via: 'reconcile' });
        await deliverTickets(db, o.id);
      }
    } catch (err) {
      console.error('[reconcile]', o.ref, err.message);
    }
  }
  const expired = await db.expireOrders();
  return json(res, 200, { ok: true, checked: pending.length, paid, expired });
});
