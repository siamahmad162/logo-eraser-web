import { useEffect, useRef, useState } from 'react';

// Before/after of real output. A video holds the original (top half) above the result (bottom
// half) in one file, so both sides are always the same frame; it is drawn into a canvas, original
// left of the divider and result right of it. Images come as two files.
export type CompareMedia =
  | { kind: 'video'; webm: string; mp4: string; poster?: string; w: number; h: number }
  | { kind: 'image'; before: string; after: string; w: number; h: number };

type Props = {
  media: CompareMedia;
  logo: { x: number; y: number }; // logo centre as fractions of the frame
  alt: string;
  variant?: 'hero' | 'card';
  lens?: boolean;
  eager?: boolean;
};

const LENS = 3; // lens magnification
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function MediaCompare({ media, logo, alt, variant = 'card', lens = false, eager = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const lensCv = useRef<HTMLCanvasElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const state = useRef({ pos: 0, touched: false, hover: false, visible: false, drawn: false, lens: null as null | { x: number; y: number }, pinned: false });
  const [pinned, setPinned] = useState(false);
  const [ready, setReady] = useState(false);
  const lx = logo.x * 100;
  const start = variant === 'hero' ? Math.min(97, lx + 7) : lx - 6;

  useEffect(() => {
    const el = wrap.current!, c = cv.current!, ctx = c.getContext('2d')!;
    const st = state.current;
    let imgs: [HTMLImageElement, HTMLImageElement] | null = null;
    let raf = 0, alive = true, dirty = true, lastT = -1, sweepT0 = -1;
    const v = vid.current;

    const draw = () => {
      const W = c.width, H = c.height, split = Math.round((W * st.pos) / 100);
      if (media.kind === 'video') {
        if (!v || v.readyState < 2) return false;
        ctx.drawImage(v, 0, media.h, media.w, media.h, 0, 0, W, H);
        if (split > 0) ctx.drawImage(v, 0, 0, Math.min(media.w, split), media.h, 0, 0, Math.min(W, split), H);
      } else {
        if (!imgs) return false;
        ctx.drawImage(imgs[1], 0, 0, W, H);
        if (split > 0) ctx.drawImage(imgs[0], 0, 0, Math.min(media.w, split), media.h, 0, 0, Math.min(W, split), H);
      }
      if (!st.drawn) { st.drawn = true; setReady(true); }
      drawLens();
      return true;
    };
    const drawLens = () => {
      const lc = lensCv.current;
      if (!lc) return;
      const at = st.pinned ? { x: logo.x, y: logo.y } : st.lens;
      el.dataset.lens = at ? 'on' : 'off';
      if (!at) return;
      const lctx = lc.getContext('2d')!, box = el.getBoundingClientRect();
      const cssR = lc.getBoundingClientRect().width / 2 || 90;
      const r = (cssR * (media.w / (box.width || media.w))) / LENS, L = lc.width;
      const sx = at.x * media.w - r, sy = at.y * media.h - r;
      // the same spot before (left half) and after (right half), side by side
      const src = media.kind === 'video' ? (v && v.readyState >= 2 ? [v, v] : null) : imgs;
      if (!src) return;
      const dy = media.kind === 'video' ? media.h : 0;
      lctx.imageSmoothingEnabled = false;
      lctx.clearRect(0, 0, L, L);
      lctx.drawImage(src[0], sx, sy, 2 * r, 2 * r, 0, 0, L, L);
      lctx.save();
      lctx.beginPath(); lctx.rect(L / 2, 0, L / 2, L); lctx.clip();
      lctx.drawImage(src[1], sx, sy + dy, 2 * r, 2 * r, 0, 0, L, L);
      lctx.restore();
      lctx.fillStyle = 'rgba(255,255,255,0.9)';
      lctx.fillRect(L / 2 - 1.5, 0, 3, L);
      el.style.setProperty('--lx', `${at.x * 100}%`);
      el.style.setProperty('--ly', `${at.y * 100}%`);
    };
    const setPos = (p: number) => {
      p = Math.max(0, Math.min(100, p));
      if (Math.abs(p - st.pos) < 0.05) return;
      st.pos = p;
      el.style.setProperty('--pos', `${p}%`);
      el.dataset.side = p < 12 ? 'after' : p > 88 ? 'before' : 'both';
      if (range.current) range.current.value = String(p);
      dirty = true;
    };
    st.pos = -1;
    setPos(start);

    // One loop while on screen: move the divider (heroes sweep once across the logo, cards drift
    // back and forth over it) and redraw only when the divider moved or the video showed a new frame.
    const tick = (now: number) => {
      if (!alive || !st.visible) { raf = 0; return; }
      if (sweepT0 >= 0) {
        if (variant === 'hero') {
          if (!st.touched) {
            const k = Math.min(1, Math.max(0, (now - sweepT0) / 1500)), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
            setPos(start + (lx - 20 - start) * e);
            if (k >= 1) sweepT0 = -1;
          }
        } else if (!st.hover) setPos(lx - 8 + 20 * Math.sin((now - sweepT0) / 900));
      }
      if (v && v.currentTime !== lastT && v.readyState >= 2) { lastT = v.currentTime; dirty = true; }
      if (dirty && draw()) dirty = false;
      raf = requestAnimationFrame(tick);
    };
    const run = () => { if (!raf && alive && st.visible) raf = requestAnimationFrame(tick); };
    const redraw = () => { dirty = true; run(); if (!st.visible) draw(); };
    if (v) v.addEventListener('loadeddata', redraw);

    const load = () => {
      if (media.kind === 'image' && !imgs) {
        const a = new Image(), b = new Image();
        let n = 0;
        const done = () => { if (++n === 2) { imgs = [a, b]; redraw(); } };
        a.onload = done; b.onload = done;
        a.src = media.before; b.src = media.after;
      }
    };
    // the hero's video starts once the page has settled, so it doesn't compete with first paint
    let started = variant !== 'hero';
    const start2 = () => {
      started = true;
      if (st.visible && v) v.play().catch(() => {});
      if (st.visible && sweepT0 < 0 && !reduced() && !st.touched) sweepT0 = performance.now() + 300;
      run();
    };
    if (!started) {
      const go = () => setTimeout(start2, 700);
      if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
    }
    const io = new IntersectionObserver(([e]) => {
      st.visible = e.isIntersecting;
      if (e.isIntersecting) {
        load();
        if (started) {
          if (v) v.play().catch(() => {});
          if (variant === 'card' && sweepT0 < 0 && !reduced()) sweepT0 = performance.now();
        }
        dirty = true;
        run();
      } else if (v) v.pause();
    }, { rootMargin: '100px' });
    io.observe(el);
    if (eager) load();

    // hover: cards follow the pointer; the hero shows the lens
    const rel = (e: PointerEvent) => { const b = c.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height }; };
    const onMove = (e: PointerEvent) => {
      if (variant === 'card' && e.pointerType === 'mouse') { st.hover = true; setPos(rel(e).x * 100); run(); }
      if (lens && e.pointerType === 'mouse') { st.lens = rel(e); dirty = true; run(); }
    };
    const onLeave = () => { st.hover = false; st.lens = null; dirty = true; run(); };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    const onInput = () => { st.touched = true; setPos(+range.current!.value); run(); };
    range.current!.addEventListener('input', onInput);
    const onResize = () => { dirty = true; run(); };
    addEventListener('resize', onResize);
    (el as HTMLDivElement & { __pin?: (on: boolean) => void }).__pin = (on: boolean) => { st.pinned = on; dirty = true; run(); };

    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      if (v) { v.removeEventListener('loadeddata', redraw); v.pause(); }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      removeEventListener('resize', onResize);
    };
  }, [media, logo.x, logo.y, variant, lens, eager, lx, start]);

  const togglePin = () => {
    const on = !pinned;
    setPinned(on);
    (wrap.current as HTMLDivElement & { __pin?: (on: boolean) => void })?.__pin?.(on);
  };

  const poster = media.kind === 'video' ? media.poster : media.before;
  return (
    <div className={`mc mc-${variant}`} data-ready={ready || undefined}>
      <div ref={wrap} className="mc-stage" style={{ aspectRatio: `${media.w} / ${media.h}` }} data-side="before" data-lens="off">
        {poster && <img className="mc-poster" src={poster} alt="" width={media.w} height={media.h} loading={eager ? 'eager' : 'lazy'} decoding="async" />}
        <canvas ref={cv} className="mc-canvas" width={media.w} height={media.h} role="img" aria-label={`${alt}: original on the left of the divider, logo removed on the right`} />
        {media.kind === 'video' && (
          <video ref={vid} className="mc-video" muted loop playsInline preload={eager ? 'auto' : 'none'} aria-hidden="true" tabIndex={-1}>
            <source src={media.webm} type="video/webm" />
            <source src={media.mp4} type="video/mp4" />
          </video>
        )}
        <span className="mc-tag mc-tag-l">Original</span>
        <span className="mc-tag mc-tag-r">Logo removed</span>
        <span className="mc-line" aria-hidden="true">
          <span className="mc-knob">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>
          </span>
        </span>
        {lens && <canvas ref={lensCv} className="mc-lens" width={360} height={360} aria-hidden="true" />}
        {lens && <span className="mc-lens-labels" aria-hidden="true"><span>Before</span><span>After</span></span>}
        <input ref={range} className="mc-range" type="range" min={0} max={100} step={0.1} defaultValue={start} aria-label={`Compare original and result: ${alt}`} />
      </div>
      {lens && (
        <button type="button" className="mc-zoom" aria-pressed={pinned} onClick={togglePin}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5" /></svg>
          {pinned ? 'Hide zoom' : `Zoom ${LENS}× on the logo`}
        </button>
      )}
    </div>
  );
}
