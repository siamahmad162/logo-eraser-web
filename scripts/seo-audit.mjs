// Checks the built pages (run after `npm run build`): titles, descriptions, headings, structured data, text length,
// image alt text and internal links. Exits with an error when something is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'assets') walk(p); } else if (f.name.endsWith('.html')) files.push(p); } })(dist);
const route = (f) => { const r = '/' + path.relative(dist, f).replace(/\.html$/, ''); return r === '/index' ? '/' : r; };
const routes = new Set(files.map(route));
const TOOLS = ['/gemini-omni-watermark-remover', '/veo-watermark-remover', '/gemini-photo-watermark-remover'];
const LEGAL = ['/terms', '/privacy'];
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const titles = new Map(), descs = new Map();
let bad = 0;
const fail = (r, m) => { bad++; console.log('  FAIL', r, '-', m); };

for (const f of files) {
  const r = route(f), html = fs.readFileSync(f, 'utf8');
  if (r === '/404') { if (!/noindex/.test(html)) fail(r, 'the 404 page must be noindex'); continue; }
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '', desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  if (title.length < 25 || title.length > 66) fail(r, `title length ${title.length}: ${title}`);
  if (desc.length < 90 || desc.length > 165) fail(r, `description length ${desc.length}`);
  if (titles.has(title)) fail(r, `same title as ${titles.get(title)}`); titles.set(title, r);
  if (descs.has(desc)) fail(r, `same description as ${descs.get(desc)}`); descs.set(desc, r);
  const main = html.replace(/<(header|footer)[\s\S]*?<\/\1>/g, (m) => (/<h1[\s>]/.test(m) ? m : ' '));
  const h1 = (html.match(/<h1[\s>]/g) || []).length, h2 = (main.match(/<h2[\s>]/g) || []).length;
  if (h1 !== 1) fail(r, `${h1} h1 headings`);
  if (h2 < 2 && !LEGAL.includes(r) && r !== '/contact') fail(r, `only ${h2} h2 headings`);
  const words = text(html.replace(/<(nav|header|footer)[\s\S]*?<\/\1>/g, ' ')).split(' ').length;
  const need = TOOLS.includes(r) ? 1100 : r.startsWith('/use-cases/') || r === '/gemini-watermark-remover' ? 900 : r === '/use-cases' ? 400 : r.startsWith('/guides/') ? 450 : r === '/' || r.endsWith('-watermark-remover') ? 600 : 150;
  if (words < need) fail(r, `${words} words of text, wants ${need}`);
  for (const tag of ['og:title', 'og:description', 'twitter:title', 'twitter:description', 'og:site_name']) if (!html.includes(tag)) fail(r, `missing ${tag}`);
  if (!/<html lang="en"/.test(html) || !/name="viewport"/.test(html)) fail(r, 'missing lang or viewport');
  const types = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { const j = JSON.parse(m[1].replace(/\\u003c/g, '<')); for (const x of j['@graph'] || [j]) types.push(x['@type']); } catch (e) { fail(r, 'structured data is not valid JSON'); }
  }
  if (TOOLS.includes(r)) for (const t of ['WebApplication', 'HowTo', 'FAQPage', 'BreadcrumbList']) if (!types.includes(t)) fail(r, `missing ${t} structured data`);
  if (r.startsWith('/use-cases/') || r === '/gemini-watermark-remover') for (const t of ['WebPage', 'FAQPage', 'BreadcrumbList']) if (!types.includes(t)) fail(r, `missing ${t} structured data`);
  if (r.startsWith('/guides/') && !types.includes('Article')) fail(r, 'missing Article structured data');
  if (r === '/' && !types.includes('WebSite')) fail(r, 'missing WebSite structured data');
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) fail(r, 'an image has no alt attribute');
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const h = m[1];
    if (/^(mailto:|https?:|#)/.test(h)) continue;
    const t = h.split('#')[0].replace(/\/$/, '') || '/';
    if (!routes.has(t) && !fs.existsSync(path.join(dist, t))) fail(r, `broken link ${h}`);
  }
}
// every page is linked from somewhere (no orphans)
const linked = new Set();
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/<a\b[^>]*href="(\/[^"#]*)"/g)) linked.add(m[1].replace(/\/$/, '') || '/');
for (const r of routes) if (r !== '/404' && r !== '/' && !linked.has(r)) fail(r, 'no page links to it');
console.log(`${files.length - 1} pages checked, ${bad} problem${bad === 1 ? '' : 's'}`);
process.exit(bad ? 1 : 0);
