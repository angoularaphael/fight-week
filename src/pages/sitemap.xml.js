import { SITE } from '../../lib/event.js';
import { PAGES } from '../data/pages.js';

export const prerender = true;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function GET() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PAGES.filter((p) => p.path !== '/recherche')
    .map((p) => {
      const loc = p.path === '/' ? SITE.url + '/' : SITE.url + p.path;
      const image =
        p.path === '/'
          ? `\n    <image:image><image:loc>${esc(`${SITE.url}/img/og-fight-and-furious.jpg`)}</image:loc></image:image>`
          : '';
      return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>${image}\n  </url>`;
    })
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
