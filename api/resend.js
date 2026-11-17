import { after } from '../lib/after.js';
import { getDb } from '../lib/db.js';
import { json, readBody, route } from '../lib/http.js';
import { deliverTickets } from '../lib/orders.js';
import { verifyPow } from '../lib/pow.js';
import { enforceRate } from '../lib/ratelimit.js';

/**
 * Renvoi des billets a l'adresse de la commande. Reponse identique que
 * l'adresse ait commande ou non (pas d'enumeration).
 */
export default route(['POST'], async (req, res) => {
  const db = getDb();
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  await enforceRate(db, req, 'resend', { email });
  await verifyPow(db, body.pow, 'resend');
  if (email.includes('@')) {
    after(async () => {
      const orders = await db.listOrdersByEmail(email);
      for (const o of orders.slice(0, 3)) await deliverTickets(db, o.id, { force: true });
    }, 'mail resend');
  }
  return json(res, 200, { ok: true, message: "Si une commande existe pour cette adresse, les billets viennent d'être renvoyés." });
});
