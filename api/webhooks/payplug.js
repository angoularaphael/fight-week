import { after } from '../../lib/after.js';
import { getDb } from '../../lib/db.js';
import { json, readBody, route } from '../../lib/http.js';
import { deliverTickets } from '../../lib/orders.js';
import { isPayplugPaid, payplugMatches, retrievePayplugPayment } from '../../lib/payplug.js';

/**
 * PayPlug ne signe pas ses notifications : le corps ne sert qu'a connaitre
 * l'id. Le paiement est RELU via l'API, puis on controle commande, montant,
 * devise et is_live avant le passage a paye (UPDATE conditionnel).
 * Erreur interne = 5xx (via route) pour que PayPlug rejoue.
 */
export async function handlePayplugNotification(db, body, deps = {}) {
  const id = String(body?.id || '');
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(id)) return { status: 200, result: 'ignored' };
  const payment = await (deps.retrieve || retrievePayplugPayment)(id);
  const orderId = String(payment?.metadata?.order_id || '');
  const order = orderId ? await db.getOrder(orderId) : null;
  if (!order) {
    await db.audit('webhook.rejected', id, { provider: 'payplug', reason: 'unknown_order' });
    return { status: 200, result: 'unknown_order' };
  }
  if (!payplugMatches(payment, order)) {
    await db.audit('webhook.rejected', order.ref, { provider: 'payplug', reason: 'mismatch', payment: id });
    return { status: 200, result: 'mismatch' };
  }
  if (!isPayplugPaid(payment)) return { status: 200, result: 'not_paid' };
  const first = await db.recordWebhook('payplug', `${id}:paid`);
  const changed = await db.markPaid(order.id, {
    provider: 'payplug',
    provider_id: id,
    amount_cents: Number(payment.amount),
    currency: payment.currency,
  });
  return { status: 200, result: changed ? 'paid' : first ? 'unchanged' : 'replay', orderId: changed ? order.id : null };
}

export default route(['POST'], async (req, res) => {
  const db = getDb();
  const body = await readBody(req);
  const out = await handlePayplugNotification(db, body);
  if (out.orderId) after(() => deliverTickets(db, out.orderId), 'mail payplug');
  return json(res, out.status, { ok: true, result: out.result });
});
