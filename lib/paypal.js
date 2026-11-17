/** PayPal, compte Boxing Center uniquement (pas de compte Portet). */
import { env, isLive, onVercelProd, paymentVar } from './env.js';

function apiBase() {
  return isLive() ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export function isPaypalEnabled() {
  const id = paymentVar('PAYPAL_CLIENT_ID');
  return Boolean(id && id.length >= 60 && paymentVar('PAYPAL_CLIENT_SECRET'));
}

let cached = null;

async function accessToken(fetchImpl) {
  const key = `${isLive()}`;
  if (cached?.key === key && Date.now() < cached.exp - 30000) return cached.value;
  const id = paymentVar('PAYPAL_CLIENT_ID');
  const sec = paymentVar('PAYPAL_CLIENT_SECRET');
  if (!id || !sec) throw new Error('PAYPAL_CLIENT_ID / SECRET manquants');
  const res = await fetchImpl(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`PayPal OAuth ${res.status}`), { status: 502 });
  cached = { key, value: body.access_token, exp: Date.now() + Number(body.expires_in || 300) * 1000 };
  return cached.value;
}

async function request(path, { method = 'GET', body, fetchImpl = fetch, requestId } = {}) {
  const token = await accessToken(fetchImpl);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  const res = await fetchImpl(`${apiBase()}${path}`, {
    method,
    headers,
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
    const err = new Error(data.message || data.details?.[0]?.issue || `PayPal HTTP ${res.status}`);
    err.status = res.status >= 500 ? 502 : 500;
    err.provider_status = res.status;
    err.issue = data.details?.[0]?.issue;
    throw err;
  }
  return data;
}

export async function createPaypalOrder({ order, returnUrl, cancelUrl, description }) {
  const created = await request('/v2/checkout/orders', {
    method: 'POST',
    requestId: `gala-${order.id}`,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: order.id,
          custom_id: order.id,
          invoice_id: order.ref,
          description: String(description).slice(0, 127),
          amount: { currency_code: 'EUR', value: (order.amount_cents / 100).toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          email_address: order.email,
          experience_context: {
            brand_name: 'Boxing Center',
            locale: 'fr-FR',
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  });
  const link = (created.links || []).find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  return { id: created.id, approve_url: link?.href || null };
}

export function getPaypalOrder(id, opts = {}) {
  return request(`/v2/checkout/orders/${encodeURIComponent(id)}`, opts);
}

/** Capture si APPROVED, idempotent (PayPal-Request-Id + relecture si course). */
export async function capturePaypalIfApproved(id, opts = {}) {
  const current = await getPaypalOrder(id, opts);
  const status = String(current.status || '').toUpperCase();
  if (status === 'COMPLETED') return current;
  if (status !== 'APPROVED') return current;
  try {
    return await request(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {
      ...opts,
      method: 'POST',
      body: {},
      requestId: `gala-capture-${id}`,
    });
  } catch (err) {
    const again = await getPaypalOrder(id, opts).catch(() => null);
    if (again && String(again.status).toUpperCase() === 'COMPLETED') return again;
    throw err;
  }
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

/**
 * Ordre PayPal paye ET rattache a la commande : meme id que stocke, unique
 * purchase_unit portant notre id, capture COMPLETED au bon montant en EUR.
 * APPROVED sans capture n'est jamais considere comme paye.
 */
export function paypalPaidFor(ppOrder, order) {
  if (!ppOrder || !order) return false;
  if (String(ppOrder.id) !== String(order.provider_id || '')) return false;
  const units = ppOrder.purchase_units || [];
  if (units.length !== 1) return false;
  const u = units[0];
  if (String(u.custom_id || u.reference_id || '') !== String(order.id)) return false;
  const caps = (u.payments?.captures || []).filter((c) => String(c.status).toUpperCase() === 'COMPLETED');
  return caps.some(
    (c) =>
      cents(c.amount?.value) === Number(order.amount_cents) &&
      String(c.amount?.currency_code).toUpperCase() === 'EUR' &&
      (!c.custom_id || String(c.custom_id) === String(order.id))
  );
}

export const PAYPAL_CLOCK_SKEW_SEC = 60;

/**
 * Verification d'un webhook PayPal : en-tetes presents, horodatage signe a
 * +/- 60 s, puis verify-webhook-signature avec le PAYPAL_WEBHOOK_ID du gala.
 * Sans PAYPAL_WEBHOOK_ID en production : refus (bloquant).
 */
export async function verifyPaypalWebhook(headers, event, { fetchImpl = fetch, now = Date.now() } = {}) {
  const webhookId = paymentVar('PAYPAL_WEBHOOK_ID');
  if (!webhookId) {
    if (onVercelProd() || isLive() || env('VERCEL') === '1') return { ok: false, reason: 'PAYPAL_WEBHOOK_ID manquant' };
    return { ok: false, reason: 'PAYPAL_WEBHOOK_ID manquant (dev)' };
  }
  const h = (n) => String(headers[n] || headers[n.toLowerCase()] || '');
  const transmissionId = h('paypal-transmission-id');
  const transmissionTime = h('paypal-transmission-time');
  const certUrl = h('paypal-cert-url');
  const authAlgo = h('paypal-auth-algo');
  const sig = h('paypal-transmission-sig');
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !sig) {
    return { ok: false, reason: 'en-tetes manquants' };
  }
  const t = Date.parse(transmissionTime);
  if (!Number.isFinite(t) || Math.abs(now - t) > PAYPAL_CLOCK_SKEW_SEC * 1000) {
    return { ok: false, reason: 'horodatage hors fenetre' };
  }
  let host = '';
  try {
    host = new URL(certUrl).hostname;
  } catch {
    return { ok: false, reason: 'cert_url invalide' };
  }
  if (!/(^|\.)paypal\.com$/i.test(host)) return { ok: false, reason: 'cert_url hors paypal.com' };
  const result = await request('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    fetchImpl,
    body: {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: sig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    },
  });
  const ok = String(result.verification_status || '').toUpperCase() === 'SUCCESS';
  return ok ? { ok: true, transmissionId } : { ok: false, reason: 'signature' };
}
