/**
 * Logique de commande : creation (PoW + debit + prix serveur + reservation
 * atomique), confirmation (id prestataire stocke uniquement), livraison des
 * billets. Les API ne font qu'appeler ces fonctions.
 */
import QRCode from 'qrcode';
import { isLive, publicUrl, salesOpen } from './env.js';
import { RESERVATION_MINUTES, SITE, getDay, priceOrder } from './event.js';
import { ipHash, orderRef, randomToken, safeEqual, tokenHash } from './crypto.js';
import { clientIp, httpError } from './http.js';
import { sendTicketsMail } from './mail.js';
import { capturePaypalIfApproved, createPaypalOrder, isPaypalEnabled, paypalPaidFor } from './paypal.js';
import { createPayplugPayment, isPayplugEnabled, isPayplugPaid, payplugMatches, payplugPaymentUrl, retrievePayplugPayment } from './payplug.js';
import { enforceRate } from './ratelimit.js';
import { verifyPow } from './pow.js';
import { ticketCode } from './tickets.js';

const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]{1,190}\.[a-z]{2,24}$/i;

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, max);
}

export function validateBuyer(body) {
  const fail = (m) => httpError(400, m, 'validation');
  const email = clean(body?.email, 254).toLowerCase();
  const first_name = clean(body?.first_name, 60);
  const last_name = clean(body?.last_name, 60);
  const phone = clean(body?.phone, 20).replace(/[^0-9+ ]/g, '');
  if (!EMAIL.test(email)) throw fail('Adresse e-mail invalide.');
  if (first_name.length < 1 || last_name.length < 1) throw fail('Nom et prénom obligatoires.');
  if (body?.accept_cgv !== true) throw fail("Merci d'accepter les conditions de vente.");
  return { email, first_name, last_name, phone };
}

export function availableProviders() {
  const list = [];
  if (isPayplugEnabled()) list.push({ id: 'payplug', label: 'Carte bancaire' });
  if (isPaypalEnabled()) list.push({ id: 'paypal', label: 'PayPal' });
  return list;
}

function description(order) {
  const day = getDay(order.day);
  return `${SITE.name} - ${day.label} - ${order.quantity} billet(s)`;
}

/** POST /api/checkout */
export async function createCheckout(db, req, body) {
  if (!salesOpen()) throw httpError(409, "La vente n'est pas encore ouverte.", 'not_on_sale');
  await enforceRate(db, req, 'checkout', { email: body?.email });
  await verifyPow(db, body?.pow, 'checkout');
  const buyer = validateBuyer(body);
  const priced = priceOrder({ day: body?.day, items: body?.items });

  let provider = 'free';
  if (priced.amount_cents > 0) {
    provider = String(body?.provider || '');
    if (!availableProviders().some((p) => p.id === provider)) throw httpError(400, 'Moyen de paiement indisponible.', 'validation');
  }

  const token = randomToken(32);
  const order = await db.reserveOrder({
    ref: orderRef(),
    token_hash: tokenHash(token),
    ...buyer,
    day: priced.day,
    items: priced.items,
    quantity: priced.quantity,
    amount_cents: priced.amount_cents,
    provider,
    live: isLive(),
    minutes: RESERVATION_MINUTES,
    ip_hash: ipHash(clientIp(req)),
  });

  const base = publicUrl();
  const returnUrl = `${base}/commande?ref=${encodeURIComponent(order.ref)}`;
  const cancelUrl = `${returnUrl}&annule=1`;
  let redirect = returnUrl;

  if (provider === 'free') {
    await db.setProviderId(order.id, order.id);
    order.provider_id = order.id;
    await db.markPaid(order.id, { provider: 'free', provider_id: order.id, amount_cents: 0, currency: 'EUR' });
  } else if (provider === 'payplug') {
    const payment = await createPayplugPayment({ order, baseUrl: base, returnUrl, cancelUrl, description: description(order) });
    await db.setProviderId(order.id, payment.id);
    redirect = payplugPaymentUrl(payment);
  } else if (provider === 'paypal') {
    const pp = await createPaypalOrder({ order, returnUrl, cancelUrl, description: description(order) });
    await db.setProviderId(order.id, pp.id);
    redirect = pp.approve_url;
  }
  if (!redirect) throw httpError(502, "Le prestataire de paiement n'a pas répondu, réessayez.", 'psp');
  await db.audit('checkout.created', order.ref, { provider, amount: order.amount_cents });
  return { order, token, redirect };
}

/** Commande par reference + jeton (comparaison en temps constant). */
export async function orderByToken(db, ref, token) {
  const r = clean(ref, 20);
  const t = String(token || '');
  if (!/^FF-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(r) || t.length < 40 || t.length > 60) return null;
  const order = await db.getOrderByRef(r);
  if (!order) {
    safeEqual(tokenHash(t), tokenHash('x'));
    return null;
  }
  return safeEqual(order.token_hash, tokenHash(t)) ? order : null;
}

/**
 * Relit le paiement chez le prestataire avec l'id STOCKE, verifie le
 * rattachement (commande, montant, devise, mode) puis passe a paye.
 * Renvoie true si la commande vient de passer a paye.
 */
export async function confirmWithProvider(db, order, deps = {}) {
  if (!order || order.status === 'paid' || !order.provider_id) return false;
  if (order.provider === 'payplug') {
    const payment = await (deps.retrievePayplug || retrievePayplugPayment)(order.provider_id);
    if (!payplugMatches(payment, order) || !isPayplugPaid(payment)) return false;
  } else if (order.provider === 'paypal') {
    const pp = await (deps.capturePaypal || capturePaypalIfApproved)(order.provider_id);
    if (!paypalPaidFor(pp, order)) return false;
  } else {
    return false;
  }
  const changed = await db.markPaid(order.id, {
    provider: order.provider,
    provider_id: order.provider_id,
    amount_cents: order.amount_cents,
    currency: order.currency || 'EUR',
  });
  return changed === true;
}

/** Envoie les billets (une fois). A appeler hors du chemin critique (waitUntil). */
export async function deliverTickets(db, orderId, { force = false } = {}) {
  const order = await db.getOrder(orderId);
  if (!order || order.status !== 'paid') return false;
  if (order.mail_sent_at && !force) return false;
  const tickets = await db.getTickets(order.id);
  if (!tickets.length) return false;
  await sendTicketsMail(order, tickets);
  await db.setMailSent(order.id);
  await db.audit('mail.tickets', order.ref, { count: tickets.length, force });
  return true;
}

/** Vue publique d'une commande (jamais le hash du jeton ni l'IP). */
export async function publicOrder(db, order, { withCodes = false } = {}) {
  const day = getDay(order.day);
  const view = {
    ref: order.ref,
    status: order.status,
    day: order.day,
    day_label: day?.label,
    items: order.items,
    quantity: order.quantity,
    amount_cents: order.amount_cents,
    first_name: order.first_name,
    reserved_until: order.reserved_until,
  };
  if (withCodes && order.status === 'paid') {
    const tickets = await db.getTickets(order.id);
    view.tickets = await Promise.all(
      tickets.map(async (t) => ({
        seq: t.seq,
        tariff: t.tariff,
        used: Boolean(t.used_at),
        qr: await QRCode.toDataURL(ticketCode(t.id, t.day), { margin: 2, width: 360, errorCorrectionLevel: 'M' }),
      }))
    );
  }
  return view;
}
