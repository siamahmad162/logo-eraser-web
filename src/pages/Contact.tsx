import { useState, type FormEvent } from 'react';
import { Breadcrumbs } from '../components/Seo';
import { Check } from '../components/Icons';
import { Link } from '../router';
import { SITE } from '../site';

// Messages go to Web3Forms, which mails them to us. The access key is meant to sit in the page (it only allows sending to us).
const FORM_URL = 'https://api.web3forms.com/submit';
const ACCESS_KEY = 'a52d6bc8-86d1-4747-aa55-46c4b54c8fdc';
type Sent = 'idle' | 'sending' | 'sent' | 'error';

function ContactForm() {
  const [state, setState] = useState<Sent>('idle');
  const [note, setNote] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setState('sending'); setNote('');
    try {
      const res = await fetch(FORM_URL, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) { setState('sent'); form.reset(); }
      else { setState('error'); setNote(typeof data.message === 'string' && data.message ? data.message : 'The message could not be sent.'); }
    } catch {
      setState('error'); setNote('The message could not be sent. Check your connection and try again.');
    }
  }
  if (state === 'sent') {
    return (
      <div className="cf-done" role="status">
        <span className="cf-done-icon"><Check /></span>
        <h2>Message sent</h2>
        <p>Thank you. We usually reply within one or two working days, to the email address you gave.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setState('idle')}>Send another message</button>
      </div>
    );
  }
  return (
    <form className="cf" action={FORM_URL} method="POST" onSubmit={submit}>
      <input type="hidden" name="access_key" value={ACCESS_KEY} />
      <input type="hidden" name="subject" value={`New message from ${SITE.name}`} />
      <input type="hidden" name="from_name" value={`${SITE.name} contact form`} />
      <input type="checkbox" name="botcheck" className="cf-bot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <div className="cf-row">
        <label className="cf-field">
          <span>Your name</span>
          <input type="text" name="name" required autoComplete="name" placeholder="Jane Doe" maxLength={120} />
        </label>
        <label className="cf-field">
          <span>Email</span>
          <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" maxLength={160} />
        </label>
      </div>
      <label className="cf-field">
        <span>What is it about?</span>
        <select name="topic" defaultValue="Help with a file">
          <option>Help with a file</option>
          <option>Ads and privacy</option>
          <option>Business and press</option>
          <option>Something else</option>
        </select>
      </label>
      <label className="cf-field">
        <span>Message</span>
        <textarea name="message" required rows={6} placeholder="Tell us what happened: your browser, the file type and what you see." maxLength={4000} />
      </label>
      <div className="cf-foot">
        <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'}</button>
        <p className="cf-note">Please don’t attach or paste files you aren’t allowed to share.</p>
      </div>
      {state === 'error' && <p className="cf-error" role="alert">{note.replace(/[.!\s]+$/, '')}. You can also write to {SITE.supportEmail}.</p>}
    </form>
  );
}

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
          <div className="cf-card">
            <div className="cf-head">
              <h2>Send us a message</h2>
              <p>Fill in the form and it reaches us directly. No account needed.</p>
            </div>
            <ContactForm />
          </div>
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
              <h2>Your files stay with you</h2>
              <p>Cleaning runs inside your browser, so we never receive your videos or photos and can’t look at them. That is why a description and a screenshot are the best way to show us a problem.</p>
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
