import { useState } from 'react';
import { Link, useRouter } from '../router';
import { SITE } from '../site';
import { TOOL_PATHS } from '../content/tools';
import { Close, LogoMark, Menu } from './Icons';
import { ToolsMenu } from './ToolsMenu';

const NAV = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/guides', label: 'Guides' },
  { to: '/faq', label: 'FAQ' },
];

export function Header() {
  const { path } = useRouter();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link to="/" className="brand" onClick={close}>
          <LogoMark className="brand-mark" />
          <span>{SITE.name}</span>
        </Link>
        <button type="button" className="menu-btn" aria-expanded={open} aria-controls="site-nav" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>
          {open ? <Close /> : <Menu />}
        </button>
        <nav id="site-nav" className={open ? 'nav is-open' : 'nav'} aria-label="Main">
          <ToolsMenu onNavigate={close} />
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="nav-link" aria-current={path === n.to || (n.to === '/guides' && path.startsWith('/guides/')) ? 'page' : undefined} onClick={close}>
              {n.label}
            </Link>
          ))}
          {!TOOL_PATHS.includes(path) && (
            <Link to="/tools" className="btn btn-primary btn-sm nav-cta" onClick={close}>
              Open a tool
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
