-- Fight and Furious : billetterie du gala (Boxing Center x MOTEKA).
-- A executer dans l'editeur SQL Supabase du projet dedie au gala.
-- Principe : RLS active sans aucune policy. Seul le service_role (cote
-- serveur Vercel) lit et ecrit. Les RPC ne sont executables que par lui.

create extension if not exists pgcrypto;

-- Jours / jauges -------------------------------------------------------------
create table if not exists gala_days (
  id text primary key check (id in ('ven', 'sam', 'dim')),
  event_date date not null,
  capacity integer not null check (capacity >= 0),
  sellable integer not null check (sellable >= 0 and sellable <= capacity),
  on_sale boolean not null default false
);

insert into gala_days (id, event_date, capacity, sellable, on_sale) values
  ('ven', '2026-12-11', 300, 291, false),
  ('sam', '2026-12-12', 300, 291, false),
  ('dim', '2026-12-13', 300, 291, false)
on conflict (id) do nothing;

-- Commandes ------------------------------------------------------------------
create table if not exists gala_orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  token_hash text not null,
  email text not null,
  first_name text not null,
  last_name text not null,
  phone text,
  day text not null references gala_days(id),
  items jsonb not null,
  quantity integer not null check (quantity between 1 and 6),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'EUR',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'failed', 'refunded', 'cancelled')),
  provider text check (provider in ('payplug', 'paypal', 'free')),
  provider_id text,
  live boolean not null default true,
  reserved_until timestamptz not null,
  paid_at timestamptz,
  mail_sent_at timestamptz,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gala_orders_day_status on gala_orders (day, status);
create index if not exists gala_orders_email on gala_orders (lower(email));
create unique index if not exists gala_orders_provider on gala_orders (provider, provider_id)
  where provider_id is not null;

-- Billets (crees au passage a paye) -------------------------------------------
create table if not exists gala_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references gala_orders(id),
  day text not null references gala_days(id),
  tariff text not null,
  seq integer not null,
  used_at timestamptz,
  used_by uuid,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, seq)
);
create index if not exists gala_tickets_order on gala_tickets (order_id);

-- Nonces / anti-rejeu ----------------------------------------------------------
create table if not exists webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table if not exists pow_used (
  id text primary key,
  expires_at timestamptz not null
);

create table if not exists rate_hits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

-- Liste d'attente -------------------------------------------------------------
create table if not exists gala_waitlist (
  email text primary key,
  day text,
  created_at timestamptz not null default now()
);

-- Appareils staff (scanner) ----------------------------------------------------
create table if not exists staff_devices (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  enroll_hash text unique,
  enroll_expires_at timestamptz,
  session_hash text unique,
  session_expires_at timestamptz,
  enrolled_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Journal en insertion seule -----------------------------------------------------
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,
  ref text,
  data jsonb
);

create or replace function audit_log_block() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log est en insertion seule';
end $$;

drop trigger if exists audit_log_no_update on audit_log;
create trigger audit_log_no_update before update or delete or truncate on audit_log
  for each statement execute function audit_log_block();

-- RLS : actif partout, aucune policy -----------------------------------------------
alter table gala_days enable row level security;
alter table gala_orders enable row level security;
alter table gala_tickets enable row level security;
alter table webhook_events enable row level security;
alter table pow_used enable row level security;
alter table rate_hits enable row level security;
alter table gala_waitlist enable row level security;
alter table staff_devices enable row level security;
alter table audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- RPC ---------------------------------------------------------------------------

-- Places occupees : payees + reservations en cours non expirees.
create or replace function gala_used_seats(p_day text) returns integer
language sql stable as $$
  select coalesce(sum(quantity), 0)::int from gala_orders
  where day = p_day
    and (status = 'paid' or (status = 'pending' and reserved_until > now()));
$$;

-- Reservation atomique : verrou sur la ligne du jour, puis controle de jauge.
create or replace function gala_reserve_order(
  p_ref text, p_token_hash text, p_email text, p_first_name text, p_last_name text,
  p_phone text, p_day text, p_items jsonb, p_quantity integer, p_amount_cents integer,
  p_provider text, p_live boolean, p_minutes integer, p_ip_hash text
) returns gala_orders
language plpgsql security definer set search_path = public as $$
declare
  d gala_days;
  used integer;
  o gala_orders;
begin
  select * into d from gala_days where id = p_day for update;
  if not found then raise exception 'unknown_day'; end if;
  if not d.on_sale then raise exception 'not_on_sale'; end if;
  used := gala_used_seats(p_day);
  if used + p_quantity > d.sellable then raise exception 'sold_out'; end if;
  insert into gala_orders (ref, token_hash, email, first_name, last_name, phone, day, items,
    quantity, amount_cents, provider, live, reserved_until, ip_hash)
  values (p_ref, p_token_hash, lower(p_email), p_first_name, p_last_name, p_phone, p_day, p_items,
    p_quantity, p_amount_cents, p_provider, p_live,
    now() + make_interval(mins => greatest(1, least(p_minutes, 60))), p_ip_hash)
  returning * into o;
  insert into audit_log (kind, ref, data) values ('order.reserved', o.ref,
    jsonb_build_object('day', p_day, 'qty', p_quantity, 'amount', p_amount_cents, 'provider', p_provider));
  return o;
end $$;

create or replace function gala_set_provider_id(p_order uuid, p_provider_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update gala_orders set provider_id = p_provider_id, updated_at = now()
  where id = p_order and status = 'pending' and provider_id is null;
  return found;
end $$;

-- Passage a paye : UPDATE conditionnel, montant et prestataire controles,
-- billets crees dans la meme transaction. Renvoie false si deja paye / refuse.
create or replace function gala_mark_paid(
  p_order uuid, p_provider text, p_provider_id text, p_amount_cents integer, p_currency text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  o gala_orders;
  it jsonb;
  n integer := 0;
  i integer;
begin
  update gala_orders set status = 'paid', paid_at = now(), updated_at = now()
  where id = p_order
    and status in ('pending', 'expired')
    and provider = p_provider
    and provider_id = p_provider_id
    and amount_cents = p_amount_cents
    and currency = upper(p_currency)
  returning * into o;
  if not found then return false; end if;
  for it in select * from jsonb_array_elements(o.items) loop
    for i in 1 .. (it->>'qty')::int loop
      n := n + 1;
      insert into gala_tickets (order_id, day, tariff, seq) values (o.id, o.day, it->>'tariff', n);
    end loop;
  end loop;
  insert into audit_log (kind, ref, data) values ('order.paid', o.ref,
    jsonb_build_object('provider', p_provider, 'provider_id', p_provider_id, 'amount', p_amount_cents));
  return true;
end $$;

create or replace function gala_expire_orders() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update gala_orders set status = 'expired', updated_at = now()
  where status = 'pending' and reserved_until < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

-- Nonce PoW : true si premiere utilisation.
create or replace function gala_consume_pow(p_id text, p_expires timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from pow_used where expires_at < now() - interval '1 hour';
  insert into pow_used (id, expires_at) values (p_id, p_expires);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Nonce webhook : true si premier passage.
create or replace function gala_record_webhook(p_provider text, p_event_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into webhook_events (provider, event_id) values (p_provider, p_event_id);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Compteur de debit par fenetre fixe : true si sous la limite.
create or replace function gala_rate_hit(p_bucket text, p_window_sec integer, p_max integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_sec) * p_window_sec);
  c integer;
begin
  insert into rate_hits (bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = rate_hits.hits + 1
  returning hits into c;
  if random() < 0.01 then
    delete from rate_hits where window_start < now() - interval '1 day';
  end if;
  return c <= p_max;
end $$;

-- Scan : usage unique, bon jour, non rembourse.
create or replace function gala_scan_ticket(p_ticket uuid, p_day text, p_device uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t gala_tickets;
begin
  update gala_tickets set used_at = now(), used_by = p_device
  where id = p_ticket and day = p_day and used_at is null and refunded_at is null
  returning * into t;
  if found then
    insert into audit_log (kind, ref, data) values ('scan.ok', p_ticket::text, jsonb_build_object('device', p_device));
    return jsonb_build_object('ok', true, 'tariff', t.tariff);
  end if;
  select * into t from gala_tickets where id = p_ticket;
  insert into audit_log (kind, ref, data) values ('scan.refused', p_ticket::text, jsonb_build_object('device', p_device));
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  if t.refunded_at is not null then return jsonb_build_object('ok', false, 'reason', 'refunded'); end if;
  if t.day <> p_day then return jsonb_build_object('ok', false, 'reason', 'wrong_day'); end if;
  return jsonb_build_object('ok', false, 'reason', 'already_used', 'used_at', t.used_at);
end $$;

-- Droits : personne d'autre que service_role n'execute les RPC.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function gala_reserve_order, gala_set_provider_id, gala_mark_paid, gala_expire_orders,
  gala_consume_pow, gala_record_webhook, gala_rate_hit, gala_scan_ticket, gala_used_seats to service_role;
