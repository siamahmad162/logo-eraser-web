import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADS, type AdPlace, type AdUnit } from '../site';
import { adsOn, demoOn, frameDoc, hasCode, loadSiteScripts, mayShow, onConsent, previewing, whenToolFree, type Allow } from '../ads';

// The one ad box. It reserves its size before anything arrives (the page never jumps), says "Advertisement", and only starts
// the ad when it is near the screen, the visitor allows it (and, for most places, no file is being cleaned).
// Without code it renders nothing. Which places exist, and where, is decided by the page layouts; the sizes by ADS in site.ts.
function usePreview() {
  const [on, set] = useState(false);
  useEffect(() => { if (previewing()) set(true); }, []);
  return on;
}
export const usePreviewFlag = usePreview;
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

type UnitProps = { unit: AdUnit; className: string; place: string; busyOk?: boolean; when?: string };
function Unit({ unit, className, place, busyOk, when }: UnitProps) {
  const box = useRef<HTMLDivElement>(null);
  const allowed = useAllowed();
  const shown = useMatch(when || 'all', true);        // a place that is hidden by the layout (a rail on a small screen) is not started
  const [started, setStarted] = useState(false);
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    if (allowed !== 'yes' || !shown || !box.current) return;
    let stopped = false;
    const start = async () => { await loadSiteScripts(); if (!busyOk) await whenToolFree(); if (!stopped) setStarted(true); };
    if (typeof IntersectionObserver === 'undefined') { start(); return () => { stopped = true; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px 0px' });
    io.observe(box.current);
    return () => { stopped = true; io.disconnect(); };
  }, [allowed, shown, busyOk]);
  // a frame that stays blank (a blocker, no ad to show) gives its space back after a while
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => { const f = box.current?.querySelector('iframe'); if (!f) setEmpty(true); }, 12000);
    return () => clearTimeout(t);
  }, [started]);
  if (allowed === 'no') return null;
  return (
    <aside className={className} aria-label="Advertisement" data-empty={empty || undefined} data-place={place}>
      <span className="ad-label">Advertisement</span>
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

// A demo ad: stands in for a unit that has no code yet. It is plainly labelled, cannot be clicked and is hidden from
// screen readers and search snippets, so nobody mistakes it for the real thing.
function Demo({ w, h }: { w: number; h: number }) {
  const shape = w / h >= 4 ? 'wide' : h / w >= 2 ? 'tall' : w <= 360 && h <= 130 ? 'phone' : 'rect';
  return (
    <div className="demo-ad" data-shape={shape} style={{ width: w, height: h }} aria-hidden="true">
      <span className="demo-chip">Demo ad</span>
      <span className="demo-ico" />
      <span className="demo-text"><b>Your ad could be here</b><i>{w}×{h} · the real ad takes this spot</i></span>
      <span className="demo-cta">Learn more</span>
    </div>
  );
}
function DemoBox({ className, w, h, place }: { className: string; w: number; h: number; place: string }) {
  return (
    <aside className={className} aria-label="Demo advertisement space" data-place={place} data-demo>
      <span className="ad-label">Demo ad space</span>
      <div className="ad-box" style={{ width: w, height: h }} data-nosnippet><Demo w={w} h={h} /></div>
    </aside>
  );
}

// ---- a horizontal ad inside a page ----
export function AdSlot({ place }: { place: AdPlace }) {
  const preview = usePreview();
  const phone = useMatch('(max-width: 759px)');
  const d = ADS.banner.desktop, p = ADS.banner.phone;
  if (!ADS.places[place]) return null;
  const live = adsOn() && (hasCode(d) || hasCode(p));
  if (live) {
    const unit = phone ? (hasCode(p) ? p : d) : (hasCode(d) ? d : p);
    return <Unit unit={unit} className="ad ad-banner" place={place} />;
  }
  const w = phone ? p.width : d.width, h = phone ? p.height : d.height;
  if (demoOn()) return <DemoBox className="ad ad-banner" place={place} w={w} h={h} />;
  if (preview) return <Preview className="ad ad-banner" place={place} w={w} h={h} text={'Ad space · ' + place + ' · ' + w + '×' + h} />;
  return null;
}

// ---- the 300x250 box: in a tool's file list, and beside the text of a guide ----
export const rectLive = () => adsOn() && hasCode(ADS.rect);
export function AdRect({ place }: { place: 'welcome' | 'work' | 'side' }) {
  const preview = usePreview();
  if (!ADS.places[place]) return null;
  const u = ADS.rect;
  if (rectLive()) return <Unit unit={u} className="ad ad-rect" place={place} busyOk={place !== 'side' && ADS.workWhileBusy} when={place === 'side' ? '(min-width: 1100px)' : undefined} />;
  if (demoOn()) return <DemoBox className="ad ad-rect" place={place} w={u.width} h={u.height} />;
  if (preview) return <Preview className="ad ad-rect" place={place} w={u.width} h={u.height} text={'Ad space · ' + place + ' · ' + u.width + '×' + u.height} />;
  return null;
}
// the tool has a spot for it beside the drop zone (#adWelcome) and in the file list (#adWork); they are filled once the tool is on the page
export function WorkAd({ root }: { root: HTMLElement | null }) {
  const [hosts, setHosts] = useState<{ welcome: Element | null; work: Element | null }>({ welcome: null, work: null });
  useEffect(() => { setHosts({ welcome: root ? root.querySelector('#adWelcome') : null, work: root ? root.querySelector('#adWork') : null }); }, [root]);
  const preview = usePreview();
  if (!(rectLive() || demoOn() || preview)) return null;
  return (
    <>
      {hosts.welcome && createPortal(<AdRect place="welcome" />, hosts.welcome)}
      {hosts.work && createPortal(<AdRect place="work" />, hosts.work)}
    </>
  );
}
// does the page have room for a sidebar? (decided by the build, so nothing moves when the page loads)
export const sideOn = () => (rectLive() || demoOn()) && ADS.places.side;

// ---- the two vertical ads on the sides of every page (wide screens only) ----
const railWidth = () => Math.max(hasCode(ADS.rail.left) ? ADS.rail.left.width : 0, hasCode(ADS.rail.right) ? ADS.rail.right.width : 0);
// Room the page itself needs (the tool docks its inspector beside the file list from 960 px), then the rails: one on the right
// from there, both when there is room for two.
const PAGE = 960, GAP = 12, PAD = 32;
export function useRails() {
  const preview = usePreview();
  const live = adsOn() && railWidth() > 0;
  const width = Math.max(ADS.rail.left.width, ADS.rail.right.width);
  const one = PAGE + width + GAP + PAD, both = PAGE + 2 * (width + GAP) + PAD;
  return { on: ADS.rails && (live || demoOn() || preview) && width > 0, width, one, both, preview, live };
}
export function AdRail({ side, width, one, both, preview }: { side: 'left' | 'right'; width: number; one: number; both: number; preview: boolean }) {
  const unit = ADS.rail[side];
  const live = adsOn() && hasCode(unit);
  const when = `(min-width: ${side === 'left' ? both : one}px)`;
  return (
    <div className={'rail rail-' + side} aria-hidden={live ? undefined : true}>
      <div className="rail-in" style={{ width }}>
        {live
          ? <Unit unit={unit} className="ad ad-rail" place={'rail-' + side} when={when} />
          : demoOn() ? <DemoBox className="ad ad-rail" place={'rail-' + side} w={unit.width} h={unit.height} />
          : preview ? <Preview className="ad ad-rail" place={'rail-' + side} w={unit.width} h={unit.height} text={'Ad space · ' + side + ' · ' + unit.width + '×' + unit.height} /> : null}
      </div>
    </div>
  );
}
