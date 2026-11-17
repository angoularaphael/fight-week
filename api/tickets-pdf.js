import { getDb } from '../lib/db.js';
import { httpError, readBody, route } from '../lib/http.js';
import { orderByToken } from '../lib/orders.js';
import { enforceRate } from '../lib/ratelimit.js';
import { buildTicketsPdf } from '../lib/ticket-render.js';

/** PDF genere a la volee (aucun stockage), en no-store. */
export default route(['POST'], async (req, res) => {
  const db = getDb();
  await enforceRate(db, req, 'order');
  const body = await readBody(req);
  const order = await orderByToken(db, body.ref, body.token);
  if (!order || order.status !== 'paid') throw httpError(404, 'Commande introuvable.', 'not_found');
  const pdf = await buildTicketsPdf(order, await db.getTickets(order.id));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="billets-${order.ref}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(pdf);
});
