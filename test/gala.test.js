import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GALA_NO_DOTENV = '1';
process.env.GALA_SALES_OPEN = '1';
process.env.GALA_PAYMENT_MODE = 'test';
process.env.POW_BITS = '12';
process.env.PAYPLUG_TEST_SECRET_KEY = 'sk_test_dummy';
process.env.TICKET_HMAC_SECRET = 'test-ticket-secret';
delete process.env.VERCEL;
delete process.env.BREVO_API_KEY;

const { createMemoryDb } = await import('../lib/db.js');
const { priceOrder, sellableCapacity, getDay } = await import('../lib/event.js');
const { issueChallenge, solveChallenge, verifyPow, checkChallenge } = await import('../lib/pow.js');
const { createCheckout, confirmWithProvider, orderByToken } = await import('../lib/orders.js');
const { handlePayplugNotification } = await import('../api/webhooks/payplug.js');
const { handlePaypalWebhook } = await import('../api/webhooks/paypal.js');
const { verifyPaypalWebhook } = await import('../lib/paypal.js');
const { ticketCode, parseTicketCode } = await import('../lib/tickets.js');

const req = (ip = '10.0.0.1') => ({ headers: { 'x-forwarded-for': ip }, socket: {} });

function solvedPow(scope = 'checkout') {
  const { challenge, difficulty } = issueChallenge(scope);
  return { challenge, nonce: solveChallenge(challenge, difficulty) };
}

function buyer(extra = {}) {
  return {
    email: 'client@example.com',
    first_name: 'Alex',
    last_name: 'Martin',
    accept_cgv: true,
    day: 'ven',
    items: [{ tariff: 'adulte', qty: 2 }],
    provider: 'payplug',
    pow: solvedPow(),
    ...extra,
  };
}

/** Faux PayPlug : create renvoie un id, le paiement est stocke ici. */
function mockPayplugFetch(store) {
  return async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/payments') && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const id = `pay_${Math.random().toString(36).slice(2, 12)}`;
      store[id] = { id, amount: body.amount, currency: body.currency, metadata: body.metadata, is_live: false, is_paid: false };
      return new Response(JSON.stringify({ ...store[id], hosted_payment: { payment_url: `https://secure.payplug.com/pay/${id}` } }), { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };
}

async function withFetch(fn, impl) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

async function newPaidCapableOrder(db, store, extra) {
  return withFetch(() => createCheckout(db, req(), buyer(extra)), mockPayplugFetch(store));
}

// ---------------------------------------------------------------- Prix

test('prix recalcules cote serveur : le prix envoye par le client est ignore', () => {
  const p = priceOrder({ day: 'ven', items: [{ tariff: 'adulte', qty: 2, price_cents: 1 }], amount_cents: 1 });
  assert.equal(p.amount_cents, 2 * getDay('ven').tariffs[0].price_cents);
});

test('prix : tarif inconnu, quantite hors bornes, plus de 6 billets, jour inconnu refuses', () => {
  assert.throws(() => priceOrder({ day: 'ven', items: [{ tariff: 'vip', qty: 1 }] }), /Tarif/);
  assert.throws(() => priceOrder({ day: 'ven', items: [{ tariff: 'adulte', qty: -1 }] }));
  assert.throws(() => priceOrder({ day: 'ven', items: [{ tariff: 'adulte', qty: 1.5 }] }));
  assert.throws(() => priceOrder({ day: 'ven', items: [{ tariff: 'adulte', qty: 4 }, { tariff: 'reduit', qty: 3 }] }), /6 billets/);
  assert.throws(() => priceOrder({ day: 'lun', items: [{ tariff: 'adulte', qty: 1 }] }));
  assert.throws(() => priceOrder({ day: 'ven', items: [{ tariff: 'adulte', qty: 1 }, { tariff: 'adulte', qty: 1 }] }));
});

test('jauge vendable = 97 % de la capacite', () => {
  assert.equal(sellableCapacity('ven'), Math.floor(getDay('ven').capacity * 0.97));
});

// ---------------------------------------------------------------- PoW

test('PoW absente, invalide, falsifiee, mauvais scope : refusees', async () => {
  const db = createMemoryDb();
  await assert.rejects(verifyPow(db, null, 'checkout'), (e) => e.status === 403);
  const { challenge } = issueChallenge('checkout');
  await assert.rejects(verifyPow(db, { challenge, nonce: 'x' }, 'checkout'), (e) => e.code === 'pow_work' || e.code === 'pow_signature');
  const tampered = `${challenge.split('.')[0]}x.${challenge.split('.')[1]}`;
  await assert.rejects(verifyPow(db, { challenge: tampered, nonce: '1' }, 'checkout'), (e) => e.status === 403);
  await assert.rejects(verifyPow(db, solvedPow('resend'), 'checkout'), (e) => e.code === 'pow_scope');
});

test('PoW expiree : refusee', () => {
  const { challenge, difficulty } = issueChallenge('checkout', Date.now() - 11 * 60 * 1000);
  const nonce = solveChallenge(challenge, difficulty);
  assert.throws(() => checkChallenge({ challenge, nonce }, 'checkout'), (e) => e.code === 'pow_expired');
});

test('PoW rejouee : refusee a la seconde utilisation', async () => {
  const db = createMemoryDb();
  const pow = solvedPow();
  await verifyPow(db, pow, 'checkout');
  await assert.rejects(verifyPow(db, pow, 'checkout'), (e) => e.code === 'pow_replay');
});

test('checkout sans PoW : refuse, aucune place reservee', async () => {
  const db = createMemoryDb();
  await assert.rejects(createCheckout(db, req(), buyer({ pow: undefined })), (e) => e.status === 403);
  assert.equal(db.state.orders.size, 0);
});

// ---------------------------------------------------------------- Checkout / jeton

test('checkout PayPlug : commande en attente, provider_id stocke, jeton verifie en temps constant', async () => {
  const db = createMemoryDb();
  const store = {};
  const { order, token, redirect } = await newPaidCapableOrder(db, store);
  assert.match(redirect, /^https:\/\/secure\.payplug\.com\//);
  const saved = await db.getOrder(order.id);
  assert.equal(saved.status, 'pending');
  assert.ok(saved.provider_id.startsWith('pay_'));
  assert.equal(saved.amount_cents, 3000);
  assert.notEqual(saved.token_hash, token);
  assert.ok(await orderByToken(db, order.ref, token));
  assert.equal(await orderByToken(db, order.ref, `${token.slice(0, -1)}A`), null);
});

test('checkout dimanche gratuit : billets crees sans prestataire', async () => {
  const db = createMemoryDb();
  const { order } = await createCheckout(db, req(), buyer({ day: 'dim', items: [{ tariff: 'entree', qty: 3 }], provider: undefined }));
  const saved = await db.getOrder(order.id);
  assert.equal(saved.status, 'paid');
  assert.equal((await db.getTickets(order.id)).length, 3);
});

test('jauge : reservations concurrentes au-dela de la jauge, une seule passe', async () => {
  const db = createMemoryDb();
  const day = db.state.days.get('ven');
  day.sellable = 5;
  const store = {};
  const results = await withFetch(
    () =>
      Promise.allSettled([
        createCheckout(db, req('10.0.0.2'), buyer({ email: 'a@example.com', items: [{ tariff: 'adulte', qty: 3 }] })),
        createCheckout(db, req('10.0.0.3'), buyer({ email: 'b@example.com', items: [{ tariff: 'adulte', qty: 3 }] })),
      ]),
    mockPayplugFetch(store)
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'sold_out');
});

test('debit : trop de checkouts depuis la meme IP donnent 429', async () => {
  const db = createMemoryDb();
  let last = null;
  for (let i = 0; i < 21; i += 1) {
    try {
      await createCheckout(db, req('10.9.9.9'), { pow: null, email: `x${i}@example.com` });
    } catch (e) {
      last = e;
    }
  }
  assert.equal(last.status, 429);
});

// ---------------------------------------------------------------- Webhook PayPlug

test('webhook PayPlug : paiement inconnu, montant faux, mode live : non paye', async () => {
  const db = createMemoryDb();
  const store = {};
  const { order } = await newPaidCapableOrder(db, store);
  const saved = await db.getOrder(order.id);
  const p = store[saved.provider_id];

  const unknown = await handlePayplugNotification(db, { id: 'pay_unknown123' }, { retrieve: async () => ({ id: 'pay_unknown123', metadata: {} }) });
  assert.equal(unknown.result, 'unknown_order');

  const wrongAmount = await handlePayplugNotification(db, { id: p.id }, { retrieve: async () => ({ ...p, is_paid: true, amount: 100 }) });
  assert.equal(wrongAmount.result, 'mismatch');

  const live = await handlePayplugNotification(db, { id: p.id }, { retrieve: async () => ({ ...p, is_paid: true, is_live: true }) });
  assert.equal(live.result, 'mismatch');

  const notPaid = await handlePayplugNotification(db, { id: p.id }, { retrieve: async () => ({ ...p, is_paid: false }) });
  assert.equal(notPaid.result, 'not_paid');

  assert.equal((await db.getOrder(order.id)).status, 'pending');
});

test('webhook PayPlug : le corps ne compte pas, seul le paiement relu ; rejeu sans effet', async () => {
  const db = createMemoryDb();
  const store = {};
  const { order } = await newPaidCapableOrder(db, store);
  const saved = await db.getOrder(order.id);
  const p = { ...store[saved.provider_id], is_paid: true };
  const ok = await handlePayplugNotification(db, { id: p.id, is_paid: true }, { retrieve: async () => p });
  assert.equal(ok.result, 'paid');
  assert.equal((await db.getTickets(order.id)).length, 2);
  const again = await handlePayplugNotification(db, { id: p.id }, { retrieve: async () => p });
  assert.notEqual(again.result, 'paid');
  assert.equal((await db.getTickets(order.id)).length, 2);
});

// ---------------------------------------------------------------- Webhook PayPal

function ppEvent(id, ppOrderId, orderId) {
  return {
    id,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { custom_id: orderId, supplementary_data: { related_ids: { order_id: ppOrderId } } },
  };
}

function ppRemote(ppOrderId, orderId, { status = 'COMPLETED', value = '30.00' } = {}) {
  return {
    id: ppOrderId,
    status,
    purchase_units: [
      {
        reference_id: orderId,
        custom_id: orderId,
        payments: status === 'COMPLETED' ? { captures: [{ status: 'COMPLETED', amount: { value, currency_code: 'EUR' } }] } : {},
      },
    ],
  };
}

async function paypalOrder(db) {
  const order = await db.reserveOrder({
    ref: 'FF-PAYP-AL01',
    token_hash: 'h',
    email: 'p@example.com',
    first_name: 'P',
    last_name: 'P',
    day: 'sam',
    items: [{ tariff: 'adulte', label: 'Adulte', qty: 3, unit_cents: 1000 }],
    quantity: 3,
    amount_cents: 3000,
    provider: 'paypal',
    live: false,
    minutes: 15,
  });
  await db.setProviderId(order.id, '5O190127TN364715T');
  return db.getOrder(order.id);
}

test('webhook PayPal : signature invalide donne 401, rien ne change', async () => {
  const db = createMemoryDb();
  const o = await paypalOrder(db);
  const out = await handlePaypalWebhook(db, {}, ppEvent('WH-1', o.provider_id, o.id), { verify: async () => ({ ok: false, reason: 'signature' }) });
  assert.equal(out.status, 401);
  assert.equal((await db.getOrder(o.id)).status, 'pending');
});

test('webhook PayPal : APPROVED non capture = non paye', async () => {
  const db = createMemoryDb();
  const o = await paypalOrder(db);
  const out = await handlePaypalWebhook(db, {}, ppEvent('WH-2', o.provider_id, o.id), {
    verify: async () => ({ ok: true }),
    getOrder: async () => ppRemote(o.provider_id, o.id, { status: 'APPROVED' }),
  });
  assert.equal(out.result, 'not_paid');
  assert.equal((await db.getOrder(o.id)).status, 'pending');
});

test('webhook PayPal : valide paye une fois, evenement rejoue ne fait rien', async () => {
  const db = createMemoryDb();
  const o = await paypalOrder(db);
  const deps = { verify: async () => ({ ok: true }), getOrder: async () => ppRemote(o.provider_id, o.id) };
  const first = await handlePaypalWebhook(db, {}, ppEvent('WH-3', o.provider_id, o.id), deps);
  assert.equal(first.result, 'paid');
  const replay = await handlePaypalWebhook(db, {}, ppEvent('WH-3', o.provider_id, o.id), deps);
  assert.equal(replay.result, 'replay');
  assert.equal((await db.getTickets(o.id)).length, 3);
});

test('webhook PayPal : montant capture faux = non paye', async () => {
  const db = createMemoryDb();
  const o = await paypalOrder(db);
  const out = await handlePaypalWebhook(db, {}, ppEvent('WH-4', o.provider_id, o.id), {
    verify: async () => ({ ok: true }),
    getOrder: async () => ppRemote(o.provider_id, o.id, { value: '1.00' }),
  });
  assert.equal(out.result, 'not_paid');
});

test('verification PayPal : sans PAYPAL_WEBHOOK_ID, horodatage hors 60 s, cert_url etrangere : refus', async () => {
  delete process.env.PAYPAL_TEST_WEBHOOK_ID;
  assert.equal((await verifyPaypalWebhook({}, {})).ok, false);
  process.env.PAYPAL_TEST_WEBHOOK_ID = 'WH-ID';
  const base = {
    'paypal-transmission-id': 't',
    'paypal-transmission-sig': 's',
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT',
  };
  const old = await verifyPaypalWebhook({ ...base, 'paypal-transmission-time': new Date(Date.now() - 120000).toISOString() }, {});
  assert.equal(old.reason, 'horodatage hors fenetre');
  const evil = await verifyPaypalWebhook(
    { ...base, 'paypal-cert-url': 'https://evil.example/cert', 'paypal-transmission-time': new Date().toISOString() },
    {}
  );
  assert.equal(evil.reason, 'cert_url hors paypal.com');
  delete process.env.PAYPAL_TEST_WEBHOOK_ID;
});

// ---------------------------------------------------------------- Confirmation retour

test('confirmation retour : paiement etranger (autre commande) refuse', async () => {
  const db = createMemoryDb();
  const store = {};
  const { order } = await newPaidCapableOrder(db, store);
  const saved = await db.getOrder(order.id);
  const foreign = { id: saved.provider_id, amount: 3000, currency: 'EUR', is_live: false, is_paid: true, metadata: { order_id: 'autre' } };
  assert.equal(await confirmWithProvider(db, saved, { retrievePayplug: async () => foreign }), false);
  assert.equal((await db.getOrder(order.id)).status, 'pending');
});

test('confirmation retour : PayPal APPROVED non capture ou autre ordre refuse', async () => {
  const db = createMemoryDb();
  const o = await paypalOrder(db);
  assert.equal(await confirmWithProvider(db, o, { capturePaypal: async () => ppRemote(o.provider_id, o.id, { status: 'APPROVED' }) }), false);
  assert.equal(await confirmWithProvider(db, o, { capturePaypal: async () => ppRemote('OTHER', o.id) }), false);
  assert.equal(await confirmWithProvider(db, o, { capturePaypal: async () => ppRemote(o.provider_id, o.id) }), true);
});

// ---------------------------------------------------------------- QR / scan

async function paidTickets(db) {
  const o = await paypalOrder(db);
  await db.markPaid(o.id, { provider: 'paypal', provider_id: o.provider_id, amount_cents: 3000, currency: 'EUR' });
  return db.getTickets(o.id);
}

test('QR falsifie : refuse', () => {
  const id = '0b7f8d4c-1a2b-4c3d-8e9f-0123456789ab';
  const code = ticketCode(id, 'sam');
  assert.deepEqual(parseTicketCode(code), { ticketId: id, day: 'sam', kid: '1' });
  assert.equal(parseTicketCode(code.replace('.sam.', '.dim.')), null);
  assert.equal(parseTicketCode(code.replace(id, '1b7f8d4c-1a2b-4c3d-8e9f-0123456789ab')), null);
  assert.equal(parseTicketCode(`${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`), null);
  assert.equal(parseTicketCode('n importe quoi'), null);
});

test('scan : double scan, mauvais jour, billet rembourse refuses', async () => {
  const db = createMemoryDb();
  const [t1, t2, t3] = await paidTickets(db);
  assert.equal((await db.scanTicket(t1.id, 'sam', 'dev')).ok, true);
  assert.equal((await db.scanTicket(t1.id, 'sam', 'dev')).reason, 'already_used');
  assert.equal((await db.scanTicket(t2.id, 'ven', 'dev')).reason, 'wrong_day');
  db.state.tickets.find((t) => t.id === t3.id).refunded_at = new Date().toISOString();
  assert.equal((await db.scanTicket(t3.id, 'sam', 'dev')).reason, 'refunded');
});
