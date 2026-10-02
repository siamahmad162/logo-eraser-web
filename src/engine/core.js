// Logo removal core: works on single 8-bit image planes (Y, U, V or R, G, B).
// A plane is { data, off, stride, step, w, h, white } where `white` is the plane's value for pure white.
const LogoCore = (() => {
  'use strict';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Smooth guess of what lies under rect r, interpolated from the 1px ring around it
  // (edge blend weighted toward the nearest edge, then a few diffusion passes).
  function smoothFill(p, r, out, tmp) {
    const { data, off, stride, step } = p;
    const { x, y, w, h } = r;
    const hasL = x > 0, hasR = x + w < p.w, hasT = y > 0, hasB = y + h < p.h;
    const at = (xx, yy) => data[off + yy * stride + xx * step];
    if (!(hasL || hasR || hasT || hasB)) { out.fill(p.white * 0.5); return; }
    for (let j = 0; j < h; j++) {
      const L = hasL ? at(x - 1, y + j) : 0, R = hasR ? at(x + w, y + j) : 0;
      for (let i = 0; i < w; i++) {
        let hv = 0, wh = 0, vv = 0, wv = 0;
        if (hasL && hasR) { hv = L + (R - L) * (i + 1) / (w + 1); wh = 1 / Math.min(i + 1, w - i); }
        else if (hasL) { hv = L; wh = 1 / (i + 1); }
        else if (hasR) { hv = R; wh = 1 / (w - i); }
        const T = hasT ? at(x + i, y - 1) : 0, B = hasB ? at(x + i, y + h) : 0;
        if (hasT && hasB) { vv = T + (B - T) * (j + 1) / (h + 1); wv = 1 / Math.min(j + 1, h - j); }
        else if (hasT) { vv = T; wv = 1 / (j + 1); }
        else if (hasB) { vv = B; wv = 1 / (h - j); }
        out[j * w + i] = (hv * wh + vv * wv) / (wh + wv);
      }
    }
    const iters = clamp(Math.round(240000 / (w * h)), 2, 12);
    let a = out, b = tmp;
    for (let it = 0; it < iters; it++) {
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = j * w + i;
          let s = 0, c = 0;
          if (i > 0) { s += a[k - 1]; c++; } else if (hasL) { s += at(x - 1, y + j); c++; }
          if (i < w - 1) { s += a[k + 1]; c++; } else if (hasR) { s += at(x + w, y + j); c++; }
          if (j > 0) { s += a[k - w]; c++; } else if (hasT) { s += at(x + i, y - 1); c++; }
          if (j < h - 1) { s += a[k + w]; c++; } else if (hasB) { s += at(x + i, y + h); c++; }
          b[k] = c ? s / c : a[k];
        }
      }
      const t = a; a = b; b = t;
    }
    if (a !== out) out.set(a.subarray(0, w * h));
  }

  // ---- detection: find a static overlay from luma frames sampled across the video ----
  // frames: array of Uint8Array (w*h luma, already downscaled). Returns rect in those coords or null.
  function detect(frames, w, h) {
    const n = w * h, N = frames.length;
    if (N < 4) return null;
    const half = N >> 1;
    const m1 = new Float32Array(n), m2 = new Float32Array(n), sq = new Float32Array(n);
    frames.forEach((f, t) => {
      const m = t < half ? m1 : m2;
      for (let k = 0; k < n; k++) { const v = f[k]; m[k] += v; sq[k] += v * v; }
    });
    const mean = new Float32Array(n), sd = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      m1[k] /= half; m2[k] /= N - half;
      mean[k] = (m1[k] * half + m2[k] * (N - half)) / N;
      sd[k] = Math.sqrt(Math.max(0, sq[k] / N - mean[k] * mean[k]));
    }
    const sob = (img, k) => [
      (img[k + 1] - img[k - 1]) * 2 + (img[k - w + 1] - img[k - w - 1]) + (img[k + w + 1] - img[k + w - 1]),
      (img[k + w] - img[k - w]) * 2 + (img[k + w - 1] - img[k - w - 1]) + (img[k + w + 1] - img[k - w + 1]),
    ];
    // How much the picture changes around each pixel (box average of temporal std-dev).
    const motion = boxBlur(sd, w, h, Math.max(3, Math.round(w / 60)));
    const sorted = Float32Array.from(motion).sort();
    const mMed = sorted[n >> 1] + 1;
    // An overlay leaves a crisp edge in the averaged picture that is identical in the first and
    // second half of the video, even though the scene under it keeps changing. Scenery fails at
    // least one of these: it moves between halves, its edges are soft, or nothing changes there.
    const score = new Float32Array(n);
    let max = 0;
    const m = 3;
    for (let j = m; j < h - m; j++) {
      for (let i = m; i < w - m; i++) {
        const k = j * w + i;
        const [ax, ay] = sob(m1, k), [bx, by] = sob(m2, k), [gx, gy] = sob(mean, k);
        const ga = Math.hypot(ax, ay), gb = Math.hypot(bx, by), gm = Math.hypot(gx, gy);
        if (gm < 4) continue;
        const agree = Math.max(0, (ax * bx + ay * by) / (ga * gb + 1e-6)) * (Math.min(ga, gb) / (Math.max(ga, gb) + 1e-6));
        let lo = 255, hi = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const v = mean[k + dj * w + di]; if (v < lo) lo = v; if (v > hi) hi = v; }
        const sharp = Math.min(1, gm / (4 * (hi - lo) + 1));
        const mv = motion[k];
        const s = gm * agree * agree * sharp * (mv / (mv + mMed));
        score[k] = s;
        if (s > max) max = s;
      }
    }
    if (max < 0.5) return null;
    const thr = max * 0.2;
    const on = new Uint8Array(n);
    const dil = Math.max(2, Math.round(w / 220));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (score[j * w + i] <= thr) continue;
      for (let dj = -dil; dj <= dil; dj++) for (let di = -dil; di <= dil; di++) {
        const jj = j + dj, ii = i + di;
        if (jj >= 0 && jj < h && ii >= 0 && ii < w) on[jj * w + ii] = 1;
      }
    }
    const lab = new Int32Array(n).fill(-1), stack = [], comps = [];
    for (let k0 = 0; k0 < n; k0++) {
      if (!on[k0] || lab[k0] >= 0) continue;
      let x0 = w, y0 = h, x1 = 0, y1 = 0, sum = 0, cnt = 0;
      stack.push(k0); lab[k0] = k0;
      while (stack.length) {
        const k = stack.pop(), i = k % w, j = (k - i) / w;
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
        sum += score[k]; cnt++;
        const nb = [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1];
        for (const q of nb) if (q >= 0 && on[q] && lab[q] < 0) { lab[q] = k0; stack.push(q); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (bw > w * 0.4 || bh > h * 0.4 || bw / bh > 8 || bh / bw > 8 || cnt < 6) continue;
      // Logos sit near corners and edges; give those a mild preference.
      const cx = Math.abs((x0 + x1) / 2 / w - 0.5) * 2, cy = Math.abs((y0 + y1) / 2 / h - 0.5) * 2;
      const val = sum * (0.5 + 0.5 * Math.max(cx, cy) + 0.5 * cx * cy);
      comps.push({ val, x: x0, y: y0, w: bw, h: bh });
    }
    comps.sort((a, b) => b.val - a.val);
    const best = comps[0];
    return best ? { x: best.x, y: best.y, w: best.w, h: best.h, confidence: comps[1] ? best.val / (best.val + comps[1].val) : 1 } : null;
  }

  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      let s = 0; const row = j * w;
      for (let i = -r; i <= r; i++) s += src[row + clamp(i, 0, w - 1)];
      for (let i = 0; i < w; i++) {
        tmp[row + i] = s / (2 * r + 1);
        s += src[row + clamp(i + r + 1, 0, w - 1)] - src[row + clamp(i - r, 0, w - 1)];
      }
    }
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let j = -r; j <= r; j++) s += tmp[clamp(j, 0, h - 1) * w + i];
      for (let j = 0; j < h; j++) {
        out[j * w + i] = s / (2 * r + 1);
        s += tmp[clamp(j + r + 1, 0, h - 1) * w + i] - tmp[clamp(j - r, 0, h - 1) * w + i];
      }
    }
    return out;
  }

  // ---- learning: per-pixel opacity `a` of a flat-colour overlay of colour L inside rect r ----
  // Model: observed = a*L + (1-a)*under. `under` is guessed each frame by smoothFill; with
  // d = observed - guess, least squares over many frames gives a = Σd(L-u) / Σ(L-u)².
  // Sums are kept so L can be fitted afterwards instead of assuming pure white.
  class PlaneLearner {
    constructor(r, keep) {
      this.r = r;
      this.keep = !!keep; this.crops = [];
      const n = r.w * r.h;
      this.sd = new Float64Array(n); this.sdd = new Float64Array(n); this.sdu = new Float64Array(n);
      this.su = new Float64Array(n); this.suu = new Float64Array(n);
      this.so = new Float64Array(n); this.soo = new Float64Array(n);
      this.fill = new Float32Array(n); this.tmp = new Float32Array(n);
      this.frames = 0;
    }
    add(p) {
      const { r, sd, sdd, sdu, su, suu, so, soo, fill } = this;
      smoothFill(p, r, fill, this.tmp);
      for (let j = 0; j < r.h; j++) {
        let o = p.off + (r.y + j) * p.stride + r.x * p.step;
        for (let i = 0; i < r.w; i++, o += p.step) {
          const k = j * r.w + i, u = fill[k], ov = p.data[o], d = ov - u;
          sd[k] += d; sdd[k] += d * d; sdu[k] += d * u; su[k] += u; suu[k] += u * u;
          so[k] += ov; soo[k] += ov * ov;
        }
      }
      if (this.keep) {
        const c = new Uint8Array(r.w * r.h);
        for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) c[j * r.w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
        this.crops.push(c);
      }
      this.frames++;
    }
    alphaFor(L) {
      const n = this.r.w * this.r.h, N = this.frames, a = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const den = L * L * N - 2 * L * this.su[k] + this.suu[k];
        a[k] = den > N ? clamp((L * this.sd[k] - this.sdu[k]) / den, -0.2, 1) : 0;
      }
      return a;
    }
    // Best overlay colour for a given opacity map (closed form, pixels with a>0 only).
    colourFor(a) {
      let num = 0, den = 0;
      const N = this.frames;
      for (let k = 0; k < a.length; k++) {
        const v = a[k];
        if (v <= 0) continue;
        num += v * this.sd[k] + v * v * this.su[k];
        den += v * v * N;
      }
      return den > 0 ? num / den : null;
    }
  }

  // Fit opacity and colour together on the luma plane: alternate a|L and L|a a few times.
  function fitLuma(learner, white, w, h) {
    let L = white, a = learner.alphaFor(L), cm = cleanMask(a, w, h);
    for (let it = 0; it < 6; it++) {
      const masked = a.map((v, k) => (cm.mask[k] ? Math.max(0, v) : 0));
      const L2 = learner.colourFor(masked);
      if (L2 == null) break;
      const next = clamp(L2, white * 0.55, 255);
      const done = Math.abs(next - L) < 0.25;
      L = next;
      a = learner.alphaFor(L);
      cm = cleanMask(a, w, h);
      if (done) break;
    }
    const alpha = a.map((v, k) => (cm.mask[k] ? Math.max(0, v) : 0));
    return { L, alpha, mask: cm.mask, thr: cm.thr, noise: cm.noise };
  }

  // Moment-based refinement. Over many frames the logo leaves two fingerprints: it lifts the average
  // (mean_in = a*L + (1-a)*mean_bg) and it damps the changes over time (sd_in = (1-a)*sd_bg). The
  // background's mean and spread under the logo are interpolated from the pixels around it (both are
  // smooth once averaged over a moving shot). The damping gives the opacity independently of the
  // colour, which pins down the colour L; the mean then gives a precise opacity per pixel.
  function laplaceFill(img, unknown, w, h, iters) {
    const out = Float64Array.from(img);
    // start unknown pixels at the average of the known ones around the region
    let s = 0, c = 0;
    for (let k = 0; k < w * h; k++) if (!unknown[k]) { s += out[k]; c++; }
    for (let k = 0; k < w * h; k++) if (unknown[k]) out[k] = s / c;
    const list = [];
    for (let k = 0; k < w * h; k++) if (unknown[k]) list.push(k);
    for (let it = 0; it < iters; it++) {
      for (const k of list) {
        const i = k % w, j = (k - i) / w;
        let t = 0, n = 0;
        if (i > 0) { t += out[k - 1]; n++; } if (i < w - 1) { t += out[k + 1]; n++; }
        if (j > 0) { t += out[k - w]; n++; } if (j < h - 1) { t += out[k + w]; n++; }
        out[k] = t / n;
      }
    }
    return out;
  }
  // Edge-preserving clean-up of the opacity map: average each pixel with neighbours of similar
  // opacity, so per-pixel estimation noise goes away but the logo's outline stays sharp.
  function smoothAlpha(a, mask, w, h) {
    let cur = Float32Array.from(a);
    for (let pass = 0; pass < 2; pass++) {
      const nxt = Float32Array.from(cur);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (!mask[k]) continue;
        let s = 0, c = 0;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
          const q = jj * w + ii, v = cur[q];
          if (Math.abs(v - cur[k]) > 0.05) continue;
          s += v; c++;
        }
        nxt[k] = s / c;
      }
      cur = nxt;
    }
    return cur;
  }

  function refineByMoments(learner, fit, w, h) {
    const N = learner.frames, n = w * h;
    const mean = new Float64Array(n), sd = new Float64Array(n);
    for (let k = 0; k < n; k++) { mean[k] = learner.so[k] / N; sd[k] = Math.sqrt(Math.max(0, learner.soo[k] / N - mean[k] * mean[k])); }
    const unknown = fit.mask;
    const iters = Math.min(1500, 4 * Math.max(w, h));
    const mB = laplaceFill(mean, unknown, w, h, iters), sB = laplaceFill(sd, unknown, w, h, iters);
    let amax = 0;
    for (const v of fit.alpha) if (v > amax) amax = v;
    const Ls = [];
    for (let k = 0; k < n; k++) {
      if (fit.alpha[k] < amax * 0.6 || sB[k] < 4) continue;
      const keep = Math.min(0.97, sd[k] / sB[k]);
      const av = 1 - keep;
      if (av < 0.05) continue;
      Ls.push((mean[k] - keep * mB[k]) / av);
    }
    if (Ls.length < 20) return null;
    Ls.sort((a, b) => a - b);
    const L = Ls[Ls.length >> 1];
    const alpha = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      if (!unknown[k]) continue;
      const den = L - mB[k];
      alpha[k] = Math.abs(den) > 8 ? clamp((mean[k] - mB[k]) / den, 0, 0.98) : fit.alpha[k];
    }
    return { L, alpha: smoothAlpha(alpha, unknown, w, h), mask: unknown, samples: Ls.length };
  }

  // Near-black check. Over a flat black background the logo can come out brighter than the
  // straight-line blend predicts (seen in videos whose blacks are lifted, e.g. black at 30 instead
  // of 16), and the undo then leaves a faint grey star on black. Logo pixels whose surroundings are
  // flat black in a frame show the true error there; when enough frames agree, a correction is
  // applied that is full at the video's black level and fades out 24 levels above it.
  function fitBlackLift(learner, alpha, L, mask) {
    const { w, h } = learner.r, n = w * h, crops = learner.crops;
    if (crops.length < 8) return null;
    // the video's own black: a very low percentile of the logo-free pixels
    const hist = new Float64Array(256);
    for (const c of crops) for (let k = 0; k < n; k += 3) if (!mask[k]) hist[c[k]]++;
    const total = hist.reduce((x, y) => x + y, 0);
    let acc = 0, black = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.005) { black = v; break; } }
    const geo = [];
    for (let k = 0; k < n; k++) {
      if (alpha[k] < 0.15) continue;
      const i = k % w, j = (k - i) / w, qs = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        for (let s2 = 1; s2 < 80; s2++) {
          const ii = i + dx * s2, jj = j + dy * s2;
          if (ii < 0 || jj < 0 || ii >= w || jj >= h) break;
          const q = jj * w + ii;
          if (mask[q]) continue;
          const i2 = ii + dx * 6, j2 = jj + dy * 6;
          if (i2 >= 0 && j2 >= 0 && i2 < w && j2 < h && !mask[j2 * w + i2]) qs.push([q, j2 * w + i2]);
          break;
        }
      }
      if (qs.length >= 6) geo.push([k, qs]);
    }
    const perFrame = [];
    for (const c of crops) {
      let s = 0, cnt = 0;
      for (const [k, qs] of geo) {
        const vals = qs.map(([q]) => c[q]).sort((x, y) => x - y), med = vals[vals.length >> 1];
        if (med > black + 6) continue;
        let m = 0, ag = 0;
        for (const [q, q2] of qs) if (Math.abs(c[q] - med) <= 2 && Math.abs(c[q2] - c[q]) <= 2) { m += c[q]; ag++; }
        if (ag < 6) continue;
        m /= ag;
        s += (c[k] - (alpha[k] * L + (1 - alpha[k]) * m)) / alpha[k]; cnt++;
      }
      if (cnt >= 20) perFrame.push(s / cnt);
    }
    if (perFrame.length < 8) return null;
    const mean = perFrame.reduce((x, y) => x + y, 0) / perFrame.length;
    const sd = Math.sqrt(perFrame.reduce((x, y) => x + (y - mean) ** 2, 0) / perFrame.length);
    // act only on a clear, consistent effect
    if (Math.abs(mean) < 2 || Math.abs(mean) < 3 * sd / Math.sqrt(perFrame.length)) return null;
    const lift = clamp(mean, -15, 15);
    return { knots: [black - 64, black, black + 24, 400], g: [lift, lift, 0, 0], black, frames: perFrame.length };
  }
  function respAt(resp, bg) {
    const { knots, g } = resp, K = knots.length;
    if (bg <= knots[0]) return g[0];
    if (bg >= knots[K - 1]) return g[K - 1];
    let s = 0; while (bg > knots[s + 1]) s++;
    const t = (bg - knots[s]) / (knots[s + 1] - knots[s]);
    return g[s] * (1 - t) + g[s + 1] * t;
  }

  // Opacity on a subsampled plane = average of the full-res opacity it covers.
  function alphaOnPlane(alpha, r, pr, sx, sy) {
    const out = new Float32Array(pr.w * pr.h), cnt = new Float32Array(pr.w * pr.h);
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const pi = Math.floor((r.x + i) / sx) - pr.x, pj = Math.floor((r.y + j) / sy) - pr.y;
      if (pi < 0 || pi >= pr.w || pj < 0 || pj >= pr.h) continue;
      out[pj * pr.w + pi] += alpha[j * r.w + i]; cnt[pj * pr.w + pi]++;
    }
    for (let k = 0; k < out.length; k++) out[k] = cnt[k] ? out[k] / cnt[k] : 0;
    return out;
  }

  // Turn raw luma opacity into a clean mask: threshold against the noise seen on the rect's
  // outer band (which should be logo-free), keep the main blobs, then grow a little for soft edges.
  function cleanMask(a, w, h) {
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.08));
    let s = 0, s2 = 0, c = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (i >= band && i < w - band && j >= band && j < h - band) continue;
      const v = a[j * w + i]; s += v; s2 += v * v; c++;
    }
    const mu = s / c, sd = Math.sqrt(Math.max(0, s2 / c - mu * mu));
    const thr = Math.max(0.03, mu + 4 * sd);
    const core = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) core[k] = a[k] > thr ? 1 : 0;
    // Keep only real logo parts: drop specks, and faint blobs (scenery that happened to be brighter
    // there on average) whose peak opacity is far below the logo's own.
    const lab = new Int32Array(w * h).fill(-1), sizes = [], peaks = [], stack = [];
    for (let k0 = 0; k0 < w * h; k0++) {
      if (!core[k0] || lab[k0] >= 0) continue;
      const id = sizes.length; let cnt = 0, peak = 0;
      stack.push(k0); lab[k0] = id;
      while (stack.length) {
        const k = stack.pop(), i = k % w, j = (k - i) / w; cnt++;
        if (a[k] > peak) peak = a[k];
        const nb = [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1];
        for (const q of nb) if (q >= 0 && core[q] && lab[q] < 0) { lab[q] = id; stack.push(q); }
      }
      sizes.push(cnt); peaks.push(peak);
    }
    const big = Math.max(0, ...sizes), top = Math.max(0, ...peaks);
    const keepId = sizes.map((sz, id) => sz >= Math.max(4, big * 0.005) && peaks[id] >= top * 0.4);
    const mask = new Uint8Array(w * h);
    const grow = 2;
    for (let k = 0; k < w * h; k++) {
      if (lab[k] < 0 || !keepId[lab[k]]) continue;
      const i = k % w, j = (k - i) / w;
      for (let dj = -grow; dj <= grow; dj++) for (let di = -grow; di <= grow; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && ii < w && jj >= 0 && jj < h) mask[jj * w + ii] = 1;
      }
    }
    return { mask, thr, noise: sd };
  }

  // ---- restoring one plane in place ----
  // Where opacity is moderate, undo the blend exactly; where it is near-opaque the original is
  // unrecoverable, so those pixels are filled from their (already restored) neighbours.
  const OPAQUE = 0.82;
  function restorePlane(p, pm) {
    const { r, alpha } = pm;
    const W = pm.L;
    let holes = 0;
    // the frame's own pixels, kept for the outline repair (what the logo-covered pixel really showed)
    if (pm.repair || pm.finish) {
      const o0 = pm.orig && pm.orig.length === r.w * r.h ? pm.orig : (pm.orig = new Uint8Array(r.w * r.h));
      for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) o0[j * r.w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
    }
    for (let j = 0; j < r.h; j++) {
      let o = p.off + (r.y + j) * p.stride + r.x * p.step;
      for (let i = 0; i < r.w; i++, o += p.step) {
        const a = alpha[j * r.w + i], aD = pm.dark ? pm.dark.alpha[j * r.w + i] : a;
        if (a === 0 && aD === 0) continue;
        if (a >= OPAQUE) { holes++; continue; }
        if (pm.dark && aD !== a) {
          // opacity depends on the background: aD at near-black, a above; solve for the background
          const { lo: dlo, hi: dhi } = pm.dark, v = p.data[o];
          let lo = -40, hi = 300;
          for (let it = 0; it < 16; it++) {
            const mid = (lo + hi) / 2, t = clamp((dhi - mid) / (dhi - dlo), 0, 1), am = Math.min(OPAQUE, a + (aD - a) * t);
            if (am * W + (1 - am) * mid + (pm.resp ? am * respAt(pm.resp, mid) : 0) < v) lo = mid; else hi = mid;
          }
          p.data[o] = clamp(Math.round((lo + hi) / 2), 0, 255);
          continue;
        }
        if (pm.resp) {
          const target = p.data[o] - a * W;
          let lo = -40, hi = 300;
          for (let it = 0; it < 16; it++) { const mid = (lo + hi) / 2; if ((1 - a) * mid + a * respAt(pm.resp, mid) < target) lo = mid; else hi = mid; }
          p.data[o] = clamp(Math.round((lo + hi) / 2), 0, 255);
        } else p.data[o] = clamp(Math.round((p.data[o] - a * W) / (1 - a)), 0, 255);
      }
    }
    if (holes) fillHoles(p, pm);
    if (!pm.noHeal) heal(p, pm);
    if (pm.soften) soften(p, pm);
    if (pm.denoise) denoise(p, pm);
    if (pm.finish) finish(p, pm);
    if (pm.repair) repairOutline(p, pm);
    if (pm.despeckle) despeckle(p, pm);
  }
  // Last: single pixels inside the logo's area that stand out from everything around them. Undoing
  // the blend multiplies the source's compression noise, and now and then one pixel comes out much
  // darker or lighter than its surroundings — the "dots" that trace the logo's outline. A real
  // picture doesn't have lone dark pixels (compression smooths them away), and anything real that is
  // thin (a line, an edge) has like neighbours along it, so only a pixel beyond all but at most one
  // of its neighbours, whose neighbours agree with each other, takes their middle value. A lone light
  // pixel can be real (a small star, a highlight), so it is only taken when the logo itself explains
  // it: the opacity it shows against its neighbours is one the logo has right around that pixel.
  function despeckle(p, pm) {
    const { r } = pm, w = r.w, h = r.h, n = w * h;
    if (!pm.dsp) {
      const U = new Uint8Array(n), lo3 = new Float32Array(n), hi3 = new Float32Array(n), edge = new Uint8Array(n);
      let amax = 0; for (let k = 0; k < n; k++) amax = Math.max(amax, Math.abs(pm.alpha[k]));
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let lo = 9, hi = -9;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue; const v = pm.alpha[b2 * w + a2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        lo3[j * w + i] = lo; hi3[j * w + i] = hi;
        if (hi - lo > 0.2 * amax) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 1 && b2 >= 1 && a2 < w - 1 && b2 < h - 1) edge[b2 * w + a2] = 1; }
        if (pm.alpha[j * w + i] !== 0) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 1 && b2 >= 1 && a2 < w - 1 && b2 < h - 1) U[b2 * w + a2] = 1; }
      }
      // the opacity range around each pixel, widened by one pixel on the edge (a logo drawn a pixel
      // off moves an edge pixel's opacity anywhere within its neighbours')
      const lo5 = Float32Array.from(lo3), hi5 = Float32Array.from(hi3);
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const q = j * w + i; if (!edge[q]) continue;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const k = q + dj * w + di; lo5[q] = Math.min(lo5[q], lo3[k]); hi5[q] = Math.max(hi5[q], hi3[k]); }
      }
      const list = []; for (let q = 0; q < n; q++) if (U[q]) list.push(q);
      pm.dsp = { list, lo3: lo5, hi3: hi5, edge };
    }
    const { list, lo3, hi3, edge } = pm.dsp, O = pm.orig, L = pm.L;
    const at = (q) => p.off + (r.y + ((q / w) | 0)) * p.stride + (r.x + (q % w)) * p.step;
    const c = new Uint8Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c[j * w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
    const T = pm.speckT || 10, nb = new Array(8), D = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
    // a dark neighbour that itself goes on into more dark pixels makes this the end of a line
    const lineEnd = (q, m) => {
      for (const d of D) {
        const k = q + d;
        if (!(c[k] < m - T)) continue;
        for (const e of D) { const k2 = k + e; if (k2 !== q && k2 >= 0 && k2 < n && c[k2] < m - T && Math.abs((k2 % w) - (k % w)) <= 1) return true; }
      }
      return false;
    };
    for (let pass = 0; pass < 2; pass++) {
      let changed = false;
      for (const q of list) {
        nb[0] = c[q - w - 1]; nb[1] = c[q - w]; nb[2] = c[q - w + 1]; nb[3] = c[q - 1]; nb[4] = c[q + 1]; nb[5] = c[q + w - 1]; nb[6] = c[q + w]; nb[7] = c[q + w + 1];
        nb.sort((x, y) => x - y);
        if (nb[6] - nb[1] > 2 * T) continue;
        const m = (nb[3] + nb[4] + 1) >> 1;
        if (pass === 0 && c[q] < nb[1] - T) {
          if (lineEnd(q, m)) continue;
          c[q] = m; p.data[at(q)] = m; changed = true;
        } else if (c[q] > nb[6] + T && O && Math.abs(L - m) >= 8) {
          const aq = (O[q] - m) / (L - m);
          if (aq >= lo3[q] - 0.05 && aq <= hi3[q] + 0.25) { c[q] = m; p.data[at(q)] = m; changed = true; }
        } else if (edge[q] && O && (c[q] > nb[4] + T || c[q] < nb[3] - T)) {
          // a short run of pixels along the logo's edge (the edge drawn a pixel off): against the
          // majority of its neighbours on the other side, if the logo explains it
          const mb = c[q] > nb[4] + T ? (nb[1] + nb[2] + 1) >> 1 : (nb[5] + nb[6] + 1) >> 1;
          if (Math.abs(L - mb) < 8 || nb[c[q] > nb[4] + T ? 4 : 7] - nb[c[q] > nb[4] + T ? 0 : 3] > 2 * T) continue;
          const aq = (O[q] - mb) / (L - mb);
          if (aq >= lo3[q] - 0.05 && aq <= hi3[q] + 0.1) { c[q] = mb; p.data[at(q)] = mb; changed = true; }
        }
      }
      if (!changed) break;
    }
  }
  // The logo's outline (and its thin tips) is where any leftover concentrates: a line one or two
  // pixels wide, exactly where the logo's edge was. That strip is redrawn in every frame from the
  // pixels on both sides of it, along the direction in which the two sides match best, so lines and
  // edges that cross it (bars, rings, grid lines) carry straight through and flat areas stay flat.
  const ODIRS = [];
  for (let k = 0; k < 16; k++) { const t = k * Math.PI / 16; ODIRS.push([Math.cos(t), Math.sin(t)]); }
  function outlineBand(pm) {
    if (pm.ob) return pm.ob;
    const { r } = pm, w = r.w, h = r.h, n = w * h, A = new Float32Array(n);
    let amax = 0;
    for (let k = 0; k < n; k++) { A[k] = Math.max(Math.abs(pm.alpha[k]), pm.dark ? Math.abs(pm.dark.alpha[k]) : 0); amax = Math.max(amax, A[k]); }
    const thr = 0.12 * amax, core = new Uint8Array(n), rng = new Float32Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let lo = 9, hi = -9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue; const v = pm.alpha[b2 * w + a2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      rng[j * w + i] = hi - lo;
      if (hi - lo > thr) core[j * w + i] = 1;
    }
    const band = new Uint8Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!core[j * w + i]) continue;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) band[b2 * w + a2] = 1; }
    }
    // for every strip pixel: along each of 16 directions, the nearest pixel off the strip on either side
    const list = [];
    for (let q = 0; q < n; q++) {
      if (!band[q]) continue;
      const i = q % w, j = (q - i) / w, axes = [];
      for (const [dx, dy] of ODIRS) {
        const side = (sgn) => {
          for (let st = 1; st <= 10; st++) {
            const a2 = Math.round(i + sgn * dx * st), b2 = Math.round(j + sgn * dy * st);
            if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) return null;
            if (!band[b2 * w + a2]) return [b2 * w + a2, st];
          }
          return null;
        };
        const p1 = side(1), p2 = side(-1);
        if (p1 && p2) axes.push(p1[0], p1[1], p2[0], p2[1]);
      }
      if (axes.length) list.push(q, axes);
    }
    // how strongly the logo shows around each strip pixel (bounds how big a leftover can be there)
    // (at the thin tips and right at the edge a misfit can reach the logo's full strength nearby)
    const a3 = new Float32Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!band[j * w + i]) continue;
      let mx = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) mx = Math.max(mx, A[b2 * w + a2]); }
      a3[j * w + i] = Math.max(mx, 0.6 * amax);
    }
    // how steep the logo's edge is around each strip pixel (its 3×3 neighbourhood's widest range)
    const steep = new Float32Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!band[j * w + i]) continue;
      let mx = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) mx = Math.max(mx, rng[b2 * w + a2]); }
      steep[j * w + i] = mx;
    }
    pm.ob = { band, list, a3, steep };
    return pm.ob;
  }
  function repairOutline(p, pm) {
    const { r } = pm, w = r.w, h = r.h, n = w * h, ob = outlineBand(pm), { band, list, a3 } = ob;
    const c = new Float32Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c[j * w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
    // Each strip pixel takes the centre of the best-matching patch from nearby off the strip: the
    // patch around it is compared on its off-strip pixels (and, lightly, on its own restored ones as
    // a guide), so dots, bars and grid lines on the strip come back as they are around it.
    if (!ob.patch) {
      const P = pm.patchR || 2, S = 12;
      ob.patch = { P, S };
      // possible source centres: off the strip, with their whole patch off the strip too
      const ok = new Uint8Array(n);
      for (let j = P; j < h - P; j++) for (let i = P; i < w - P; i++) {
        let clean = true;
        for (let dj = -P; dj <= P && clean; dj++) for (let di = -P; di <= P; di++) if (band[(j + dj) * w + i + di]) { clean = false; break; }
        ok[j * w + i] = clean ? 1 : 0;
      }
      ob.patch.ok = ok;
    }
    const { P, S, ok } = ob.patch, gw = pm.guideW || 0.15;
    const out = [];
    for (let t = 0; t < list.length; t += 2) {
      const q = list[t], i = q % w, j = (q - i) / w;
      let best = Infinity, bv = c[q], second = Infinity, sv = c[q];
      for (let sj = Math.max(P, j - S); sj <= Math.min(h - 1 - P, j + S); sj++) for (let si = Math.max(P, i - S); si <= Math.min(w - 1 - P, i + S); si++) {
        const sq = sj * w + si;
        if (!ok[sq]) continue;
        let cost = 0, wsum = 0;
        for (let dj = -P; dj <= P; dj++) {
          const tj = j + dj; if (tj < 0 || tj >= h) continue;
          for (let di = -P; di <= P; di++) {
            const ti = i + di; if (ti < 0 || ti >= w) continue;
            const tq = tj * w + ti, wt = band[tq] ? gw : 1, d = c[(sj + dj) * w + si + di] - c[tq];
            cost += wt * d * d; wsum += wt;
          }
          if (cost > best * wsum + 1e9) break;
        }
        cost /= wsum;
        if (cost < best) { second = best; sv = bv; best = cost; bv = c[sq]; } else if (cost < second) { second = cost; sv = c[sq]; }
      }
      if (best < Infinity) out.push(q, second < Infinity ? (bv * 2 + sv) / 3 : bv);
    }
    // Only values the frame allows: what the pixel showed (O) is the background blended with the logo
    // at some opacity; for opacities near the one the restore used, the background lies in a range.
    // A patch value in that range is taken (a leftover of the logo is cleared); one outside it would
    // mean wiping out something real there (a dot, a mark), so the pixel stays.
    // How far off the opacity can be at a pixel grows with how steeply the logo's edge rises there
    // (a slight shift or blur of a steep edge changes it a lot, of a gentle one little), so a soft
    // edge allows only small changes and real things lying along it are kept.
    // How big the leftovers along the edge are in this frame (what the nearby patches say the
    // pixels should be, against what they are) sets how far a pixel may move: small leftovers
    // (a clean source) allow only small changes; the large, speckled leftovers of a heavily
    // compressed source allow larger ones.
    let ks = pm.repairSteep;
    if (ks == null) {
      if (pm.lead || !pm.shared) {
        const d = [];
        for (let t = 0; t < out.length; t += 2) d.push(Math.abs(out[t + 1] - c[out[t]]));
        d.sort((x, y) => x - y);
        const lv = d.length ? d[Math.floor(d.length * 0.9)] : 0;
        ks = 0.3 + 0.3 * clamp((lv - 4) / 6, 0, 1);
        if (pm.shared) pm.shared.ks = ks;
      } else ks = pm.shared.ks == null ? 0.45 : pm.shared.ks;
    }
    const L = pm.L, orig = pm.orig, span = pm.repairSpan || 0.4, { steep } = ob;
    for (let t = 0; t < out.length; t += 2) {
      const q = out[t], i = q % w, j = (q - i) / w, v = out[t + 1], O = orig[q], cur = c[q];
      if (Math.abs(L - cur) < 1) continue;
      const dl = Math.min(span, 0.03 + ks * steep[q]);
      const aEff = (O - cur) / (L - cur), bg = (a) => (a >= 0.95 ? cur : (O - a * L) / (1 - a));
      const b1 = bg(Math.min(0.9, aEff + dl)), b2 = bg(Math.max(-0.3, aEff - dl));
      if (v < Math.min(b1, b2) - 1 || v > Math.max(b1, b2) + 1) continue;
      p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step] = clamp(Math.round(v), 0, 255);
    }
  }
  // Last pass, per frame: where everything around the logo is plain in this frame (flat or evenly
  // graded), the background under the logo is known, so a faint leftover of the logo (a few levels,
  // smooth) is taken out. Only the smooth part of the leftover is removed, so grain stays, and
  // anything with real contrast (an object passing under the logo) is left alone.
  function finish(p, pm) {
    const { r } = pm, w = r.w, h = r.h, n = w * h;
    if (!pm.fin) {
      const A = new Float32Array(n);
      for (let k = 0; k < n; k++) A[k] = Math.max(Math.abs(pm.alpha[k]), pm.dark ? Math.abs(pm.dark.alpha[k]) : 0);
      const U = new Uint8Array(n), a3 = new Float32Array(n);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let mx = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) mx = Math.max(mx, A[b2 * w + a2]); }
        a3[j * w + i] = mx;
        if (A[j * w + i] > 0) for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) U[b2 * w + a2] = 1; }
      }
      // the opacities the logo has right around each pixel (its edge drawn a hair differently gives
      // a pixel any of these), and which pixels lie on its edge at all
      const lo3 = new Float32Array(n), hi3 = new Float32Array(n), edge = new Uint8Array(n);
      let amax = 0; for (let k = 0; k < n; k++) amax = Math.max(amax, A[k]);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        let lo = 9, hi = -9;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue;
          const k = b2 * w + a2;
          for (const v of pm.dark ? [pm.alpha[k], pm.dark.alpha[k]] : [pm.alpha[k]]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
        lo3[j * w + i] = lo; hi3[j * w + i] = hi; edge[j * w + i] = hi - lo > 0.12 * amax ? 1 : 0;
      }
      pm.fin = { geo: surroundOf(U, w, h), a3, lo3, hi3, edge, held: new Uint8Array(n) };
    }
    const { geo, a3 } = pm.fin, at = (k) => p.off + (r.y + ((k / w) | 0)) * p.stride + (r.x + (k % w)) * p.step;
    const c = new Uint8Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c[j * w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
    const dev = new Float32Array(n).fill(NaN), lim = new Float32Array(n);
    let any = false;
    for (const g of geo) {
      const m = bgAt(c, g, true);
      if (!(m >= 0)) continue;
      dev[g.q] = c[g.q] - m;
      lim[g.q] = Math.max(2.5, Math.min(8, 0.2 * a3[g.q] * Math.abs(pm.L - m)));
      any = true;
    }
    if (!any) return;
    // Only when the logo area looks plain in this frame: if part of it differs from what its
    // surroundings predict by more than any leftover of the logo could, something real sits under
    // the logo (a mark, a line) and the frame is left as it is.
    let known = 0, off = 0;
    for (const g of geo) {
      if (a3[g.q] < 0.05 || !(dev[g.q] === dev[g.q])) continue;
      known++; if (Math.abs(dev[g.q]) > Math.max(12, 2 * lim[g.q])) off++;
    }
    if (!known || off > 0.05 * known) return;
    for (const g of geo) {
      const q = g.q, i = q % w, j = (q - i) / w;
      if (!(Math.abs(dev[q]) <= 2 * lim[q])) continue;
      let s = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a2 = i + di, b2 = j + dj;
        if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue;
        const v = dev[b2 * w + a2];
        if (Math.abs(v) <= 2 * lim[q]) { s += v; cnt++; }
      }
      const lf = s / cnt;
      if (Math.abs(lf) <= lim[q]) p.data[at(q)] = clamp(Math.round(c[q] - lf), 0, 255);
    }
    // Pixels on the logo's edge that are far off. Joined videos can draw the logo's edge a hair
    // differently from one part to the next, which leaves single bright or dark pixels at its points
    // and along its outline. In a plain frame the background there is known, so such a pixel takes
    // it, if what the frame showed there can be that background under the logo with an opacity the
    // logo has right around that pixel. Something real (a dot, a speck of the picture) mostly needs an
    // opacity the logo cannot have there; and since such things move, a pixel is only taken once it
    // has been off in the same way for a few plain frames in a row.
    const { lo3, hi3, edge, held } = pm.fin, O = pm.orig, need = pm.holdFrames == null ? 4 : pm.holdFrames;
    if (!O || !pm.edgeFix) return;
    for (const g of geo) {
      const q = g.q;
      if (!edge[q] || !(dev[q] === dev[q])) continue;
      const m = c[q] - dev[q], d = pm.L - m;
      if (Math.abs(d) < 8) continue;
      // judged on what the frame showed (not on this pixel after the earlier steps, which sometimes
      // happen to hide it): the opacity the pixel shows against the one the logo's map has there
      const aq = (O[q] - m) / d, a = pm.alpha[q];
      if (Math.abs(aq - a) * Math.abs(d) <= 2 * lim[q] * (1 - Math.min(a, 0.9))) continue;
      if (aq < lo3[q] - 0.05 || aq > hi3[q] + 0.25) { held[q] = 0; continue; }
      if (held[q] < 255) held[q]++;
      if (held[q] >= need && Math.abs(dev[q]) > lim[q]) p.data[at(q)] = clamp(Math.round(m), 0, 255);
    }
  }
  // Undoing the blend multiplies the source's compression noise by 1/(1-a). An edge-preserving
  // 3x3 filter inside the logo shape (strength follows opacity) brings it back to normal levels.
  function denoise(p, pm) {
    const { r, alpha } = pm, w = r.w, h = r.h, sig = pm.denoise;
    const v = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) v[j * w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
    const inv = -1 / (2 * sig * sig);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, a = alpha[k];
      if (a <= 0) continue;
      let s = 0, ws = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const q = v[jj * w + ii], d = q - v[k], wt = Math.exp(d * d * inv) * (di || dj ? 1 : 1.5);
        s += q * wt; ws += wt;
      }
      const t = Math.min(1, a * 2.5);
      p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step] = clamp(Math.round(v[k] + (s / ws - v[k]) * t), 0, 255);
    }
  }
  // The logo's outline is where the source encoder smeared it differently in every frame, so the
  // exact undo leaves a thin seam there. Pixels on that outline band are rebuilt from the restored
  // pixels on both sides of it.
  function bandOf(pm, grow) {
    grow = grow || 0;
    pm.bands = pm.bands || {};
    if (pm.bands[grow]) return pm.bands[grow];
    const { r, alpha } = pm, w = r.w, h = r.h;
    let amax = 0;
    for (let k = 0; k < alpha.length; k++) if (alpha[k] > amax) amax = alpha[k];
    const thr = amax * 0.2, edge = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let lo = 1, hi = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const v = alpha[jj * w + ii]; if (v < lo) lo = v; if (v > hi) hi = v;
      }
      if (hi > 0 && hi - lo > thr) edge[j * w + i] = 1;
    }
    for (let g = 0; g < grow; g++) {
      const prev = Uint8Array.from(edge);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (!prev[k] && ((i > 0 && prev[k - 1]) || (i < w - 1 && prev[k + 1]) || (j > 0 && prev[k - w]) || (j < h - 1 && prev[k + w]))) edge[k] = 1;
      }
    }
    const list = [];
    for (let k = 0; k < w * h; k++) if (edge[k]) list.push(k);
    pm.bands[grow] = { edge, list };
    return pm.bands[grow];
  }
  function heal(p, pm) {
    const { r } = pm, w = r.w, h = r.h;
    const at = (i, j) => p.off + (r.y + j) * p.stride + (r.x + i) * p.step;
    let amax = 0;
    for (let k = 0; k < pm.alpha.length; k++) if (pm.alpha[k] > amax) amax = pm.alpha[k];
    const rebuild = (list, skip, R) => {
      const out = new Float32Array(list.length);
      list.forEach((k, n) => {
        const i = k % w, j = (k - i) / w;
        let s = 0, ws = 0;
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= w || jj >= h || skip[jj * w + ii]) continue;
          const wt = 1 / (di * di + dj * dj);
          s += p.data[at(ii, jj)] * wt; ws += wt;
        }
        out[n] = ws ? s / ws : p.data[at(i, j)];
      });
      // Only corrections of the size a leftover outline can have: that scales with how strongly
      // the logo shows over this background (opacity × distance to the logo colour). A real line
      // or object crossing the logo's edge differs far more and is kept.
      list.forEach((k, n) => {
        const i = k % w, j = (k - i) / w, o = at(i, j);
        const lim = Math.max(8, 0.35 * amax * Math.abs(pm.L - out[n]));
        if (Math.abs(out[n] - p.data[o]) <= lim) p.data[o] = clamp(Math.round(out[n]), 0, 255);
      });
    };
    const narrow = bandOf(pm, 0);
    if (narrow.list.length) rebuild(narrow.list, narrow.edge, 3);
    if (!pm.flatHeal) return;
    // Where the surroundings are truly flat in this frame (e.g. a black background), a wider strip is
    // rebuilt as well: there the source encoder's faint ringing beside the logo edge would otherwise
    // remain as a thin line, and rebuilding a flat area from itself is invisible. Textured areas are
    // left alone.
    const wide = bandOf(pm, 2), extra = [];
    for (const k of wide.list) {
      if (narrow.edge[k]) continue;
      const i = k % w, j = (k - i) / w;
      let s = 0, s2 = 0, c = 0;
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h || wide.edge[jj * w + ii]) continue;
        const v = p.data[at(ii, jj)]; s += v; s2 += v * v; c++;
      }
      if (c >= 12 && s2 / c - (s / c) ** 2 <= 1) extra.push(k);
    }
    if (extra.length) rebuild(extra, wide.edge, 5);
  }

  // Undoing the blend also amplifies compression specks; on colour planes (which carry little
  // detail) a light blur inside the logo shape, scaled by opacity, hides them.
  function soften(p, pm) {
    const { r, alpha } = pm, w = r.w, h = r.h;
    const v = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) v[j * w + i] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, a = alpha[k];
      if (a <= 0) continue;
      let s = 0, c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < w && jj < h) { s += v[jj * w + ii]; c++; }
      }
      const t = Math.min(1, a * 3);
      p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step] = clamp(Math.round(v[k] + (s / c - v[k]) * t), 0, 255);
    }
  }
  function fillHoles(p, pm) {
    const { r, alpha } = pm, w = r.w, h = r.h, n = w * h;
    const known = new Uint8Array(n), val = new Float32Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      val[k] = p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step];
      known[k] = alpha[k] < OPAQUE ? 1 : 0;
    }
    // onion peel: fill from the outside in, then smooth the filled part
    let left = n - known.reduce((s, v) => s + v, 0), guard = 0;
    while (left > 0 && guard++ < w + h) {
      const add = [];
      for (let k = 0; k < n; k++) {
        if (known[k]) continue;
        const i = k % w, j = (k - i) / w;
        let s = 0, c = 0;
        if (i > 0 && known[k - 1]) { s += val[k - 1]; c++; }
        if (i < w - 1 && known[k + 1]) { s += val[k + 1]; c++; }
        if (j > 0 && known[k - w]) { s += val[k - w]; c++; }
        if (j < h - 1 && known[k + w]) { s += val[k + w]; c++; }
        if (c) add.push(k, s / c);
      }
      if (!add.length) break;
      for (let q = 0; q < add.length; q += 2) { val[add[q]] = add[q + 1]; known[add[q]] = 2; left--; }
    }
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < n; k++) {
        if (known[k] !== 2) continue;
        const i = k % w, j = (k - i) / w;
        let s = 0, c = 0;
        if (i > 0) { s += val[k - 1]; c++; } if (i < w - 1) { s += val[k + 1]; c++; }
        if (j > 0) { s += val[k - w]; c++; } if (j < h - 1) { s += val[k + w]; c++; }
        val[k] = s / c;
      }
    }
    for (let k = 0; k < n; k++) {
      if (known[k] !== 2) continue;
      const i = k % w, j = (k - i) / w;
      p.data[p.off + (r.y + j) * p.stride + (r.x + i) * p.step] = clamp(Math.round(val[k]), 0, 255);
    }
  }

  // ---- known logo template (the Gemini sparkle) ----
  // The template is an opacity map learned from real Gemini videos, with the position of its centre
  // in a 1920×1080 frame. It lets the logo be found by its shape, and removed even when the
  // background under it never changes (where nothing can be learned from motion).
  function decodeTemplate(t, bytes) {
    const a = new Float32Array(t.w * t.h);
    for (let k = 0; k < a.length; k++) a[k] = (bytes[k] - (t.offset || 0)) / t.scale;
    return { ...t, a };
  }
  function tmplAt(T, x, y) {
    if (x < 0 || y < 0 || x > T.w - 1 || y > T.h - 1) return 0;
    const x0 = Math.min(T.w - 2, Math.floor(x)), y0 = Math.min(T.h - 2, Math.floor(y)), fx = x - x0, fy = y - y0, k = y0 * T.w + x0;
    return T.a[k] * (1 - fx) * (1 - fy) + T.a[k + 1] * fx * (1 - fy) + T.a[k + T.w] * (1 - fx) * fy + T.a[k + T.w + 1] * fx * fy;
  }
  // opacity at frame pixel (x, y) when the logo centre is at (X0, Y0) and its size is s × template
  function tmplPixel(T, X0, Y0, s, x, y) {
    if (s < 0.9) { // area-average when shrinking, so small copies keep their weight
      let v = 0; const o = [-0.25, 0.25];
      for (const dx of o) for (const dy of o) v += tmplAt(T, (x + dx - X0) / s + T.cx, (y + dy - Y0) / s + T.cy);
      return v / 4;
    }
    return tmplAt(T, (x - X0) / s + T.cx, (y - Y0) / s + T.cy);
  }
  // Search an averaged picture for the template by normalised cross-correlation, over all positions
  // and a few sizes around the expected one. Returns the best centre (in img coordinates).
  function matchTemplate(img, w, h, T, sizes) {
    let best = null;
    const ii = new Float64Array((w + 1) * (h + 1)), i2 = new Float64Array((w + 1) * (h + 1));
    for (let j = 0; j < h; j++) { let r = 0, r2 = 0; for (let i = 0; i < w; i++) { const v = img[j * w + i]; r += v; r2 += v * v; ii[(j + 1) * (w + 1) + i + 1] = ii[j * (w + 1) + i + 1] + r; i2[(j + 1) * (w + 1) + i + 1] = i2[j * (w + 1) + i + 1] + r2; } }
    const boxSum = (A, x0, y0, x1, y1) => A[y1 * (w + 1) + x1] - A[y0 * (w + 1) + x1] - A[y1 * (w + 1) + x0] + A[y0 * (w + 1) + x0];
    for (const s of sizes) {
      const half = Math.ceil(Math.max(T.w, T.h) * s / 2) + 1, side = 2 * half + 1, n = side * side;
      const t = new Float32Array(n);
      let m = 0;
      for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const v = tmplPixel(T, half, half, s, i, j); t[j * side + i] = v; m += v; }
      m /= n;
      let tn = 0; const tz = [];
      for (let k = 0; k < n; k++) { t[k] -= m; tn += t[k] * t[k]; if (Math.abs(t[k]) > 1e-4) tz.push(k); }
      tn = Math.sqrt(tn);
      for (let y = 0; y + side <= h; y++) for (let x = 0; x + side <= w; x++) {
        const sum = boxSum(ii, x, y, x + side, y + side), sum2 = boxSum(i2, x, y, x + side, y + side);
        const vr = sum2 - sum * sum / n;
        if (vr < n * 0.3) continue; // flat: nothing there
        let dot = 0;
        for (const k of tz) dot += t[k] * img[(y + Math.floor(k / side)) * w + x + k % side];
        const ncc = dot / (Math.sqrt(vr) * tn);
        if (!best || ncc > best.score) best = { x: x + half, y: y + half, s, score: ncc };
      }
    }
    return best;
  }
  // Fine alignment at full resolution: small shifts (sub-pixel) and size changes around a guess.
  function refineTemplate(img, w, h, T, X0, Y0, s0, robust) {
    const score = robust ? (X, Y, s) => robustScore(img, w, h, T, X, Y, s).score : (X, Y, s) => {
      const half = Math.ceil(Math.max(T.w, T.h) * s / 2) + 1;
      const xa = Math.max(0, Math.floor(X - half)), xb = Math.min(w - 1, Math.ceil(X + half)), ya = Math.max(0, Math.floor(Y - half)), yb = Math.min(h - 1, Math.ceil(Y + half));
      let st = 0, si = 0, stt = 0, sii = 0, sti = 0, n = 0;
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const t = tmplPixel(T, X, Y, s, x, y), v = img[y * w + x]; st += t; si += v; stt += t * t; sii += v * v; sti += t * v; n++; }
      const cov = sti - st * si / n, vt = stt - st * st / n, vi = sii - si * si / n;
      return vt > 0 && vi > 0 ? cov / Math.sqrt(vt * vi) : -1;
    };
    let X = X0, Y = Y0, s = s0, bs = score(X, Y, s);
    for (const step of [2, 1, 0.5, 0.25]) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const [dx, dy, ds] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step * 0.02], [0, 0, -step * 0.02]]) {
          const v = score(X + dx, Y + dy, s + ds);
          if (v > bs) { bs = v; X += dx; Y += dy; s += ds; improved = true; }
        }
      }
    }
    return { x: X, y: Y, s, score: bs };
  }
  // Robust match score at one placement: fit picture = c0 + c1*template over the window, then drop
  // pixels that do not fit at all (lines, edges and objects crossing the logo) and correlate the rest.
  function robustScore(img, w, h, T, X, Y, s) {
    const half = Math.ceil(Math.max(T.w, T.h) * s / 2) + 1;
    const xa = Math.max(0, Math.floor(X - half)), xb = Math.min(w - 1, Math.ceil(X + half)), ya = Math.max(0, Math.floor(Y - half)), yb = Math.min(h - 1, Math.ceil(Y + half));
    const ts = [], vs = [];
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { ts.push(tmplPixel(T, X, Y, s, x, y)); vs.push(img[y * w + x]); }
    const n = ts.length, keep = new Uint8Array(n).fill(1);
    let r = -1, inside = 0;
    for (let it = 0; it < 4; it++) {
      let st = 0, sv = 0, stt = 0, svv = 0, stv = 0, c = 0;
      for (let q = 0; q < n; q++) if (keep[q]) { st += ts[q]; sv += vs[q]; stt += ts[q] ** 2; svv += vs[q] ** 2; stv += ts[q] * vs[q]; c++; }
      const vt = stt - st * st / c, vv = svv - sv * sv / c, cov = stv - st * sv / c;
      if (vt <= 0 || vv <= 0) return { score: -1, inside: 0 };
      r = cov / Math.sqrt(vt * vv);
      const b = cov / vt, a = (sv - b * st) / c;
      const res = vs.map((v, q) => Math.abs(v - a - b * ts[q])), sorted = res.filter((_, q) => keep[q]).sort((x, y) => x - y);
      const lim = Math.max(1.5, 3 * 1.4826 * sorted[sorted.length >> 1]);
      for (let q = 0; q < n; q++) keep[q] = res[q] <= lim ? 1 : 0;
      if (b <= 0) return { score: -1, inside: 0 };
    }
    // share of the logo's own pixels that took part (a match made of a few leftover pixels is not trusted)
    let tot = 0; for (let q = 0; q < n; q++) if (ts[q] > 0.05) { tot++; if (keep[q]) inside++; }
    return { score: r, inside: tot ? inside / tot : 0 };
  }

  // Precise alignment for removal. First decide, at the current placement, which pixels belong to
  // things crossing the logo (they do not fit the template at all); then shift/scale using only the
  // remaining pixels, which stay fixed during that step so the fit cannot improve itself by
  // dropping inconvenient pixels. Size stays within ±10% of the expected size.
  function alignTemplate(img, w, h, T, X0, Y0, s0, opts) {
    const o = opts || {}, maxShift = o.maxShift || Infinity, sr = o.sizeRange || 0.1;
    let X = X0, Y = Y0, s = s0;
    const sMin = s0 * (1 - sr), sMax = s0 * (1 + sr);
    for (let round = 0; round < 3; round++) {
      const half = Math.ceil(Math.max(T.w, T.h) * s / 2) + 4;
      const xa = Math.max(0, Math.floor(X - half)), xb = Math.min(w - 1, Math.ceil(X + half)), ya = Math.max(0, Math.floor(Y - half)), yb = Math.min(h - 1, Math.ceil(Y + half));
      const px = [];
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) px.push(x, y);
      // inliers at the current placement
      const fitKeep = () => {
        const n = px.length / 2, ts = new Float32Array(n), vs = new Float32Array(n), keep = new Uint8Array(n).fill(1);
        for (let q = 0; q < n; q++) { ts[q] = tmplPixel(T, X, Y, s, px[2 * q], px[2 * q + 1]); vs[q] = img[px[2 * q + 1] * w + px[2 * q]]; }
        for (let it = 0; it < 4; it++) {
          let st = 0, sv = 0, stt = 0, stv = 0, c = 0;
          for (let q = 0; q < n; q++) if (keep[q]) { st += ts[q]; sv += vs[q]; stt += ts[q] ** 2; stv += ts[q] * vs[q]; c++; }
          const vt = stt - st * st / c; if (vt <= 0) break;
          const b = (stv - st * sv / c) / vt, a = (sv - b * st) / c;
          const res = Array.from(vs, (v, q) => Math.abs(v - a - b * ts[q])), sorted = res.filter((_, q) => keep[q]).sort((x2, y2) => x2 - y2);
          // generous limit: only things that clearly are not the logo (lines, objects) are set aside;
          // the logo's own edge, slightly off while the placement is still off, must keep steering
          const lim = Math.max(6, 5 * 1.4826 * sorted[sorted.length >> 1], 0.25 * b * 0.3);
          for (let q = 0; q < n; q++) keep[q] = res[q] <= lim ? 1 : 0;
        }
        const out = []; for (let q = 0; q < n; q++) if (keep[q]) out.push(px[2 * q], px[2 * q + 1]);
        return out;
      };
      const use = fitKeep();
      const score = (Xc, Yc, sc) => {
        let st = 0, si = 0, stt = 0, sii = 0, sti = 0; const n = use.length / 2;
        for (let q = 0; q < use.length; q += 2) { const t = tmplPixel(T, Xc, Yc, sc, use[q], use[q + 1]), v = img[use[q + 1] * w + use[q]]; st += t; si += v; stt += t * t; sii += v * v; sti += t * v; }
        const cov = sti - st * si / n, vt = stt - st * st / n, vi = sii - si * si / n;
        return vt > 0 && vi > 0 ? cov / Math.sqrt(vt * vi) : -1;
      };
      let bs = score(X, Y, s);
      for (const step of [2, 1, 0.5, 0.25]) {
        let improved = true;
        while (improved) {
          improved = false;
          for (const [dx, dy, ds] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step * 0.02 * s0], [0, 0, -step * 0.02 * s0]]) {
            const ns = clamp(s + ds, sMin, sMax);
            if (Math.abs(X + dx - X0) > maxShift || Math.abs(Y + dy - Y0) > maxShift) continue;
            const v = score(X + dx, Y + dy, ns);
            if (v > bs + 1e-6) { bs = v; X += dx; Y += dy; s = ns; improved = true; }
          }
        }
      }
    }
    return { x: X, y: Y, s, score: robustScore(img, w, h, T, X, Y, s) };
  }

  // A softer copy of the template (Gaussian blur on its own grid): heavier compression smears the
  // logo's edge, and the template has to match the edge as it appears in the video.
  function blurTemplate(T, sigma) {
    if (!(sigma > 0.05)) return T;
    const r = Math.ceil(sigma * 3), ker = [];
    let ks = 0;
    for (let d = -r; d <= r; d++) { const v = Math.exp(-d * d / (2 * sigma * sigma)); ker.push(v); ks += v; }
    for (let q = 0; q < ker.length; q++) ker[q] /= ks;
    const w = T.w, h = T.h, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let v = 0; for (let d = -r; d <= r; d++) { const x = i + d; if (x >= 0 && x < w) v += T.a[j * w + x] * ker[d + r]; } tmp[j * w + i] = v; }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let v = 0; for (let d = -r; d <= r; d++) { const y = j + d; if (y >= 0 && y < h) v += tmp[y * w + i] * ker[d + r]; } out[j * w + i] = v; }
    return { ...T, a: out, sigma };
  }
  // A crisper copy (unsharp mask): videos sharpened or upscaled after the logo was put on show a thin
  // bright rim inside its edge and a dark ring outside it.
  function sharpenTemplate(T, sigma, amount) {
    const Tb = blurTemplate(T, sigma);
    return { ...T, a: T.a.map((v, q) => v + amount * (v - Tb.a[q])), sharpen: amount };
  }
  // Pick the edge's look from the learning frames. Where a logo pixel's background is known in a
  // frame (plain surroundings, or stripes running through), the logo's real edge profile can be
  // compared with the template blurred (compression smears it) or sharpened (rim and ring) by
  // different amounts; the best match wins (ties go to the unchanged one).
  function fitTemplateEdge(learner, T, X, Y, s, L, k) {
    const r = learner.r, w = r.w, h = r.h, n = w * h, crops = learner.crops;
    if (!crops.length) return { sigma: 0, T };
    const sharp = templateIn(T, X, Y, s, r).alpha, wide = new Uint8Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (sharp[j * w + i] <= 0) continue;
      for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) wide[b2 * w + a2] = 1; }
    }
    // only the logo's edge zone matters here (where blur or sharpening changes anything)
    const edgeZone = (q) => {
      const i = q % w, j = (q - i) / w;
      let lo = 1, hi = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue; const v = sharp[b2 * w + a2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      return hi - lo >= 0.05;
    };
    const geo = surroundOf(wide, w, h).filter((g) => edgeZone(g.q));
    const samples = [];
    for (const c of crops) for (const g of geo) {
      const m = bgAt(c, g, true);
      if (!(m >= 0)) continue;
      if (Math.abs(L - m) < 25) continue; // too little contrast to see the edge
      samples.push(g.q, c[g.q], m);
    }
    if (samples.length < 3 * 500) return { sigma: 0, T, samples: samples.length / 3 };
    const cands = [0, 0.4, 0.7, 1.0, 1.3, 1.7, 2.2].map((sigma) => ({ sigma, T: blurTemplate(T, sigma) }));
    for (const sg of [0.6, 1.0, 1.5]) for (const amt of [0.25, 0.5, 0.8, 1.2]) cands.push({ sigma: 0, sharpen: { sigma: sg, amount: amt }, T: sharpenTemplate(T, sg, amt) });
    let best = null;
    for (const cd of cands) {
      const a = templateIn(cd.T, X, Y, s, r).alpha;
      let sse = 0;
      for (let t = 0; t < samples.length; t += 3) {
        const q = samples[t], bg = samples[t + 2], obs = samples[t + 1] - bg;
        const e = obs - k * a[q] * (L - bg);
        sse += e * e;
      }
      if (!best || sse < best.sse * 0.995) best = { ...cd, sse };
    }
    return { sigma: best.sigma, sharpen: best.sharpen || null, T: best.T, samples: samples.length / 3 };
  }

  // For each pixel of region U: the nearest pixel outside U in each of 8 directions, plus what is
  // needed to fit a plane (a flat or evenly graded background) through those references: the
  // plane's value at the pixel is Σ wt·ref, and the fit's residuals are hat-matrix rows.
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  function surroundOf(U, w, h) {
    const geo = [];
    for (let q = 0; q < w * h; q++) {
      if (!U[q]) continue;
      const i = q % w, j = (q - i) / w, refs = [], xs = [], ys = [], dirs = [];
      DIRS.forEach(([dx, dy], d) => {
        for (let s2 = 1; s2 < 400; s2++) {
          const a2 = i + dx * s2, b2 = j + dy * s2;
          if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) break;
          if (U[b2 * w + a2]) continue;
          refs.push(b2 * w + a2); xs.push(dx * s2); ys.push(dy * s2); dirs.push(d);
          break;
        }
      });
      const k = refs.length;
      if (k < 6) continue;
      // least squares plane v = c0 + c1·x + c2·y through the references (pixel at the origin)
      let n0 = k, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
      for (let t = 0; t < k; t++) { sx += xs[t]; sy += ys[t]; sxx += xs[t] * xs[t]; sxy += xs[t] * ys[t]; syy += ys[t] * ys[t]; }
      const M = [[n0, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], Mi = inv3(M);
      if (!Mi) continue;
      // P = Mi · Xᵀ (3×k); value at the pixel = P[0]·v; fitted value at ref t = [1, x_t, y_t]·P·v
      const P = [0, 1, 2].map((r) => xs.map((x, t) => Mi[r][0] + Mi[r][1] * x + Mi[r][2] * ys[t]));
      const hat = [];
      for (let t = 0; t < k; t++) for (let u = 0; u < k; u++) hat.push(P[0][u] + xs[t] * P[1][u] + ys[t] * P[2][u]);
      // lines through the pixel (opposite references), with a short cross-profile at each end
      const axes = [];
      for (let d = 0; d < 8; d += 2) {
        const t1 = dirs.indexOf(d), t2 = dirs.indexOf(d + 1);
        if (t1 < 0 || t2 < 0) continue;
        const [dx, dy] = DIRS[d], px = -dy, py = dx, prof = (t) => {
          const out = new Int32Array(7), ri = i + xs[t], rj = j + ys[t];
          for (let o = -3; o <= 3; o++) { const a2 = ri + px * o, b2 = rj + py * o; out[o + 3] = a2 >= 0 && b2 >= 0 && a2 < w && b2 < h && !U[b2 * w + a2] ? b2 * w + a2 : -1; }
          return out;
        };
        // and 3 pixels further out along the line itself: the pattern must run along the line there
        const along = (t, sx, sy) => {
          const out = new Int32Array(3), ri = i + xs[t], rj = j + ys[t];
          for (let o = 1; o <= 3; o++) { const a2 = ri + sx * o, b2 = rj + sy * o; out[o - 1] = a2 >= 0 && b2 >= 0 && a2 < w && b2 < h && !U[b2 * w + a2] ? b2 * w + a2 : -1; }
          return out;
        };
        const s1 = Math.hypot(xs[t1], ys[t1]), s2 = Math.hypot(xs[t2], ys[t2]);
        axes.push({ r1: refs[t1], r2: refs[t2], w1: s2 / (s1 + s2), w2: s1 / (s1 + s2), p1: prof(t1), p2: prof(t2), a1: along(t1, dx, dy), a2: along(t2, -dx, -dy), span: s1 + s2 });
      }
      axes.sort((a, b) => a.span - b.span);
      geo.push({ q, refs, xs: Float32Array.from(xs), ys: Float32Array.from(ys), dirs, wt: Float32Array.from(P[0]), hat: Float32Array.from(hat), axes });
    }
    return geo;
  }
  function inv3(M) {
    const [[a, b, c], [d, e, f], [g, h2, i]] = M;
    const A = e * i - f * h2, B = -(d * i - f * g), C2 = d * h2 - e * g, det = a * A + b * B + c * C2;
    if (Math.abs(det) < 1e-9) return null;
    return [[A / det, -(b * i - c * h2) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C2 / det, -(a * h2 - b * g) / det, (a * e - b * d) / det]];
  }
  // The background under a pixel in one frame, when its surroundings are plain: a plane through the
  // references fits them within ±2 (flat or evenly graded). One reference, or two that are not
  // opposite each other, may be off (something small sitting beside the logo); two opposite ones
  // never, since that is what a line or edge running through the pixel looks like. NaN when unknown.
  function bgAt(c, g, stripes) {
    const m = bgPlane(c, g);
    return m >= 0 || !stripes ? m : bgStripe(c, g);
  }
  // Stripes or bars running through the logo: along one line through the pixel, the two ends show
  // the same cross-profile (7 pixels across) and the pattern runs along the line just outside both
  // ends, so it continues straight under the logo and the background is read along that line. A line crossing at another angle, or anything ending
  // under the logo, gives different profiles at the two ends and is not used. Of several lines that
  // qualify the shortest is taken, and they must agree.
  function bgStripe(c, g) {
    let m = NaN;
    for (const ax of g.axes) {
      let ok = 0, bad = 0;
      for (let o = 0; o < 7; o++) {
        const a = ax.p1[o], b = ax.p2[o];
        if (a < 0 || b < 0) continue;
        if (Math.abs(c[a] - c[b]) <= 2) ok++; else bad++;
      }
      if (bad || ok < 5) continue;
      let along = true;
      for (let o = 0; o < 3 && along; o++) {
        if (ax.a1[o] >= 0 && Math.abs(c[ax.a1[o]] - c[ax.r1]) > 2) along = false;
        if (ax.a2[o] >= 0 && Math.abs(c[ax.a2[o]] - c[ax.r2]) > 2) along = false;
      }
      if (!along) continue;
      const v = ax.w1 * c[ax.r1] + ax.w2 * c[ax.r2];
      if (!(m >= 0)) m = v; else if (Math.abs(v - m) > 3) return NaN;
    }
    return m;
  }
  function bgPlane(c, g) {
    const { refs, wt, hat } = g, k = refs.length;
    let bad = -1, worst = 2;
    for (let t = 0; t < k; t++) {
      let fit = 0;
      for (let u = 0; u < k; u++) fit += hat[t * k + u] * c[refs[u]];
      const r = Math.abs(c[refs[t]] - fit);
      if (r > worst) { worst = r; bad = t; }
    }
    if (bad < 0) {
      let m = 0;
      for (let u = 0; u < k; u++) m += wt[u] * c[refs[u]];
      return m;
    }
    if (k < 7) return NaN;
    // refit without the worst reference; if needed, once more without the next worst
    const keep = new Uint8Array(k).fill(1);
    keep[bad] = 0;
    for (let round = 0; round < 2; round++) {
      const p = planeFit(c, g, keep);
      if (!p) return NaN;
      let b2 = -1, w2 = 2;
      for (let t = 0; t < k; t++) {
        if (!keep[t]) continue;
        const r = Math.abs(c[refs[t]] - (p[0] + p[1] * g.xs[t] + p[2] * g.ys[t]));
        if (r > w2) { w2 = r; b2 = t; }
      }
      if (b2 < 0) return p[0];
      if (round === 1) return NaN;
      keep[b2] = 0;
      let left = 0;
      for (let t = 0; t < k; t++) left += keep[t];
      if (left < 6) return NaN;
      // the two left out must not face each other
      const out = [];
      for (let t = 0; t < k; t++) if (!keep[t]) out.push(g.dirs[t]);
      if ((out[0] ^ 1) === out[1]) return NaN;
    }
    return NaN;
  }
  function planeFit(c, g, keep) {
    let n0 = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, sv = 0, sxv = 0, syv = 0;
    for (let t = 0; t < g.refs.length; t++) {
      if (!keep[t]) continue;
      const x = g.xs[t], y = g.ys[t], v = c[g.refs[t]];
      n0++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; sv += v; sxv += x * v; syv += y * v;
    }
    const Mi = inv3([[n0, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]]);
    if (!Mi) return null;
    return [0, 1, 2].map((r) => Mi[r][0] * sv + Mi[r][1] * sxv + Mi[r][2] * syv);
  }

  // The differences a logo shows from its template in a given video, as a smooth mix of a few shapes:
  // its strength (a times a smooth gain), a crisper or softer edge (a minus a blurred copy, at two
  // widths) and a slightly shifted edge (the gradient of a), each scaled by a field that varies
  // smoothly over the logo (bilinear on a G×G grid). Fitted to the measured differences (weights =
  // how well each pixel was measured), with outliers down-weighted; returns the fitted differences.
  function smoothDelta(delta, wts, a0, w, h, U, G) {
    G = G || 5;
    const n = w * h;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let q = 0; q < n; q++) if (U[q]) { const i = q % w, j = (q - i) / w; x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
    const out = new Float32Array(n);
    if (x1 <= x0 || y1 <= y0) return out;
    const blur = (s) => blurTemplate({ w, h, a: a0 }, s).a;
    const b1 = blur(0.7), b2 = blur(2);
    const F = 5, feat = (q) => {
      const i = q % w, j = (q - i) / w;
      const gx = (i > 0 && i < w - 1) ? (a0[q + 1] - a0[q - 1]) / 2 : 0, gy = (j > 0 && j < h - 1) ? (a0[q + w] - a0[q - w]) / 2 : 0;
      return [a0[q], a0[q] - b1[q], b2[q] - a0[q], gx, gy];
    };
    const K = F * G * G, sx = (G - 1) / Math.max(1, x1 - x0), sy = (G - 1) / Math.max(1, y1 - y0);
    const nodes = (q) => {
      const i = q % w, j = (q - i) / w, u = (i - x0) * sx, v = (j - y0) * sy;
      const iu = Math.min(G - 2, Math.max(0, Math.floor(u))), iv = Math.min(G - 2, Math.max(0, Math.floor(v))), fu = Math.min(1, Math.max(0, u - iu)), fv = Math.min(1, Math.max(0, v - iv));
      return [[iv * G + iu, (1 - fu) * (1 - fv)], [iv * G + iu + 1, fu * (1 - fv)], [(iv + 1) * G + iu, (1 - fu) * fv], [(iv + 1) * G + iu + 1, fu * fv]];
    };
    const pts = [];
    for (let q = 0; q < n; q++) {
      if (!U[q] || !(wts[q] > 0)) continue;
      const f = feat(q), nd = nodes(q), idx = [], val = [];
      for (let k = 0; k < F; k++) { if (!f[k]) continue; for (const [g, hw] of nd) if (hw > 0) { idx.push(k * G * G + g); val.push(f[k] * hw); } }
      pts.push([q, idx, val]);
    }
    if (pts.length < 50) return out;
    let c = new Float64Array(K);
    const rw = new Float64Array(pts.length).fill(1);
    for (let it = 0; it < 4; it++) {
      const M = new Float64Array(K * K), r = new Float64Array(K);
      for (let t = 0; t < pts.length; t++) {
        const [q, idx, val] = pts[t], wt = wts[q] * rw[t];
        for (let a = 0; a < idx.length; a++) {
          r[idx[a]] += wt * val[a] * delta[q];
          for (let b = 0; b < idx.length; b++) M[idx[a] * K + idx[b]] += wt * val[a] * val[b];
        }
      }
      let tr = 0; for (let k = 0; k < K; k++) tr += M[k * K + k];
      const ridge = 1e-3 * tr / K + 1e-9;
      for (let k = 0; k < K; k++) M[k * K + k] += ridge;
      c = solveSPD(M, r, K);
      if (!c) return out;
      // Huber weights: pixels far off the smooth fit (a mark that stays put) count less
      for (let t = 0; t < pts.length; t++) {
        const [q, idx, val] = pts[t];
        let fit = 0; for (let a = 0; a < idx.length; a++) fit += c[idx[a]] * val[a];
        const e = Math.abs(delta[q] - fit);
        rw[t] = e <= 0.02 ? 1 : 0.02 / e;
      }
    }
    for (let q = 0; q < n; q++) {
      if (!U[q]) continue;
      const f = feat(q), nd = nodes(q);
      let v = 0;
      for (let k = 0; k < F; k++) for (const [g, hw] of nd) v += c[k * G * G + g] * f[k] * hw;
      out[q] = v;
    }
    return out;
  }
  // Symmetric positive definite solve (Cholesky).
  function solveSPD(M, r, K) {
    const Lm = new Float64Array(K * K);
    for (let i = 0; i < K; i++) for (let j = 0; j <= i; j++) {
      let s = M[i * K + j];
      for (let k = 0; k < j; k++) s -= Lm[i * K + k] * Lm[j * K + k];
      if (i === j) { if (s <= 0) return null; Lm[i * K + i] = Math.sqrt(s); } else Lm[i * K + j] = s / Lm[j * K + j];
    }
    const y = new Float64Array(K), x = new Float64Array(K);
    for (let i = 0; i < K; i++) { let s = r[i]; for (let k = 0; k < i; k++) s -= Lm[i * K + k] * y[k]; y[i] = s / Lm[i * K + i]; }
    for (let i = K - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < K; k++) s -= Lm[k * K + i] * x[k]; x[i] = s / Lm[i * K + i]; }
    return x;
  }

  // Per-pixel refinement of the opacity map on one plane, from frames where the logo's surroundings
  // are flat: there the background under each logo pixel is known, so (observed − bg) = a·(L − bg)
  // gives that pixel's real opacity in this video — including the encoder's blur, halo and colour
  // subsampling. Pixels with little such evidence keep the starting map (shrinkage toward it).
  function refineAlphaFlat(learner, alpha0, mask0, L, opts) {
    const o = opts || {}, r = learner.r, w = r.w, h = r.h, n = w * h, crops = learner.crops;
    const grow = o.grow == null ? 3 : o.grow, lambda = o.lambda == null ? 1500 : o.lambda;
    // Over a background close to the logo's own colour the logo hardly changes anything, so what
    // such a frame says about its opacity is mostly noise, and a soft edge sitting still there (a
    // pale shape behind a white logo) would be read as opacity; only clearly different backgrounds
    // count.
    const minD = o.minD == null ? 8 : o.minD;
    if (!crops.length) return null;
    // area that may carry the logo (incl. a halo), and logo-free references around it
    const U = new Uint8Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!mask0[j * w + i]) continue;
      for (let dj = -grow; dj <= grow; dj++) for (let di = -grow; di <= grow; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < w && b2 < h) U[b2 * w + a2] = 1; }
    }
    const geo = surroundOf(U, w, h);
    // the video's black: a very low percentile of the logo-free pixels
    const hist = new Float64Array(256);
    for (const c of crops) for (let q = 0; q < n; q += 3) if (!U[q]) hist[c[q]]++;
    const total = hist.reduce((x, y) => x + y, 0);
    let black = 0;
    for (let v = 0, acc = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.005) { black = v; break; } }
    const darkCut = black + 30;
    // samples: (pixel, frame) pairs whose background is known in that frame
    // Plain edges around the logo don't prove a plain inside: an object can sit fully under the logo
    // (a gear, an icon, tick marks). So a frame counts only when the whole logo, inside and just
    // around it, looks the way the template says it would over that plain background; anything
    // under it shows up as a clear misfit and the frame is left out.
    const soft = blurTemplate({ w, h, a: alpha0 }, 1.5).a;
    const collect = (ref, slackIn, slackOut, cover) => {
      const out = { q: [], o: [], m: [], frames: 0, rejected: 0 };
      for (const c of crops) {
        const fq = [], fo = [], fm = [];
        let checked = 0, bad = 0, logoPx = 0, known = 0;
        for (const g of geo) {
          const q = g.q, a0 = alpha0[q], inner = a0 >= 0.15 && Math.abs(soft[q] - a0) < 0.02, outer = a0 === 0 && Math.abs(soft[q]) < 0.01;
          if (a0 >= 0.05) logoPx++;
          // (plane test only: reading stripes is reliable enough for the overall colour and for the
          // final touch-up, but a rare wrong reading would stay in a pixel's opacity for good)
          const m = bgAt(c, g, false);
          if (!(m >= 0)) continue;
          if (a0 >= 0.05) known++;
          if (inner || outer) {
            const R = c[q] - m - ref[q] * (L - m);
            checked++;
            if (Math.abs(R) > (inner ? 5 + slackIn * Math.abs(L - m) : 5 + slackOut * Math.abs(L - m))) bad++;
          }
          // near black the encoder may not follow a straight blend; when the video lifts its blacks
          // (fitBlackLift handles that) those frames are left out
          if (o.skipDark && m < black + 24) continue;
          fq.push(q); fo.push(c[q]); fm.push(m);
        }
        if (!checked || bad > 0.05 * checked || known < cover * logoPx) { out.rejected++; continue; }
        out.frames++;
        for (let t = 0; t < fq.length; t++) { out.q.push(fq[t]); out.o.push(fo[t]); out.m.push(fm[t]); }
      }
      return out;
    };
    // First, frames where almost the whole logo can be checked and looks like the template over a
    // plain background. Without enough of those (something always sits under the logo) nothing is
    // measured: what stays put under a logo can't be told apart from the logo itself.
    const p1 = collect(alpha0.map((v) => v), 0.15 * 0.31, 0.05, o.cover1 == null ? 0.45 : o.cover1);
    let sq = [], so = [], sm = [], framesUsed = 0, rejected = p1.rejected;
    if (p1.frames >= 8) {
      // then every frame whose checked part agrees closely with what those frames showed
      const est = Float32Array.from(alpha0), acc = new Map();
      for (let t = 0; t < p1.q.length; t++) { const d = L - p1.m[t]; if (Math.abs(d) < 8) continue; let e = acc.get(p1.q[t]); if (!e) acc.set(p1.q[t], (e = [])); e.push([(p1.o[t] - p1.m[t]) / d, d * d]); }
      for (const [q, e] of acc) {
        if (e.length < 3) continue;
        e.sort((x, y) => x[0] - y[0]);
        let tot = 0; for (const v of e) tot += v[1];
        let run = 0; for (const v of e) { run += v[1]; if (run >= tot / 2) { est[q] = clamp(v[0], -0.2, 0.98); break; } }
      }
      const p2 = collect(est, 0.03, 0.03, 0.3);
      sq = p2.q; so = p2.o; sm = p2.m; framesUsed = p2.frames; rejected = p2.rejected;
    }
    // Model per pixel: observed − bg = a·(L − bg), with a pulled toward the starting map. Over
    // near-black the logo's thin parts survive compression better than over light backgrounds, so
    // dark frames get an opacity aD of their own (pulled toward a).
    // Flat edges don't guarantee a flat inside: something passing under the logo (a phone's edge,
    // text) breaks the assumption for that pixel in that frame. Such samples are far off what the
    // current fit predicts and are dropped; two rounds, the second against the first round's fit.
    const lamDark = 3 * (L - black) ** 2 + 1;
    const support = new Float32Array(n), plain = new Float32Array(n);
    for (let t = 0; t < sq.length; t++) plain[sq[t]]++;
    for (let q = 0; q < n; q++) plain[q] /= crops.length;
    // Robust start: per pixel, the weighted median of the opacity each sample implies. Something
    // passing under the logo in a minority of frames (a moving sweep, a passing object) then has no
    // pull at all; the least-squares rounds below only use samples close to it.
    let cur = Float32Array.from(alpha0), curD = Float32Array.from(alpha0), used = 0, nDark = 0, lx = null, dx = null;
    {
      const cnt = new Int32Array(n + 1);
      for (let t = 0; t < sq.length; t++) cnt[sq[t] + 1]++;
      for (let q = 0; q < n; q++) cnt[q + 1] += cnt[q];
      const order = new Int32Array(sq.length), fillAt = cnt.slice(0, n);
      for (let t = 0; t < sq.length; t++) order[fillAt[sq[t]]++] = t;
      const wmed = (list) => {
        if (list.length < 3) return NaN;
        list.sort((x, y) => x[0] - y[0]);
        let tot = 0; for (const e of list) tot += e[1];
        let acc = 0; for (const e of list) { acc += e[1]; if (acc >= tot / 2) return e[0]; }
        return list[list.length - 1][0];
      };
      for (let q = 0; q < n; q++) {
        if (!U[q] || cnt[q + 1] === cnt[q]) continue;
        const li = [], di = [];
        for (let k = cnt[q]; k < cnt[q + 1]; k++) {
          const t = order[k], m = sm[t], d = L - m;
          if (Math.abs(d) < minD) continue;
          const e = [(so[t] - m) / d, d * d];
          if (o.darkRegime && m < darkCut) di.push(e); else li.push(e);
        }
        const a1 = wmed(li), a2 = wmed(di);
        if (a1 === a1) cur[q] = clamp(a1, -0.2, 0.98);
        if (a2 === a2) curD[q] = clamp(a2, -0.2, 0.98);
        if (a1 !== a1 && a2 === a2) cur[q] = curD[q];
        if (a2 !== a2) curD[q] = cur[q];
      }
    }
    for (const tol of [0.15, 0.1]) {
      // Σyd and Σd² for light and dark backgrounds (y = observed − bg, d = L − bg)
      const ly = new Float64Array(n), dy = new Float64Array(n);
      lx = new Float64Array(n); dx = new Float64Array(n);
      used = 0; nDark = 0;
      for (let t = 0; t < sq.length; t++) {
        const q = sq[t], m = sm[t], d = L - m, y = so[t] - m, isDark = !!o.darkRegime && m < darkCut;
        if (Math.abs(d) < minD) continue;
        if (Math.abs(y - (isDark ? curD : cur)[q] * d) > Math.max(3, tol * Math.abs(d))) continue;
        if (isDark) { dy[q] += y * d; dx[q] += d * d; nDark++; } else { ly[q] += y * d; lx[q] += d * d; }
        used++;
      }
      const next = new Float32Array(n), nextD = new Float32Array(n);
      for (let q = 0; q < n; q++) {
        if (!U[q]) continue;
        // minimise Σ(y − a·d)² + Σdark(y − aD·d)² + λ(a − a0)² + λD(aD − a)²
        const A11 = lx[q] + lambda + lamDark, A22 = dx[q] + lamDark, r1 = ly[q] + lambda * alpha0[q], r2 = dy[q];
        const det = A11 * A22 - lamDark * lamDark, av = (r1 * A22 + lamDark * r2) / det;
        next[q] = clamp(av, -0.2, 0.98);
        nextD[q] = clamp((r2 + lamDark * av) / A22, -0.2, 0.98);
        support[q] = lx[q] / (lx[q] + lambda);
      }
      cur = next; curD = nextD;
    }
    // Only the kinds of difference a logo really shows from its template are kept (see smoothDelta):
    // anything that stays put under the logo, like a tick mark or a grid line, would otherwise be
    // taken for opacity and wiped out.
    if (o.smooth) {
      const d1 = new Float32Array(n), w1 = new Float32Array(n), d2 = new Float32Array(n), w2 = new Float32Array(n);
      for (let q = 0; q < n; q++) {
        if (!U[q]) continue;
        d1[q] = cur[q] - alpha0[q]; w1[q] = lx[q] / (lx[q] + lambda);
      }
      const f1 = smoothDelta(d1, w1, alpha0, w, h, U), sm = new Float32Array(n);
      for (let q = 0; q < n; q++) sm[q] = U[q] ? clamp(alpha0[q] + f1[q], -0.2, 0.98) : 0;
      for (let q = 0; q < n; q++) {
        if (!U[q]) continue;
        d2[q] = curD[q] - sm[q]; w2[q] = dx[q] / (dx[q] + lamDark);
      }
      const f2 = nDark >= 50 ? smoothDelta(d2, w2, sm, w, h, U) : new Float32Array(n);
      const smD = new Float32Array(n);
      for (let q = 0; q < n; q++) smD[q] = U[q] ? clamp(sm[q] + f2[q], -0.2, 0.98) : 0;
      cur = sm; curD = smD;
    }
    // A real logo differs from its template only so much: a faint halo just outside it, a somewhat
    // stronger or weaker edge. Anything beyond that is something that sits there (a ring, a mark)
    // and must not become part of the logo.
    // At the logo's edge a slight shift of a sharp point or rim moves a pixel's opacity anywhere
    // between its neighbours' values, so there the range is what the template has around the pixel.
    const span = o.span == null ? 0.2 : o.span, halo = o.halo == null ? 0.12 : o.halo;
    const lo3 = new Float32Array(n), hi3 = new Float32Array(n);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let lo = 9, hi = -9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= w || b2 >= h) continue; const v = alpha0[b2 * w + a2]; lo = Math.min(lo, v); hi = Math.max(hi, v); }
      lo3[j * w + i] = o.edgeRange ? lo : 9; hi3[j * w + i] = o.edgeRange ? hi : -9;
    }
    const bound = (v, q) => (alpha0[q] === 0 ? clamp(v, Math.min(-halo, lo3[q]), Math.max(halo, hi3[q])) : clamp(v, Math.min(alpha0[q] - span, lo3[q]), Math.max(alpha0[q] + span, hi3[q])));
    for (let q = 0; q < n; q++) { if (!U[q]) continue; cur[q] = bound(cur[q], q); curD[q] = bound(curD[q], q); }
    // a trace this small changes nothing visible; leave those pixels untouched
    const alpha = new Float32Array(n), alphaDark = new Float32Array(n);
    let darkMatters = false;
    for (let q = 0; q < n; q++) {
      alpha[q] = Math.abs(cur[q]) < 0.004 ? 0 : cur[q];
      alphaDark[q] = Math.abs(curD[q]) < 0.004 ? 0 : curD[q];
      if (Math.abs(alphaDark[q] - alpha[q]) * (L - black) > 2) darkMatters = true;
    }
    const dark = o.darkRegime && darkMatters && nDark >= 50 ? { alpha: alphaDark, lo: black + 15, hi: black + 45 } : null;
    return { alpha, dark, mask: U, support, plain, used, framesUsed, rejected };
  }

  // Choosing the logo's settings (look, exact placement and size, strength) by what removal leaves
  // behind. Over a background with things in it this is the check that still works: the logo's
  // outline sits at the same place in every frame and real edges don't line up with it, so the right
  // settings leave the least edge across the outline over many frames.
  function outlineSetup(crops, rect, T, X, Y, s) {
    const { w, h } = rect, n = w * h, a = templateIn(T, X, Y, s, rect).alpha;
    let amax = 0; for (const v of a) amax = Math.max(amax, v);
    const band = [];
    for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) {
      const q = j * w + i, gx = (a[q + 1] - a[q - 1]) / 2, gy = (a[q + w] - a[q - w]) / 2, g = Math.hypot(gx, gy);
      if (g < 0.04 * amax) continue;
      // step across the outline: the nearest of the 8 directions to the gradient
      const ang = Math.atan2(gy, gx), d = Math.round(ang / (Math.PI / 4));
      const dx = Math.round(Math.cos(d * Math.PI / 4)), dy = Math.round(Math.sin(d * Math.PI / 4));
      band.push(q, q + dy * w + dx, q - dy * w - dx, g);
    }
    // judged on the frames where the logo stands out most from what is around it: over a background
    // close to its own colour the logo hardly shows, and those frames would only add noise and
    // whatever sits still there (a pale shape's edge) to the judgement
    const ring = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((i < 3 || j < 3 || i >= w - 3 || j >= h - 3) && (i + j) % 2 === 0) ring.push(j * w + i);
    const L0 = T.L || 235, scored = crops.map((c, t) => { const v = ring.map((q) => c[q]).sort((x, y) => x - y); return [Math.abs(L0 - v[v.length >> 1]), t]; });
    scored.sort((x, y) => y[0] - x[0] || x[1] - y[1]);
    const use = scored.slice(0, Math.min(40, crops.length)).sort((x, y) => x[1] - y[1]).map(([, t]) => crops[t]);
    return { band, use, n };
  }
  function outlineEnergy(setup, alpha, L) {
    const { band, use } = setup;
    let e = 0;
    const rest = (o, a) => (a >= 0.82 ? o : (o - a * L) / (1 - a));
    for (const c of use) for (let t = 0; t < band.length; t += 4) {
      const q1 = band[t + 1], q2 = band[t + 2];
      const d = rest(c[q1], alpha[q1]) - rest(c[q2], alpha[q2]);
      e += Math.min(Math.abs(d), 15) * band[t + 3];
    }
    return e;
  }
  // Ts: template looks to choose from; Lfor(T): the logo colour to use with a look. Returns the best
  // look, placement and size. (The strength can't be judged this way: removing a little too much
  // hides edges as well as it reveals them, so it comes from plain frames or the logo's known value.)
  function calibrateOutline(crops, rect, Ts, X0, Y0, s0, k, Lfor, pass) {
    if (!crops.length) return null;
    const setup = outlineSetup(crops, rect, Ts[0], X0, Y0, s0);
    if (setup.band.length < 4 * 50) return null;
    if (!pass) {
      // a second pass measures along the outline of the look and placement the first pass found
      const b1 = calibrateOutline(crops, rect, Ts, X0, Y0, s0, k, Lfor, 1);
      if (!b1) return null;
      return calibrateOutline(crops, rect, [b1.T, ...Ts.filter((T) => T !== b1.T)], b1.X, b1.Y, b1.s, k, Lfor, 2) || b1;
    }
    const E = (c) => outlineEnergy(setup, templateIn(c.T, c.X, c.Y, c.s, rect).alpha.map((v) => v * k), Lfor(c.T));
    let best = { T: Ts[0], X: X0, Y: Y0, s: s0 };
    best.e = E(best);
    const tryIt = (c) => { const e = E(c); if (e < best.e) best = { ...c, e }; };
    const base = () => ({ T: best.T, X: best.X, Y: best.Y, s: best.s });
    for (const T of Ts.slice(1)) tryIt({ ...base(), T });
    for (const st of [0.5, 0.25, 0.125]) {
      const b = base();
      for (const dx of [-2, -1, 0, 1, 2]) for (const dy of [-2, -1, 0, 1, 2]) if (dx || dy) tryIt({ ...b, X: b.X + dx * st, Y: b.Y + dy * st });
      const b2 = base();
      for (const f of [-1, 1]) tryIt({ ...b2, s: b2.s * (1 + f * st * 0.02) });
      const b4 = base();
      for (const T of Ts) if (T !== b4.T) tryIt({ ...b4, T });
    }
    return best;
  }

  // Opacity map (and mask = logo + 2px) of the template placed at (X0, Y0) with size s, over rect.
  function templateIn(T, X0, Y0, s, rect) {
    const alpha = new Float32Array(rect.w * rect.h), mask = new Uint8Array(rect.w * rect.h);
    for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) {
      const v = tmplPixel(T, X0, Y0, s, rect.x + i, rect.y + j);
      alpha[j * rect.w + i] = v > 0.002 || (T.sharpen && v < -0.002) ? v : 0;
    }
    for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) {
      if (alpha[j * rect.w + i] === 0) continue;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < rect.w && b2 < rect.h) mask[b2 * rect.w + a2] = 1; }
    }
    return { alpha, mask };
  }
  // Padded, even-aligned rect around the placed template, with its opacity map.
  function placeTemplate(T, X0, Y0, s, W, H) {
    const hw = T.w * s / 2, hh = T.h * s / 2, pad = Math.max(8, Math.round(Math.max(hw, hh) * 0.6));
    const x0 = Math.max(0, Math.floor((X0 - hw - pad) / 2) * 2), y0 = Math.max(0, Math.floor((Y0 - hh - pad) / 2) * 2);
    const x1 = Math.min(W, Math.ceil((X0 + hw + pad) / 2) * 2), y1 = Math.min(H, Math.ceil((Y0 + hh + pad) / 2) * 2);
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    return { rect, ...templateIn(T, X0, Y0, s, rect) };
  }
  // Find the template in an averaged picture. Gemini puts its logo at the same spot in every video of
  // a given frame shape, so that spot is checked first and accepted on a moderate fit (on light
  // backgrounds the logo is faint). Only when it is clearly not there is the whole picture searched,
  // and then only a very clear match counts (so look-alike shapes elsewhere cannot win).
  function findTemplate(img, w, h, T, sNom, W, H) {
    const kx = w / W, ky = h / H, k = Math.min(W, H) / T.refH;
    // usual spot: the same distance from the bottom-right corner as in a 1920×1080 video, scaled
    // with the frame's shorter side (as the logo's size is)
    const UX = W - (T.refW - T.refCx) * k, UY = H - (T.refH - T.refCy) * k;
    const ux = (UX + 0.5) * kx - 0.5, uy = (UY + 0.5) * ky - 0.5;
    const usual = alignTemplate(img, w, h, T, ux, uy, sNom, { maxShift: 2, sizeRange: 0.05 });
    // when it is there, it is exactly there: the spot itself is returned, not the fit on this small
    // picture (which a faint logo over a light background can pull a pixel or two aside)
    const atUsual = { x: ux, y: uy, s: sNom, score: usual.score.score, usual: true };
    if (usual.score.score >= 0.5 && usual.score.inside >= 0.3) return atUsual;
    // Near it: Gemini's logo keeps its size and its corner (a cropped or re-framed video moves it a
    // little), so only a window around the usual spot and sizes near the usual one are searched;
    // shapes that merely look alike elsewhere in the picture (a crosshair, an icon) can't win.
    const R = Math.round(0.15 * Math.min(w, h)) + Math.ceil(T.w * sNom / 2);
    const x0 = Math.max(0, Math.round(ux) - R) & ~1, y0 = Math.max(0, Math.round(uy) - R) & ~1;
    const x1 = Math.min(w, Math.round(ux) + R), y1 = Math.min(h, Math.round(uy) + R);
    const cw = (x1 - x0) >> 1, ch = (y1 - y0) >> 1, coarse = new Float32Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const o = (y0 + 2 * j) * w + x0 + 2 * i; coarse[j * cw + i] = (img[o] + img[o + 1] + img[o + w] + img[o + w + 1]) / 4; }
    const c = cw > 4 && ch > 4 ? matchTemplate(coarse, cw, ch, T, [0.9, 1, 1.1].map((m) => sNom / 2 * m)) : null;
    if (c) {
      const a = alignTemplate(img, w, h, T, x0 + c.x * 2 + 0.5, y0 + c.y * 2 + 0.5, c.s * 2, { sizeRange: 0.12 });
      if (a.score.score >= 0.85 && a.score.inside >= 0.3 && Math.abs(a.s / sNom - 1) <= 0.12) return { x: a.x, y: a.y, s: a.s, score: a.score.score, usual: false };
    }
    // A busy background moving under the logo (bars, text) can hide it in the average picture;
    // the usual spot still wins on a weaker fit, and learning then decides from the frames. Over
    // dense lines that stand still (a wire mesh) the fit stays weak however clear the logo is; there
    // removing the logo at that spot tells: if it is there, the edge along its outline goes away
    // (elsewhere, removing a logo that isn't there draws a dark one in).
    if (usual.score.score >= 0.3 && usual.score.inside >= 0.3) return atUsual;
    if (usual.score.score >= 0.15 && usual.score.inside >= 0.3 && logoPresence(img, w, h, T, ux, uy, sNom) < 1) return atUsual;
    return null;
  }
  // Edge across the logo's outline after removing it there (white, the template's shape), against
  // the edge the picture has there: well under 1 when the logo is there, over 1 when it isn't.
  function logoPresence(img, w, h, T, X, Y, s, Lw) {
    const rect = placeTemplate(T, X, Y, s, w, h).rect, c = new Float32Array(rect.w * rect.h);
    for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) c[j * rect.w + i] = img[(rect.y + j) * w + rect.x + i];
    const b = outlineSetup([c], rect, T, X, Y, s).band, a = templateIn(T, X, Y, s, rect).alpha, L = Lw || 245;
    if (b.length < 4 * 20) return Infinity;
    const rest = (o, al) => (al >= 0.82 ? o : (o - al * L) / (1 - al)), d1 = [], d0 = [];
    for (let u = 0; u < b.length; u += 4) { const q1 = b[u + 1], q2 = b[u + 2]; d1.push(Math.abs(rest(c[q1], a[q1]) - rest(c[q2], a[q2]))); d0.push(Math.abs(c[q1] - c[q2])); }
    const med = (v) => { v.sort((x, y) => x - y); return v[v.length >> 1]; };
    return med(d1) / Math.max(0.5, med(d0));
  }

  // ---------- photos ----------
  // Gemini marks a photo with the same sparkle near its bottom-right corner; its size and margin
  // follow the photo's size. The corner is searched at every plausible size on a reduced copy, the
  // best few places are fitted at full size, and a place only counts when removing the logo there
  // takes the edge along its outline away (see logoPresence).
  function findImageLogo(lum, W, H, Ts) {
    const cands = [];
    for (let px = 20; px <= Math.min(220, 0.5 * Math.min(W, H)); px *= 1.15) {
      // the margin grows with the logo, so a logo this size sits within a few sizes of the corner;
      // searched on a copy reduced so that it is about 22 pixels across
      const side = Math.round(Math.min(W, H, 3.5 * px + 40)), d = Math.max(1, Math.round(px / 22));
      const x0 = W - side, y0 = H - side, cw = Math.floor(side / d), ch = Math.floor(side / d), small = new Float32Array(cw * ch);
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        let s = 0;
        for (let dj = 0; dj < d; dj++) for (let di = 0; di < d; di++) s += lum[(y0 + j * d + dj) * W + x0 + i * d + di];
        small[j * cw + i] = s / (d * d);
      }
      for (const T of Ts) {
        const c = matchTemplate(small, cw, ch, T, [px / (0.8 * T.w) / d]);
        if (c) cands.push({ T, x: x0 + (c.x + 0.5) * d - 0.5, y: y0 + (c.y + 0.5) * d - 0.5, s: c.s * d, ncc: c.score });
      }
    }
    cands.sort((p, q) => q.ncc - p.ncc);
    const tried = cands.slice(0, 8);
    // and where Gemini puts it: the gap to the corner is two thirds of the logo's size (32 pixels
    // for a 48-pixel logo, 64 for 96); there a busy picture may weaken the fit, so a weaker one counts
    for (const T of Ts) for (const px of [48, 64, 96, 128]) {
      if (px > 0.5 * Math.min(W, H)) continue;
      const m = px * 2 / 3;
      tried.push({ T, x: W - m - px / 2 - 0.5, y: H - m - px / 2 - 0.5, s: px / (0.8 * T.w), prior: true });
    }
    let best = null;
    for (const c of tried) {
      const a = alignTemplate(lum, W, H, c.T, c.x, c.y, c.s, { sizeRange: 0.1, maxShift: c.prior ? 4 : Infinity });
      if (!(a.score.score > -1)) continue;
      const pres = logoPresence(lum, W, H, c.T, a.x, a.y, a.s, 250);
      const ok = (a.score.score >= 0.5 && pres < 1) || (a.score.score >= 0.2 && pres < 0.8) || (c.prior && a.score.score >= 0.3 && pres < 1.5);
      const val = a.score.score - 0.3 * Math.min(pres, 2);
      if (ok && (!best || val > best.val)) best = { T: c.T, x: a.x, y: a.y, s: a.s, score: a.score.score, presence: pres, val };
    }
    // found within a few pixels of where Gemini puts a logo of about that size: it is exactly there
    if (best) for (const px of [48, 64, 96, 128]) {
      const m = px * 2 / 3, X = W - m - px / 2 - 0.5, Y = H - m - px / 2 - 0.5, sz = best.s * 0.8 * best.T.w;
      if (Math.abs(best.x - X) <= 4 && Math.abs(best.y - Y) <= 4 && Math.abs(sz / px - 1) <= 0.15) {
        Object.assign(best, { x: X, y: Y, s: px / (0.8 * best.T.w), exact: true });
        break;
      }
    }
    return best;
  }
  // The model for one photo: look, exact place and size settled on the photo itself (the outline
  // it leaves behind), the logo's strength from where its surroundings are plain (each such pixel
  // says how strong the logo must be for what it shows; the middle is taken), white for its colour.
  function fitImageLogo(lum, W, H, found, looks) {
    let { T, x: X, y: Y, s } = found;
    let rect = placeTemplate(T, X, Y, s, W, H).rect;
    const crop = () => { const c = new Uint8Array(rect.w * rect.h); for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) c[j * rect.w + i] = clamp(Math.round(lum[(rect.y + j) * W + rect.x + i]), 0, 255); return c; };
    const cal = calibrateOutline([crop()], rect, [T, ...looks.filter((t) => t !== T)], X, Y, s, 1, () => 255);
    if (cal) {
      // at Gemini's own spot the fine-tuning may move it only a little (lines in the picture could
      // pull it further); beyond that only the look it chose is kept
      if (found.exact && (Math.abs(cal.X - X) > 0.75 || Math.abs(cal.Y - Y) > 0.75 || Math.abs(cal.s / s - 1) > 0.04)) T = cal.T;
      else { T = cal.T; X = cal.X; Y = cal.Y; s = cal.s; }
      rect = placeTemplate(T, X, Y, s, W, H).rect;
    }
    const { alpha } = templateIn(T, X, Y, s, rect), c = crop(), n = rect.w * rect.h;
    const U = new Uint8Array(n);
    for (let j = 0; j < rect.h; j++) for (let i = 0; i < rect.w; i++) if (alpha[j * rect.w + i] !== 0) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < rect.w && b2 < rect.h) U[b2 * rect.w + a2] = 1; }
    const ks = [];
    let big = 0;
    for (let q = 0; q < n; q++) if (alpha[q] >= 0.15) big++;
    for (const g of surroundOf(U, rect.w, rect.h)) {
      const a = alpha[g.q];
      if (a < 0.15) continue;
      const bg = bgAt(c, g, true);
      if (!(bg >= 0) || 255 - bg < 30) continue;
      ks.push((c[g.q] - bg) / (a * (255 - bg)));
    }
    let k = 1;
    if (ks.length >= Math.max(30, 0.25 * big)) {
      ks.sort((x, y) => x - y);
      const med = ks[ks.length >> 1], spread = (ks[Math.floor(ks.length * 0.75)] - ks[Math.floor(ks.length * 0.25)]) / 2;
      if (spread <= 0.12) k = clamp(med, 0.5, 2);
    }
    return { T, X, Y, s, k, rect, alpha: alpha.map((v) => clamp(v * k, -0.3, 0.97)), L: 255 };
  }
  // Removes the logo from a photo given as RGB planes (and a model from fitImageLogo).
  function cleanImage(planes, model, opts) {
    const o = opts || {}, shared = {};
    planes.forEach((p, i) => restorePlane(p, { r: model.rect, alpha: model.alpha, L: model.L, denoise: o.denoise || 0, flatHeal: true, finish: true, repair: true, despeckle: true, shared, lead: i === 0 }));
  }

  // Logo colour (and an opacity gain k) for a placed template, from the learning frames. Where the
  // logo's surroundings are flat in a frame, the background under it is known, so each logo pixel
  // gives (observed - bg)/a = k*(L - bg). With backgrounds of several brightnesses both k and L
  // follow; otherwise k = 1. Without flat surroundings the long-run means are used instead.
  function fitTemplateColour(learner, alpha, mask, kFixed, Lguess) {
    const { w, h } = learner.r, n = w * h, crops = learner.crops;
    const ys = [], bs = [];
    if (crops.length) {
      // pixels of the logo whose background is known in a frame; a frame counts only when the logo
      // there looks like the template over a plain background (with a colour near Lguess), since
      // something sitting under the logo would mislead the fit
      const geo = surroundOf(mask, w, h).filter((g) => alpha[g.q] >= 0.12), Lg = Lguess || 235;
      for (const c of crops) {
        const fy = [], fb = [];
        let bad = 0, chk = 0;
        for (const g of geo) {
          const m = bgAt(c, g, false);
          if (!(m >= 0)) continue;
          const a = alpha[g.q], R = c[g.q] - m - a * (Lg - m);
          chk++; if (Math.abs(R) > 4 + 0.15 * a * Math.abs(Lg - m)) bad++;
          fy.push((c[g.q] - m) / a); fb.push(m);
        }
        if (chk < 0.8 * geo.length || bad > 0.03 * chk) continue;
        for (let t = 0; t < fy.length; t++) { ys.push(fy[t]); bs.push(fb[t]); }
      }
    }
    let k = kFixed || 1, L;
    if (ys.length >= 200) {
      const sb = Float32Array.from(bs).sort(), spread = sb[Math.floor(sb.length * 0.9)] - sb[Math.floor(sb.length * 0.1)];
      if (!kFixed && spread >= 40) {
        // y = k*L - k*bg  → least squares line
        let mb = 0, my = 0; for (let q = 0; q < ys.length; q++) { mb += bs[q]; my += ys[q]; } mb /= ys.length; my /= ys.length;
        let cov = 0, vb = 0; for (let q = 0; q < ys.length; q++) { cov += (bs[q] - mb) * (ys[q] - my); vb += (bs[q] - mb) ** 2; }
        k = clamp(-cov / vb, 0.6, 1.5);
      }
      const Ls = ys.map((y, q) => bs[q] + y / k).sort((x, y2) => x - y2);
      L = Ls[Ls.length >> 1];
      return { k, L, from: 'flat', samples: ys.length };
    }
    // long-run means: mean_in = k*a*L + (1 - k*a)*mean_bg, with mean_bg interpolated from around the logo
    const N = learner.frames, mean = new Float64Array(n);
    for (let q = 0; q < n; q++) mean[q] = learner.so[q] / N;
    const mB = laplaceFill(mean, mask, w, h, Math.min(1500, 4 * Math.max(w, h)));
    const Ls = [];
    for (let q = 0; q < n; q++) if (alpha[q] >= 0.15) Ls.push(mB[q] + (mean[q] - mB[q]) / (k * alpha[q]));
    if (!Ls.length) return null;
    Ls.sort((x, y) => x - y);
    return { k, L: Ls[Ls.length >> 1], from: 'means', samples: Ls.length };
  }

  // Rect of a full-res rect on a plane subsampled by (sx, sy), grown outward to whole samples.
  function planeRect(r, sx, sy, pw, ph) {
    const x0 = Math.floor(r.x / sx), y0 = Math.floor(r.y / sy);
    const x1 = Math.min(pw, Math.ceil((r.x + r.w) / sx)), y1 = Math.min(ph, Math.ceil((r.y + r.h) / sy));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  return { smoothFill, detect, PlaneLearner, fitLuma, refineByMoments, fitBlackLift, alphaOnPlane, cleanMask, restorePlane, planeRect, decodeTemplate, matchTemplate, refineTemplate, robustScore, alignTemplate, blurTemplate, sharpenTemplate, fitTemplateEdge, calibrateOutline, outlineSetup, outlineEnergy, refineAlphaFlat, surroundOf, bgAt, templateIn, placeTemplate, findTemplate, logoPresence, findImageLogo, fitImageLogo, cleanImage, fitTemplateColour, OPAQUE, clamp };
})();
export default LogoCore;
