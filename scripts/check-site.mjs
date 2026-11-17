/**
 * Controles de livraison (local puis prod) : sitemap XML, robots, favicons,
 * JSON-LD, sante de l'API.
 * Usage : node scripts/check-site.mjs [https://gala.boxingcenter.fr]
 */
const base = (process.argv[2] || 'http://127.0.0.1:5640').replace(/\/+$/, '');
const PROD = 'https://gala.boxingcenter.fr';
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'OK    ' : 'ERREUR'} ${name}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failed += 1;
}

async function get(path) {
  const res = await fetch(base + path, { redirect: 'manual' });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type') || '', text: body.toString('utf8'), size: body.length };
}

const sm = await get('/sitemap.xml');
check('sitemap 200', sm.status === 200, String(sm.status));
check('sitemap en XML', /xml/.test(sm.type) && sm.text.startsWith('<?xml'), sm.type);
check('sitemap urlset + loc', sm.text.includes('<urlset') && sm.text.includes(`<loc>${PROD}/`));
check('sitemap sans undefined', !sm.text.includes('undefined'));
check('sitemap couvre billetterie', sm.text.includes(`${PROD}/billetterie`));

const rb = await get('/robots.txt');
check('robots 200', rb.status === 200);
check('robots -> sitemap', rb.text.includes(`Sitemap: ${PROD}/sitemap.xml`));
check('robots bots IA', ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot-Image'].every((b) => rb.text.includes(b)));

for (const f of ['/favicon.ico', '/favicon-48x48.png', '/favicon-96x96.png', '/apple-touch-icon.png', '/favicon-512.png']) {
  const r = await get(f);
  check(`${f} image`, r.status === 200 && /^image\//.test(r.type) && r.size > 200, `${r.status} ${r.type}`);
}

const home = await get('/');
check('accueil 200', home.status === 200);
check('accueil rel=icon', home.text.includes('rel="icon" href="/favicon.ico"'));
check('JSON-LD knowsAbout', home.text.includes('"knowsAbout"'));
check('JSON-LD SearchAction', home.text.includes('SearchAction') && home.text.includes('/recherche?q='));
check('JSON-LD 3 evenements', (home.text.match(/"SportsEvent"/g) || []).length === 3);
check('hreflang fr-FR + x-default', home.text.includes('hreflang="fr-FR"') && home.text.includes('hreflang="x-default"'));

const nf = await get('/page-qui-nexiste-pas');
check('404 brandee', nf.status === 404 && nf.text.includes('KO technique'), String(nf.status));

const h = await get('/api/health');
check('/api/health 200', h.status === 200, String(h.status));

console.log(failed ? `\n${failed} controle(s) en erreur` : '\nTous les controles sont OK');
process.exit(failed ? 1 : 0);
