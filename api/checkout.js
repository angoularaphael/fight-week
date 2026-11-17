import { after } from '../lib/after.js';
import { getDb } from '../lib/db.js';
import { json, readBody, route } from '../lib/http.js';
import { createCheckout, deliverTickets } from '../lib/orders.js';

export default route(['POST'], async (req, res) => {
  const db = getDb();
  const body = await readBody(req);
  const { order, token, redirect } = await createCheckout(db, req, body);
  if (order.provider === 'free') after(() => deliverTickets(db, order.id), 'mail free');
  return json(res, 200, { ok: true, ref: order.ref, token, redirect, free: order.provider === 'free' });
});
