import { useEffect, useState } from 'react';
import { asksFirst, consent, onConsent, setConsent } from '../ads';
import { SITE } from '../site';
import { Link } from '../router';

// Where visitors have to be asked first, ads that use cookies wait for a yes. A "no" keeps the site exactly as it is, without ads.
export function ConsentBar() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => setOpen(asksFirst() && consent() === null); f(); return onConsent(f); }, []);
  if (!open) return null;
  return (
    <div className="consent" role="dialog" aria-label="Ads">
      <p><b>{SITE.name} is free, paid for by ads.</b> Ads may use cookies. Allow them? If you say no, everything works the same, without ads. <Link to="/privacy">Privacy Policy</Link></p>
      <div className="consent-row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setConsent('yes')}>Allow ads</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConsent('no')}>No thanks</button>
      </div>
    </div>
  );
}
