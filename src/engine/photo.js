// The photo logo remover. A photo has no other frames to learn from, so a logo is removed by finding which
// pixels inside the person's box really are the logo, and rebuilding only those from the picture around them,
// with the photo's own grain put back. This is its own engine: the video removers (sora.js) work from time.
import { patchFill } from './fill.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function dilateSq(m, w, h, r) {
  if (r <= 0) return Uint8Array.from(m);
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; } }
  return out;
}
// connected pieces of a mask (4-neighbours): drops the ones smaller than `min`; with `holes`, fills the enclosed
// gaps up to that size instead
function pieces(m, w, h, min) {
  const seen = new Uint8Array(w * h), out = new Uint8Array(m.length), stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    const comp = []; stack.push(s); seen[s] = 1;
    while (stack.length) { const i = stack.pop(); comp.push(i); const x = i % w; if (x > 0 && m[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); } if (x < w - 1 && m[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); } if (i >= w && m[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); } if (i + w < w * h && m[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); } }
    if (comp.length >= min) for (const i of comp) out[i] = 1;
  }
  return out;
}
function fillGaps(m, w, h, maxHole) {
  const inv = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  const seen = new Uint8Array(w * h), out = Uint8Array.from(m), stack = [];
  for (let s = 0; s < w * h; s++) {
    if (!inv[s] || seen[s]) continue;
    const comp = []; let border = false; stack.push(s); seen[s] = 1;
    while (stack.length) { const i = stack.pop(); comp.push(i); const x = i % w, y = (i - x) / w; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true; if (x > 0 && inv[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); } if (x < w - 1 && inv[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); } if (i >= w && inv[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); } if (i + w < w * h && inv[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); } }
    if (!border && comp.length <= maxHole) for (const i of comp) out[i] = 1;
  }
  return out;
}
// the level that best splits the values in two groups, and how far apart the groups are
function otsu(vals) {
  const hist = new Float64Array(256); let n = 0;
  for (const v of vals) { hist[clamp(Math.round(v), 0, 255)]++; n++; }
  if (!n) return { thr: 255, gap: 0 };
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = -1, thr = 0, m0 = 0, m1 = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; thr = t; m0 = mB; m1 = mF; }
  }
  return { thr, gap: m1 - m0 };
}

// Grey-scale opening (for a light mark) or closing (for a dark one) by a square, then the difference: how much
// brighter or darker a pixel is than its own close surroundings. Unlike the guess below this is a local
// measure, so a busy picture does not drown it.
function topHat(L, w, h, k, light) {
  const r = k >> 1, t = new Float32Array(w * h), e = new Float32Array(w * h), o = new Float32Array(w * h);
  const a1 = light ? Math.min : Math.max, i1 = light ? Infinity : -Infinity;
  const a2 = light ? Math.max : Math.min, i2 = light ? -Infinity : Infinity;
  const pass = (src, dst, horiz, pick, init) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = init;
      for (let d = -r; d <= r; d++) {
        const X = horiz ? clamp(x + d, 0, w - 1) : x, Y = horiz ? y : clamp(y + d, 0, h - 1);
        m = pick(m, src[Y * w + X]);
      }
      dst[y * w + x] = m;
    }
  };
  pass(L, t, true, a1, i1); pass(t, e, false, a1, i1);
  pass(e, t, true, a2, i2); pass(t, o, false, a2, i2);
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = light ? L[i] - o[i] : o[i] - L[i];
  return out;
}

/**
 * Which pixels of the box are the logo? Two ways of looking. First: the whole box is filled in once from
 * outside it (so the logo never shows), and what differs most from that guess is the logo - which works when
 * the picture under the box is calm. When that cannot tell anything apart (a busy picture), the second way is
 * tried: how much brighter or darker each pixel is than its own close surroundings, which a logo's strokes
 * stand out in whatever the picture behind them does. Returns null when neither tells the logo from the
 * picture: the whole box is then used.
 * @param crop {w,h,rgb}  the picture around the box;  box {x,y,w,h} in crop coordinates
 */
export function selectLogo(crop, box, seed = 1, maxFrac = 0.95) {
  const { w, h, rgb } = crop, M = new Uint8Array(w * h);
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) M[y * w + x] = 1;
  const inBox = (S) => { const v = []; for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) v.push(S[y * w + x]); return v; };
  // the shape that a signal and its split level give: strong pixels are the logo, weaker ones count when they
  // touch it (the dark parts of a logo on a dark picture)
  const shapeOf = (S, thr, loFloor) => {
    const lo = Math.max(loFloor, 0.22 * thr);
    let strong = new Uint8Array(w * h); const weak = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (M[i]) { if (S[i] > thr) strong[i] = 1; if (S[i] > lo) weak[i] = 1; }
    strong = pieces(strong, w, h, 6);
    let m = Uint8Array.from(strong), grew = true, guard = 0;
    while (grew && guard++ < 12) {
      grew = false; const near = dilateSq(m, w, h, 1);
      for (let i = 0; i < w * h; i++) if (weak[i] && !m[i] && near[i]) { m[i] = 1; grew = true; }
    }
    m = fillGaps(dilateSq(m, w, h, 1), w, h, Math.round(0.2 * box.w * box.h));
    m = dilateSq(m, w, h, 2);
    let n = 0; for (let i = 0; i < w * h; i++) { if (M[i] === 0) m[i] = 0; n += m[i]; }
    const frac = n / (box.w * box.h);
    return frac < 0.03 || frac > maxFrac ? null : m;
  };
  const guess = patchFill(crop, M, [], { seed, iters: [1, 2, 3, 4] });
  const D = new Float32Array(w * h);
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    const i = y * w + x; let d = 0;
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(rgb[i * 3 + c] - guess[i * 3 + c]));
    D[i] = d;
  }
  const d0 = otsu(inBox(D));
  if (d0.gap >= 24 && d0.thr >= 10) { const m = shapeOf(D, d0.thr, 9); if (m) return m; }
  // the guess told us nothing: look for strokes that stand out from what is right around them
  const hi = new Float32Array(w * h), lo = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { hi[i] = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); lo[i] = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); }
  const k = Math.max(5, Math.round(Math.min(box.w, box.h) * 0.55)) | 1;
  let best = null;
  for (const [S, light] of [[hi, true], [lo, false]]) {
    const H = topHat(S, w, h, k, light), o = otsu(inBox(H));
    if (o.gap >= 14 && o.thr >= 6 && (!best || o.gap > best.gap)) best = { H, ...o };
  }
  return best ? shapeOf(best.H, best.thr, 6) : null;
}

// The grain of the picture around the hole, put back into the hole (a fill is smoother than a photo).
function boxBlurLuma(L, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, c = 0; for (let x = -r; x < w; x++) { const a = x + r, b = x - r - 1; if (a < w) { s += L[y * w + a]; c++; } if (b >= 0) { s -= L[y * w + b]; c--; } if (x >= 0) tmp[y * w + x] = s / c; } }
  for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let y = -r; y < h; y++) { const a = y + r, b = y - r - 1; if (a < h) { s += tmp[a * w + x]; c++; } if (b >= 0) { s -= tmp[b * w + x]; c--; } if (y >= 0) out[y * w + x] = s / c; } }
  return out;
}
function mad(a) { if (!a.length) return 0; const s = Float32Array.from(a).sort(); const m = s[s.length >> 1]; const d = Float32Array.from(s, (v) => Math.abs(v - m)).sort(); return 1.4826 * d[d.length >> 1]; }
export function matchGrain(rgb, w, h, mask, seed = 1) {
  const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = 0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2];
  const hp = new Float32Array(w * h), b = boxBlurLuma(L, w, h, 1); for (let i = 0; i < w * h; i++) hp[i] = L[i] - b[i];
  const near = dilateSq(mask, w, h, 3), far = dilateSq(mask, w, h, 16), ring = [], inside = [];
  for (let i = 0; i < w * h; i++) { if (mask[i]) inside.push(hp[i]); else if (far[i] && !near[i]) ring.push(hp[i]); }
  const sRing = mad(ring), sIn = mad(inside), add = Math.sqrt(Math.max(0, sRing * sRing - sIn * sIn));
  if (add < 0.4) return 0;
  let s = seed >>> 0 || 1; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  for (let i = 0; i < w * h; i++) if (mask[i]) {
    const g = gauss() * add * 0.85;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = clamp(rgb[i * 3 + c] + g + gauss() * add * 0.3, 0, 255);
  }
  return add;
}

/**
 * Removes the logo in a box from a picture.
 * @param rgb  interleaved RGB of the whole photo (not changed);  box {x,y,w,h} in photo coordinates
 * @returns { crop:{x,y,w,h}, rgb: Uint8ClampedArray (the crop, filled), mask: Uint8Array (crop), mode: 'shape' | 'box' }
 */
export function removeLogoBox(rgb, W, H, box, o = {}) {
  const bx = clamp(Math.round(box.x), 0, W - 4), by = clamp(Math.round(box.y), 0, H - 4);
  const b = { x: bx, y: by, w: clamp(Math.round(box.w), 4, W - bx), h: clamp(Math.round(box.h), 4, H - by) };
  const margin = Math.max(48, Math.round(Math.max(b.w, b.h)));
  const cx0 = Math.max(0, b.x - margin), cy0 = Math.max(0, b.y - margin), cx1 = Math.min(W, b.x + b.w + margin), cy1 = Math.min(H, b.y + b.h + margin);
  const cw = cx1 - cx0, ch = cy1 - cy0, crop = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) crop.set(rgb.subarray(((cy0 + y) * W + cx0) * 3, ((cy0 + y) * W + cx1) * 3), y * cw * 3);
  const local = { x: b.x - cx0, y: b.y - cy0, w: b.w, h: b.h };
  let mask = o.precise === false ? null : selectLogo({ w: cw, h: ch, rgb: crop }, local, o.seed || 1, o.maxFrac), mode = 'shape';
  if (!mask) { mode = 'box'; mask = new Uint8Array(cw * ch); for (let y = local.y; y < local.y + local.h; y++) for (let x = local.x; x < local.x + local.w; x++) mask[y * cw + x] = 1; }
  const out = patchFill({ w: cw, h: ch, rgb: crop }, mask, [], { seed: o.seed || 1, iters: o.iters || [2, 3, 6, 8], fineR: o.fineR, sigmaMul: o.sigmaMul });
  if (o.grain !== false) matchGrain(out, cw, ch, mask, o.seed || 1);
  return { crop: { x: cx0, y: cy0, w: cw, h: ch }, rgb: out, mask, mode };
}

/**
 * The page side of the photo remover: reads the photo, removes each box in turn and keeps the result as a picture.
 * @param E  the engine helpers (makeCanvas);  env  the page's state
 */
export function makePhoto(E, env) {
  const { makeCanvas } = E;
  const idle = () => new Promise((r) => setTimeout(r, 0));
  async function removeBoxes(item, boxes, onP) {
    const W = item.info.w, H = item.info.h;
    const cv = makeCanvas(W, H), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(item.bmp, 0, 0);
    const img = cx.getImageData(0, 0, W, H), d = img.data, rgb = new Uint8Array(W * H * 3);
    for (let i = 0, j = 0; i < W * H * 4; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    const rects = [], modes = [];
    for (let n = 0; n < boxes.length; n++) {
      if (onP) onP(n / boxes.length);
      await idle();
      const r = removeLogoBox(rgb, W, H, boxes[n], { seed: 7 + n });
      const { x, y, w, h } = r.crop;
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const k = yy * w + xx;
        if (!r.mask[k]) continue;
        const i = (y + yy) * W + x + xx;
        for (let c = 0; c < 3; c++) { const v = r.rgb[k * 3 + c]; rgb[i * 3 + c] = v; d[i * 4 + c] = v; }
      }
      rects.push({ x: Math.round(boxes[n].x), y: Math.round(boxes[n].y), w: Math.round(boxes[n].w), h: Math.round(boxes[n].h) });
      modes.push(r.mode);
    }
    cx.putImageData(img, 0, 0);
    if (onP) onP(1);
    const last = rects[rects.length - 1];
    return { kind: 'image', ok: true, engine: 'photo', gemini: false, rect: last, rects, modes, out: cv, max: 1, size: Math.max(last.w, last.h), method: 'fill' };
  }
  return { removeBoxes };
}
