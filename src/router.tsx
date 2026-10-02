import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { metaFor, normalizePath } from './routes';

// A small router: the site has a handful of static pages, each prerendered to its own HTML file.
// The single-file test build (`npm run build:file`) opens from disk, where there are no paths to
// route on, so it keeps the page in the hash instead (#/pricing).
const HASH = import.meta.env.MODE === 'file';

type Ctx = { path: string; navigate: (to: string) => void };
const RouterContext = createContext<Ctx>({ path: '/', navigate: () => {} });
export const useRouter = () => useContext(RouterContext);

export const currentPath = () => normalizePath(HASH ? (location.hash.startsWith('#/') ? location.hash.slice(1) : '/') : location.pathname);
const hrefFor = (to: string) => (HASH ? '#' + to : to);

// A page can veto in-app navigation (the tool asks before abandoning a running job).
let leaveGuard: (() => boolean) | null = null;
export function setLeaveGuard(fn: (() => boolean) | null) { leaveGuard = fn; }

function scrollToHash(hash: string) {
  const el = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (el) el.scrollIntoView();
  else window.scrollTo(0, 0);
}

function applyMeta(path: string) {
  const m = metaFor(path);
  document.title = m.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', m.description);
}

export function Router({ initialPath, children }: { initialPath: string; children: ReactNode }) {
  const [path, setPath] = useState(normalizePath(initialPath));
  useEffect(() => {
    const sync = () => {
      // in hash mode an in-page anchor (#main) is not a page change
      if (HASH && location.hash && !location.hash.startsWith('#/')) return;
      const p = currentPath();
      setPath(p);
      applyMeta(p);
      if (HASH) window.scrollTo(0, 0);
    };
    const ev = HASH ? 'hashchange' : 'popstate';
    addEventListener(ev, sync);
    return () => removeEventListener(ev, sync);
  }, []);
  const navigate = useCallback((to: string) => {
    if (HASH) {
      const next = normalizePath(to.split('#')[0]);
      if (next !== currentPath() && leaveGuard && !leaveGuard()) return;
      location.hash = next;
      return;
    }
    const url = new URL(to, location.href);
    const next = normalizePath(url.pathname);
    if (next !== currentPath() && leaveGuard && !leaveGuard()) return;
    if (next === currentPath() && url.hash) {
      history.pushState(null, '', url.pathname + url.search + url.hash);
      scrollToHash(url.hash);
      return;
    }
    history.pushState(null, '', url.pathname + url.search + url.hash);
    setPath(next);
    applyMeta(next);
    requestAnimationFrame(() => scrollToHash(url.hash));
  }, []);
  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };
export function Link({ to, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={hrefFor(to)} onClick={handle} {...rest} />;
}
