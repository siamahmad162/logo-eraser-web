import { useEffect, useRef, useState } from 'react';
import { ADS, type AdPlace, type AdUnit } from '../site';
import { adsOn, frameDoc, hasCode, loadSiteScripts, mayShow, onConsent, previewing, whenToolFree, type Allow } from '../ads';

// The one ad box. It reserves its size before anything arrives (the page never jumps), says "Advertisement", and only starts
// the ad when it is near the screen, the visitor allows it and no file is being cleaned. Without code it renders nothing.
function usePreview() {
  const [on, set] = useState(false);
  useEffect(() => { if (previewing()) set(true); }, []);
  return on;
}
function useMatch(q: string, initial = false) {
  const [m, set] = useState(initial);
  useEffect(() => {
    const mq = matchMedia(q), f = () => set(mq.matches);
    f(); mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
// 'wait' until the page is up (the space is kept, so nothing jumps), then yes or no
function useAllowed(): Allow {
  const [ok, set] = useState<Allow>('wait');
  useEffect(() => { const f = () => set(mayShow() ? 'yes' : 'no'); f(); return onConsent(f); }, []);
  return ok;
}

function Unit({ unit, label, className, style, place }: { unit: AdUnit; label: string; className: string; style: React.CSSProperties; place: string }) {
  const box = useRef<HTMLDivElement>(null);
  const allowed = useAllowed();
  const [started, setStarted] = useState(false);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    if (allowed !== 'yes' || !box.current) return;
    let stopped = false;
    const start = async () => { await loadSiteScripts(); await whenToolFree(); if (!stopped) setStarted(true); };
    if (typeof IntersectionObserver === 'undefined') { start(); return () => { stopped = true; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px 0px' });
    io.observe(box.current);
    return () => { stopped = true; io.disconnect(); };
  }, [allowed]);
  // a frame that stays blank (a blocker, no ad to show) gives its space back after a while
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => { const f = box.current?.querySelector('iframe'); if (!f) setEmpty(true); }, 12000);
    return () => clearTimeout(t);
  }, [started]);
  if (allowed === 'no') return null;
  return (
    <aside className={className} aria-label="Advertisement" data-empty={empty || undefined} data-place={place} style={style}>
      <span className="ad-label">{label}</span>
      <div className="ad-box" ref={box} style={{ width: unit.width, height: unit.height }}>
        {started && (ADS.isolate
          ? <iframe title="Advertisement" srcDoc={frameDoc(unit)} width={unit.width} height={unit.height} scrolling="no" referrerPolicy="origin-when-cross-origin" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
          : <div className="ad-raw" ref={(el) => { if (el && !el.dataset.done) { el.dataset.done = '1'; runCode(el, unit.code); } }} />)}
      </div>
    </aside>
  );
}
// without isolation the code goes straight into the page; scripts put in with innerHTML would not run, so they are re-made
function runCode(host: HTMLElement, code: string) {
  const t = document.createElement('div'); t.innerHTML = code;
  for (const old of Array.from(t.querySelectorAll('script'))) { const s = document.createElement('script'); for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value); s.text = old.text; old.replaceWith(s); }
  host.append(...Array.from(t.childNodes));
}

function Preview({ className, w, h, text, place }: { className: string; w: number; h: number; text: string; place: string }) {
  return (
    <aside className={className} aria-label="Advertisement" data-place={place}>
      <span className="ad-label">Advertisement</span>
      <div className="ad-box ad-ph" style={{ width: w, height: h }}><span>{text}</span></div>
    </aside>
  );
}

// a horizontal ad inside a page
export function AdSlot({ place }: { place: AdPlace }) {
  const preview = usePreview();
  const phone = useMatch('(max-width: 759px)');
  const d = ADS.banner.desktop, p = ADS.banner.phone;
  const live = adsOn() && ADS.places[place] && (hasCode(d) || hasCode(p));
  if (!live && !preview) return null;
  const unit = phone ? (hasCode(p) ? p : d) : (hasCode(d) ? d : p);
  if (preview && !live) return <Preview className="ad ad-banner" place={place} w={phone ? p.width : d.width} h={phone ? p.height : d.height} text={'Ad space · ' + place + ' · ' + (phone ? p.width + '×' + p.height : d.width + '×' + d.height)} />;
  if (!hasCode(unit)) return null;
  return <Unit unit={unit} label="Advertisement" className="ad ad-banner" place={place} style={{}} />;
}

// the two vertical ads on the sides of every page (wide screens only)
export function useRails() {
  const preview = usePreview();
  const { left, right } = ADS.rail;
  const live = adsOn() && (hasCode(left) || hasCode(right));
  const w = Math.max(hasCode(left) ? left.width : 0, hasCode(right) ? right.width : 0) || (preview ? 160 : 0);
  const fits = useMatch(`(min-width: ${1200 + 2 * (w + 16) + 48}px)`);
  const allowed = useAllowed();
  return { on: (live || preview) && w > 0 && fits && !(live && !preview && allowed === 'no'), width: w, preview, live };
}
export function AdRail({ side, width, preview }: { side: 'left' | 'right'; width: number; preview: boolean }) {
  const unit = ADS.rail[side];
  const live = adsOn() && hasCode(unit);
  return (
    <div className={'rail rail-' + side} aria-hidden={live ? undefined : true}>
      <div className="rail-in" style={{ width }}>
        {live && !preview
          ? <Unit unit={unit} label="Advertisement" className="ad ad-rail" place={'rail-' + side} style={{}} />
          : preview ? <Preview className="ad ad-rail" place={'rail-' + side} w={unit.width} h={unit.height} text={'Ad space · ' + side + ' · ' + unit.width + '×' + unit.height} /> : null}
      </div>
    </div>
  );
}
