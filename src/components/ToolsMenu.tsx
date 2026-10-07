import { useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '../router';
import { TOOLS } from '../content/tools';
import { ArrowRight, ChevronDown } from './Icons';
import { ToolIcon } from './ToolIcon';

// The "Tools" entry of the header. On a wide screen it opens a panel with the four removers; in the phone menu the
// same list is shown open, so every tool is one tap away from any page.
export function ToolsMenu({ onNavigate, inline = false }: { onNavigate: () => void; inline?: boolean }) {
  const { path } = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const onTool = TOOLS.some((t) => t.path === path) || path === '/tools';
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  useEffect(() => setOpen(false), [path]);
  const go = () => { setOpen(false); onNavigate(); };
  const list = (
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
  if (inline) return <div className="tm-inline"><span className="tm-label">Tools</span>{list}</div>;
  return (
    <div className="tm" ref={box}>
      <button type="button" className="nav-link tm-btn" aria-expanded={open} aria-haspopup="true" aria-controls="tools-menu" aria-current={onTool ? 'page' : undefined} onClick={() => setOpen(!open)}>
        Tools <ChevronDown className="tm-chev" />
      </button>
      <div id="tools-menu" className="tm-panel" hidden={!open}>{list}</div>
    </div>
  );
}
