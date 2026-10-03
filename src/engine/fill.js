// Fills a masked region of a picture so the mask disappears: from the rest of that picture and, for video,
// from other frames. This is for logos that cannot be restored exactly (they hide what is under them):
// the Sora mark and any logo a user points out. The Gemini/Veo engine does not use it.
//
// Pictures are { w, h, rgb } with rgb an interleaved Uint8Array/Uint8ClampedArray (w*h*3).
// A mask is a Uint8Array (w*h) with 1 for "fill this".

// ---------------------------------------------------------------------------------------------
// Smooth fill and seamless blending: both solve a Poisson equation over the masked pixels.
// ---------------------------------------------------------------------------------------------

// Neighbour table of the masked pixels: index of each of the 4 neighbours among the unknowns, -1 if it is
// a known pixel (then `outer` holds its position), -2 if it is outside the picture.
function unknowns(w, h, mask) {
  const idx = new Int32Array(w * h).fill(-1); const pos = [];
  for (let i = 0; i < w * h; i++) if (mask[i]) { idx[i] = pos.length; pos.push(i); }
  const n = pos.length, nb = new Int32Array(n * 4), outer = new Int32Array(n * 4).fill(-1), cnt = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const i = pos[k], x = i % w, y = (i - x) / w;
    const q = [x > 0 ? i - 1 : -2, x < w - 1 ? i + 1 : -2, y > 0 ? i - w : -2, y < h - 1 ? i + w : -2];
    for (let d = 0; d < 4; d++) {
      const j = q[d];
      if (j === -2) { nb[k * 4 + d] = -2; continue; }
      cnt[k]++;
      if (mask[j]) nb[k * 4 + d] = idx[j]; else { nb[k * 4 + d] = -1; outer[k * 4 + d] = j; }
    }
  }
  return { pos, idx, n, nb, outer, cnt };
}

// Conjugate gradients for  cnt_k f_k - sum(unknown neighbours) = b_k  (one channel).
function cg(U, b, x, iters, tol) {
  const { n, nb, cnt } = U;
  const r = new Float32Array(n), p = new Float32Array(n), Ap = new Float32Array(n);
  const mul = (v, out) => {
    for (let k = 0; k < n; k++) {
      let s = cnt[k] * v[k];
      for (let d = 0; d < 4; d++) { const j = nb[k * 4 + d]; if (j >= 0) s -= v[j]; }
      out[k] = s;
    }
  };
  mul(x, Ap);
  let rr = 0;
  for (let k = 0; k < n; k++) { r[k] = b[k] - Ap[k]; p[k] = r[k]; rr += r[k] * r[k]; }
  const stop = tol * tol * Math.max(1, n);
  for (let it = 0; it < iters && rr > stop; it++) {
    mul(p, Ap);
    let pAp = 0; for (let k = 0; k < n; k++) pAp += p[k] * Ap[k];
    if (pAp <= 0) break;
    const a = rr / pAp; let rr2 = 0;
    for (let k = 0; k < n; k++) { x[k] += a * p[k]; r[k] -= a * Ap[k]; rr2 += r[k] * r[k]; }
    const beta = rr2 / rr; rr = rr2;
    for (let k = 0; k < n; k++) p[k] = r[k] + beta * p[k];
  }
}

// The smoothest possible filling: each masked pixel is the average of its neighbours.
export function harmonicFill(img, mask) {
  const { w, h } = img, U = unknowns(w, h, mask), out = Uint8ClampedArray.from(img.rgb);
  if (!U.n) return out;
  const { n, nb, outer, pos } = U;
  for (let c = 0; c < 3; c++) {
    const b = new Float32Array(n), x = new Float32Array(n);
    let mean = 0, m = 0;
    for (let k = 0; k < n; k++) for (let d = 0; d < 4; d++) { const j = outer[k * 4 + d]; if (j >= 0) { b[k] += img.rgb[j * 3 + c]; mean += img.rgb[j * 3 + c]; m++; } }
    mean = m ? mean / m : 128; x.fill(mean);
    cg(U, b, x, 300, 0.2);
    for (let k = 0; k < n; k++) out[pos[k] * 3 + c] = x[k] + 0.5;
  }
  return out;
}

// Seamless cloning: the masked pixels take the *texture* of `pred` and the *colours* of the picture around
// them. `pred` is defined on the mask and one pixel beyond it.
export function poissonBlend(img, mask, pred) {
  const { w, h } = img, U = unknowns(w, h, mask), out = Uint8ClampedArray.from(img.rgb);
  if (!U.n) return out;
  const { n, nb, outer, pos } = U;
  for (let c = 0; c < 3; c++) {
    const b = new Float32Array(n), x = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const i = pos[k]; let s = 0;
      for (let d = 0; d < 4; d++) {
        const j = d === 0 ? i - 1 : d === 1 ? i + 1 : d === 2 ? i - w : i + w;
        if (nb[k * 4 + d] === -2) continue;
        s += pred[i * 3 + c] - pred[j * 3 + c];
        if (nb[k * 4 + d] === -1) s += img.rgb[outer[k * 4 + d] * 3 + c];
      }
      b[k] = s; x[k] = pred[i * 3 + c];
    }
    cg(U, b, x, 200, 0.25);
    for (let k = 0; k < n; k++) out[pos[k] * 3 + c] = x[k] + 0.5;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Patch-based filling (PatchMatch): every masked patch is replaced by the best matching patch found in
// the picture itself and in the other frames, coarse to fine.
// ---------------------------------------------------------------------------------------------

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function down(src, w, h, mask) {
  const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1);
  const rgb = new Uint8ClampedArray(w2 * h2 * 3), m2 = mask ? new Uint8Array(w2 * h2) : null;
  for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
    const i = ((y * 2) * w + x * 2), o = y * w2 + x;
    for (let c = 0; c < 3; c++) rgb[o * 3 + c] = (src[i * 3 + c] + src[(i + 1) * 3 + c] + src[(i + w) * 3 + c] + src[(i + w + 1) * 3 + c] + 2) >> 2;
    if (mask) m2[o] = mask[i] | mask[i + 1] | mask[i + w] | mask[i + w + 1];
  }
  return { w: w2, h: h2, rgb, mask: m2 };
}

// 1 where the (2r+1)^2 patch centred there lies inside the picture and is made only of usable pixels
function patchOk(w, h, usable, r) {
  const ok = new Uint8Array(w * h), I = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += usable[y * w + x] ? 0 : 1; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
    const a = I[(y - r) * (w + 1) + x - r], b = I[(y - r) * (w + 1) + x + r + 1], c = I[(y + r + 1) * (w + 1) + x - r], d = I[(y + r + 1) * (w + 1) + x + r + 1];
    ok[y * w + x] = d - b - c + a === 0 ? 1 : 0;
  }
  return ok;
}

/**
 * @param target  { w, h, rgb }  the picture to fill
 * @param mask    Uint8Array     1 = fill
 * @param others  [{ rgb, valid }] more pictures of the same size (other frames of the same view, or the same
 *                frame shifted): `valid` is 1 where they may be copied from. May be empty.
 * @returns Uint8ClampedArray  the filled picture
 */
export function patchFill(target, mask, others = [], opts = {}) {
  const seed = opts.seed || 1234, rand = rng(seed);
  const levels = opts.levels || (Math.min(target.w, target.h) >= 120 ? 3 : Math.min(target.w, target.h) >= 56 ? 2 : 1);
  const iters = opts.iters || [1, 2, 4, 6];            // per level, finest first
  const pyr = [];
  {
    let t = { w: target.w, h: target.h, rgb: target.rgb, mask };
    let srcs = [{ rgb: target.rgb, valid: Uint8Array.from(mask, (v) => 1 - v) }].concat(others.map((o) => ({ rgb: o.rgb, valid: o.valid })));
    for (let l = 0; l < levels; l++) {
      pyr.push({ t, srcs });
      if (l === levels - 1) break;
      const nt = down(t.rgb, t.w, t.h, t.mask);
      const nsrcs = srcs.map((s) => {
        const d = down(s.rgb, t.w, t.h, null), v = new Uint8Array(d.w * d.h);
        for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) { const i = y * 2 * t.w + x * 2; v[y * d.w + x] = s.valid[i] & s.valid[i + 1] & s.valid[i + t.w] & s.valid[i + t.w + 1]; }
        return { rgb: d.rgb, valid: v };
      });
      t = { w: nt.w, h: nt.h, rgb: nt.rgb, mask: nt.mask }; srcs = nsrcs;
    }
  }
  let ringVal = null, est = null, nnf = null;
  for (let l = levels - 1; l >= 0; l--) {
    const { t, srcs } = pyr[l], w = t.w, h = t.h, M = t.mask, r = l === 0 ? 2 : 3;
    // the picture of this level: the real pixels outside the hole, the coarser result (or a smooth fill) inside
    const cur = new Float32Array(w * h * 3);
    if (l === levels - 1) {
      const hf = harmonicFill({ w, h, rgb: t.rgb }, M);
      for (let i = 0; i < cur.length; i++) cur[i] = hf[i];
    } else {
      const pw = pyr[l + 1].t.w, ph = pyr[l + 1].t.h;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!M[i]) { cur[i * 3] = t.rgb[i * 3]; cur[i * 3 + 1] = t.rgb[i * 3 + 1]; cur[i * 3 + 2] = t.rgb[i * 3 + 2]; continue; }
        const fx = Math.min(pw - 1.001, Math.max(0, (x - 0.5) / 2)), fy = Math.min(ph - 1.001, Math.max(0, (y - 0.5) / 2));
        const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
        for (let c = 0; c < 3; c++) {
          const a = est[(y0 * pw + x0) * 3 + c], b = est[(y0 * pw + x0 + 1) * 3 + c], cc = est[((y0 + 1) * pw + x0) * 3 + c], d = est[((y0 + 1) * pw + x0 + 1) * 3 + c];
          cur[i * 3 + c] = a * (1 - ax) * (1 - ay) + b * ax * (1 - ay) + cc * (1 - ax) * ay + d * ax * ay;
        }
      }
    }
    const wmap = new Float32Array(w * h), wHole = l === levels - 1 ? 0.35 : 0.7;
    for (let i = 0; i < w * h; i++) wmap[i] = M[i] ? wHole : 1;
    // patch centres that touch the hole, and the one-pixel ring around it
    const R1 = new Uint8Array(w * h), centres = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (M[i]) continue;
      if ((x > 0 && M[i - 1]) || (x < w - 1 && M[i + 1]) || (y > 0 && M[i - w]) || (y < h - 1 && M[i + w])) R1[i] = 1;
    }
    {
      const I = new Int32Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += M[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row; } }
      for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) {
        const a = I[(y - r) * (w + 1) + x - r], b = I[(y - r) * (w + 1) + x + r + 1], c = I[(y + r + 1) * (w + 1) + x - r], d = I[(y + r + 1) * (w + 1) + x + r + 1];
        if (d - b - c + a > 0) centres.push(y * w + x);
      }
    }
    if (l === 0) ringVal = new Float32Array(w * h * 3);
    const nc = centres.length; if (!nc) { est = cur; nnf = null; continue; }
    const K = srcs.length, oks = srcs.map((s) => patchOk(w, h, s.valid, r));
    const cand = oks.map((ok) => { const a = []; for (let i = 0; i < w * h; i++) if (ok[i]) a.push(i); return Int32Array.from(a); });
    if (!cand.some((a) => a.length)) { est = cur; nnf = null; continue; }
    const srcRgb = srcs.map((s) => s.rgb);
    const slot = new Int32Array(w * h).fill(-1); for (let i = 0; i < nc; i++) slot[centres[i]] = i;
    const nk = new Uint8Array(nc), nq = new Int32Array(nc), nd = new Float32Array(nc);
    const area = (2 * r + 1) * (2 * r + 1), lam = 0.05 * area / 49;
    const dist = (ci, k, q, limit) => {
      const c = centres[ci], s = srcRgb[k]; let sum = 0;
      for (let dy = -r; dy <= r; dy++) {
        let a = c + dy * w - r, b = q + dy * w - r;
        for (let dx = -r; dx <= r; dx++, a++, b++) {
          const o = a * 3, p = b * 3, wt = wmap[a], d0 = cur[o] - s[p], d1 = cur[o + 1] - s[p + 1], d2 = cur[o + 2] - s[p + 2];
          sum += wt * (d0 * d0 + d1 * d1 + d2 * d2);
        }
        if (sum >= limit) return sum;
      }
      return sum;
    };
    const pen = (ci, q) => { const c = centres[ci], dx = (q % w) - (c % w), dy = ((q / w) | 0) - ((c / w) | 0); return lam * (dx * dx + dy * dy); };
    const pick = () => { for (let tries = 0; tries < 30; tries++) { const k = (rand() * K) | 0, L = cand[k]; if (L.length) return [k, L[(rand() * L.length) | 0]]; } return null; };
    const useCoarse = nnf && l < levels - 1;
    for (let i = 0; i < nc; i++) {
      let k = -1, q = -1;
      if (useCoarse) {
        const pw = pyr[l + 1].t.w, ph = pyr[l + 1].t.h, c = centres[i], cx = c % w, cy = (c - cx) / w;
        const j = nnf.slot[Math.min(ph - 1, cy >> 1) * pw + Math.min(pw - 1, cx >> 1)];
        if (j >= 0) {
          k = nnf.k[j]; const qq = nnf.q[j], qx = Math.min(w - 1, (qq % pw) * 2 + (cx & 1)), qy = Math.min(h - 1, ((qq / pw) | 0) * 2 + (cy & 1));
          q = qy * w + qx; if (!oks[k][q]) k = -1;
        }
      }
      if (k < 0) { const pk = pick(); k = pk[0]; q = pk[1]; }
      nk[i] = k; nq[i] = q; nd[i] = dist(i, k, q, 1e30) + pen(i, q);
    }
    const tryCand = (i, k, q) => {
      if (q < 0 || q >= w * h || !oks[k][q]) return;
      const p = pen(i, q); if (p >= nd[i]) return;
      const d = dist(i, k, q, nd[i] - p) + p;
      if (d < nd[i]) { nd[i] = d; nk[i] = k; nq[i] = q; }
    };
    const it = iters[Math.min(iters.length - 1, l)];
    const rmax = Math.max(4, Math.min(Math.max(w, h) >> 1, l === 0 ? 24 : 64));
    for (let iter = 0; iter < it; iter++) {
      const fwd = (iter & 1) === 0;
      for (let ii = 0; ii < nc; ii++) {
        const i = fwd ? ii : nc - 1 - ii, c = centres[i], x = c % w;
        if (fwd) {
          if (x > 0) { const j = slot[c - 1]; if (j >= 0) tryCand(i, nk[j], nq[j] + 1); }
          const j2 = slot[c - w]; if (j2 >= 0) tryCand(i, nk[j2], nq[j2] + w);
        } else {
          if (x < w - 1) { const j = slot[c + 1]; if (j >= 0) tryCand(i, nk[j], nq[j] - 1); }
          const j2 = slot[c + w]; if (j2 >= 0) tryCand(i, nk[j2], nq[j2] - w);
        }
        if (l === 0 && iter > 0 && (iter & 1) === 0) continue;       // the finest level: refine by propagation mostly
        const k = nk[i], q = nq[i], qx = q % w, qy = (q - qx) / w;
        for (let R = rmax; R >= 2; R >>= 1) {
          const x2 = qx + (((rand() * 2 - 1) * R) | 0), y2 = qy + (((rand() * 2 - 1) * R) | 0);
          if (x2 >= 0 && y2 >= 0 && x2 < w && y2 < h) tryCand(i, k, y2 * w + x2);
        }
        if (K > 1 && (iter & 1) === 0) { const cx = c % w, cy = (c - cx) / w; tryCand(i, 1 + ((rand() * (K - 1)) | 0), Math.min(h - 1, Math.max(0, cy + (((rand() * 7) | 0) - 3))) * w + Math.min(w - 1, Math.max(0, cx + (((rand() * 7) | 0) - 3)))); }
      }
      // vote: every hole pixel is the weighted mean of what the patches that cover it say
      const last = iter === it - 1, withRing = last && l === 0;
      const acc = new Float32Array(w * h * 3), wsum = new Float32Array(w * h);
      let nsum = 0; for (let i = 0; i < nc; i++) nsum += nd[i]; const sigma = Math.max(1, 1.3 * nsum / nc);
      for (let i = 0; i < nc; i++) {
        const c = centres[i], q = nq[i], s = srcRgb[nk[i]], wt = Math.exp(-nd[i] / (2 * sigma));
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const a = c + dy * w + dx; if (!M[a] && !(withRing && R1[a])) continue;
          const b = q + dy * w + dx;
          acc[a * 3] += wt * s[b * 3]; acc[a * 3 + 1] += wt * s[b * 3 + 1]; acc[a * 3 + 2] += wt * s[b * 3 + 2]; wsum[a] += wt;
        }
      }
      for (let a = 0; a < w * h; a++) {
        if (wsum[a] <= 0) continue;
        if (M[a]) { cur[a * 3] = acc[a * 3] / wsum[a]; cur[a * 3 + 1] = acc[a * 3 + 1] / wsum[a]; cur[a * 3 + 2] = acc[a * 3 + 2] / wsum[a]; }
        else if (withRing && R1[a]) { ringVal[a * 3] = acc[a * 3] / wsum[a]; ringVal[a * 3 + 1] = acc[a * 3 + 1] / wsum[a]; ringVal[a * 3 + 2] = acc[a * 3 + 2] / wsum[a]; }
      }
    }
    est = cur; nnf = { k: nk, q: nq, slot };
  }
  // seamless blend of the result into the picture: the sources also say what is just outside the hole, so the
  // blend keeps the texture they bring and the colours of the picture around
  const w0 = target.w, h0 = target.h, pred = new Float32Array(w0 * h0 * 3);
  for (let i = 0; i < pred.length; i++) pred[i] = est[i];
  for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
    const i = y * w0 + x; if (mask[i]) continue;
    const touch = (x > 0 && mask[i - 1]) || (x < w0 - 1 && mask[i + 1]) || (y > 0 && mask[i - w0]) || (y < h0 - 1 && mask[i + w0]);
    if (!touch) continue;
    const has = ringVal && ringVal[i * 3] + ringVal[i * 3 + 1] + ringVal[i * 3 + 2] > 0;
    for (let c = 0; c < 3; c++) pred[i * 3 + c] = has ? ringVal[i * 3 + c] : target.rgb[i * 3 + c];
  }
  const rgb = poissonBlend(target, mask, pred);
  return opts.layer ? { rgb, pred } : rgb;
}
