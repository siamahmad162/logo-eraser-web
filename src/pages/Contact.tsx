import { Breadcrumbs } from '../components/Seo';
import { Link } from '../router';
import { SITE } from '../site';

export function Contact() {
  const mail = <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>;
  return (
    <>
      <section className="page-head">
        <div className="wrap narrow">
          <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: '/contact', label: 'Contact' }]} />
          <h1>Contact {SITE.name}</h1>
          <p className="lede">Email {mail}. We usually reply within one or two working days.</p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="wrap narrow">
          <div className="contact-grid">
            <div className="contact-card">
              <h2>Help with a file</h2>
              <p>Tell us your browser and computer, the file type and resolution, and what you see. A screenshot of the result helps a lot. Please don’t send files you aren’t allowed to share.</p>
            </div>
            <div className="contact-card">
              <h2>Ads and privacy</h2>
              <p>{SITE.name} is free and supported by ads. If an ad looks wrong or unsafe, tell us what you saw and on which page. Privacy questions are answered in our <Link to="/privacy">Privacy Policy</Link>.</p>
            </div>
            <div className="contact-card">
              <h2>Business &amp; press</h2>
              <p>Teams, partnerships, integrations or interviews: put “Business” in the subject line.</p>
            </div>
            <div className="contact-card">
              <h2>Quick answers</h2>
              <p>Many questions are answered in the <Link to="/faq">FAQ</Link> and our <Link to="/guides">guides</Link>.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
