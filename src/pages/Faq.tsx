import { AdSlot } from '../components/AdSlot';
import { FAQ, FaqList } from '../faq';
import { SITE } from '../site';

const GROUPS = [
  { id: 'faq-what', title: 'What the watermark remover does', ids: ['which-watermarks', 'clean', 'quality'] },
  { id: 'faq-files', title: 'Files, browsers and speed', ids: ['formats', 'speed'] },
  { id: 'faq-privacy', title: 'Privacy: are my files uploaded?', ids: ['upload'] },
  { id: 'faq-rules', title: 'Rules, cost and who makes it', ids: ['allowed', 'free', 'google'] },
];

export function Faq() {
  return (
    <>
      <section className="page-head">
        <div className="wrap narrow">
          <h1>Watermark remover FAQ: files, privacy and cost</h1>
          <p className="lede">Can’t find an answer? Write to <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.</p>
        </div>
      </section>
      {GROUPS.map((g) => (
        <section key={g.title} className="section section-tight" aria-labelledby={g.id}>
          <div className="wrap narrow">
            <h2 id={g.id} className="section-title">{g.title}</h2>
            <FaqList items={g.ids.map((id) => FAQ.find((q) => q.id === id)!)} />
          </div>
        </section>
      ))}
      <AdSlot place="faq1" />
    </>
  );
}
