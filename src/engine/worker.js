// Runs the heavy parts of the engine (finding the logo, learning it, cleaning and writing the video) off the page's thread.
import { makeEngine } from './engine.js';

const env = { cancel: false, quality: 'max', conv: null };
const E = makeEngine(env);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let holding = false;
const post = (m, transfer) => self.postMessage(m, transfer || []);
const fail = (id, e) => post({ id, type: 'error', msg: (e && e.userMsg) || null, text: (e && (e.message || e.name)) || String(e), cancelled: !!(e && (e.userMsg === 'Stopped.' || (e.name === 'ConversionCanceledError'))) });
const progress = (id) => { let last = 0; return (p) => { const now = performance.now(); if (p < 1 && now - last < 60) return; last = now; post({ id, type: 'progress', p }); }; };

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'cancel') { env.cancel = true; if (env.conv) env.conv.cancel().catch(() => {}); return; }
  if (m.type === 'hold') { holding = !!m.on; return; }
  const item = m.item;
  env.cancel = false; env.quality = m.quality || env.quality;
  try {
    if (m.type === 'detect') {
      post({ id: m.id, type: 'done', result: await E.detectLogo(item, progress(m.id)) });
    } else if (m.type === 'learn') {
      post({ id: m.id, type: 'done', result: await E.learn(item, m.rect, progress(m.id), m.guess) });
    } else if (m.type === 'convert') {
      // pictures of the work in progress, drawn here and handed over as bitmaps
      let live = null;
      if (m.live) {
        const L = m.live, mk = (w, h) => new OffscreenCanvas(w, h);
        const cb = mk(L.cu[0], L.cu[1]), ca = mk(L.cu[0], L.cu[1]), th = mk(L.th[0], L.th[1]);
        const draw = (src, cv) => { const c = cv.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.clearRect(0, 0, cv.width, cv.height); src.draw(c, L.g.sx, L.g.sy, L.g.sw, L.g.sh, 0, 0, cv.width, cv.height); };
        live = (s, out) => {
          draw(s, cb); draw(out, ca);
          const c = th.getContext('2d'); out.draw(c, L.cr.sx, L.cr.sy, L.cr.sw, L.cr.sh, 0, 0, th.width, th.height);
          const bs = [cb.transferToImageBitmap(), ca.transferToImageBitmap(), th.transferToImageBitmap()];
          post({ id: m.id, type: 'live', b: bs[0], a: bs[1], t: bs[2] }, bs);
        };
      }
      const hold = async () => { while (holding && !env.cancel) await sleep(60); };
      const blob = await E.convert(item, m.model, progress(m.id), live, hold);
      post({ id: m.id, type: 'done', result: blob, outCodec: item.outCodec });
    }
  } catch (err) { fail(m.id, err); }
};
