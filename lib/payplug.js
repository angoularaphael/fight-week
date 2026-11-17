/** PayPlug, compte Boxing Center. Reprise de stage-boxeur sans Scalapay. */
import { paymentVar, isLive } from './env.js';

const API_BASE = 'https://api.payplug.com/v1';
const API_VERSION = '2019-08-06';

export function isPayplugEnabled() {
  return Boolean(paymentVar('PAYPLUG_SECRET_KEY'));
}

async function request(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const key = paymentVar('PAYPLUG_SECRET_KEY');
  if (!key) throw new Error('PAYPLUG_SECRET_KEY manquante');
  const res = await fetchImpl(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'PayPlug-Version': API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const err = new Error(data.message || `PayPlug HTTP ${res.status}`);
    err.status = res.status >= 500 ? 502 : 500;
    err.provider_status = res.status;
    throw err;
  }
  return data;
}

export async function createPayplugPayment({ order, baseUrl, returnUrl, cancelUrl, description }) {
  const billing = {
    first_name: order.first_name,
    last_name: order.last_name,
    email: order.email,
    address1: '14 rue Seveso',
    postcode: '31150',
    city: 'Fenouillet',
    country: 'FR',
    language: 'fr',
  };
  return request('/payments', {
    method: 'POST',
    body: {
      amount: order.amount_cents,
      currency: 'EUR',
      billing,
      shipping: { ...billing, delivery_type: 'BILLING' },
      description: String(description).slice(0, 80),
      metadata: { order_id: order.id, ref: order.ref, product: 'gala-fight-and-furious' },
      notification_url: `${baseUrl}/api/webhooks/payplug`,
      hosted_payment: { return_url: returnUrl, cancel_url: cancelUrl },
    },
  });
}

export function retrievePayplugPayment(id, opts = {}) {
  return request(`/payments/${encodeURIComponent(id)}`, opts);
}

export function payplugPaymentUrl(payment) {
  return payment?.hosted_payment?.payment_url || null;
}

export function isPayplugPaid(payment) {
  return Boolean(payment && payment.is_paid === true && !payment.failure && !payment.is_refunded);
}

/** Le paiement relu appartient-il a cette commande, au bon montant, dans le bon mode ? */
export function payplugMatches(payment, order) {
  if (!payment || !order) return false;
  if (String(payment.id) !== String(order.provider_id || '')) return false;
  if (String(payment.metadata?.order_id || '') !== String(order.id)) return false;
  if (Number(payment.amount) !== Number(order.amount_cents)) return false;
  if (String(payment.currency || '').toUpperCase() !== 'EUR') return false;
  if (Boolean(payment.is_live) !== Boolean(order.live) || Boolean(payment.is_live) !== isLive()) return false;
  return true;
}
