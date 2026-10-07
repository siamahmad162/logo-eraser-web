// After the client and server builds: render every page to its own HTML file so the site is fast
// and readable by search engines before any JavaScript runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssr = path.join(root, 'dist-ssr');
const { render, ROUTES, NOT_FOUND, SITE, ADS } = await import(pathToFileURL(path.join(ssr, 'entry-server.js')).href);
const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
// preload the two fonts the first screen uses, so text doesn't reflow when they arrive
const fonts = fs.readdirSync(path.join(dist, 'assets')).filter((f) => /^geist(-mono)?-latin-wght-normal-.*\.woff2$/.test(f));
const preload = fonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function page(meta, html) {
  const head = [
    ...preload,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  ];
  if (SITE.url && meta !== NOT_FOUND) {
    const url = SITE.url + meta.path;
    head.push(`<link rel="canonical" href="${esc(url)}" />`, `<meta property="og:url" content="${esc(url)}" />`, `<meta property="og:image" content="${esc(SITE.url)}/og.png" />`);
  }
  if (meta === NOT_FOUND) head.push('<meta name="robots" content="noindex" />');
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace('<meta name="description" content="" />', `<meta name="description" content="${esc(meta.description)}" />`)
    .replace('<!--head-->', head.join('\n    '))
    .replace('data-page=""', `data-page="${esc(meta.path)}"`)
    .replace('<!--app-->', html);
}

for (const r of ROUTES) {
  const file = path.join(dist, r.path === '/' ? 'index.html' : r.path.slice(1) + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(r, render(r.path)));
}
fs.writeFileSync(path.join(dist, '404.html'), page(NOT_FOUND, render('/404')));

if (SITE.url) {
  const urls = ROUTES.map((r) => `  <url><loc>${SITE.url}${r.path}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  fs.appendFileSync(path.join(dist, 'robots.txt'), `\nSitemap: ${SITE.url}/sitemap.xml\n`);
}
// ads.txt tells ad buyers who may sell this site's ads; the lines come from the ad company (see ADS in src/site.ts)
if (ADS.adsTxt.length) fs.writeFileSync(path.join(dist, 'ads.txt'), ADS.adsTxt.join('\n') + '\n');
fs.rmSync(ssr, { recursive: true, force: true });
console.log(`prerendered ${ROUTES.length} pages + 404`);
