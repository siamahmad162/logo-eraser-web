import { useEffect, useRef, useState, type CSSProperties } from 'react';

// Real results from the engine: the corner of a frame (or photo) with the logo, and the same corner after.
type Sample = { id: string; kind: 'Video' | 'Photo'; label: string; before: string; after: string; logoX: number; alt: string };

export const SAMPLES: Sample[] = [
  { id: 'cloud', kind: 'Video', label: 'Server room', before: '/demo/cloud-before.webp', after: '/demo/cloud-after.webp', logoX: 77, alt: 'Corner of an animated server-room video' },
  { id: 'hud', kind: 'Video', label: 'Sci-fi HUD', before: '/demo/hud-before.webp', after: '/demo/hud-after.webp', logoX: 77, alt: 'Corner of an animated sci-fi dashboard video' },
  { id: 'burger', kind: 'Photo', label: 'Food photo', before: '/demo/burger-before.webp', after: '/demo/burger-after.webp', logoX: 90, alt: 'Corner of a food photo' },
];

const startPos = (s: Sample) => Math.min(98, s.logoX + 12);
const endPos = (s: Sample) => s.logoX - 24;

export function Compare() {
  const [i, setI] = useState(0);
  const s = SAMPLES[i];
  const [pos, setPos] = useState(startPos(s));
  const touched = useRef(false);

  // Sweep the divider across the logo once, so the logo visibly disappears.
  useEffect(() => {
    if (touched.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const from = startPos(s), to = endPos(s), t0 = performance.now() + 700, dur = 1300;
    const tick = (now: number) => {
      if (touched.current) return;
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      setPos(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  const pick = (k: number) => {
    touched.current = false;
    setI(k);
    setPos(startPos(SAMPLES[k]));
  };

  return (
    <figure className="compare">
      <div className="ba" style={{ '--pos': `${pos}%` } as CSSProperties}>
        <img className="ba-img" src={s.after} alt={`${s.alt}, logo removed`} width={800} height={450} />
        <img className="ba-img ba-before" src={s.before} alt={`${s.alt}, with the logo`} width={800} height={450} />
        <span className="ba-tag ba-tag-l" data-hide={pos < 14 || undefined}>Before</span>
        <span className="ba-tag ba-tag-r" data-hide={pos > 86 || undefined}>After</span>
        <span className="ba-line" aria-hidden="true">
          <span className="ba-knob">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5" /></svg>
          </span>
        </span>
        <input
          className="ba-range"
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={pos}
          aria-label="Drag to compare before and after"
          onChange={(e) => { touched.current = true; setPos(+e.target.value); }}
          onPointerDown={() => { touched.current = true; }}
        />
      </div>
      <figcaption className="compare-bar">
        <div className="chips" role="group" aria-label="Choose a sample">
          {SAMPLES.map((x, k) => (
            <button key={x.id} type="button" className="chip-btn" aria-pressed={k === i} onClick={() => pick(k)}>
              <span className="chip-kind">{x.kind}</span> {x.label}
            </button>
          ))}
        </div>
        <span className="compare-note">Real output, unretouched · drag to compare</span>
      </figcaption>
    </figure>
  );
}
