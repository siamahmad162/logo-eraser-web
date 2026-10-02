// After `vite build --mode file`: fold the script and stylesheet into the page itself, giving one
// HTML file that opens from disk with a double-click (for testing without a server).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'dist-file');
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const read = (href) => fs.readFileSync(path.join(dir, href.replace(/^\.\//, '')), 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  // a closing tag inside the code would end the inline script early
  const js = read(src).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  return '<script type="module">' + js + '</script>';
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => '<style>' + read(href) + '</style>');
const icon = fs.readFileSync(path.join(root, 'public/favicon.svg'));
html = html.replace('href="./favicon.svg"', 'href="data:image/svg+xml;base64,' + icon.toString('base64') + '"');
html = html.replace('<!--head-->', '').replace('<!--app-->', '');
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('an asset was left un-inlined');

const out = path.join(dir, 'ClearFrame-test.html');
fs.writeFileSync(out, html);
console.log(`${path.relative(root, out)}  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
