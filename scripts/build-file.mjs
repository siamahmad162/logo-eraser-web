// After `vite build --mode file`: fold the script and stylesheet into the page itself, giving one
// HTML file that opens from disk with a double-click (for testing without a server).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'dist-file');
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const read = (href) => fs.readFileSync(path.join(dir, href.replace(/^\.\//, '')), 'utf8');

// the page script goes last in <body>, so the loading screen is drawn before the browser reads it
let moduleTag = '';
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  // a closing tag inside the code would end the inline script early
  const js = read(src).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
  moduleTag = '<script type="module">' + js + '</script>';
  return '';
});
html = html.replace('</body>', () => moduleTag + '\n</body>');
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => '<style>' + read(href) + '</style>');
const icon = fs.readFileSync(path.join(root, 'public/favicon.svg'));
html = html.replace('href="./favicon.svg"', 'href="data:image/svg+xml;base64,' + icon.toString('base64') + '"');
// Something to see while the (large) page script is read, and the reason if it fails to start.
const boot = `<div id="boot" style="min-height:100vh;display:grid;place-content:center;justify-items:center;gap:14px;background:#07080b;color:#f3f4f8;font:16px system-ui,sans-serif;text-align:center;padding:24px">
<div style="width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.15);border-top-color:#ff4d8d;animation:bootspin .8s linear infinite"></div>
<strong style="font-size:20px">Loading VanishLogo…</strong>
<span id="boot-msg" style="color:#a3aabb;max-width:46ch">This test file holds the whole site, videos included, so it can take a few seconds.</span>
<pre id="boot-err" style="display:none;white-space:pre-wrap;color:#ffb4c8;background:#1a0f15;border:1px solid #5a2036;border-radius:10px;padding:12px 14px;max-width:80ch;text-align:left;font-size:13px"></pre>
<noscript><p style="color:#ffb4c8">JavaScript is turned off in this browser, so the site cannot start.</p></noscript>
<style>@keyframes bootspin{to{transform:rotate(360deg)}}</style></div>`;
const bootScript = `<script>(function(){var t=setTimeout(function(){var m=document.getElementById('boot-msg');if(m)m.textContent='Still loading. If nothing appears, open this file in a current Chrome or Edge, and send a screenshot of this screen.'},20000);
window.addEventListener('error',function(e){var x=document.getElementById('boot-err');if(!x)return;x.style.display='block';x.textContent+=(e.message||'Error')+(e.filename?'\\n  at '+String(e.filename).slice(-60)+':'+e.lineno:'')+'\\n';});
window.__bootDone=function(){clearTimeout(t)};})();</script>`;
html = html.replace('<!--head-->', bootScript).replace('<!--app-->', boot);
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('an asset was left un-inlined');

const out = path.join(dir, 'VanishLogo-test.html');
fs.writeFileSync(out, html);
console.log(`${path.relative(root, out)}  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);
