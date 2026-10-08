import { Link } from '../router';
import { SITE } from '../site';
import { USE_CASES } from '../content/tools';
import { ArrowRight, ArrowUp, Lock, Mail, Stack, Check, LogoMark } from './Icons';
import { ToolIcon } from './ToolIcon';
import { asksFirst, setConsent } from '../ads';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-cta">
          <div>
            <h2>Got a watermark to remove?</h2>
            <p>Free, no sign-up, and your files never leave your device.</p>
          </div>
          <div className="footer-cta-actions">
            <Link to="/tools" className="btn btn-primary">Open the tools <ArrowRight /></Link>
            <Link to="/how-it-works" className="btn btn-ghost">How it works</Link>
          </div>
        </div>
      </div>
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link to="/" className="brand"><LogoMark className="brand-mark" /><span>{SITE.name}</span></Link>
          <p>Free watermark and logo removal for videos and photos. Runs in your browser; your files never leave your device.</p>
          <ul className="footer-badges" aria-label="Highlights">
            <li><Check /> Free</li>
            <li><Lock /> Stays on your device</li>
            <li><Stack /> Batches and folders</li>
          </ul>
          <a className="footer-mailbtn" href={`mailto:${SITE.supportEmail}`}><Mail /> {SITE.supportEmail}</a>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link to="/tools" className="fl"><span>All tools</span><ArrowRight /></Link>
          <Link to="/how-it-works" className="fl"><span>How it works</span><ArrowRight /></Link>
          <Link to="/faq" className="fl"><span>FAQ</span><ArrowRight /></Link>
          <Link to="/guides" className="fl"><span>Guides</span><ArrowRight /></Link>
        </nav>
        <nav aria-label="Use cases">
          <h2>Use cases</h2>
          {USE_CASES.map((u) => (
            <Link key={u.path} to={u.path} className="fl fl-uc">
              <i className="fl-ic">{u.icon === 'overview' ? <Stack /> : <ToolIcon id={u.icon} />}</i><span>{u.name}<small>{u.note}</small></span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Resources">
          <h2>Resources</h2>
          <Link to="/about" className="fl"><span>About</span><ArrowRight /></Link>
          <Link to="/contact" className="fl"><span>Contact</span><ArrowRight /></Link>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <Link to="/terms" className="fl"><span>Terms of Service</span><ArrowRight /></Link>
          <Link to="/privacy" className="fl"><span>Privacy Policy</span><ArrowRight /></Link>
          {asksFirst() && <button type="button" className="fl footer-link-btn" onClick={() => setConsent(null)}><span>Ad choices</span></button>}
        </nav>
      </div>
      <div className="wrap">
        <div className="footer-base">
          <div className="footer-base-text">
            <p>© <span suppressHydrationWarning>{new Date().getFullYear()}</span> {SITE.operator}. All rights reserved.</p>
            <p>{SITE.name} is an independent tool and is not affiliated with or endorsed by Google. Gemini and Veo are trademarks of Google LLC, mentioned only to describe compatibility.</p>
          </div>
          <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp /> Back to top</button>
        </div>
      </div>
    </footer>
  );
}
