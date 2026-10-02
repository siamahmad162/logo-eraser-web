import { Compare } from '../components/Compare';
import { ArrowRight, Download, Frames, Gauge, Lock, Photo, Scan, Stack, Text, Upload } from '../components/Icons';
import { Plans } from '../components/Plans';
import { FAQ, FaqList } from '../faq';
import { Link } from '../router';
import { SITE } from '../site';

const STEPS = [
  { icon: Upload, title: 'Drop in your files', text: 'Videos or photos, one or fifty. Nothing is uploaded: the work happens in your browser.' },
  { icon: Scan, title: 'The logo is found', text: 'The sparkle is located to the pixel, and its exact opacity is measured in your file.' },
  { icon: Download, title: 'Download clean files', text: 'Same resolution, frame rate and audio. Grab files one by one or as a single ZIP.' },
];

const FEATURES = [
  { icon: Frames, title: 'Restored, not blurred', text: 'Most removers smudge or crop the corner. The sparkle is see-through, so we reverse it frame by frame and bring back the real pixels underneath.' },
  { icon: Lock, title: 'Private by design', text: 'Your videos never leave your device. No uploads, no queues, nothing stored on our servers.' },
  { icon: Gauge, title: 'Quality kept', text: 'Resolution, frame rate and frame count stay identical. Audio is copied bit for bit.' },
  { icon: Stack, title: 'Batch mode', text: 'Process a whole folder in one go. The first video teaches the logo’s spot to the rest.' },
  { icon: Photo, title: 'Photos too', text: 'PNG, JPG and WebP images from AI generators, cleaned in a second.' },
  { icon: Text, title: 'Other logos', text: 'Handles the Veo text logo, and any steady corner logo you box in yourself.' },
];

export function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">For AI-generated videos &amp; photos</p>
            <h1>Remove the watermark. <span className="accent">Keep every pixel</span> underneath.</h1>
            <p className="lede">
              {SITE.name} finds the corner sparkle in Gemini and Veo videos and photos and restores what’s behind it, frame by frame, right in your browser.
            </p>
            <div className="cta-row">
              <Link to="/app" className="btn btn-primary btn-lg">Remove a watermark — free <ArrowRight /></Link>
              <Link to="/pricing" className="btn btn-ghost btn-lg">See pricing</Link>
            </div>
            <ul className="trust">
              <li>No upload</li>
              <li>Same resolution &amp; frame rate</li>
              <li>Audio untouched</li>
            </ul>
          </div>
          <Compare />
        </div>
      </section>

      <section className="section" aria-labelledby="how">
        <div className="wrap">
          <h2 id="how" className="section-title">How it works</h2>
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
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="why">
        <div className="wrap">
          <h2 id="why" className="section-title">Why {SITE.name}</h2>
          <p className="section-lede">Built from real AI videos, for people who publish them.</p>
          <div className="features">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature">
                <f.icon className="feature-icon" />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="pricing">
        <div className="wrap">
          <h2 id="pricing" className="section-title">Simple pricing</h2>
          <p className="section-lede">Start free. Go Pro when you need longer videos and batch mode.</p>
          <Plans />
        </div>
      </section>

      <section className="section section-alt" aria-labelledby="faq">
        <div className="wrap narrow">
          <h2 id="faq" className="section-title">Questions</h2>
          <FaqList items={FAQ.slice(0, 5)} />
          <p className="more"><Link to="/faq">All questions <ArrowRight /></Link></p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="cta-band">
            <div>
              <h2>Clean your first video in a minute.</h2>
              <p>No sign-up, no upload. Just drop it in.</p>
            </div>
            <Link to="/app" className="btn btn-primary btn-lg">Open the remover <ArrowRight /></Link>
          </div>
          <p className="fine">Use {SITE.name} only on content you have the right to edit. It removes the visible logo, not invisible watermarks such as SynthID, so label AI-generated content where required.</p>
        </div>
      </section>
    </>
  );
}
