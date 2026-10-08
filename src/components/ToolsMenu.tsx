import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useRouter } from '../router';
import { TOOLS, USE_CASES } from '../content/tools';
import { ArrowRight, ChevronDown, Stack } from './Icons';
import { ToolIcon } from './ToolIcon';

// A header entry that opens a panel. On a wide screen the panel drops down; in the phone menu it opens in place.
function Dropdown({ id, label, active, wide, children }: { id: string; label: string; active: boolean; wide?: boolean; children: (go: () => void) => ReactNode }) {
  const { path } = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // a click elsewhere closes a dropped-down panel; the in-place list of the phone menu stays, or the page would shift under the tap
    const away = (e: Event) => {
      const panel = box.current && box.current.querySelector('.tm-panel');
      if (box.current && !box.current.contains(e.target as Node) && panel && getComputedStyle(panel).position === 'absolute') setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="tm" ref={box}>
      <button type="button" className="nav-link tm-btn" aria-expanded={open} aria-haspopup="true" aria-controls={id} aria-current={active ? 'page' : undefined} onClick={() => setOpen(!open)}>
        {label} <ChevronDown className="tm-chev" />
      </button>
      <div id={id} className={wide ? 'tm-panel' : 'tm-panel tm-panel-sm'} hidden={!open}>{children(() => setOpen(false))}</div>
    </div>
  );
}

// "Tools": the three removers, with what each takes and how it finds the logo.
export function ToolsMenu({ onNavigate }: { onNavigate: () => void }) {
  const { path } = useRouter();
  const onTool = TOOLS.some((t) => t.path === path) || path === '/tools';
  return (
    <Dropdown id="tools-menu" label="Tools" active={onTool} wide>
      {(close) => {
        const go = () => { close(); onNavigate(); };
        return (
          <ul className="tm-list">
            {TOOLS.map((t) => (
              <li key={t.id}>
                <Link to={t.path} className="tm-item" aria-current={path === t.path ? 'page' : undefined} onClick={go}>
                  <ToolIcon id={t.id} className="tm-ico" />
                  <span className="tm-text"><b>{t.name}</b><span>{t.short}</span></span>
                  <span className="tm-tags"><i>{t.files}</i><i>{t.how}</i></span>
                </Link>
              </li>
            ))}
            <li><Link to="/tools" className="tm-all" onClick={go}>All tools and examples <ArrowRight /></Link></li>
          </ul>
        );
      }}
    </Dropdown>
  );
}

// "Use cases": the Gemini overview and one page per use, the same list the footer shows.
export function UseCasesMenu({ onNavigate }: { onNavigate: () => void }) {
  const { path } = useRouter();
  return (
    <Dropdown id="usecases-menu" label="Use cases" active={USE_CASES.some((u) => u.path === path)}>
      {(close) => {
        const go = () => { close(); onNavigate(); };
        return (
          <ul className="tm-list">
            {USE_CASES.map((u) => (
              <li key={u.path}>
                <Link to={u.path} className="tm-item tm-item-uc" aria-current={path === u.path ? 'page' : undefined} onClick={go}>
                  {u.icon === 'overview' ? <Stack className="tm-ico" /> : <ToolIcon id={u.icon} className="tm-ico" />}
                  <span className="tm-text"><b>{u.name}</b><span>{u.note}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        );
      }}
    </Dropdown>
  );
}
