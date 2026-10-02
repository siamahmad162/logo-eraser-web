import { Plans } from '../components/Plans';
import { FAQ, FaqList } from '../faq';
import { SITE } from '../site';

export function Pricing() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>Pricing</h1>
          <p className="lede">Start free. Upgrade to {SITE.name} Pro for long videos, batch mode and ZIP downloads. Cancel anytime.</p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="wrap">
          <h2 className="sr-only">Plans</h2>
          <Plans />
          <p className="fine center">Prices in US dollars. Local taxes may be added at checkout.</p>
        </div>
      </section>
      <section className="section section-alt">
        <div className="wrap narrow">
          <h2 className="section-title">Billing questions</h2>
          <FaqList items={FAQ.filter((x) => ['cancel', 'refunds', 'upload', 'quality'].includes(x.id))} />
        </div>
      </section>
    </>
  );
}
