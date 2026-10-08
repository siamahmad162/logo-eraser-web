// Ads from any company. A unit is a bit of HTML from the ad company; it runs in its own frame, so what it does stays
// out of the page. Nothing is loaded unless a unit has code, and not before the page has settled, the visitor has
// agreed (where asked), the unit is near the screen and no file is being cleaned.
import { ADS, type AdUnit } from './site';

export const adsOn = () => import.meta.env.MODE !== 'file' && [ADS.banner.desktop, ADS.banner.phone, ADS.rect, ADS.rail.left, ADS.rail.right].some((u) => !!u.code.trim());
export const hasCode = (u: AdUnit) => !!u.code.trim();
// demo ads stand in for units that have no code yet (never in the single-file test build)
export const demoOn = () => import.meta.env.MODE !== 'file' && ADS.demo;
// is there any ad space on the pages at all (real or demo)?
export const layoutOn = () => adsOn() || demoOn();
// ?ads=preview shows where the ads will go (as empty labelled boxes), whatever the settings
export const previewing = () => typeof location !== 'undefined' && /[?&]ads=preview\b/.test(location.search);

// ---------- asking first ----------
const KEY = 'cf-ads';
const read = (): 'yes' | 'no' | null => { try { const v = localStorage.getItem(KEY); return v === 'yes' || v === 'no' ? v : null; } catch { return null; } };
const write = (v: 'yes' | 'no' | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* private mode: asked again next time */ } };
// time zones in Europe (a guess about where the visitor is; the ad company's own consent tool, if it has one, is better)
const inEurope = () => { try { return /^(Europe|Atlantic\/(Reykjavik|Canary|Madeira|Faroe|Azores))/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || ''); } catch { return true; } };
export const asksFirst = () => adsOn() && (ADS.consent === 'all' || (ADS.consent === 'eu' && inEurope()));
const listeners = new Set<() => void>();
export const consent = () => read();
export const setConsent = (v: 'yes' | 'no' | null) => { write(v); listeners.forEach((f) => f()); };
export const onConsent = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
// may ads that use cookies run for this visitor right now?
export const mayShow = () => adsOn() && (!asksFirst() || read() === 'yes');
export type Allow = 'wait' | 'yes' | 'no';

// ---------- site-wide scripts ----------
let loading: Promise<void> | null = null;
export function loadSiteScripts(): Promise<void> {
  if (loading || !ADS.scripts.length) return loading || Promise.resolve();
  loading = new Promise<void>((resolve) => {
    const go = () => { let n = ADS.scripts.length; for (const src of ADS.scripts) { const s = document.createElement('script'); s.async = true; s.src = src; s.dataset.ads = '1'; s.onload = s.onerror = () => { if (--n === 0) resolve(); }; document.head.appendChild(s); } };
    let done = false;
    const once = () => { if (done) return; done = true; go(); };
    const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    const idle = () => (ric ? ric(once, { timeout: 4000 }) : setTimeout(once, 2500));
    if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
  });
  return loading;
}

// the tool says when it is busy; an ad is only started in between
export const toolBusy = () => document.documentElement.dataset.busy === '1';
export function whenToolFree(): Promise<void> {
  if (!toolBusy()) return Promise.resolve();
  return new Promise((resolve) => {
    const mo = new MutationObserver(() => { if (!toolBusy()) { mo.disconnect(); resolve(); } });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-busy'] });
  });
}

// the page that goes into a unit's frame
export function frameDoc(u: AdUnit): string {
  return '<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark}html,body{margin:0;padding:0;background:transparent;overflow:hidden}body{display:flex;justify-content:center;align-items:flex-start}</style></head><body>' + u.code + '</body></html>';
}
