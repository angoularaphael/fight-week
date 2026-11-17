import { orderToken } from './order-store.js';

const params = new URLSearchParams(location.search);
const ref = params.get('ref') || '';
const cancelled = params.has('annule');
const statusEl = document.getElementById('order-status');
const detail = document.getElementById('order-detail');
const missing = document.getElementById('order-missing');
const ticketsEl = document.getElementById('tickets');
const pdfBtn = document.getElementById('pdf-btn');
const token = ref ? orderToken(ref) : null;

// On retire les parametres ajoutes par le prestataire (token PayPal, etc.)
// de la barre d'adresse : rien de ce qu'il ajoute n'est utilise.
history.replaceState(null, '', `/commande?ref=${encodeURIComponent(ref)}`);

const euros = (c) => (c ? `${(c / 100).toFixed(2).replace('.', ',').replace(',00', '')} EUR` : 'Gratuit');

async function call(url) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, token }),
    referrerPolicy: 'no-referrer',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur'), { status: res.status });
  return data.order;
}

function show(order) {
  detail.hidden = false;
  document.getElementById('order-title').textContent = `Commande ${order.ref}`;
  const lines = order.items.map((i) => `${i.qty} x ${i.label}`).join(', ');
  document.getElementById('order-summary').textContent = `${order.day_label} - ${lines} - ${euros(order.amount_cents)}`;
  ticketsEl.innerHTML = '';
  if (order.status === 'paid') {
    statusEl.textContent = `${order.amount_cents ? 'Paiement confirmé' : 'Réservation confirmée'}. Vos billets sont aussi envoyés par e-mail.`;
    pdfBtn.hidden = false;
    for (const t of order.tickets || []) {
      const card = document.createElement('div');
      card.className = 'ticket-card';
      const img = document.createElement('img');
      img.src = t.qr;
      img.alt = `QR code du billet ${t.seq}`;
      img.width = 280;
      img.height = 280;
      const cap = document.createElement('p');
      cap.textContent = `Billet ${t.seq} - ${t.tariff}${t.used ? ' (déjà utilisé)' : ''}`;
      card.append(img, cap);
      ticketsEl.append(card);
    }
  } else if (order.status === 'pending') {
    statusEl.textContent = cancelled ? 'Paiement annulé. Vos places restent bloquées quelques minutes.' : 'Paiement en cours de vérification...';
  } else {
    statusEl.textContent = 'Cette commande a expiré sans paiement. Vous pouvez en refaire une.';
  }
}

async function run() {
  if (!ref || !token) {
    statusEl.textContent = '';
    missing.hidden = false;
    return;
  }
  let tries = 0;
  for (;;) {
    try {
      const order = await call('/api/confirm');
      show(order);
      if (order.status !== 'pending' || cancelled || tries >= 20) return;
    } catch (err) {
      statusEl.textContent = err.status === 404 ? '' : err.message;
      if (err.status === 404) missing.hidden = false;
      return;
    }
    tries += 1;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

pdfBtn.addEventListener('click', async () => {
  pdfBtn.disabled = true;
  try {
    const res = await fetch('/api/tickets-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, token }),
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) throw new Error('PDF indisponible');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `billets-${ref}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    statusEl.textContent = err.message;
  } finally {
    pdfBtn.disabled = false;
  }
});

run();
