// Rebuilds the picture under a logo for one frame: from other frames of the same view when the scene is
// still (a copy that cannot be told from the real thing), otherwise by patch-based filling (fill.js). A filler
// belongs to one logo spot and remembers what worked for the previous frame, so a still scene is not worked out
// again and again (faster, and nothing flickers).
import { patchFill, poissonBlend } from './fill.js';

function dilateBox(m, w, h, r) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; } }
  return out;
}
// the pixels just around the mask: where a donor has to agree with the frame
export function ringOf(mask, w, h, inner, outer) {
  const a = dilateBox(mask, w, h, inner), b = dilateBox(mask, w, h, outer), idx = [];
  for (let i = 0; i < w * h; i++) if (b[i] && !a[i]) idx.push(i);
  return Int32Array.from(idx);
}
function ringMse(t, d, w, h, ring, dx, dy, stride, limit, dm) {
  let sum = 0, n = 0;
  for (let k = 0; k < ring.length; k += stride) {
    const i = ring[k], x = i % w, y = (i - x) / w, xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) { sum += 3 * 255 * 255 * 0.25; n++; continue; }
    const j = yy * w + xx;
    if (dm && dm[j]) continue;                                   // the logo is there in the donor too
    const e0 = t[i * 3] - d[j * 3], e1 = t[i * 3 + 1] - d[j * 3 + 1], e2 = t[i * 3 + 2] - d[j * 3 + 2];
    sum += e0 * e0 + e1 * e1 + e2 * e2; n++;
    if (sum > limit * 3 * (n + 20)) return sum / (3 * n) * 4;
  }
  return n ? sum / (3 * n) : 1e9;
}
// the best shift of a donor (a translation) against the frame, looked at on the ring only
export function alignDonor(t, d, w, h, ring, search, hole, dm) {
  // with a donor that has the logo too (a logo that never moves), the part of the donor used for the hole must be clean
  const holeOk = (dx, dy) => {
    if (!dm) return true;
    for (let k = 0; k < hole.length; k += 5) { const i = hole[k], x = i % w, y = (i - x) / w, xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h || dm[yy * w + xx]) return false; }
    return true;
  };
  let best = holeOk(0, 0) ? { mse: ringMse(t, d, w, h, ring, 0, 0, 2, 1e9, dm), dx: 0, dy: 0 } : { mse: 1e9, dx: 0, dy: 0 };
  if (best.mse < 12) return best;
  const S = Math.max(2, Math.round(search));
  const step = S > 12 ? 4 : 2;
  for (let dy = -S; dy <= S; dy += step) for (let dx = -S; dx <= S; dx += step) {
    const m = ringMse(t, d, w, h, ring, dx, dy, 3, Math.min(best.mse * 1.5 + 30, 1e8), dm);
    if (m < best.mse && holeOk(dx, dy)) best = { mse: m, dx, dy };
  }
  if (best.mse >= 1e8) return best;
  const c = { ...best };
  for (let dy = c.dy - step + 1; dy <= c.dy + step - 1; dy++) for (let dx = c.dx - step + 1; dx <= c.dx + step - 1; dx++) {
    const m = ringMse(t, d, w, h, ring, dx, dy, 1, Math.min(best.mse * 1.5 + 30, 1e8), dm);
    if (m < best.mse && holeOk(dx, dy)) best = { mse: m, dx, dy };
  }
  return best;
}
// the donor, moved by (dx, dy); pixels that fall outside (or are the logo in the donor too) are flagged unusable
export function shifted(d, w, h, dx, dy, dm) {
  const out = new Uint8Array(w * h * 3), valid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy)), i = y * w + x, j = yy * w + xx;
    out[i * 3] = d[j * 3]; out[i * 3 + 1] = d[j * 3 + 1]; out[i * 3 + 2] = d[j * 3 + 2];
    valid[i] = x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && !(dm && dm[j]) ? 1 : 0;
  }
  return { rgb: out, valid };
}
function bboxOf(mask, w, h, pad) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(w, x1 + pad + 1), y1: Math.min(h, y1 + pad + 1) };
}
// per pixel median of a few donors (inside the box only; the rest is not needed by the blend)
function medianLayer(target, use, w, h, bb) {
  const pred = new Float32Array(w * h * 3), n = use.length, v = new Float32Array(n);
  for (let i = 0; i < pred.length; i++) pred[i] = target.rgb[i];
  for (let y = bb.y0; y < bb.y1; y++) for (let x = bb.x0; x < bb.x1; x++) {
    const i = y * w + x;
    for (let c = 0; c < 3; c++) {
      let m = 0;
      for (let k = 0; k < n; k++) if (use[k].valid[i]) { let a = use[k].rgb[i * 3 + c], j = m++; while (j > 0 && v[j - 1] > a) { v[j] = v[j - 1]; j--; } v[j] = a; }
      if (m) pred[i * 3 + c] = m & 1 ? v[m >> 1] : (v[m / 2 - 1] + v[m / 2]) / 2;
    }
  }
  return pred;
}

export function makeFiller() {
  let dset = null, dage = 0, layer = null, key = null, kage = 0;
  const REFRESH = 20;
  return {
    /**
     * @param target {w,h,rgb}  the frame's area (with some margin around the mask)
     * @param mask   Uint8Array 1 where the logo is
     * @param pool   [{rgb}]    the same area in frames where the logo is not (or, for a logo that never moves, in other frames)
     * @param o      { s: scale, goodMse, donorMask: where the logo is in the pool pictures too }
     * @returns { rgb: Uint8ClampedArray, mode: 'donor' | 'reuse' | 'patch', mse }
     */
    fill(target, mask, pool, o = {}) {
      const { w, h } = target, s = o.s || 1, dm = o.donorMask || null, good = o.goodMse || 30, K = o.k || 5;
      const ring = ringOf(mask, w, h, Math.max(2, Math.round(3 * s)), Math.max(8, Math.round(14 * s)));
      const bb = bboxOf(mask, w, h, 3), out = (rgb, mode, mse) => { key = rgb; kage = 0; return { rgb, mode, mse }; };
      if (!bb) return { rgb: Uint8ClampedArray.from(target.rgb), mode: 'patch', mse: 0 };
      // 0. the frame just written is the best donor there is: the same picture a moment earlier, already clean
      if (key && kage < (o.keyAge || 24) && key.length === target.rgb.length) {
        const a = alignDonor(target.rgb, key, w, h, ring, (o.prevSearch || 14) * s, null, null);
        if (a.mse <= (o.prevMse || 100)) {
          kage++;
          return { rgb: poissonBlend(target, mask, medianLayer(target, [shifted(key, w, h, a.dx, a.dy, null)], w, h, bb)), mode: 'prev', mse: a.mse };
        }
      }
      // 1. the donors that worked a moment ago still do
      if (dset && dage < REFRESH && dset.length) {
        const c = dset[0];
        if (ringMse(target.rgb, c.p.rgb, w, h, ring, c.dx, c.dy, 2, 1e9, dm) <= good * 1.3) {
          dage++;
          const use = dset.map((d) => shifted(d.p.rgb, w, h, d.dx, d.dy, dm));
          return out(poissonBlend(target, mask, medianLayer(target, use, w, h, bb)), 'donor', 0);
        }
      }
      dset = null;
      // 2. the patch layer made a moment ago still fits this frame's surroundings
      if (layer && layer.age < REFRESH * 2) {
        let inside = true;
        for (let i = 0; i < w * h; i++) if (mask[i] && !layer.maskU[i]) { inside = false; break; }
        if (inside) {
          let sum = 0, n = 0;
          for (let k = 0; k < layer.ring.length; k += 3) { const i = layer.ring[k]; for (let c = 0; c < 3; c++) { const e = target.rgb[i * 3 + c] - layer.ringRgb[k / 3 * 3 + c]; sum += e * e; } n += 3; }
          if (n && sum / n <= (o.reuseMse || 36)) { layer.age++; return out(poissonBlend(target, mask, layer.pred), 'reuse', sum / n); }
        }
      }
      layer = null;
      // 3. look for donors
      const holeIdx = [];
      if (dm) for (let i = 0; i < w * h; i++) if (mask[i]) holeIdx.push(i);
      const hole = Int32Array.from(holeIdx), cands = [];
      for (const p of pool) { const a = alignDonor(target.rgb, p.rgb, w, h, ring, (o.search || 40) * s, hole, dm); if (a.mse < 1e8) cands.push({ ...a, p }); }
      cands.sort((a, b) => a.mse - b.mse);
      if (cands.length && cands[0].mse <= good) {
        dset = cands.filter((c) => c.mse <= Math.max(good, cands[0].mse * 1.6)).slice(0, K); dage = 0;
        const use = dset.map((d) => shifted(d.p.rgb, w, h, d.dx, d.dy, dm));
        return out(poissonBlend(target, mask, medianLayer(target, use, w, h, bb)), 'donor', cands[0].mse);
      }
      // 4. nothing lines up: fill by patches (other frames only as extra material)
      const others = cands.length ? cands.slice(0, 6).map((c) => shifted(c.p.rgb, w, h, c.dx, c.dy, dm)) : pool.slice(0, 6).map((p) => shifted(p.rgb, w, h, 0, 0, dm));
      const r = patchFill(target, mask, others, { seed: o.seed || 1, layer: true, iters: o.iters, levels: o.levels });
      const ringRgb = new Uint8Array(Math.ceil(ring.length / 3) * 3);
      for (let k = 0, q = 0; k < ring.length; k += 3, q += 3) { const i = ring[k]; ringRgb[q] = target.rgb[i * 3]; ringRgb[q + 1] = target.rgb[i * 3 + 1]; ringRgb[q + 2] = target.rgb[i * 3 + 2]; }
      layer = { pred: r.pred, maskU: dilateBox(mask, w, h, 2), ring, ringRgb, age: 0 };
      return out(r.rgb, 'patch', cands.length ? cands[0].mse : -1);
    },
  };
}

// one-off use (a preview of one frame, a photo)
export function fillBlock(target, mask, pool, o = {}) { return makeFiller().fill(target, mask, pool, o); }
