/**
 * Acces base. Deux implementations au meme contrat :
 * - Supabase (PostgREST + RPC, service_role cote serveur uniquement) ;
 * - memoire (dev local sans Supabase et tests), interdite sur Vercel.
 * Toute la logique de jauge / paiement / scan vit dans les RPC SQL ; la
 * version memoire en reproduit la semantique pour les tests.
 */
import { randomUUID } from 'node:crypto';
import { env } from './env.js';
import { DAYS, sellableCapacity } from './event.js';

function supabaseConfigured() {
  return Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));
}

class DbError extends Error {
  constructor(message, code, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const KNOWN_RPC_ERRORS = {
  sold_out: [409, 'Plus assez de places pour ce jour.'],
  not_on_sale: [409, 'La vente n est pas ouverte pour ce jour.'],
  unknown_day: [400, 'Jour inconnu.'],
};

function rpcError(message) {
  for (const [code, [status, text]] of Object.entries(KNOWN_RPC_ERRORS)) {
    if (String(message).includes(code)) return new DbError(text, code, status);
  }
  return new DbError(`Base : ${message}`, 'db', 500);
}

export function createSupabaseDb({ url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY'), fetchImpl = fetch } = {}) {
  const base = url.replace(/\/+$/, '');
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  async function call(path, { method = 'GET', body, prefer } = {}) {
    const res = await fetchImpl(`${base}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) throw rpcError(data?.message || data?.hint || `HTTP ${res.status}`);
    return data;
  }

  const rpc = (name, args) => call(`rpc/${name}`, { method: 'POST', body: args });
  const one = (rows) => (Array.isArray(rows) ? rows[0] || null : rows);
  const enc = encodeURIComponent;

  return {
    kind: 'supabase',
    async reserveOrder(o) {
      return one(
        await rpc('gala_reserve_order', {
          p_ref: o.ref,
          p_token_hash: o.token_hash,
          p_email: o.email,
          p_first_name: o.first_name,
          p_last_name: o.last_name,
          p_phone: o.phone || null,
          p_day: o.day,
          p_items: o.items,
          p_quantity: o.quantity,
          p_amount_cents: o.amount_cents,
          p_provider: o.provider,
          p_live: o.live,
          p_minutes: o.minutes,
          p_ip_hash: o.ip_hash || null,
        })
      );
    },
    setProviderId: (id, providerId) => rpc('gala_set_provider_id', { p_order: id, p_provider_id: providerId }),
    markPaid: (id, { provider, provider_id, amount_cents, currency }) =>
      rpc('gala_mark_paid', {
        p_order: id,
        p_provider: provider,
        p_provider_id: provider_id,
        p_amount_cents: amount_cents,
        p_currency: currency,
      }),
    async getOrder(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id))) return null;
      return one(await call(`gala_orders?id=eq.${enc(id)}&select=*`));
    },
    async getOrderByRef(ref) {
      return one(await call(`gala_orders?ref=eq.${enc(ref)}&select=*`));
    },
    async findOrderByProvider(provider, providerId) {
      return one(await call(`gala_orders?provider=eq.${enc(provider)}&provider_id=eq.${enc(providerId)}&select=*`));
    },
    async listPendingOrders({ olderThanSec = 60, limit = 50 } = {}) {
      const before = new Date(Date.now() - olderThanSec * 1000).toISOString();
      const after = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
      return call(
        `gala_orders?status=in.(pending,expired)&provider_id=not.is.null&created_at=lt.${enc(before)}&created_at=gt.${enc(after)}&order=created_at.asc&limit=${limit}&select=*`
      );
    },
    async listOrdersByEmail(email) {
      return call(`gala_orders?email=eq.${enc(String(email).toLowerCase())}&status=eq.paid&select=*&order=created_at.desc&limit=10`);
    },
    async getTickets(orderId) {
      return call(`gala_tickets?order_id=eq.${enc(orderId)}&select=*&order=seq.asc`);
    },
    async setMailSent(id) {
      await call(`gala_orders?id=eq.${enc(id)}`, { method: 'PATCH', body: { mail_sent_at: new Date().toISOString() } });
    },
    async usedSeats(day) {
      return Number(await rpc('gala_used_seats', { p_day: day })) || 0;
    },
    async getDays() {
      return call('gala_days?select=*&order=event_date.asc');
    },
    consumePow: (id, expiresAt) => rpc('gala_consume_pow', { p_id: id, p_expires: expiresAt }),
    recordWebhook: (provider, eventId) => rpc('gala_record_webhook', { p_provider: provider, p_event_id: eventId }),
    rateHit: (bucket, windowSec, max) => rpc('gala_rate_hit', { p_bucket: bucket, p_window_sec: windowSec, p_max: max }),
    scanTicket: (ticketId, day, deviceId) => rpc('gala_scan_ticket', { p_ticket: ticketId, p_day: day, p_device: deviceId }),
    expireOrders: () => rpc('gala_expire_orders', {}),
    async addWaitlist(email, day) {
      await call('gala_waitlist?on_conflict=email', {
        method: 'POST',
        body: { email: String(email).toLowerCase(), day: day || null },
        prefer: 'resolution=ignore-duplicates',
      });
    },
    async audit(kind, ref, data) {
      await call('audit_log', { method: 'POST', body: { kind, ref: ref || null, data: data || null } }).catch((err) =>
        console.error('[audit]', kind, err.message)
      );
    },
  };
}

/** Implementation memoire (tests, dev local). */
export function createMemoryDb({ onSale = true, days = DAYS } = {}) {
  const state = {
    days: new Map(days.map((d) => [d.id, { id: d.id, capacity: d.capacity, sellable: sellableCapacity(d), on_sale: onSale }])),
    orders: new Map(),
    tickets: [],
    pow: new Set(),
    webhooks: new Set(),
    rate: new Map(),
    waitlist: new Map(),
    audit: [],
  };
  const now = () => Date.now();
  const used = (day) =>
    [...state.orders.values()]
      .filter((o) => o.day === day && (o.status === 'paid' || (o.status === 'pending' && Date.parse(o.reserved_until) > now())))
      .reduce((s, o) => s + o.quantity, 0);
  const clone = (o) => (o ? structuredClone(o) : null);

  return {
    kind: 'memory',
    state,
    async reserveOrder(o) {
      const d = state.days.get(o.day);
      if (!d) throw rpcError('unknown_day');
      if (!d.on_sale) throw rpcError('not_on_sale');
      if (used(o.day) + o.quantity > d.sellable) throw rpcError('sold_out');
      for (const x of state.orders.values()) if (x.ref === o.ref) throw rpcError('duplicate ref');
      const row = {
        id: randomUUID(),
        ref: o.ref,
        token_hash: o.token_hash,
        email: String(o.email).toLowerCase(),
        first_name: o.first_name,
        last_name: o.last_name,
        phone: o.phone || null,
        day: o.day,
        items: structuredClone(o.items),
        quantity: o.quantity,
        amount_cents: o.amount_cents,
        currency: 'EUR',
        status: 'pending',
        provider: o.provider,
        provider_id: null,
        live: o.live,
        reserved_until: new Date(now() + Math.max(1, Math.min(o.minutes, 60)) * 60000).toISOString(),
        paid_at: null,
        mail_sent_at: null,
        ip_hash: o.ip_hash || null,
        created_at: new Date().toISOString(),
      };
      state.orders.set(row.id, row);
      state.audit.push({ kind: 'order.reserved', ref: row.ref });
      return clone(row);
    },
    async setProviderId(id, providerId) {
      const o = state.orders.get(id);
      if (!o || o.status !== 'pending' || o.provider_id) return false;
      o.provider_id = providerId;
      return true;
    },
    async markPaid(id, { provider, provider_id, amount_cents, currency }) {
      const o = state.orders.get(id);
      if (!o) return false;
      if (!['pending', 'expired'].includes(o.status)) return false;
      if (o.provider !== provider || o.provider_id !== provider_id) return false;
      if (o.amount_cents !== amount_cents || o.currency !== String(currency).toUpperCase()) return false;
      o.status = 'paid';
      o.paid_at = new Date().toISOString();
      let seq = 0;
      for (const it of o.items) {
        for (let i = 0; i < it.qty; i += 1) {
          seq += 1;
          state.tickets.push({ id: randomUUID(), order_id: o.id, day: o.day, tariff: it.tariff, seq, used_at: null, refunded_at: null });
        }
      }
      state.audit.push({ kind: 'order.paid', ref: o.ref });
      return true;
    },
    async getOrder(id) {
      return clone(state.orders.get(id));
    },
    async getOrderByRef(ref) {
      return clone([...state.orders.values()].find((o) => o.ref === ref));
    },
    async findOrderByProvider(provider, providerId) {
      return clone([...state.orders.values()].find((o) => o.provider === provider && o.provider_id === providerId));
    },
    async listPendingOrders() {
      return [...state.orders.values()].filter((o) => ['pending', 'expired'].includes(o.status) && o.provider_id).map(clone);
    },
    async listOrdersByEmail(email) {
      return [...state.orders.values()].filter((o) => o.email === String(email).toLowerCase() && o.status === 'paid').map(clone);
    },
    async getTickets(orderId) {
      return state.tickets.filter((t) => t.order_id === orderId).map(clone);
    },
    async setMailSent(id) {
      const o = state.orders.get(id);
      if (o) o.mail_sent_at = new Date().toISOString();
    },
    async usedSeats(day) {
      return used(day);
    },
    async getDays() {
      return [...state.days.values()].map(clone);
    },
    async consumePow(id) {
      if (state.pow.has(id)) return false;
      state.pow.add(id);
      return true;
    },
    async recordWebhook(provider, eventId) {
      const k = `${provider}:${eventId}`;
      if (state.webhooks.has(k)) return false;
      state.webhooks.add(k);
      return true;
    },
    async rateHit(bucket, windowSec, max) {
      const w = Math.floor(now() / 1000 / windowSec);
      const k = `${bucket}@${w}`;
      const c = (state.rate.get(k) || 0) + 1;
      state.rate.set(k, c);
      return c <= max;
    },
    async scanTicket(ticketId, day, deviceId) {
      const t = state.tickets.find((x) => x.id === ticketId);
      if (!t) return { ok: false, reason: 'unknown' };
      if (t.refunded_at) return { ok: false, reason: 'refunded' };
      if (t.day !== day) return { ok: false, reason: 'wrong_day' };
      if (t.used_at) return { ok: false, reason: 'already_used', used_at: t.used_at };
      t.used_at = new Date().toISOString();
      t.used_by = deviceId;
      return { ok: true, tariff: t.tariff };
    },
    async expireOrders() {
      return 0;
    },
    async addWaitlist(email, day) {
      state.waitlist.set(String(email).toLowerCase(), day || null);
    },
    async audit(kind, ref, data) {
      state.audit.push({ kind, ref, data });
    },
  };
}

let current = null;

export function getDb() {
  if (current) return current;
  if (supabaseConfigured()) {
    current = createSupabaseDb();
  } else {
    if (env('VERCEL') === '1') throw new DbError('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants', 'db_config', 500);
    current = createMemoryDb({ onSale: true });
  }
  return current;
}

/** Tests : injecter une base. */
export function setDb(db) {
  current = db;
}
