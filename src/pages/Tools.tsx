import { AdSlot } from '../components/AdSlot';
import { ToolShowcase } from '../components/ToolShowcase';
import { TOOLS } from '../content/tools';
import { Link } from '../router';
import { ArrowRight } from '../components/Icons';
import { ToolIcon } from '../components/ToolIcon';
import { JsonLd, abs } from '../components/Seo';
import { SITE } from '../site';

const CHOOSE: [string, string][] = [
  ['A video or a photo from Gemini, or a Veo video', '/app'],
  ['A video from Sora', '/sora-watermark-remover'],
  ['A logo, badge or date stamp in another video', '/remove-logo-from-video'],
  ['A logo or watermark in a photo', '/remove-logo-from-photo'],
];

export function Tools() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>All tools</h1>
          <p className="lede">Four removers, one for each kind of logo. They all run in your browser, so nothing is uploaded. Pick the one that matches your file.</p>
        </div>
      </section>
      <section className="section section-tight" aria-labelledby="which">
        <div className="wrap">
          <h2 id="which" className="section-title">Which one do I need?</h2>
          <ul className="choose" data-reveal>
            {CHOOSE.map(([q, to]) => {
              const t = TOOLS.find((x) => x.path === to)!;
              return (
                <li key={to}>
                  <Link to={to} className="choose-item">
                    <ToolIcon id={t.id} className="choose-ico" />
                    <span className="choose-q">{q}</span>
                    <span className="choose-a">{t.name} <ArrowRight /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
      <AdSlot place="tools1" />

      <section className="section section-tight" aria-labelledby="examples">
        <div className="wrap">
          <h2 id="examples" className="section-title">Examples, before and after</h2>
          <p className="section-lede">Move across a picture to compare the original with the result.</p>
          <ToolShowcase />
        </div>
      </section>
      <AdSlot place="tools2" />

      <section className="section section-tight" aria-labelledby="common">
        <div className="wrap">
          <div className="section-head">
            <h2 id="common" className="section-title">What they have in common</h2>
            <p className="section-lede">Your files stay on your device: videos and photos are opened, cleaned and saved by your browser, so there is no upload and no waiting in a queue. Size, frame rate and sound are kept. Use them on content you made or have the right to edit, and read how the <Link to="/how-it-works">removers work</Link> to know what to expect from each.</p>
          </div>
        </div>
      </section>
      <JsonLd data={{
        '@context': 'https://schema.org', '@type': 'ItemList', name: `${SITE.name} tools`,
        itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: abs(t.path) })),
      }} />
    </>
  );
}
