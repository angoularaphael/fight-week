import { getDb } from '../lib/db.js';
import { paymentMode, salesOpen } from '../lib/env.js';
import { DAYS } from '../lib/event.js';
import { json, route } from '../lib/http.js';
import { availableProviders } from '../lib/orders.js';

/** Etat dynamique de la billetterie (la page est statique). */
export default route(['GET'], async (req, res) => {
  const db = getDb();
  const rows = await db.getDays().catch(() => []);
  const days = {};
  for (const d of DAYS) {
    const row = rows.find((r) => r.id === d.id);
    let remaining = null;
    if (row) {
      const used = await db.usedSeats(d.id).catch(() => null);
      remaining = used === null ? null : Math.max(0, row.sellable - used);
    }
    days[d.id] = { on_sale: Boolean(row?.on_sale) && salesOpen(), low: remaining !== null && remaining <= 30, sold_out: remaining === 0 };
  }
  return json(
    res,
    200,
    { ok: true, sales_open: salesOpen(), mode: paymentMode(), providers: availableProviders(), days },
    { 'Cache-Control': 'public, max-age=0, s-maxage=20, stale-while-revalidate=40' }
  );
});
