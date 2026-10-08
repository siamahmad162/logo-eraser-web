import { AdSlot } from '../components/AdSlot';
import type { ReactNode } from 'react';
import { MediaCompare } from '../components/MediaCompare';
import { CLIPS, type Demo } from '../media';
import { ArrowRight, Check } from '../components/Icons';
import { ToolCta } from '../components/Seo';
import { FAQ, FaqList } from '../faq';
import { GUIDES } from '../content/meta';
import { TOOLS } from '../content/tools';
import { Link } from '../router';
import { SITE } from '../site';
import { GuideCards } from './Guides';
import { STEPS } from './Home';

// Use-case pages: one per kind of watermark people search for.
type Landing = {
  eyebrow: string;
  h1: ReactNode;
  lede: string;
  demo: Demo;
  sections: { title: string; body: ReactNode }[];
  faq: string[];
  guides: string[];
};

const n = SITE.name;

const PAGES: Record<string, Landing> = {
  '/gemini-watermark-remover': {
    eyebrow: 'Gemini videos & images',
    h1: <>Remove the Gemini watermark from <span className="grad">videos and photos</span></>,
    lede: `The sparkle in the corner of Gemini videos and images is see-through. ${n} measures it in your file and restores the real pixels underneath, frame by frame. Nothing is uploaded.`,
    demo: CLIPS.G_GARDEN,
    sections: [
      {
        title: 'What the Gemini watermark is',
        body: <p>Gemini marks generated videos and images with a small four-pointed sparkle near the bottom-right corner. It is white and partly transparent, always the same shape, and on video it stays in exactly the same spot in every frame. That makes it ideal for exact removal: the shape is known, the transparency can be measured, and every frame can be corrected the same way.</p>,
      },
      {
        title: 'Restored, not covered up',
        body: <p>Instead of blurring the corner or inventing new pixels, {n} reverses the blend between the logo and your picture. The detail that was always there comes back: moving backgrounds stay sharp, and there is no smudge or flicker. <Link to="/how-it-works">See how it works</Link>.</p>,
      },
      {
        title: 'Same video, minus the logo',
        body: <p>Resolution, frame rate and the number of frames stay exactly the same, and the audio is copied untouched. Images keep their size; PNGs stay lossless. Add one file or a whole folder; batch mode handles the rest.</p>,
      },
    ],
    faq: ['which-watermarks', 'clean', 'upload', 'quality', 'allowed'],
    guides: ['remove-gemini-watermark-from-video', 'blur-crop-or-restore', 'visible-watermark-vs-synthid'],
  },
};

export function Landing({ path }: { path: string }) {
  const p = PAGES[path];
  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">{p.eyebrow}</span>
            <h1 className="h1-long">{p.h1}</h1>
            <p className="lede">{p.lede}</p>
            <div className="cta-row">
              <Link to="/gemini-omni-watermark-remover" className="btn btn-primary btn-lg">Clean a video — free <ArrowRight /></Link>
              <Link to="/gemini-photo-watermark-remover" className="btn btn-ghost btn-lg">Clean an image</Link>
            </div>
            <ul className="trust">
              <li><Check /> No upload</li>
              <li><Check /> Same resolution &amp; frame rate</li>
              <li><Check /> Audio untouched</li>
            </ul>
          </div>
          <div className="product">
            <div className="product-glow" aria-hidden="true" />
            <div className="window">
              <div className="window-bar">
                <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="window-title">{p.demo.title} <em>· original vs. result</em></span>
              </div>
              <MediaCompare media={p.demo.media} logo={p.demo.logo} alt={p.demo.alt} variant="hero" zoom eager />
            </div>
            <p className="product-note">Real output, unedited. Drag the divider, or zoom in on the logo.</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="explain" data-reveal>
            {p.sections.map((s) => (
              <div key={s.title} className="explain-item">
                <h2>{s.title}</h2>
                {s.body}
              </div>
            ))}
          </div>
        </div>
      </section>

      <AdSlot place="article1" />

      <section className="section" aria-labelledby="steps">
        <div className="wrap">
          <h2 id="steps" className="section-title">Three steps</h2>
          <ol className="steps">
            {STEPS.map((s, k) => (
              <li key={s.title} className="step-card">
                <span className="step-num">{k + 1}</span>
                <s.icon className="step-icon" />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <ToolCta title="Ready when you are" to="/tools" label="Choose your remover" />
        </div>
      </section>

      <section className="section" aria-labelledby="questions">
        <div className="wrap narrow">
          <h2 id="questions" className="section-title">Questions</h2>
          <FaqList items={p.faq.map((id) => FAQ.find((q) => q.id === id)!)} />
        </div>
      </section>

      <AdSlot place="article2" />

      <section className="section" aria-labelledby="read">
        <div className="wrap">
          <h2 id="read" className="section-title">Read next</h2>
          <GuideCards items={p.guides.map((s) => GUIDES.find((g) => g.slug === s)!)} />
          <p className="also">
            The removers: {TOOLS.map((t, k) => (
              <span key={t.path}>{k > 0 && ' · '}<Link to={t.path}>{t.name}</Link></span>
            ))}
          </p>
        </div>
      </section>
    </>
  );
}
