import { useState } from 'react';
import { Link } from '../router';
import { PLANS, SITE } from '../site';
import { Check } from './Icons';

const money = (v: number) => (Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`);

export function Plans() {
  const [yearly, setYearly] = useState(false);
  const pro = PLANS.find((p) => p.id === 'pro')!;
  const save = Math.round((1 - pro.yearly / (pro.monthly * 12)) * 100);
  return (
    <div className="plans-block">
      <div className="billing" role="group" aria-label="Billing period">
        <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
        <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly <span className="save">−{save}%</span></button>
      </div>
      <div className="plans">
        {PLANS.map((p) => {
          const per = yearly ? p.yearly / 12 : p.monthly;
          return (
            <article key={p.id} className={p.highlight ? 'plan is-highlight' : 'plan'}>
              <header>
                <h3>{p.name}</h3>
                {p.highlight && <span className="plan-badge">Most popular</span>}
              </header>
              <p className="plan-blurb">{p.blurb}</p>
              <p className="price">
                <span className="price-num">{money(Math.round(per * 100) / 100)}</span>
                <span className="price-per">/ month</span>
              </p>
              <p className="price-note">{p.monthly === 0 ? 'No card needed' : yearly ? `${money(p.yearly)} billed once a year` : 'Billed monthly, cancel anytime'}</p>
              <ul className="plan-list">
                {p.features.map((f) => (<li key={f}><Check />{f}</li>))}
              </ul>
              {p.id === 'free' ? (
                <Link to="/app" className="btn btn-ghost btn-wide">Start free</Link>
              ) : SITE.paymentsLive ? (
                <Link to="/app" className="btn btn-primary btn-wide">Get {p.name}</Link>
              ) : (
                <button type="button" className="btn btn-primary btn-wide" disabled>Coming soon</button>
              )}
            </article>
          );
        })}
      </div>
      {!SITE.paymentsLive && (
        <p className="launch-note">We’re just launching: until accounts and {pro.name} go live, every feature is free to use.</p>
      )}
    </div>
  );
}
