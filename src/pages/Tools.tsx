import { AdSlot } from '../components/AdSlot';
import { ToolShowcase } from '../components/ToolShowcase';
import { TOOLS } from '../content/tools';
import { Link } from '../router';
import { ArrowRight } from '../components/Icons';
import { ToolIcon } from '../components/ToolIcon';
import { JsonLd, abs, faqSchema } from '../components/Seo';
import { FaqList, type Qa } from '../faq';
import { SITE } from '../site';

const CHOOSE: [string, string][] = [
  ['A video or a photo from Gemini, or a Veo video', '/app'],
  ['A video from Sora', '/sora-watermark-remover'],
  ['A logo, badge or date stamp in another video', '/remove-logo-from-video'],
  ['A logo or watermark in a photo', '/remove-logo-from-photo'],
];

const TOOLS_FAQ: Qa[] = [
  { id: 'tools-which', q: 'Which watermark remover should I use?', a: <p>Use the <Link to="/app">Gemini and Veo remover</Link> for the Gemini sparkle and the Veo text mark, the <Link to="/sora-watermark-remover">Sora remover</Link> for the moving Sora watermark, the <Link to="/remove-logo-from-video">video logo remover</Link> for any other steady logo in a video, and the <Link to="/remove-logo-from-photo">photo logo remover</Link> for a logo or watermark in a photo.</p> },
  { id: 'tools-diff', q: 'What is the difference between restoring and rebuilding?', a: <p>A see-through logo such as the Gemini sparkle still lets the real picture show through, so it can be restored exactly. A solid logo hides the pixels completely, so the picture under it is rebuilt from other frames and from around it. The first is exact; the second is very good on most scenes and can look soft on fine detail.</p> },
  { id: 'tools-free', q: 'Are the tools free, and are my files uploaded?', a: <p>All four tools are free with no sign-up and no limit on files. Everything runs in your browser, so your videos and photos never leave your device.</p> },
  { id: 'tools-files', q: 'Which videos and photos can I use?', a: <p>Videos: MP4, MOV, WebM and MKV. Photos: PNG, JPG and WebP. A recent Chrome or Edge on a computer works best.</p> },
  { id: 'tools-allowed', q: 'Can I remove any watermark?', a: <p>Only from videos and photos you made or have the right to edit. Read our <Link to="/guides/label-ai-generated-content">guide to labelling AI content</Link> and our <Link to="/terms">Terms</Link>.</p> },
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
      <section className="section section-tight" aria-labelledby="tools-questions">
        <div className="wrap narrow">
          <h2 id="tools-questions" className="section-title">Questions about the tools</h2>
          <FaqList items={TOOLS_FAQ} />
        </div>
      </section>
      <JsonLd data={{
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'ItemList', name: `${SITE.name} tools`, itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: abs(t.path) })) },
          faqSchema(TOOLS_FAQ),
        ],
      }} />
    </>
  );
}
