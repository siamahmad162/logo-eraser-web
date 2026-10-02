import { Link } from '../router';
import { SITE } from '../site';
import { LogoMark } from './Icons';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand"><LogoMark className="brand-mark" /><span>{SITE.name}</span></Link>
          <p>Frame-by-frame watermark removal for AI videos and photos. Runs in your browser; your files never leave your device.</p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link to="/app">Watermark remover</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/faq">FAQ</Link>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/refunds">Refund Policy</Link>
        </nav>
        <div>
          <h2>Contact</h2>
          <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
        </div>
      </div>
      <div className="wrap">
        <div className="footer-base">
        <p>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> {SITE.operator}. All rights reserved.</p>
        <p>{SITE.name} is an independent tool and is not affiliated with or endorsed by Google. Gemini and Veo are trademarks of Google LLC, mentioned only to describe compatibility.</p>
        </div>
      </div>
    </footer>
  );
}
