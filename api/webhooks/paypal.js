import { after } from '../../lib/after.js';
import { getDb } from '../../lib/db.js';
import { json, readRawBody, route } from '../../lib/http.js';
import { deliverTickets } from '../../lib/orders.js';
import { getPaypalOrder, paypalPaidFor, verifyPaypalWebhook } from '../../lib/paypal.js';

/**
 * PayPal : signature verifiee (verify-webhook-signature, PAYPAL_WEBHOOK_ID du
 * gala), horodatage a +/- 60 s, nonce par id d'evenement, seul
 * PAYMENT.CAPTURE.COMPLETED est traite, puis l'ordre est relu via l'API.
 */
export async function handlePaypalWebhook(db, headers, event, deps = {}) {
  const verify = deps.verify || verifyPaypalWebhook;
  const v = await verify(headers, event);
  if (!v.ok) {
    await db.audit('webhook.rejected', String(event?.id || ''), { provider: 'paypal', reason: v.reason });
    return { status: 401, result: 'signature' };
  }
  if (event?.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return { status: 200, result: 'ignored' };
  const eventId = String(event.id || '');
  if (!eventId) return { status: 400, result: 'no_id' };

  const resource = event.resource || {};
  const ppOrderId = String(resource.supplementary_data?.related_ids?.order_id || '');
  const order = ppOrderId ? await db.findOrderByProvider('paypal', ppOrderId) : null;
  if (!order || String(resource.custom_id || order.id) !== order.id) {
    await db.audit('webhook.rejected', eventId, { provider: 'paypal', reason: 'unknown_order' });
    return { status: 200, result: 'unknown_order' };
  }
  const first = await db.recordWebhook('paypal', eventId);
  if (!first) return { status: 200, result: 'replay' };
  const remote = await (deps.getOrder || getPaypalOrder)(ppOrderId);
  if (!paypalPaidFor(remote, order)) {
    await db.audit('webhook.rejected', order.ref, { provider: 'paypal', reason: 'not_paid_or_mismatch' });
    return { status: 200, result: 'not_paid' };
  }
  const changed = await db.markPaid(order.id, {
    provider: 'paypal',
    provider_id: ppOrderId,
    amount_cents: order.amount_cents,
    currency: 'EUR',
  });
  return { status: 200, result: changed ? 'paid' : 'unchanged', orderId: changed ? order.id : null };
}

export default route(['POST'], async (req, res) => {
  const db = getDb();
  const raw = await readRawBody(req);
  let event = null;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(res, 400, { ok: false });
  }
  const out = await handlePaypalWebhook(db, req.headers || {}, event);
  if (out.orderId) after(() => deliverTickets(db, out.orderId), 'mail paypal');
  return json(res, out.status, { ok: out.status < 300, result: out.result });
});
