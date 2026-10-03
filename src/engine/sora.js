// Removing the Sora watermark from a video: find where the mark sits and when it moves, then rebuild the
// picture under it frame by frame. This is a separate engine from the Gemini/Veo one (engine.js), which it only
// borrows plain helpers from (reading frames, opening files). See sora-core.js (finding the mark) and
// fill.js / sora-fill.js (rebuilding what is under it).
import * as MB from 'mediabunny';
import * as SC from './sora-core.js';
import { fillBlock, makeFiller } from './sora-fill.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The block of the mark (icon, word and name) of an interval, in frame coordinates, with some room around it.
export function blockRect(iv, W, H, s) {
  const g = SC.geometry(s, iv.layout), pad = Math.round(14 * s);
  const x0 = Math.max(0, Math.floor(iv.x + g.bx - pad)), y0 = Math.max(0, Math.floor(iv.y + g.by - pad));
  const x1 = Math.min(W, Math.ceil(iv.x + g.bx + g.bw + pad)), y1 = Math.min(H, Math.ceil(iv.y + g.by + g.bh + pad));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// the crop used for filling: the block with a margin of real picture around it
export function cropRect(iv, W, H, s) {
  const r = blockRect(iv, W, H, s), m = Math.round(36 * s);
  const x0 = Math.max(0, r.x - m), y0 = Math.max(0, r.y - m), x1 = Math.min(W, r.x + r.w + m), y1 = Math.min(H, r.y + r.h + m);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
// the interval a moment belongs to
export function intervalAt(model, t) {
  const tol = model.tol || 0.02;
  for (const iv of model.intervals) if (t >= iv.t0 - tol && t <= iv.t1 + tol) return iv;
  return null;
}
// where the mark is at a moment (or where it sits for longest, as a place to look at)
export function rectAtTime(model, t) {
  const iv = t == null ? null : intervalAt(model, t);
  return iv ? iv.rect : model.rect;
}

export function makeSora(E, env, extra = {}) {
  const fillers = new WeakMap();                // one filler per logo spot, remembering the last frame
  const { withTrack, openInput, readFrame, targetBitrate, makeCanvas, stamps } = E;
  // a breath for the thread: a message, not a timer (browsers slow timers in background tabs)
  const idle = (() => {
    const ch = new MessageChannel(), waiting = [];
    ch.port1.onmessage = () => { const r = waiting.shift(); if (r) r(); };
    return () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
  })();
  const uerr = (msg) => { const e = new Error(msg); e.userMsg = msg; return e; };

  // ---- pixels of a decoded frame as RGB, and back ----
  function getRgb(fr, x0, y0, w, h) {
    const out = new Uint8Array(w * h * 3), P = fr.planes;
    if (fr.mode === 'rgb') {
      for (let c = 0; c < 3; c++) { const p = P[c]; for (let y = 0; y < h; y++) { let o = p.off + (y0 + y) * p.stride + x0 * p.step, q = y * w * 3 + c; for (let x = 0; x < w; x++, o += p.step, q += 3) out[q] = p.data[o]; } }
      return out;
    }
    const full = P[0].white === 255, ky = full ? 1 : 255 / 219, kc = full ? 1 : 255 / 224;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x0 + x, Y = y0 + y;
      const yy = P[0].data[P[0].off + Y * P[0].stride + X * P[0].step];
      const u = P[1].data[P[1].off + (Y >> (P[1].sy - 1)) * P[1].stride + (X >> (P[1].sx - 1)) * P[1].step];
      const v = P[2].data[P[2].off + (Y >> (P[2].sy - 1)) * P[2].stride + (X >> (P[2].sx - 1)) * P[2].step];
      const l = (yy - (full ? 0 : 16)) * ky, cb = (u - 128) * kc, cr = (v - 128) * kc, q = (y * w + x) * 3;
      const r = l + 1.5748 * cr, g = l - 0.1873 * cb - 0.4681 * cr, b = l + 1.8556 * cb;
      out[q] = r < 0 ? 0 : r > 255 ? 255 : r + 0.5; out[q + 1] = g < 0 ? 0 : g > 255 ? 255 : g + 0.5; out[q + 2] = b < 0 ? 0 : b > 255 ? 255 : b + 0.5;
    }
    return out;
  }
  // writes back only where `mask` is set (luma exactly there; chroma where its 2x2 block touches the mask)
  function putRgb(fr, x0, y0, w, h, rgb, mask) {
    const P = fr.planes;
    if (fr.mode === 'rgb') {
      for (let c = 0; c < 3; c++) { const p = P[c]; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) p.data[p.off + (y0 + y) * p.stride + (x0 + x) * p.step] = rgb[(y * w + x) * 3 + c]; }
      return;
    }
    const full = P[0].white === 255, ky = full ? 1 : 219 / 255, ycl = full ? 0 : 16, kc = full ? 1 : 224 / 255;
    const yuv = (q) => { const R = rgb[q], G = rgb[q + 1], B = rgb[q + 2], Y = 0.2126 * R + 0.7152 * G + 0.0722 * B; return [Y * ky + ycl, (B - Y) / 1.8556 * kc + 128, (R - Y) / 1.5748 * kc + 128]; };
    const p0 = P[0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { const v = yuv((y * w + x) * 3)[0]; p0.data[p0.off + (y0 + y) * p0.stride + (x0 + x) * p0.step] = v < 0 ? 0 : v > 255 ? 255 : v + 0.5; }
    const sx = P[1].sx, sy = P[1].sy, p1 = P[1], p2 = P[2];
    const cx0 = (x0 / sx) | 0, cy0 = (y0 / sy) | 0, cx1 = Math.ceil((x0 + w) / sx), cy1 = Math.ceil((y0 + h) / sy);
    for (let cy = cy0; cy < cy1; cy++) for (let cx = cx0; cx < cx1; cx++) {
      let u = 0, v = 0, n = 0, touched = false;
      for (let dy = 0; dy < sy; dy++) for (let dx = 0; dx < sx; dx++) {
        const X = cx * sx + dx - x0, Y = cy * sy + dy - y0;
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        if (mask[Y * w + X]) touched = true;
        const c = yuv((Y * w + X) * 3); u += c[1]; v += c[2]; n++;
      }
      if (!touched || !n) continue;
      u /= n; v /= n;
      p1.data[p1.off + cy * p1.stride + cx * p1.step] = u < 0 ? 0 : u > 255 ? 255 : u + 0.5;
      p2.data[p2.off + cy * p2.stride + cx * p2.step] = v < 0 ? 0 : v > 255 ? 255 : v + 0.5;
    }
  }

  // ---- finding the mark ----
  // pictures for detection are made at a working size (the short side about 720 px); positions are kept in
  // the video's own pixels
  const workScale = (info) => Math.min(1, 720 / Math.min(info.w, info.h));
  // box-average an RGB picture down to dw x dh (a copy when the size is the same)
  function shrink(rgb, w, h, dw, dh) {
    if (dw === w && dh === h) return rgb;
    const out = new Uint8Array(dw * dh * 3), fx = w / dw, fy = h / dh;
    for (let y = 0; y < dh; y++) {
      const y0 = Math.floor(y * fy), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) * fy)));
      for (let x = 0; x < dw; x++) {
        const x0 = Math.floor(x * fx), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) * fx)));
        let r = 0, g = 0, b = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 3; r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; n++; }
        const o = (y * dw + x) * 3; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
      }
    }
    return out;
  }
  // RGB of a rectangle of a decoded frame, shrunk to dw x dh
  const look = (fr, x, y, w, h, dw, dh) => shrink(getRgb(fr, x, y, w, h), w, h, dw, dh);

  /** @returns a model: { ok:false } when the file has no Sora mark, otherwise everything needed to remove it */
  async function detectSora(item, onP) {
    const info = item.info, W = info.w, H = info.h, r = workScale(info), ww = Math.max(8, Math.round(W * r)), wh = Math.max(8, Math.round(H * r));
    return withTrack(item, async (track) => {
      const sink = new MB.VideoSampleSink(track), holder = {}, whole = { x: 0, y: 0, w: W, h: H };
      // 1. a few frames, the whole picture: where could it be, and how big?
      const ts = stamps(info, 12), samples = [], scales = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];
      let k = 0;
      for await (const s of sink.samplesAtTimestamps(ts)) {
        if (env.cancel) throw uerr('Stopped.');
        if (s) {
          try { const fr = await readFrame(s, whole, holder), rgb = look(fr, 0, 0, W, H, ww, wh); samples.push({ t: s.timestamp, peaks: SC.scanFrame(rgb, ww, wh, scales).peaks }); } finally { s.close(); }
        }
        onP(0.06 * (++k / ts.length)); await idle();
      }
      const cl = SC.clusterSlots(samples);
      if (!cl) return { ok: false, engine: 'sora' };
      const sw = cl.s;                                     // icon scale at working size
      const sf = sw / r;                                   // ... in the video's own pixels
      // which side of the icon the text is on, from the frames where each slot was seen
      const slots = cl.slots.map((p) => ({ wx: p.x, wy: p.y, x: p.x / r, y: p.y / r, layout: 'L' }));
      {
        const wd = SC.wordAt(sw), seen = new Map();
        for (const h of cl.hits) { const sl = slots.findIndex((q) => Math.abs(q.wx - h.x) < 12 * sw && Math.abs(q.wy - h.y) < 12 * sw); if (sl >= 0) { if (!seen.has(sl)) seen.set(sl, []); seen.get(sl).push(h.t); } }
        for (const [si, times] of seen) {
          const sc = { L: 0, R: 0 };
          for await (const s of sink.samplesAtTimestamps(times.slice(0, 3))) {
            if (!s) continue;
            try {
              const fr = await readFrame(s, whole, holder), rgb = look(fr, 0, 0, W, H, ww, wh);
              for (const lay of ['L', 'R']) {
                const g = SC.geometry(sw, lay), wx = Math.round(slots[si].wx + g.wx), wy = Math.round(slots[si].wy + g.wy);
                if (wx < 0 || wy < 0 || wx + wd.w > ww || wy + wd.h > wh) continue;
                let sum = 0, cnt = 0;
                for (let y = 0; y < wd.h; y++) for (let x = 0; x < wd.w; x++) { if (wd.a[y * wd.w + x] < 153) continue; const i = ((wy + y) * ww + wx + x) * 3, m = Math.min(rgb[i], rgb[i + 1], rgb[i + 2]); sum += m <= 120 ? 0 : m >= 180 ? 1 : (m - 120) / 60; cnt++; }
                sc[lay] += sum / Math.max(1, cnt);
              }
            } finally { s.close(); }
          }
          slots[si].layout = sc.L >= sc.R ? 'L' : 'R';
        }
      }
      // 2. every frame: how strongly is the mark at each slot? Meanwhile keep pictures of each slot from frames
      // where it is not there (to copy from later).
      const K = SC.kernelAt(sw), n = K.n, win = n + 16, total = Math.max(1, Math.round((info.dur - info.first) * info.fps));
      const crops = slots.map((sl) => { const iv = { x: sl.x, y: sl.y, layout: sl.layout }; return cropRect(iv, W, H, sf); });
      const keep = 36, store = slots.map(() => []), stride = slots.map(() => 1), tick = slots.map(() => 0);
      const times = [], scores = slots.map(() => []), where = slots.map(() => []), state = slots.map((sl) => ({ x: sl.wx, y: sl.wy, score: 0 }));
      let idx = 0;
      for await (const s of sink.samples()) {
        if (env.cancel) { s.close(); throw uerr('Stopped.'); }
        try {
          const fr = await readFrame(s, whole, holder);
          times.push(s.timestamp);
          slots.forEach((sl, si) => {
            const wx0 = Math.max(0, Math.round(sl.wx) - 8), wy0 = Math.max(0, Math.round(sl.wy) - 8);
            const ew = Math.min(win, ww - wx0), eh = Math.min(win, wh - wy0);
            const sx = Math.round(wx0 / r), sy = Math.round(wy0 / r), sw2 = Math.min(W - sx, Math.round(ew / r)), sh2 = Math.min(H - sy, Math.round(eh / r));
            const rgb = look(fr, sx, sy, sw2, sh2, ew, eh);
            // cheap first: look at the last known place; only when something white is there, search around it
            const wm = SC.whiteness(rgb, ew, eh), st = state[si], px = Math.round(st.x) - wx0, py = Math.round(st.y) - wy0;
            let best = { score: SC.scoreAt(wm, ew, eh, px, py, K), x: px, y: py };
            if (best.score > 0.2) best = SC.refine(wm, ew, eh, px, py, K, st.score > 0.5 ? 2 : 4);
            else if (st.score <= 0.2 && (idx & 3) === 0) best = SC.refine(wm, ew, eh, Math.round(sl.wx) - wx0, Math.round(sl.wy) - wy0, K, 6);
            st.score = best.score; if (best.score > 0.5) { st.x = wx0 + best.x; st.y = wy0 + best.y; }
            scores[si].push(best.score); where[si].push({ x: (wx0 + best.x) / r, y: (wy0 + best.y) / r });
            // a clean picture of this slot
            if (best.score < 0.3 && (tick[si]++ % stride[si]) === 0) {
              const c = crops[si];
              store[si].push({ t: s.timestamp, rgb: getRgb(fr, c.x, c.y, c.w, c.h) });
              if (store[si].length > keep) { store[si] = store[si].filter((_, i) => i % 2 === 0); stride[si] *= 2; }
            }
          });
        } finally { s.close(); }
        idx++;
        if (idx % 8 === 0) { onP(0.06 + 0.9 * Math.min(1, idx / total)); await idle(); }
      }
      const n2 = times.length;
      // 3. only one mark is on screen at a time: a slot that is clearly weaker than another at the same moment is not there
      for (let t = 0; t < n2; t++) { let m = 0; for (let q = 0; q < slots.length; q++) m = Math.max(m, scores[q][t]); for (let q = 0; q < slots.length; q++) if (scores[q][t] < m - 0.12) scores[q][t] = 0; }
      const intervals = [];
      slots.forEach((sl, si) => {
        for (const [a, b] of SC.runsOf(Float32Array.from(scores[si]))) {
          const xs = [], ys = [];
          for (let t = a; t <= b; t++) if (scores[si][t] > 0.6) { xs.push(where[si][t].x); ys.push(where[si][t].y); }
          xs.sort((p, q) => p - q); ys.sort((p, q) => p - q);
          const iv = { slot: si, a, b, t0: times[a], t1: times[b], x: xs.length ? xs[xs.length >> 1] : sl.x, y: ys.length ? ys[ys.length >> 1] : sl.y, layout: sl.layout };
          // the crop is the slot's own, so the pictures kept from frames without the mark line up with it exactly
          iv.rect = blockRect(iv, W, H, sf); iv.crop = crops[si];
          const mid = (iv.t0 + iv.t1) / 2;
          iv.pool = store[si].slice().sort((p, q) => Math.abs(p.t - mid) - Math.abs(q.t - mid)).slice(0, 14).map((d) => ({ t: d.t, rgb: d.rgb }));
          intervals.push(iv);
        }
      });
      if (!intervals.length) return { ok: false, engine: 'sora' };
      intervals.sort((p, q) => p.t0 - q.t0);
      // the longest interval stands for "where the mark is" in previews
      const main = intervals.reduce((p, q) => (q.t1 - q.t0 > p.t1 - p.t0 ? q : p), intervals[0]);
      return { ok: true, engine: 'sora', kind: 'video', gemini: false, veo: false, W, H, s: sf, tol: 0.5 / (info.fps || 30), intervals, rect: main.rect, mainT: (main.t0 + main.t1) / 2, frames: n2, hits: cl.hits.length };
    });
  }

  // ---- helper threads: the frames of a run are dealt out in chunks, each worked on by one helper in order ----
  function makeFillPool(count) {
    const ws = [];
    try { for (let i = 0; i < count; i++) ws.push(extra.newFillWorker()); } catch (e) { for (const w of ws) w.terminate(); return null; }
    const jobs = new Map(); let seq = 0, dead = false;
    const fail = (why) => { dead = true; for (const [, j] of jobs) j.reject(new Error(why)); jobs.clear(); };
    ws.forEach((w) => { w.onmessage = (e) => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); if (e.data.error) j.reject(new Error(e.data.error)); else j.resolve(e.data); }; w.onerror = () => fail('A helper thread stopped'); });
    return {
      n: count,
      setPool(key, pool, donorMask) { for (const w of ws) w.postMessage({ type: 'pool', key, pool, donorMask }); },
      run(chunk, job) {
        if (dead) return Promise.reject(new Error('A helper thread stopped'));
        return new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); ws[chunk % count].postMessage({ type: 'fill', id, ...job }, [job.rgb.buffer, job.mask.buffer]); });
      },
      close() { fail('closed'); for (const w of ws) w.terminate(); },
    };
  }
  const cores = () => Math.max(1, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4) - 2);

  // ---- removing it ----
  // One frame. `model.intervals[k].pool` pictures are in the interval's own crop rectangle.
  async function cleanSample(s, model, holder) {
    const iv = intervalAt(model, s.timestamp);
    if (!iv || s.displayWidth !== model.W || s.displayHeight !== model.H) return s;
    const c = iv.crop, fr = await readFrame(s, c, holder);
    const rgb = getRgb(fr, c.x, c.y, c.w, c.h);
    const mask = iv.mask || SC.buildMask({ x0: c.x, y0: c.y, w: c.w, h: c.h, rgb }, iv.x, iv.y, model.s, iv.layout);
    let f = fillers.get(iv); if (!f) { f = makeFiller(); fillers.set(iv, f); }
    const r = f.fill({ w: c.w, h: c.h, rgb }, mask, iv.pool.filter((p) => p.rgb.length === c.w * c.h * 3), { s: model.s, seed: 1 + (iv.a & 15), donorMask: iv.mask || null });
    putRgb(fr, c.x, c.y, c.w, c.h, r.rgb, mask);
    return fr.toSample();
  }

  async function convert(item, model, onP, live, hold) {
    const input = openInput(item.file);
    let fp = null, producer = null;
    try {
      const target = new MB.BufferTarget();
      const output = new MB.Output({ format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
      const quality = new MB.Quality({ bitrate: targetBitrate(item.info, env.quality), bitrateMode: 'variable' });
      const codec = await MB.getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: item.info.w, height: item.info.h, quality });
      if (!codec) throw uerr('This browser cannot encode video at this resolution. Use a recent Chrome or Edge on a computer.');
      const holder = {};
      let frameNo = 0, consumed = 0;
      // with helper threads, a producer runs ahead of the writer: it reads each frame of a logo interval and hands
      // its picture to a helper; the writer then only puts the finished pictures in
      const futures = new Map(), masks = new Map();
      let prodDone = false;
      const ivIndex = (iv) => model.intervals.indexOf(iv);
      if (extra.newFillWorker && cores() >= 2 && model.intervals.length) {
        fp = makeFillPool(Math.min(cores(), 6));
        if (fp) {
          model.intervals.forEach((iv, k) => fp.setPool(k, iv.pool.filter((p) => p.rgb.length === iv.crop.w * iv.crop.h * 3).map((p) => p.rgb.slice()), iv.mask ? iv.mask.slice() : null));
          const CH = 16, LOOK = fp.n * CH * 2;
          producer = (async () => {
            const pin = openInput(item.file), ph = {};
            try {
              const sink = new MB.VideoSampleSink(await pin.getPrimaryVideoTrack());
              let idx = 0; const seen = new Map();
              for await (const s of sink.samples()) {
                try {
                  if (env.cancel) return;
                  const iv = intervalAt(model, s.timestamp);
                  if (iv) {
                    while (idx - consumed > LOOK && !env.cancel) await new Promise((r) => setTimeout(r, 4));
                    const c = iv.crop, k = ivIndex(iv), n0 = seen.get(k) || 0; seen.set(k, n0 + 1);
                    const fr = await readFrame(s, c, ph), rgb = getRgb(fr, c.x, c.y, c.w, c.h);
                    const mask = iv.mask ? iv.mask.slice() : SC.buildMask({ x0: c.x, y0: c.y, w: c.w, h: c.h, rgb }, iv.x, iv.y, model.s, iv.layout);
                    masks.set(s.timestamp, mask);
                    const chunk = Math.floor(n0 / CH);
                    const job = fp.run(chunk + k, { key: k, w: c.w, h: c.h, rgb, mask: mask.slice(), s: model.s, seed: 1 + (iv.a & 15), fresh: n0 % CH === 0 });
                    job.catch(() => {});
                    futures.set(s.timestamp, job);
                  }
                } finally { s.close(); }
                idx++;
              }
            } finally { try { pin.dispose(); } catch (e) { /* closed */ } }
          })();
          producer.catch(() => {}).finally(() => { prodDone = true; });
        }
      }
      const conv = await MB.Conversion.init({
        input, output, showWarnings: false,
        video: {
          codec, quality, forceTranscode: true,
          process: async (s) => {
            if (hold) await hold();
            let out = s;
            const iv = intervalAt(model, s.timestamp);
            if (iv && fp) {
              // wait for this frame's helper, unless the producer failed or was stopped
              let f = futures.get(s.timestamp);
              for (let w = 0; !f && w < 4000 && !env.cancel; w++) { if (prodDone) break; await new Promise((r) => setTimeout(r, 5)); f = futures.get(s.timestamp); }
              if (f) {
                const res = await f; futures.delete(s.timestamp);
                const c = iv.crop, fr = await readFrame(s, c, holder), mask = masks.get(s.timestamp); masks.delete(s.timestamp);
                putRgb(fr, c.x, c.y, c.w, c.h, res.rgb, mask);
                out = fr.toSample();
              } else out = await cleanSample(s, model, holder);
            } else if (iv) out = await cleanSample(s, model, holder);
            consumed++;
            if (live && out !== s && frameNo++ % 12 === 0) { try { live(s, out); } catch (e) { /* only a preview */ } }
            return out;
          },
        },
      });
      if (!conv.isValid) throw uerr('This video cannot be converted (' + conv.discardedTracks.map((d) => d.track.type + ': ' + d.reason).join(', ') + ').');
      conv.onProgress = (p) => onP(p);
      env.conv = conv;
      await conv.execute();
      env.conv = null;
      item.outCodec = codec;
      return new Blob([target.buffer], { type: 'video/mp4' });
    } finally { env.conv = null; if (fp) fp.close(); try { input.dispose(); } catch (e) { /* closed */ } }
  }

  // ---- a logo the person pointed out (a box): it does not move, so the picture under it is rebuilt from other
  // frames (where the scene moved) and from around it ----
  const boxMask = (w, h, r, grow) => { const m = new Uint8Array(w * h); for (let y = Math.max(0, r.y - grow); y < Math.min(h, r.y + r.h + grow); y++) for (let x = Math.max(0, r.x - grow); x < Math.min(w, r.x + r.w + grow); x++) m[y * w + x] = 1; return m; };
  function logoGeometry(rect, W, H) {
    const pad = Math.max(2, Math.round(0.04 * Math.max(rect.w, rect.h)));
    const m = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), w: 0, h: 0 };
    m.w = Math.min(W, rect.x + rect.w + pad) - m.x; m.h = Math.min(H, rect.y + rect.h + pad) - m.y;
    const margin = Math.max(40, Math.round(0.7 * Math.max(m.w, m.h)));
    const cx0 = Math.max(0, m.x - margin), cy0 = Math.max(0, m.y - margin), cx1 = Math.min(W, m.x + m.w + margin), cy1 = Math.min(H, m.y + m.h + margin);
    const crop = { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 };
    const mask = boxMask(crop.w, crop.h, { x: m.x - crop.x, y: m.y - crop.y, w: m.w, h: m.h }, 0);
    return { mrect: m, crop, mask, s: clamp(Math.max(m.w, m.h) / 110, 0.5, 2.5) };
  }
  // Where in the box the logo really is. A logo that never moves stays the same while the picture behind it changes,
  // so its pixels hardly vary from frame to frame, unlike the ones around it. Only where the picture varies enough to
  // tell (and the result is a believable shape) is the box narrowed down to that; otherwise the whole box is used.
  function narrowToLogo(pool, crop, box, grow) {
    const w = crop.w, h = crop.h, n = pool.length; if (n < 6) return null;
    const mean = new Float32Array(w * h), sq = new Float32Array(w * h);
    for (const p of pool) for (let i = 0; i < w * h; i++) { const y = 0.2126 * p.rgb[i * 3] + 0.7152 * p.rgb[i * 3 + 1] + 0.0722 * p.rgb[i * 3 + 2]; mean[i] += y; sq[i] += y * y; }
    const sd = new Float32Array(w * h); for (let i = 0; i < w * h; i++) { const m = mean[i] / n; sd[i] = Math.sqrt(Math.max(0, sq[i] / n - m * m)); }
    const around = [], bx0 = box.x - crop.x, by0 = box.y - crop.y, ring = 24;
    for (let y = Math.max(0, by0 - ring); y < Math.min(h, by0 + box.h + ring); y++) for (let x = Math.max(0, bx0 - ring); x < Math.min(w, bx0 + box.w + ring); x++) if (x < bx0 || y < by0 || x >= bx0 + box.w || y >= by0 + box.h) around.push(sd[y * w + x]);
    if (around.length < 50) return null;
    around.sort((a, b) => a - b); const out = around[around.length >> 1];
    if (out < 6) return null;                                   // the picture hardly moves: nothing to tell the logo from
    const thr = Math.max(2.5, 0.45 * out), L = new Uint8Array(w * h); let cnt = 0;
    for (let y = by0; y < by0 + box.h; y++) for (let x = bx0; x < bx0 + box.w; x++) if (sd[y * w + x] < thr) { L[y * w + x] = 1; cnt++; }
    if (cnt < 0.05 * box.w * box.h || cnt > 0.9 * box.w * box.h) return null;
    // grow by `grow` pixels (edges and soft glow), inside the box
    const G = new Uint8Array(w * h);
    for (let y = by0; y < by0 + box.h; y++) for (let x = bx0; x < bx0 + box.w; x++) {
      if (!L[y * w + x]) continue;
      for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) { const X = x + dx, Y = y + dy; if (X >= bx0 && Y >= by0 && X < bx0 + box.w && Y < by0 + box.h) G[Y * w + X] = 1; }
    }
    return G;
  }
  async function prepareLogo(item, rect, onP) {
    const info = item.info, W = info.w, H = info.h, g = logoGeometry(rect, W, H);
    return withTrack(item, async (track) => {
      const sink = new MB.VideoSampleSink(track), holder = {}, ts = stamps(info, 16), pool = [];
      let k = 0;
      for await (const s of sink.samplesAtTimestamps(ts)) {
        if (env.cancel) throw uerr('Stopped.');
        if (s) { try { const fr = await readFrame(s, g.crop, holder); pool.push({ t: s.timestamp, rgb: getRgb(fr, g.crop.x, g.crop.y, g.crop.w, g.crop.h) }); } finally { s.close(); } }
        onP(++k / ts.length); await idle();
      }
      const narrowed = narrowToLogo(pool, g.crop, g.mrect, Math.max(3, Math.round(g.s * 2)));
      const iv = { slot: 0, a: 0, b: 1e9, t0: info.first - 1, t1: info.dur + 1, x: 0, y: 0, layout: 'L', rect: g.mrect, crop: g.crop, mask: narrowed || g.mask, pool };
      return { ok: true, engine: 'logo', kind: 'video', gemini: false, veo: false, W, H, s: g.s, tol: 0.5 / (info.fps || 30), intervals: [iv], rect: g.mrect, mainT: info.first + Math.min(1, (info.dur - info.first) * 0.3), frames: pool.length };
    });
  }
  // a photo: the box is filled in from around it
  async function logoImage(item, rect) {
    const W = item.info.w, H = item.info.h, g = logoGeometry(rect, W, H);
    const cv = makeCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(item.bmp, 0, 0);
    const c = g.crop, img = cx.getImageData(c.x, c.y, c.w, c.h), rgb = new Uint8Array(c.w * c.h * 3);
    for (let i = 0, j = 0; i < c.w * c.h * 4; i += 4, j += 3) { rgb[j] = img.data[i]; rgb[j + 1] = img.data[i + 1]; rgb[j + 2] = img.data[i + 2]; }
    await idle();
    const r = fillBlock({ w: c.w, h: c.h, rgb }, g.mask, [], { s: g.s, seed: 7 });
    for (let i = 0; i < c.w * c.h; i++) if (g.mask[i]) { img.data[i * 4] = r.rgb[i * 3]; img.data[i * 4 + 1] = r.rgb[i * 3 + 1]; img.data[i * 4 + 2] = r.rgb[i * 3 + 2]; }
    cx.putImageData(img, c.x, c.y);
    return { kind: 'image', ok: true, engine: 'logo', gemini: false, rect: g.mrect, out: cv, max: 1, size: Math.max(g.mrect.w, g.mrect.h), method: 'fill' };
  }

  return { detectSora, prepareLogo, logoImage, cleanSample, convert, getRgb, putRgb };
}
