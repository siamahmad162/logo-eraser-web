import { AdSlot } from '../components/AdSlot';
import { FAQ, FaqList } from '../faq';
import { SITE } from '../site';

export function Faq() {
  return (
    <>
      <section className="page-head">
        <div className="wrap narrow">
          <h1>Frequently asked questions</h1>
          <p className="lede">Can’t find an answer? Write to <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="wrap narrow">
          <FaqList items={FAQ} />
        </div>
      </section>
      <AdSlot place="faq1" />
    </>
  );
}
