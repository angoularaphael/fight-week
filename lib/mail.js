/**
 * Mails via Brevo contact@boxingcenter.fr (meme compte que BOXPLUS / boutique).
 * Reply-To boxingcenter31@gmail.com. Pieces jointes PDF / PNG / ICS uniquement.
 */
import { env, publicUrl } from './env.js';
import { SITE, VENUE, formatEuros, getDay } from './event.js';
import { buildOrderIcs } from './ics.js';
import { buildTicketPng, buildTicketsPdf } from './ticket-render.js';

const SENDER_EMAIL = 'contact@boxingcenter.fr';
const REPLY_TO = 'boxingcenter31@gmail.com';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export async function sendBrevo({ to, subject, html, text, attachments = [], tags = [] }, { fetchImpl = fetch } = {}) {
  const key = env('BREVO_API_KEY');
  if (!key) {
    if (env('VERCEL') === '1') throw new Error('BREVO_API_KEY manquante');
    console.log('[mail dev] pas de BREVO_API_KEY, mail non envoye :', subject, '->', to);
    return { skipped: true };
  }
  const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: env('BREVO_SENDER_EMAIL', SENDER_EMAIL), name: env('BREVO_SENDER_NAME', SITE.name) },
      replyTo: { email: env('BREVO_REPLY_TO', REPLY_TO), name: SITE.organizer },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      tags,
      attachment: attachments.length
        ? attachments.map((a) => ({ name: a.name, content: Buffer.from(a.content).toString('base64') }))
        : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendTicketsMail(order, tickets) {
  const day = getDay(order.day);
  const pdf = await buildTicketsPdf(order, tickets);
  const pngs = [];
  for (const t of tickets) pngs.push({ name: `billet-${order.ref}-${t.seq}.png`, content: await buildTicketPng(order, t) });
  const ics = buildOrderIcs(order);
  const lines = order.items.map((it) => `${it.qty} x ${escapeHtml(it.label)} (${formatEuros(it.unit_cents)})`).join('<br>');
  const link = `${publicUrl()}/billetterie#renvoi`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#141414;color:#ffffff;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="color:#d11414;font-weight:bold;letter-spacing:2px;margin:0 0 8px">FIGHT AND FURIOUS</p>
<h1 style="font-size:22px;margin:0 0 16px">Vos billets pour le round ${day.round} : ${escapeHtml(day.title)}</h1>
<p>Bonjour ${escapeHtml(order.first_name)},</p>
<p>Votre commande <strong>${escapeHtml(order.ref)}</strong> est confirmée.</p>
<p style="background:#2b2b2e;padding:14px;border-left:4px solid #d11414">${escapeHtml(day.label)} 2026<br>Ouverture ${day.doors.replace(':', 'h')}, début ${day.start.replace(':', 'h')}<br>${escapeHtml(VENUE.name)}, ${escapeHtml(VENUE.street)}, ${VENUE.postalCode} ${escapeHtml(VENUE.city)}</p>
<p>${lines}<br>Total : <strong>${formatEuros(order.amount_cents)}</strong></p>
<p>Vos ${tickets.length} billet(s) sont joints en PDF et en image. Chaque QR code est nominatif, à usage unique et valable uniquement ce jour-là.</p>
<p style="font-size:13px">Billets perdus ? <a href="${link}" style="color:#ffffff">Renvoi sur le site</a>.</p>
<p style="color:#999b9a;font-size:13px">Une question ? Répondez simplement à ce mail.<br>Boxing Center x MOTEKA</p>
</div></body></html>`;
  const text = `Fight and Furious - commande ${order.ref} confirmée.\n${day.label} 2026, ouverture ${day.doors}.\n${VENUE.name}, ${VENUE.street}, ${VENUE.postalCode} ${VENUE.city}.\nBillets joints (PDF et PNG).${link ? `\nBillets perdus ? Renvoi : ${link}` : ''}`;
  return sendBrevo({
    to: order.email,
    subject: `Vos billets Fight and Furious - ${day.label}`,
    html,
    text,
    tags: ['gala', `gala-${order.day}`],
    attachments: [
      { name: `billets-${order.ref}.pdf`, content: pdf },
      ...pngs,
      { name: `fight-and-furious-${order.day}.ics`, content: Buffer.from(ics, 'utf8') },
    ],
  });
}
