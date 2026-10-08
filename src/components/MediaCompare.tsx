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
  zoom?: boolean;
  eager?: boolean;
  /** a looping arrow that points at the logo on the original side (default: on the hero) */
  pointer?: boolean;
};

const ZOOM_MS = 700;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function MediaCompare({ media, logo, alt, variant = 'card', zoom = false, eager = false, pointer = variant === 'hero' }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const range = useRef<HTMLInputElement>(null);
  const api = useRef<{ zoom?: (z: number) => void }>({});
  const state = useRef({ pos: 0, z: 1, ky: 50, touched: false, hover: false, visible: false, drawn: false });
  const [level, setLevel] = useState(1);
  const [ready, setReady] = useState(false);
  const levels = [1, 2, media.w >= 1000 ? 4 : 3];
  const lx = logo.x * 100;
  const start = variant === 'hero' ? Math.min(97, lx + 7) : lx - 6;

  useEffect(() => {
    const el = wrap.current!, c = cv.current!, ctx = c.getContext('2d')!;
    const st = state.current;
    let imgs: [HTMLImageElement, HTMLImageElement] | null = null;
    let raf = 0, alive = true, dirty = true, lastT = -1, sweepT0 = -1;
    let anim: null | { t0: number; z0: number; z1: number; p0: number; k0: number } = null;
    const v = vid.current;

    // The part of the frame on screen at zoom z: centred on the logo, kept inside the frame. Once
    // zoomed it stays half a pixel inside the frame, so smoothing never samples the other half of
    // the stacked video.
    const view = (z: number) => {
      const sw = media.w / z, sh = media.h / z, m = Math.min(0.5, z - 1);
      const fit = (centre: number, size: number, full: number) => Math.max(m, Math.min(full - size - m, centre - size / 2));
      return { sx: fit(logo.x * media.w, sw, media.w), sy: fit(logo.y * media.h, sh, media.h), sw, sh };
    };
    const logoAt = (z: number) => { const r = view(z); return ((logo.x * media.w - r.sx) / r.sw) * 100; };
    // the knob sits mid-height unless the logo is there; then it moves below the logo (or above)
    const knobFor = (z: number) => {
      if (!zoom) return 50;
      const r = view(z), y = ((logo.y * media.h - r.sy) / r.sh) * 100;
      return Math.abs(y - 50) >= 22 ? 50 : y + 30 <= 88 ? y + 30 : y - 30;
    };
    const setKnob = (k: number) => { st.ky = k; el.style.setProperty('--ky', `${k}%`); };
    setKnob(knobFor(st.z));

    const draw = () => {
      const W = c.width, H = c.height, split = Math.round((W * st.pos) / 100);
      const { sx, sy, sw, sh } = view(st.z);
      let before: CanvasImageSource, after: CanvasImageSource, dy: number;
      if (media.kind === 'video') {
        if (!v || v.readyState < 2) return false;
        before = after = v; dy = media.h;
      } else {
        if (!imgs) return false;
        [before, after] = imgs; dy = 0;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(after, sx, sy + dy, sw, sh, 0, 0, W, H);
      if (split > 0) ctx.drawImage(before, sx, sy, (sw * Math.min(W, split)) / W, sh, 0, 0, Math.min(W, split), H);
      if (!st.drawn) { st.drawn = true; setReady(true); }
      // where the logo is on screen now, for the arrow that points at it. It says "Logo" while the original shows there
      // (the divider is to the right of the logo) and "Removed" once the divider has passed; hidden when zoomed in
      const lxs = ((logo.x * media.w - sx) / sw) * 100, lys = ((logo.y * media.h - sy) / sh) * 100;
      el.style.setProperty('--lx', `${lxs}%`);
      el.style.setProperty('--ly', `${lys}%`);
      el.dataset.ptr = st.z > 1.01 ? 'zoom' : st.pos > lxs + 4 ? 'before' : 'after';
      if (zoom) {
        el.style.setProperty('--vx', `${(sx / media.w) * 100}%`);
        el.style.setProperty('--vy', `${(sy / media.h) * 100}%`);
        el.style.setProperty('--vw', `${(sw / media.w) * 100}%`);
        el.style.setProperty('--vh', `${(sh / media.h) * 100}%`);
        el.dataset.zoomed = st.z > 1.01 ? 'yes' : 'no';
      }
      return true;
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
    // back and forth over it), animate the zoom, and redraw only when something changed or the
    // video showed a new frame.
    const tick = (now: number) => {
      if (!alive || !st.visible) { raf = 0; return; }
      if (anim) {
        // zoom at an even pace, and bring the divider onto the logo as the view closes in
        const k = Math.min(1, (now - anim.t0) / ZOOM_MS), e = ease(k);
        st.z = anim.z0 * (anim.z1 / anim.z0) ** e;
        setPos(anim.p0 + (logoAt(st.z) - anim.p0) * e);
        setKnob(anim.k0 + (knobFor(anim.z1) - anim.k0) * e);
        dirty = true;
        if (k >= 1) anim = null;
      } else if (sweepT0 >= 0) {
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
      if (st.visible && sweepT0 < 0 && !reduced() && !st.touched) sweepT0 = performance.now() + 2200;   // the arrow says "Logo" for a moment first
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

    // cards follow a mouse pointer
    const onMove = (e: PointerEvent) => {
      if (variant !== 'card' || e.pointerType !== 'mouse') return;
      const b = c.getBoundingClientRect();
      st.hover = true; setPos(((e.clientX - b.left) / b.width) * 100); run();
    };
    const onLeave = () => { st.hover = false; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    const onInput = () => { st.touched = true; anim = null; setPos(+range.current!.value); run(); };
    range.current!.addEventListener('input', onInput);
    const onResize = () => { dirty = true; run(); };
    addEventListener('resize', onResize);
    api.current.zoom = (z: number) => {
      st.touched = true; sweepT0 = -1;
      if (reduced()) { anim = null; st.z = z; setPos(logoAt(z)); setKnob(knobFor(z)); dirty = true; if (!st.visible) draw(); }
      else anim = { t0: performance.now(), z0: st.z, z1: z, p0: st.pos, k0: st.ky };
      run();
    };

    return () => {
      alive = false;
      io.disconnect();
      cancelAnimationFrame(raf);
      if (v) { v.removeEventListener('loadeddata', redraw); v.pause(); }
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      range.current?.removeEventListener('input', onInput);
      removeEventListener('resize', onResize);
      api.current.zoom = undefined;
    };
  }, [media, logo.x, logo.y, variant, zoom, eager, lx, start]);

  const pick = (z: number) => {
    setLevel(z);
    api.current.zoom?.(z);
  };

  const poster = media.kind === 'video' ? media.poster : media.before;
  return (
    <div className={`mc mc-${variant}`} data-ready={ready || undefined}>
      <div ref={wrap} className="mc-stage" style={{ aspectRatio: `${media.w} / ${media.h}` }} data-side="before" data-zoomed="no">
        {poster && <img className="mc-poster" src={poster} alt="" width={media.w} height={media.h} loading={eager ? 'eager' : 'lazy'} decoding="async" />}
        <canvas ref={cv} className="mc-canvas" width={media.w} height={media.h} role="img" aria-label={`${alt}: original on the left of the divider, logo removed on the right`} />
        {media.kind === 'video' && (
          <video ref={vid} className="mc-video" muted loop playsInline preload={eager ? 'auto' : 'none'} aria-hidden="true" tabIndex={-1}>
            <source src={media.webm} type="video/webm" />
            {media.mp4 && <source src={media.mp4} type="video/mp4" />}
          </video>
        )}
        {pointer && (
          <span className="mc-ptr" aria-hidden="true">
            <span className="mc-ptr-ring" />
            <span className="mc-ptr-in">
              <b className="mc-ptr-a">Logo</b>
              <b className="mc-ptr-b">Removed</b>
              <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6 32 32M32 14v18H14" /></svg>
            </span>
          </span>
        )}
        <span className="mc-tag mc-tag-l">Original</span>
        <span className="mc-tag mc-tag-r">Logo removed</span>
        <span className="mc-line" aria-hidden="true">
          <span className="mc-knob">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>
          </span>
        </span>
        {zoom && (
          <span className="mc-map" aria-hidden="true" style={{ aspectRatio: `${media.w} / ${media.h}`, backgroundImage: `url(${poster})` }}>
            <span className="mc-map-view" />
          </span>
        )}
        <input ref={range} className="mc-range" type="range" min={0} max={100} step={0.1} defaultValue={start} aria-label={`Compare original and result: ${alt}`} />
      </div>
      {zoom && (
        <div className="mc-zoom" role="group" aria-label="Zoom in on the logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          {levels.map((z) => (
            <button key={z} type="button" aria-pressed={level === z} onClick={() => pick(z)}>
              {z === 1 ? 'Fit' : `${z}×`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
