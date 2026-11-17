import { prepare, take } from './pow-client.js';
import { saveOrderToken } from './order-store.js';

const MAX = 6;
const DAYS = JSON.parse(document.getElementById('gala-days')?.textContent || '[]');
const form = document.getElementById('checkout-form');
const closed = document.getElementById('closed');
const totalEl = document.getElementById('total');
const summaryDay = document.getElementById('summary-day');
const payBlock = document.getElementById('pay-block');
const payBtn = document.getElementById('pay-btn');
const msg = document.getElementById('checkout-msg');
const qty = {};
let config = { sales_open: false, providers: [], days: {} };

const euros = (c) => (c ? `${(c / 100).toFixed(2).replace('.', ',').replace(',00', '')} EUR` : '0 EUR');
const currentDay = () => form.querySelector('input[name="day"]:checked')?.value || DAYS[0]?.id;
const dayData = (id) => DAYS.find((d) => d.id === id);

function itemsFor(dayId) {
  return Object.entries(qty[dayId] || {})
    .filter(([, n]) => n > 0)
    .map(([tariff, n]) => ({ tariff, qty: n }));
}

function totals(dayId) {
  const d = dayData(dayId);
  let count = 0;
  let cents = 0;
  for (const { tariff, qty: n } of itemsFor(dayId)) {
    const t = d.tariffs.find((x) => x.id === tariff);
    count += n;
    cents += n * (t?.price_cents || 0);
  }
  return { count, cents };
}

function render() {
  const dayId = currentDay();
  const d = dayData(dayId);
  document.querySelectorAll('[data-tariffs]').forEach((el) => (el.hidden = el.dataset.tariffs !== dayId));
  document.querySelectorAll('.stepper').forEach((s) => {
    s.querySelector('output').textContent = String(qty[s.dataset.day]?.[s.dataset.tariff] || 0);
  });
  const { count, cents } = totals(dayId);
  totalEl.textContent = euros(cents);
  summaryDay.textContent = `${d.label} - ${d.title} - ${count} billet(s)`;
  const free = count > 0 && cents === 0;
  payBlock.hidden = free || cents === 0;
  payBtn.textContent = free ? 'Réserver gratuitement' : cents ? `Payer ${euros(cents)}` : 'Payer';
  const state = config.days?.[dayId];
  payBtn.disabled = !config.sales_open || !state?.on_sale || state?.sold_out || count === 0;
}

function renderProviders() {
  payBlock.innerHTML = '';
  config.providers.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'day-option';
    wrap.innerHTML = `<input type="radio" name="provider" id="pv-${p.id}" value="${p.id}" ${i === 0 ? 'checked' : ''}><label for="pv-${p.id}"></label>`;
    wrap.querySelector('label').textContent = p.label;
    payBlock.append(wrap);
  });
}

function renderDayStates() {
  document.querySelectorAll('[data-day-state]').forEach((el) => {
    const s = config.days?.[el.dataset.dayState];
    el.textContent = s?.sold_out ? ' - Complet' : s?.low ? ' - Dernières places' : '';
  });
}

form.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-step]');
  if (!btn) return;
  const s = btn.closest('.stepper');
  const day = s.dataset.day;
  qty[day] = qty[day] || {};
  const cur = qty[day][s.dataset.tariff] || 0;
  const { count } = totals(day);
  const step = Number(btn.dataset.step);
  if (step > 0 && count >= MAX) {
    showMsg(`${MAX} billets maximum par commande.`);
    return;
  }
  qty[day][s.dataset.tariff] = Math.max(0, Math.min(MAX, cur + step));
  showMsg('');
  render();
});

form.addEventListener('change', render);
form.addEventListener('focusin', () => prepare('checkout').catch(() => {}), { once: true });

function showMsg(text, ok = false) {
  msg.textContent = text;
  msg.classList.toggle('ok', ok);
}

async function postCheckout(payload) {
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dayId = currentDay();
  const items = itemsFor(dayId);
  const f = new FormData(form);
  const payload = {
    day: dayId,
    items,
    first_name: String(f.get('first_name') || '').trim(),
    last_name: String(f.get('last_name') || '').trim(),
    email: String(f.get('email') || '').trim(),
    phone: String(f.get('phone') || '').trim(),
    accept_cgv: document.getElementById('accept_cgv').checked,
    provider: String(f.get('provider') || ''),
  };
  if (!items.length) return showMsg('Choisissez au moins un billet.');
  if (!payload.first_name || !payload.last_name) return showMsg('Indiquez votre prénom et votre nom.');
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(payload.email)) return showMsg('Adresse e-mail invalide.');
  if (!payload.accept_cgv) return showMsg("Merci d'accepter les conditions de vente.");

  payBtn.disabled = true;
  showMsg('Vérification anti-robot en cours...', true);
  try {
    let { res, data } = await postCheckout({ ...payload, pow: await take('checkout') });
    if (res.status === 403 && String(data.code || '').startsWith('pow_')) {
      ({ res, data } = await postCheckout({ ...payload, pow: await take('checkout') }));
    }
    if (!res.ok || !data.ok) throw new Error(data.error || 'Paiement impossible pour le moment.');
    saveOrderToken(data.ref, data.token);
    showMsg(data.free ? 'Réservation confirmée, redirection...' : 'Redirection vers le paiement sécurisé...', true);
    window.location.assign(data.redirect);
  } catch (err) {
    showMsg(err.message);
    payBtn.disabled = false;
    prepare('checkout').catch(() => {});
  }
});

// Liste d'attente et renvoi : meme mecanique, scopes distincts.
function wireSimpleForm(id, scope, url, okText) {
  const el = document.getElementById(id);
  if (!el) return;
  const out = el.querySelector('.form-msg');
  el.addEventListener('focusin', () => prepare(scope).catch(() => {}), { once: true });
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = String(new FormData(el).get('email') || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      out.textContent = 'Adresse e-mail invalide.';
      return;
    }
    const btn = el.querySelector('button[type="submit"]');
    btn.disabled = true;
    out.textContent = 'Envoi...';
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, day: currentDay(), pow: await take(scope) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur, réessayez.');
      out.textContent = data.message || okText;
      el.reset();
    } catch (err) {
      out.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });
}

wireSimpleForm('waitlist-form', 'waitlist', '/api/waitlist', "C'est noté, vous serez prévenu à l'ouverture.");
wireSimpleForm('resend-form', 'resend', '/api/resend', "Si une commande existe pour cette adresse, les billets viennent d'être renvoyés.");

// Jour pre-selectionne via ?jour=
const wanted = new URLSearchParams(location.search).get('jour');
if (wanted && dayData(wanted)) {
  const input = document.getElementById(`day-${wanted}`);
  if (input) input.checked = true;
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    config = await res.json();
  } catch {
    config = { sales_open: false, providers: [], days: {} };
  }
  if (!config.sales_open) {
    closed.hidden = false;
    form.hidden = true;
  }
  renderProviders();
  renderDayStates();
  render();
}

render();
loadConfig();
