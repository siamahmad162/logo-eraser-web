import { LANDINGS } from '../content/meta';
import { Link } from '../router';
import { SITE } from '../site';
import { LogoMark } from './Icons';

const USE_CASES: Record<string, string> = {
  '/gemini-watermark-remover': 'Gemini watermark remover',
  '/veo-watermark-remover': 'Veo watermark remover',
  '/ai-image-watermark-remover': 'AI image watermark remover',
};

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand"><LogoMark className="brand-mark" /><span>{SITE.name}</span></Link>
          <p>Frame-by-frame watermark removal for AI videos and photos. Runs in your browser; your files never leave your device.</p>
          <a className="footer-mail" href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link to="/tools">All tools</Link>
          <Link to="/app">Gemini &amp; Veo remover</Link>
          <Link to="/sora-watermark-remover">Sora watermark remover</Link>
          <Link to="/remove-logo-from-video">Video logo remover</Link>
          <Link to="/remove-logo-from-photo">Photo logo remover</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/faq">FAQ</Link>
        </nav>
        <nav aria-label="Use cases">
          <h2>Use cases</h2>
          {LANDINGS.map((l) => <Link key={l.path} to={l.path}>{USE_CASES[l.path] || l.title}</Link>)}
        </nav>
        <nav aria-label="Resources">
          <h2>Resources</h2>
          <Link to="/guides">Guides</Link>
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/refunds">Refund Policy</Link>
        </nav>
      </div>
      <div className="wrap">
        <div className="footer-base">
          <p>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> {SITE.operator}. All rights reserved.</p>
          <p>{SITE.name} is an independent tool and is not affiliated with or endorsed by Google. Gemini and Veo are trademarks of Google LLC and Sora is a trademark of OpenAI, mentioned only to describe compatibility.</p>
        </div>
      </div>
    </footer>
  );
}
