import type { ReactNode } from 'react';
import { Compare } from '../components/Compare';
import { ArrowRight } from '../components/Icons';
import { ToolCta } from '../components/Seo';
import { FAQ, FaqList } from '../faq';
import { GUIDES, LANDINGS } from '../content/meta';
import { Link } from '../router';
import { SITE } from '../site';
import { GuideCards } from './Guides';
import { STEPS } from './Home';

// Use-case pages: one per kind of watermark people search for.
type Landing = {
  eyebrow: string;
  h1: ReactNode;
  lede: string;
  sample: number;
  sections: { title: string; body: ReactNode }[];
  faq: string[];
  guides: string[];
};

const n = SITE.name;

const PAGES: Record<string, Landing> = {
  '/gemini-watermark-remover': {
    eyebrow: 'Gemini videos & images',
    h1: <>Remove the Gemini watermark from <span className="accent">videos and photos</span></>,
    lede: `The sparkle in the corner of Gemini videos and images is see-through. ${n} measures it in your file and restores the real pixels underneath, frame by frame. Nothing is uploaded.`,
    sample: 0,
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
  '/veo-watermark-remover': {
    eyebrow: 'Veo videos',
    h1: <>Remove the Veo watermark, <span className="accent">frame by frame</span></>,
    lede: `Clean the sparkle and the “Veo” text logo off Veo clips without cropping, blurring or losing quality. ${n} runs in your browser, so your clips stay on your device.`,
    sample: 1,
    sections: [
      {
        title: 'Both kinds of Veo mark',
        body: <p>Depending on where a Veo video was made, it may carry the sparkle in the corner or a small “Veo” text logo. {n} finds the sparkle by its shape, and other steady logos such as the text mark by noticing what stays still while the scene moves. If it ever misses, drag a box around the logo and {n} learns it from your video.</p>,
      },
      {
        title: 'Made for moving pictures',
        body: <p>Veo clips are full of motion: camera moves, particles, water, light. Covering the logo leaves a patch that stands still while everything else moves. Reversing the blend works on each frame from that frame’s own pixels, so whatever passes behind the logo comes through sharp.</p>,
      },
      {
        title: 'Keep the clip exactly as it was',
        body: <p>Your clip keeps its resolution, frame rate, length and audio. Maximum quality encodes at about 2.5 times the original bitrate, so the new file can’t be told apart from the original anywhere outside the logo.</p>,
      },
    ],
    faq: ['which-watermarks', 'clean', 'quality', 'formats', 'allowed'],
    guides: ['remove-gemini-watermark-from-video', 'batch-remove-watermarks', 'label-ai-generated-content'],
  },
  '/ai-image-watermark-remover': {
    eyebrow: 'AI images',
    h1: <>Remove the sparkle watermark from <span className="accent">AI images</span></>,
    lede: `Drop in a PNG, JPG or WebP. The corner logo is found, fitted to your image and reversed in seconds, with no blur and no upload.`,
    sample: 2,
    sections: [
      {
        title: 'Fitted to your image',
        body: <p>A photo has only one frame, so there is nothing to learn the logo from over time. Instead, {n} starts from the known shape of the sparkle and fits its exact position, size, sharpness and strength to your image, then reverses it on each colour channel.</p>,
      },
      {
        title: 'No quality loss',
        body: <p>Your image keeps its exact dimensions. PNGs are saved losslessly, JPEGs at 95% quality, and WebP images come back as PNG. Only the pixels inside the logo change.</p>,
      },
      {
        title: 'One image or a hundred',
        body: <p>Drop in as many images as you like, together with videos if you have them, and download everything as one ZIP when it is done.</p>,
      },
    ],
    faq: ['which-watermarks', 'clean', 'upload', 'formats', 'allowed'],
    guides: ['blur-crop-or-restore', 'visible-watermark-vs-synthid', 'batch-remove-watermarks'],
  },
};

export function Landing({ path }: { path: string }) {
  const p = PAGES[path];
  const others = LANDINGS.filter((l) => l.path !== path);
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{p.eyebrow}</p>
            <h1 className="h1-long">{p.h1}</h1>
            <p className="lede">{p.lede}</p>
            <div className="cta-row">
              <Link to="/app" className="btn btn-primary btn-lg">Remove it now — free <ArrowRight /></Link>
              <Link to="/how-it-works" className="btn btn-ghost btn-lg">How it works</Link>
            </div>
            <ul className="trust">
              <li>No upload</li>
              <li>Same resolution &amp; frame rate</li>
              <li>Audio untouched</li>
            </ul>
          </div>
          <Compare initial={p.sample} />
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap">
          <div className="explain">
            {p.sections.map((s) => (
              <div key={s.title} className="explain-item">
                <h2>{s.title}</h2>
                {s.body}
              </div>
            ))}
          </div>
        </div>
      </section>

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
          <ToolCta title="Ready when you are" />
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="questions">
        <div className="wrap narrow">
          <h2 id="questions" className="section-title">Questions</h2>
          <FaqList items={p.faq.map((id) => FAQ.find((q) => q.id === id)!)} />
        </div>
      </section>

      <section className="section" aria-labelledby="read">
        <div className="wrap">
          <h2 id="read" className="section-title">Read next</h2>
          <GuideCards items={p.guides.map((s) => GUIDES.find((g) => g.slug === s)!)} />
          <p className="also">
            Also: {others.map((o, k) => (
              <span key={o.path}>{k > 0 && ' · '}<Link to={o.path}>{o.title}</Link></span>
            ))}
          </p>
        </div>
      </section>
    </>
  );
}
