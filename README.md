# Fight and Furious

Site du gala Boxing Center x MOTEKA, inauguration du garage MOTEKA (14 rue Seveso, 31150 Fenouillet), 11-13 decembre 2026.
Domaine prevu : `gala.boxingcenter.fr`.

- Astro 5 statique + fonctions Vercel `api/` (Node 22) + Supabase.
- Billetterie PayPlug et PayPal, compte Boxing Center uniquement.
- Mails Brevo suzinabot, Reply-To boxingcenter31@gmail.com, billets PDF + PNG + ICS.

## Commandes

- `npm run dev` : API locale (port 5641, base memoire si Supabase absent) + Astro (port 5640).
- `npm test` : tests unitaires et de securite (prix, PoW, webhooks, QR, jauge).
- `npm run test:db` : tests sur une base Supabase de TEST (`SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, option `SUPABASE_TEST_ANON_KEY`).
- `npm run icons` : regenere favicons et image Open Graph.
- `npm run check:site -- https://gala.boxingcenter.fr` : sitemap, robots, favicons, JSON-LD, sante API.

## Avant l'ouverture des ventes

1. Supabase : nouveau projet, executer `supabase/001_gala.sql`, regler `gala_days` (capacite, `sellable` = 97 %, `on_sale`).
2. Prix, jauges, horaires : `lib/event.js` (puis `PRICES_CONFIRMED = true`).
3. Infos legales : `src/data/legal.js` (entite qui encaisse, SIRET, adresse, directeur de publication).
4. Vercel (navigateur, option Sensitive) : variables de `.env.example`, domaine `gala.boxingcenter.fr`.
5. PayPal : webhook dedie au gala vers `/api/webhooks/paypal`, evenement `PAYMENT.CAPTURE.COMPLETED`, copier son id dans `PAYPAL_WEBHOOK_ID`.
6. `GALA_PAYMENT_MODE=live`, `GALA_SALES_OPEN=1`, un paiement reel de 1 EUR par prestataire, rembourse.

## Securite (resume)

- Route publique de commande protegee par preuve de travail signee HMAC, usage unique, 10 min (`lib/pow.js`, `public/pow-worker.js`).
- Prix et jauges recalcules cote serveur ; reservation atomique en SQL (`gala_reserve_order`, verrou de ligne).
- Paiement confirme uniquement avec l'id prestataire stocke, relu chez le prestataire (commande, montant, devise, mode).
- Webhook PayPal signe (`verify-webhook-signature`), +/- 60 s, nonce ; PayPlug relu via l'API.
- QR HMAC-SHA-256 versionne, scan a usage unique (`gala_scan_ticket`).
- RLS sans policy, RPC reservees au service_role, journal `audit_log` en insertion seule.
