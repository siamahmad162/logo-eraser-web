// A helper thread of the Sora / any-logo removers: fills the picture under the logo for the frames it is
// handed (see sora-fill.js). Frames of one run arrive in order, so a filler can reuse what it worked out
// for the frame before.
import { makeFiller } from './sora-fill.js';

const pools = new Map(), fillers = new Map();
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'pool') { pools.set(m.key, { pool: m.pool.map((rgb) => ({ rgb })), donorMask: m.donorMask || null }); fillers.delete(m.key); return; }
  if (m.type === 'fill') {
    try {
      const P = pools.get(m.key) || { pool: [], donorMask: null };
      let f = fillers.get(m.key);
      if (!f || m.fresh) { f = makeFiller(); fillers.set(m.key, f); }
      const r = f.fill({ w: m.w, h: m.h, rgb: m.rgb }, m.mask, P.pool, { s: m.s, seed: m.seed, donorMask: P.donorMask });
      const out = new Uint8Array(r.rgb);       // a copy: the filler keeps its own result for the next frame
      self.postMessage({ id: m.id, rgb: out, mode: r.mode }, [out.buffer]);
    } catch (err) { self.postMessage({ id: m.id, error: String((err && err.message) || err) }); }
  }
};
