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
  ['A video from Gemini, with the sparkle in the corner', '/gemini-omni-watermark-remover'],
  ['A Veo clip, with the “Veo” text or the sparkle', '/veo-watermark-remover'],
  ['An image from Gemini, with the sparkle in the corner', '/gemini-photo-watermark-remover'],
];

const TOOLS_FAQ: Qa[] = [
  { id: 'tools-which', q: 'Which watermark remover should I use?', a: <p>Use the <Link to="/gemini-omni-watermark-remover">Gemini Omni watermark remover</Link> for a Gemini video, the <Link to="/veo-watermark-remover">Veo watermark remover</Link> for a Veo clip (it removes the text mark and the sparkle), and the <Link to="/gemini-photo-watermark-remover">Gemini photo watermark remover</Link> for a Gemini image.</p> },
  { id: 'tools-diff', q: 'What is the difference between the three?', a: <p>They run the same engine and find the logo by themselves. What differs is the file: the first two take videos (a video is cleaned frame by frame, and Veo clips can carry a text mark as well as the sparkle), and the third takes images (one picture, so the sparkle is fitted to it and reversed).</p> },
  { id: 'tools-restore', q: 'Why is the picture restored instead of covered up?', a: <p>The sparkle is see-through, so the real picture is still in every frame, only blended with white. Reversing that blend gives the real pixels back, which a blur or a patch cannot. Where a mark is fully solid there is nothing to recover, and those few pixels are filled in from around them.</p> },
  { id: 'tools-free', q: 'Are the tools free, and are my files uploaded?', a: <p>All three tools are free with no sign-up and no limit on files. Everything runs in your browser, so your videos and images never leave your device.</p> },
  { id: 'tools-files', q: 'Which videos and images can I use?', a: <p>Videos: MP4, MOV, WebM and MKV. Images: PNG, JPG and WebP. A recent Chrome or Edge on a computer works best.</p> },
  { id: 'tools-allowed', q: 'Can I remove any watermark?', a: <p>Only from videos and images you made or have the right to edit. Read our <Link to="/guides/label-ai-generated-content">guide to labelling AI content</Link> and our <Link to="/terms">Terms</Link>.</p> },
];

export function Tools() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>All tools</h1>
          <p className="lede">Three removers, one for each kind of file: Gemini videos, Veo clips and Gemini images. They all run in your browser, so nothing is uploaded. Pick the one that matches your file.</p>
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
