/** Billets : PDF (une page par billet) et PNG (un par billet), QR signe. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { SITE, VENUE, formatEuros, getDay, getTariff } from './event.js';
import { ticketCode } from './tickets.js';

const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');
const JOST = path.join(fontsDir, 'jost-latin-wght-normal.woff2');
const MICHROMA = path.join(fontsDir, 'michroma-latin-400-normal.woff');

let fontsReady = false;
function ensureCanvasFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(JOST, 'Jost');
  GlobalFonts.registerFromPath(MICHROMA, 'Michroma');
  fontsReady = true;
}

const C = { carbon: '#141414', anthracite: '#2b2b2e', red: '#d11414', steel: '#999b9a', white: '#ffffff' };

function ticketLines(order, ticket) {
  const day = getDay(ticket.day);
  const tariff = getTariff(day, ticket.tariff);
  return {
    day,
    title: `Round ${day.round} - ${day.title}`,
    date: `${day.label} 2026`,
    hours: `Ouverture ${day.doors.replace(':', 'h')} - début ${day.start.replace(':', 'h')}`,
    tariff: `${tariff?.label || ticket.tariff} - ${formatEuros(tariff?.price_cents || 0)}`,
    holder: `${order.first_name} ${order.last_name}`.trim(),
    ref: `${order.ref} - billet ${ticket.seq}/${order.quantity}`,
    venue: `${VENUE.name}, ${VENUE.street}, ${VENUE.postalCode} ${VENUE.city}`,
  };
}

/** Trois barres obliques du logo (motif, pas le logo complet). */
function bars(doc, x, y, h, color) {
  const w = h * 0.32;
  const slant = h * 0.55;
  for (let i = 0; i < 3; i += 1) {
    const bx = x + i * (w + h * 0.14);
    doc.polygon([bx + slant, y], [bx + slant + w, y], [bx + w, y + h], [bx, y + h]).fill(color);
  }
}

export async function buildTicketsPdf(order, tickets) {
  const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: `${SITE.name} - ${order.ref}`, Author: SITE.organizer } });
  doc.registerFont('Michroma', MICHROMA);
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', resolve));
  const W = doc.page.width;
  const H = doc.page.height;

  for (let i = 0; i < tickets.length; i += 1) {
    if (i > 0) doc.addPage({ size: 'A5', margin: 0 });
    const t = tickets[i];
    const L = ticketLines(order, t);
    const light = L.day.theme === 'light';
    doc.rect(0, 0, W, H).fill(light ? '#e4e5e1' : C.carbon);
    bars(doc, 28, 28, 34, C.red);
    doc.fillColor(light ? C.carbon : C.white).font('Michroma').fontSize(17).text('FIGHT AND FURIOUS', 28, 76, { width: W - 56 });
    doc.font('Helvetica').fontSize(9).fillColor(C.steel).text('BOXING CENTER x MOTEKA', 28, 100);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(light ? C.carbon : C.white).text(L.title, 28, 130, { width: W - 56 });
    doc.font('Helvetica').fontSize(11).fillColor(light ? C.anthracite : '#dddddd');
    doc.text(L.date, 28, 152).text(L.hours).text(L.tariff).text(L.holder);

    const qr = await QRCode.toBuffer(ticketCode(t.id, t.day), { errorCorrectionLevel: 'M', margin: 2, width: 600, color: { dark: '#000000', light: '#ffffff' } });
    const size = 210;
    doc.rect((W - size) / 2 - 6, 238, size + 12, size + 12).fill(C.white);
    doc.image(qr, (W - size) / 2, 244, { width: size, height: size });

    doc.font('Helvetica').fontSize(9).fillColor(C.steel);
    doc.text(L.ref, 28, 478, { width: W - 56, align: 'center' });
    doc.text(L.venue, 28, 494, { width: W - 56, align: 'center' });
    doc.fontSize(8).text(
      "Billet nominatif à usage unique, valable uniquement le jour indiqué. Présentez ce QR code à l'entrée (écran ou papier). Ne le partagez pas : la première présentation fait foi.",
      28,
      530,
      { width: W - 56, align: 'center' }
    );
    doc.rect(0, H - 6, W, 6).fill(C.red);
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

export async function buildTicketPng(order, ticket) {
  ensureCanvasFonts();
  const L = ticketLines(order, ticket);
  const light = L.day.theme === 'light';
  const W = 1080;
  const H = 1500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = light ? '#e4e5e1' : C.carbon;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.red;
  const bh = 90;
  for (let i = 0; i < 3; i += 1) {
    const bx = 70 + i * (bh * 0.46);
    ctx.beginPath();
    ctx.moveTo(bx + bh * 0.55, 70);
    ctx.lineTo(bx + bh * 0.87, 70);
    ctx.lineTo(bx + bh * 0.32, 70 + bh);
    ctx.lineTo(bx, 70 + bh);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = light ? C.carbon : C.white;
  ctx.font = '54px Michroma';
  ctx.fillText('FIGHT AND FURIOUS', 70, 240);
  ctx.fillStyle = C.steel;
  ctx.font = '500 30px Jost';
  ctx.fillText('BOXING CENTER x MOTEKA', 70, 290);
  ctx.fillStyle = light ? C.carbon : C.white;
  ctx.font = '600 44px Jost';
  ctx.fillText(L.title, 70, 380);
  ctx.font = '400 36px Jost';
  ctx.fillStyle = light ? C.anthracite : '#dddddd';
  [L.date, L.hours, L.tariff, L.holder].forEach((line, i) => ctx.fillText(line, 70, 440 + i * 50));

  const qr = await QRCode.toBuffer(ticketCode(ticket.id, ticket.day), { errorCorrectionLevel: 'M', margin: 2, width: 640 });
  const img = await loadImage(qr);
  ctx.fillStyle = C.white;
  ctx.fillRect((W - 660) / 2, 680, 660, 660);
  ctx.drawImage(img, (W - 640) / 2, 690, 640, 640);
  ctx.fillStyle = C.steel;
  ctx.font = '400 30px Jost';
  ctx.textAlign = 'center';
  ctx.fillText(L.ref, W / 2, 1400);
  ctx.fillStyle = C.red;
  ctx.fillRect(0, H - 14, W, 14);
  return canvas.encode('png');
}
