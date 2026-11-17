/**
 * Test sur une VRAIE base Supabase de test (jamais la prod) :
 * SUPABASE_TEST_URL et SUPABASE_TEST_SERVICE_ROLE_KEY, schema 001_gala.sql applique.
 * Verifie le verrou de la RPC gala_reserve_order sous concurrence, l'UPDATE
 * conditionnel de gala_mark_paid et le journal en insertion seule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.GALA_NO_DOTENV = '1';
const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const skip = !url || !key ? 'SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY absents' : false;

const { createSupabaseDb } = await import('../lib/db.js');

async function rest(path, init = {}) {
  const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const ref = () => `FF-${randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}-${randomBytes(4).toString('hex').toUpperCase().slice(0, 4)}`;

function order(qty) {
  return {
    ref: ref(),
    token_hash: 'h',
    email: `t${randomBytes(3).toString('hex')}@example.com`,
    first_name: 'T',
    last_name: 'T',
    day: 'dim',
    items: [{ tariff: 'entree', label: 'Entree', qty, unit_cents: 0 }],
    quantity: qty,
    amount_cents: 0,
    provider: 'free',
    live: false,
    minutes: 15,
  };
}

test('2 reservations concurrentes au-dela de la jauge : une seule passe', { skip }, async () => {
  const db = createSupabaseDb({ url, key });
  const used = await db.usedSeats('dim');
  await rest('gala_days?id=eq.dim', { method: 'PATCH', body: JSON.stringify({ on_sale: true, sellable: used + 5 }) });
  try {
    const results = await Promise.allSettled([db.reserveOrder(order(3)), db.reserveOrder(order(3))]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'sold_out');
  } finally {
    await rest('gala_days?id=eq.dim', { method: 'PATCH', body: JSON.stringify({ on_sale: false, sellable: 291 }) });
  }
});

test('mark_paid conditionnel : mauvais montant refuse, double passage sans doublon de billets', { skip }, async () => {
  const db = createSupabaseDb({ url, key });
  await rest('gala_days?id=eq.dim', { method: 'PATCH', body: JSON.stringify({ on_sale: true }) });
  try {
    const o = await db.reserveOrder(order(2));
    await db.setProviderId(o.id, o.id);
    assert.equal(await db.markPaid(o.id, { provider: 'free', provider_id: o.id, amount_cents: 1, currency: 'EUR' }), false);
    assert.equal(await db.markPaid(o.id, { provider: 'free', provider_id: o.id, amount_cents: 0, currency: 'EUR' }), true);
    assert.equal(await db.markPaid(o.id, { provider: 'free', provider_id: o.id, amount_cents: 0, currency: 'EUR' }), false);
    assert.equal((await db.getTickets(o.id)).length, 2);
  } finally {
    await rest('gala_days?id=eq.dim', { method: 'PATCH', body: JSON.stringify({ on_sale: false }) });
  }
});

test('audit_log en insertion seule : UPDATE et DELETE refuses', { skip }, async () => {
  const ins = await rest('audit_log', { method: 'POST', body: JSON.stringify({ kind: 'test', ref: 'x' }) });
  assert.equal(ins.status, 201);
  const id = ins.data[0].id;
  assert.ok((await rest(`audit_log?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ kind: 'hack' }) })).status >= 400);
  assert.ok((await rest(`audit_log?id=eq.${id}`, { method: 'DELETE' })).status >= 400);
});

test('RPC interdites a la cle anon', { skip: skip || (!process.env.SUPABASE_TEST_ANON_KEY && 'SUPABASE_TEST_ANON_KEY absente') }, async () => {
  const anon = process.env.SUPABASE_TEST_ANON_KEY;
  const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/gala_rate_hit`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_bucket: 'x', p_window_sec: 60, p_max: 1 }),
  });
  assert.ok(res.status === 401 || res.status === 403 || res.status === 404, String(res.status));
  const rows = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/gala_orders?select=id&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  const body = rows.ok ? await rows.json() : [];
  assert.ok(!rows.ok || body.length === 0);
});
