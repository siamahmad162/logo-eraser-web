// The Sora watermark: finding it, and the mask to hide. No page, no video library: only pictures in, numbers out.
//
// What the mark is (measured on real Sora downloads): a white cloud icon with two animated eyes, the word "Sora"
// and, under it, the creator's name. It is about 80% opaque, so what is under it is gone; the pictures behind
// it have to be rebuilt (see fill.js). It sits in one place for a few seconds, fades out, and reappears somewhere
// else (a corner or the middle of a side). Its size and opacity differ from video to video.

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const ICON = { w: 63, h: 63, a: b64('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOGB8rNklTXmJkZmNdUEc0JxsWEhUVFRQNAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADRAWHCgyP0ZTWmVnbXN5foKGhoR4aFM/LB0XFRQRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPEBslMjpKVWZygYiPjo+Oj5OWnaavtri0q5iCZ0s0JhsTEA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWIDM8SFFicYONm6CnqKurrK6xtbzAxMTDwLmqln5iSjkmFQ4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AFCA4R1ZbaHOImaass7a7wMTFxsfJy83NzcvKycnDs6CJblpJMxkOAAAAAAAAAAAAAAAAAAAAAAAAAAAADhESJTpUXWpxhJGlsLe2urzCxsnLy8vNzMzLzMzMy8zLwrOfh21bTzgcDgAAAAAAAAAAAAAAAAAAAAAAAAASER8yWnCBhpSgtL3Fx8XFxMbIy87Ozs7NzMvKysnJycrLysO0oIZrW1A3GgAAAAAAAAAAAAAAAAAAAAAAAAANEzRXfYybn624xcbIyMnKycrLzMzLy8rKysrLysrKysrLycvEvKiOb2BRMRQAAAAAAAAAAAAAAAAAAAAAAAAcOXCUq7S8wcjJysnJysrLy83NzMrJycnKysvLy8vKysrLycrJycOzlXttWjMSAAAAAAAAAAAAAAAAAAAAABU8a6CywMPHx8nIysrLy8zNzs3My8rJycrKy8rLy8rKycnKysnJysrGtpqFe14xEAAAAAAAAAAAAAAAAAANHj11osXKzs3LycnJysvNzc7Ozs3Ly8rLy8vLy8zMzczMzMvMy8vJycrKxbWekoNcLwAAAAAAAAAAAAAAAA4VP2iatcnKzMrLy8zMzMzNzMzLy8rKysrKysnKyszMzMzLy8vKysnKysrKx8G0p5yEVyoAAAAAAAAAAAAADiA4b5Czw8zMzMzLzM3NzszMy8vLysrJysnJycnKy8zNzcvLzM3NzMzMy8vLysW+tq6he1InAAAAAAAAAAAAFTJZiJ68x83NzczLy8zMy8vLy8vKysnIycrKysrLy8zKysjIysvMy8vLy8vLy8fCvrmwk3JQKAAAAAAAAAAAIU91kqfAys3NzczLy8zLy8vLy8vKysrJycvLy8vLysjGv7e3u7+/xcnLzMvLy8nFw8C6pIRsTiIAAAAAAAAALWB5k6jCy83Ly8rKysrKy8zLysrKysrKysrKysrJyMGtj3Z0hp2uusTNzMvLy8rIx8XCsJF4akUbAAAAAAASQGuBmrbJzMzLy8vLysnKysvKycrJysrKysrKysnGw5NMHhITGTZzqbnHy8rKy8rJysjGvKaIeGM4EgAAAAAmU3WJqMDLy8vLzMzLy8nLycrIyMrJysrKyczMycfMlzMRFRcVFw4eYaXAycrLysnIysrJxreahHZWJQAAAAA3ZHyXt8fLy8vLy8vLysjFxsjJx8jLy8zLyMnHys2/RREWQjkXGRMRHGauwcnKysnHycrJysStlYZvPxQAABFAa4upwcnLy8vKysrLzMK+t6u0vcXIxcnLycvHysqLHxIxnIAzGhcTAC6LvcfKysnHycrKysm7qJaBViEAABxMeqC4xMjLy8rKysrDwLOOa1ZRaZW/y8fJy8rMycpVHABQt72EZzwWABNcq8TJycnIycrLysnGuqmVbTMQACdfjq69xMnLysrKysfBq3c4GBERGS9sssfEycvIxspCDyuLtsLGumIWAAA2m8HIycnIycrKycnJxbmqhEYXDTh1oLW+xMjKysrKx8G0dSYTGhIVFQ4WW7TPxsrHxM87Dnawv726jTcAAAAfhr3HycnJysrKysrJycW7nFsfGE2GpbS9xMjKysrJxLybMhAwTTAQGRgUF2vFyMrJyM9BAE1qmcClMwAAAAAAbLfIycnJycnKysrIycjDrHArKGCLorbAxcjJysrJw7JqFhpEooAkExQVDy6kzczMyMxaDQAANJd5Hy4sDwAATavIyMvLysnJysrJysrHtoI4N2eIobjDyMrJysrHxKZRGCRktrqGVzEAABFeycrKyMuCFQAAAEErMJSHIAAALpnFyMzNy8nJysrKysrHuI1DQ2iHqMHHysrKysrHw6NGG0mZv7q6sFcAAAA2wMnMysqsIgAAAAAAKYFyGgAAG4bByM7Oy8nJycvLysrHtpFOTGiKsMfJycnKysrGxaA2LozBvr6tahMAAAAgncbJy8rENwAAAAAAABANAAAOEXq9x83NysrJysrKysnFsZBYT2eOt8nKysnJysrGxqZBF0t6ob6QIwAAAAAQc8vLyM/OXwAAAAAAAAAAAAANGHS8x8rMyczJycrKysnCq41dUmiUvMnKycnJysvIx69WAAARQppzHS8oAAAAQ8rGyMvQiSMAAAAAAAAAAAAOHHrByMjKyMzJycrKysm+pIZdVW6ZvsrKycrKysrJxrt2EgAADSolQ7GBAAAAJ7zEzMjJtjoAAAAAAAAAAA8QKIrFyMjJyczJycrKycq7nX5aXHeevsrKycrKysvKx72YHAAAAAAALX5gAAAAG6LJzMvG0XYfAA4AAAAAFRINQKXGyMjJysrJycrKycq6lnNXZoOmwsvKycrLy8vLyMGhPQAAAAAAAAAAAAAAHZPJy8zFyb9cFBEQEhERFQ4idbzHycjKysnJycrJycm3kGtTbI6sw8zLysvLy8vLyMOmVw4AAAAAAAAAAAAAGoTFy8jJxsm5UxgOFRUZDxJdrMXIycnKysnKysrJycm0iWNPb5ezxcvLy8vLy8vLyca3fBkAAAAAAAAAAAAOJp7LxszKy8fGwHcxEw8TMnexyMnJysrKysrKycnJycevgmBMcZy4xsvLy8vLy8vLysjDnjoADQAAAAAAABQRKbjKycvNycfBxr+rj4aRqMHJysnJysrKysrKycnIyMSnfGBHbp+8x8rLy8vLy8vLy8rGt3YaABURDQAAFhIWV8jIxsrKzM7OycfHy8fKzMrMy8nKysvLysrKycnIx72de2M/ZZ+/x8rLzMvLy8vLy8vKxKlYFg4UFhYVEQ4vqsfKyMjIyMbJycrHw8bIyMjMzszLy8vLy8vKycjHw7SYf2EyV5m+x8jLzMvLy8vLy8vMyMOnXSAVEBEPACqDxsjJycnJyc7HyMzLxMPIycnLysrLy8vLy8vKycjFvq6XgVgiQ4u7xsjKy8vLy8vLy8vKx8PDrHhMMyo5V5bFxcXHyMnKyMrLyMjIycrHyszMysrLy8vLy8vJycfDu66efkUWM3iww8bJysrLysvLy8vJxsTHxLiqmZCet8jIxcfIycrKyMrLycjIysvIyMzLysvLy8vKy8vKysjDuq+acDIAKGWeusTIysrKysvLy8vKyMfHyMrKy8rJx8XIyMnJycnJycrKysrJysrKysrKysrKysrKysvLysjCuaqKVx8AHFCJqbvGy8nKycrLysrKysjIyMjIyMjHyMnJycnJycnJysrKysrKysrKysrKysrKysrKy8vMy8jBtp50QRMAFDx0lam8ysrJysrLy8rKysjIyMjIyMjIyMnJycnJycnJysrKysrKysrKysrKysrKysrLy8vLy8i9qYliNAAAECpeg5WpwcrKycrKy8rLy8rKysrKysnJycnJycnJycnKysrKysrKysrKysrLy8rLy8vLy8vKy8e1lXhYKwAAABlGc4WVsMXLycrKysrKy8rKysrKysnJycnJycnKycrKysrKysvKysrKysrLy8vLy8vLzMvKy8Kmg25PHgAAAA4sW3iDnbnIyMrKysnKysrKysrKysnJycnJycnJycrKysrKysrKysrKysvKysrKy8vLy8vMyLaUemhADwAAAAAWO2V3iqm/xsjIyMnKysrKysrKy8nJycnJycnKysrKysrKysrKysrLy8vLysrKy8vLysrKwqiLd1soAAAAAAAAGkRpepq1wMTFx8nKysrKysrKysrKysrKysnJysrKysrKysvLysrLy8vLysvLy8zLysnIuJ6Ib0MVAAAAAAAAACVMaIanur/BxsrLzMrKysvKysrKysrKysnJycrKysrKy8vLy8vLy8vLy8vLy8zLycnEr5eBVyUAAAAAAAAAAAAlR3CXsLm8w8jLy8rKysrKysnKysrKycnJycnKysvLy8vLy8vLzMzMy8vLy8rJyci8p49pNBIAAAAAAAAAAAAAH0t9n62zvcbKysrKysrKysrKysrKycnJycrKysvLy8vLy8zMzMzMzMzMysrJysW4nnQ+FwAAAAAAAAAAAAAAACFSgZqjsMDJycnJysrJysrKysrKysrKysrLy8vLzMzLy8vLzMzMzMzLy8vLyMGsfEMbDgAAAAAAAAAAAAAAAAAmV4GOmbDFyMfIysrKysrKysrKysrKysrLy8vLy8vLy8vLy8vMzMzLzMrGwK+BQh0QDgAAAAAAAAAAAAAAAAAAK1hzfJKywcbIycnKysrKysrKycrKysrLy8vLy8vLy8vLzMzMy8nGw723p39EHBIPAAAAAAAAAAAAAAAAAAAAES9UY3CPq73GyMnJycnJysrKysrKysnKysrKy8vLy8zMzM3Lxb20rKWYdUAcEhENAAAAAAAAAAAAAAAAAAAAABQwTlprhKG1wsjJycnJycrKysnJysnJysvJyMfIycrKyca+rp+XkINmORoSEQ4AAAAAAAAAAAAAAAAAAAAAAAAVMktZZoCZrr7HycnJysnIyMjHyMnJysnGw8HBwcC+t6qXhnx1bFQwFxIRDgAAAAAAAAAAAAAAAAAAAAAAAAAAFi5HV2mCmK6+xsnJysrKy8rJycnIyMbCvrq2sqqgkn9uZGBXQygWERAOAAAAAAAAAAAAAAAAAAAAAAAAAAAADxMkOk5mgpmsvMbIycjHxcLCwsG/vbu5trGpnY+AcGBYUkc0HxMQEA0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4RGio+WHKMpLe/wr+7trCqqKWioJ+hoJ2VhnVjVEpDNSMWEhEOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANDhIaJjlQaoeYoaOhm5WPiYOAfXx6dG5lVkU3LyggFhEQDw0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADQ4PERUdKT1QY293eXl3c21mYFdJPDEnHRcTEQ4AAAAAAAAAAAAAAAAAAAAAAAAA') };   // alpha 0..255 at scale 1 (a 720 px wide video)
export const WORD = { w: 85, h: 34, a: b64('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') };

// size of the whole block (icon + word + name) at scale 1, and where its parts sit relative to the icon's
// top-left corner. The name is right-aligned to the word when the text is left of the icon ("R"), and
// left-aligned when it is right of it ("L").
export function geometry(s, layout) {
  return layout === 'R'
    ? { bx: -168 * s, by: 0, bw: 231 * s, bh: 63 * s, wx: -94 * s, wy: 2 * s, ux: -168 * s, uw: 154 * s, uy: 40 * s, uh: 20 * s }
    : { bx: 0, by: 0, bw: 231 * s, bh: 63 * s, wx: 70 * s, wy: 2 * s, ux: 73 * s, uw: 156 * s, uy: 40 * s, uh: 20 * s };
}

// bilinear / box resize of an 8-bit one-channel picture
export function resize(a, w, h, s) {
  const nw = Math.max(2, Math.round(w * s)), nh = Math.max(2, Math.round(h * s)), o = new Float32Array(nw * nh);
  const fx = w / nw, fy = h / nh;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    // average over the source footprint of this pixel
    const x0 = x * fx, x1 = (x + 1) * fx, y0 = y * fy, y1 = (y + 1) * fy;
    let sum = 0, wsum = 0;
    for (let yy = Math.floor(y0); yy < Math.min(h, Math.ceil(y1)); yy++) {
      const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
      for (let xx = Math.floor(x0); xx < Math.min(w, Math.ceil(x1)); xx++) {
        const wx = Math.min(xx + 1, x1) - Math.max(xx, x0), ww = wx * wy;
        sum += a[yy * w + xx] * ww; wsum += ww;
      }
    }
    o[y * nw + x] = sum / Math.max(wsum, 1e-6);
  }
  return { w: nw, h: nh, a: o };
}
const scaled = new Map();
export function iconAt(s) { const k = 'i' + s.toFixed(3); if (!scaled.has(k)) scaled.set(k, resize(ICON.a, ICON.w, ICON.h, s)); return scaled.get(k); }
export function wordAt(s) { const k = 'w' + s.toFixed(3); if (!scaled.has(k)) scaled.set(k, resize(WORD.a, WORD.w, WORD.h, s)); return scaled.get(k); }

// ---- finding the icon: a white cloud, so a blob of near-white pixels of the right shape ----
const kernels = new Map();
export function kernelAt(s) {
  const k = 'k' + s.toFixed(3);
  if (kernels.has(k)) return kernels.get(k);
  const ic = iconAt(s), n = ic.w, body = [], ring = [];
  const mark = new Uint8Array(n * n), near = new Uint8Array(n * n);
  const rr = Math.max(1, Math.round(4.5 * s));
  for (let i = 0; i < n * n; i++) mark[i] = ic.a[i] > 38 ? 1 : 0;   // alpha > 0.15
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (mark[y * n + x]) continue;
    let hit = false;
    for (let dy = -rr; dy <= rr && !hit; dy++) for (let dx = -rr; dx <= rr; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < n && xx < n && mark[yy * n + xx]) { hit = true; break; } }
    if (hit) near[y * n + x] = 1;
  }
  for (let i = 0; i < n * n; i++) { if (ic.a[i] > 153) body.push(i); else if (near[i]) ring.push(i); }   // alpha > 0.6
  // the ring around the cloud is also looked at outside its footprint (the template box is padded)
  const K = { n, body: Int32Array.from(body), ring: Int32Array.from(ring), wb: 1 / Math.max(1, body.length), wr: 0.5 / Math.max(1, ring.length) };
  kernels.set(k, K); return K;
}
// whiteness of an RGB pixel: how close its weakest channel is to white
export const LO = 120;
export function whiteness(rgb, w, h, lo = LO) {
  const o = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const m = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); o[i] = m <= lo ? 0 : m >= lo + 60 ? 1 : (m - lo) / 60; }
  return o;
}
// score of the icon template with its top-left corner at (x, y) on a whiteness map
export function scoreAt(wm, w, h, x, y, K) {
  const n = K.n; if (x < 0 || y < 0 || x + n > w || y + n > h) return -1;
  let b = 0, r = 0;
  for (let t = 0; t < K.body.length; t++) { const i = K.body[t], yy = (i / n) | 0, xx = i - yy * n; b += wm[(y + yy) * w + x + xx]; }
  for (let t = 0; t < K.ring.length; t++) { const i = K.ring[t], yy = (i / n) | 0, xx = i - yy * n; if (x + xx < w && y + yy < h) r += wm[(y + yy) * w + x + xx]; }
  return b * K.wb - r * K.wr;
}
// best position within +-rad of (x, y)
export function refine(wm, w, h, x, y, K, rad = 6) {
  let best = { score: -9, x, y };
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const sc = scoreAt(wm, w, h, x + dx, y + dy, K); if (sc > best.score) best = { score: sc, x: x + dx, y: y + dy }; }
  return best;
}
// coarse search of a whole frame: whiteness at 1/4, every scale; returns the best peak of each scale (full-frame
// coordinates, refined). A position is only scored when the middle of the cloud is mostly white, which most are not.
export function scanFrame(rgb, w, h, scales) {
  const f = 4, w4 = w >> 2, h4 = h >> 2, small = new Float32Array(w4 * h4);
  const wm = whiteness(rgb, w, h);
  for (let y = 0; y < h4; y++) for (let x = 0; x < w4; x++) {
    let s = 0; for (let dy = 0; dy < f; dy++) { const o = (y * f + dy) * w + x * f; s += wm[o] + wm[o + 1] + wm[o + 2] + wm[o + 3]; }
    small[y * w4 + x] = s / (f * f);
  }
  const I = new Float32Array((w4 + 1) * (h4 + 1));
  for (let y = 0; y < h4; y++) { let row = 0; for (let x = 0; x < w4; x++) { row += small[y * w4 + x]; I[(y + 1) * (w4 + 1) + x + 1] = I[y * (w4 + 1) + x + 1] + row; } }
  const box = (x, y, bw, bh) => I[(y + bh) * (w4 + 1) + x + bw] - I[y * (w4 + 1) + x + bw] - I[(y + bh) * (w4 + 1) + x] + I[y * (w4 + 1) + x];
  const out = [];
  for (const s of scales) {
    const K = kernelAt(s / f), n = K.n, c0 = Math.max(1, Math.round(n * 0.25)), cn = Math.max(2, Math.round(n * 0.5));
    let best = { score: -9 };
    for (let y = 0; y + n <= h4; y++) for (let x = 0; x + n <= w4; x++) {
      if (box(x + c0, y + c0, cn, cn) < 0.6 * cn * cn) continue;
      const sc = scoreAt(small, w4, h4, x, y, K);
      if (sc > best.score) best = { score: sc, x, y };
    }
    if (best.score > -9) {
      const KF = kernelAt(s), r = refine(wm, w, h, best.x * f, best.y * f, KF, 6);
      out.push({ s, x: r.x, y: r.y, score: r.score, coarse: best.score });
    }
  }
  return { peaks: out, wm };
}

// ---------------------------------------------------------------------------------------------
// From a few scanned frames to the places the mark sits in, and from per-frame scores to time intervals.
// ---------------------------------------------------------------------------------------------

export const THR_SCAN = 0.78;     // a frame shows the mark when its best peak is at least this
// samples: [{ t, peaks: [{ s, x, y, score }] }]. Returns { s, slots: [{x, y}], hits } or null.
export function clusterSlots(samples) {
  const hits = [];
  for (const smp of samples) { const b = smp.peaks.slice().sort((a, c) => c.score - a.score)[0]; if (b && b.score >= THR_SCAN) hits.push({ ...b, t: smp.t }); }
  if (hits.length < 2) return null;
  const wsum = new Map();
  for (const h of hits) wsum.set(h.s, (wsum.get(h.s) || 0) + h.score);
  let s0 = null; for (const [s, v] of wsum) if (s0 === null || v > wsum.get(s0)) s0 = s;
  const slots = [];
  for (const h of hits.sort((a, c) => c.score - a.score)) {
    if (Math.abs(h.s - s0) > 0.11) continue;
    if (slots.every((p) => Math.abs(p.x - h.x) > 12 * s0 || Math.abs(p.y - h.y) > 12 * s0)) slots.push({ x: h.x, y: h.y });
  }
  return { s: s0, slots, hits };
}

// Hysteresis on a score series: a run starts when the score reaches `hi`, goes on while it stays above `lo`;
// close gaps of up to `gap` frames, drop runs shorter than `minLen`, and widen each run by `ext` frames for the fades.
export function runsOf(scores, hi = 0.6, lo = 0.42, ext = 4, gap = 6, minLen = 8) {
  const n = scores.length, on = new Uint8Array(n);
  for (let t = 0; t < n;) {
    if (scores[t] >= hi) {
      let a = t, b = t;
      while (a > 0 && scores[a - 1] >= lo) a--;
      while (b < n - 1 && scores[b + 1] >= lo) b++;
      for (let i = a; i <= b; i++) on[i] = 1; t = b + 1;
    } else t++;
  }
  const runs = [];
  for (let t = 0; t < n;) { if (on[t]) { const a = t; while (t < n && on[t]) t++; runs.push([a, t - 1]); } else t++; }
  const merged = [];
  for (const r of runs) { if (merged.length && r[0] - merged[merged.length - 1][1] <= gap) merged[merged.length - 1][1] = r[1]; else merged.push(r); }
  return merged.filter(([a, b]) => b - a + 1 >= minLen).map(([a, b]) => [Math.max(0, a - ext), Math.min(n - 1, b + ext)]);
}

// ---------------------------------------------------------------------------------------------
// The mask of one frame: every pixel the mark touches. Pictures are interleaved RGB crops.
// ---------------------------------------------------------------------------------------------

function fillHoles(sil, w, h) {            // the icon's eyes are holes in its alpha; the silhouette has none
  const out = new Uint8Array(sil), outside = new Uint8Array(w * h), stack = [];
  const push = (x, y) => { const i = y * w + x; if (!sil[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) { const i = stack.pop(), x = i % w, y = (i - x) / w; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
  for (let i = 0; i < w * h; i++) if (!sil[i] && !outside[i]) out[i] = 1;
  return out;
}
function dilate(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h), r2 = r * r + r;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!m[y * w + x]) continue; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) tmp[y * w + xx] = 1; } }
  // a round-ish structuring element: stretch vertically with a shrinking horizontal reach
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!tmp[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) out[yy * w + x] = 1; }
  }
  return out;
}
// white top-hat of the weakest channel: thin bright strokes (the creator's name)
function topHat(min, w, h, k) {
  const er = new Uint8Array(w * h), op = new Uint8Array(w * h), r = k >> 1;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 255; for (let dx = -r; dx <= r; dx++) { const xx = Math.min(w - 1, Math.max(0, x + dx)); const v = min[y * w + xx]; if (v < m) m = v; } tmp[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 255; for (let dy = -r; dy <= r; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); const v = tmp[yy * w + x]; if (v < m) m = v; } er[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let dx = -r; dx <= r; dx++) { const xx = Math.min(w - 1, Math.max(0, x + dx)); const v = er[y * w + xx]; if (v > m) m = v; } tmp[y * w + x] = m; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let dy = -r; dy <= r; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)); const v = tmp[yy * w + x]; if (v > m) m = v; } op[y * w + x] = m; }
  const out = new Int16Array(w * h); for (let i = 0; i < w * h; i++) out[i] = min[i] - op[i];
  return out;
}

/**
 * @param crop   { x0, y0, w, h, rgb }  a picture of the area around the mark (frame coordinates of its corner)
 * @param ix,iy  icon top-left in frame coordinates, s the scale, layout 'L' | 'R'
 * @returns Uint8Array (w*h) mask in crop coordinates
 */
export function buildMask(crop, ix, iy, s, layout) {
  const { x0, y0, w, h, rgb } = crop, g = geometry(s, layout), M = new Uint8Array(w * h);
  const put = (a, aw, ah, ox, oy, thr) => {
    const px = Math.round(ox) - x0, py = Math.round(oy) - y0;
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) { if (a[y * aw + x] <= thr) continue; const X = px + x, Y = py + y; if (X >= 0 && Y >= 0 && X < w && Y < h) M[Y * w + X] = 1; }
  };
  const ic = iconAt(s), wd = wordAt(s);
  const sil = new Uint8Array(ic.w * ic.h); for (let i = 0; i < sil.length; i++) sil[i] = ic.a[i] > 15 ? 1 : 0;
  put(fillHoles(sil, ic.w, ic.h), ic.w, ic.h, ix, iy, 0);
  put(wd.a, wd.w, wd.h, ix + g.wx, iy + g.wy, 15);
  // the creator's name: bright thin strokes in a band under the word
  const ux = Math.round(ix + g.ux) - x0, uy = Math.round(iy + g.uy) - y0, uw = Math.round(g.uw), uh = Math.round(g.uh);
  if (uw > 4 && uh > 3) {
    const min = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) min[i] = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    const k = Math.max(5, Math.round(9 * s)) | 1, th = topHat(min, w, h, k);
    for (let y = Math.max(0, uy); y < Math.min(h, uy + uh); y++) for (let x = Math.max(0, ux); x < Math.min(w, ux + uw); x++) if (th[y * w + x] > 22) M[y * w + x] = 1;
  }
  // the soft edge and the icon's small movements
  return dilate(M, w, h, Math.max(3, Math.round(5 * s)));
}
