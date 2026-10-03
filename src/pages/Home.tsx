import { Gallery } from '../components/Gallery';
import { ArrowRight, Check, Download, Frames, Gauge, Globe, Lock, Photo, Scan, Stack, Text, Upload } from '../components/Icons';
import { MediaCompare } from '../components/MediaCompare';
import { Plans } from '../components/Plans';
import { JsonLd, abs } from '../components/Seo';
import { GUIDES, LANDINGS } from '../content/meta';
import { FAQ, FaqList } from '../faq';
import { CLIPS, PHOTOS } from '../media';
import { Link } from '../router';
import { SITE } from '../site';
import { GuideCards } from './Guides';

export const STEPS = [
  { icon: Upload, title: 'Drop in your files', text: 'Videos or photos, one or fifty. Nothing is uploaded: your browser does the work.' },
  { icon: Scan, title: 'It removes the logo by itself', text: 'The sparkle or Veo mark is located to the pixel, its exact opacity is measured in your file, and every frame is restored. No button to press.' },
  { icon: Download, title: 'Download clean files', text: 'Same resolution, frame rate and audio. One by one, or everything as a single ZIP.' },
];

const STATS = [
  { value: '0 bytes', label: 'uploaded. Everything runs on your device.' },
  { value: 'Every frame', label: 'restored on its own. No blur, no crop.' },
  { value: '1 : 1', label: 'resolution, frame rate and audio kept.' },
  { value: 'Batch', label: 'whole folders in one go, one ZIP out.' },
];

const COMPARE_ROWS: [string, string, string, string][] = [
  ['Brings back the real pixels under the logo', 'yes', 'no', 'no'],
  ['No smudge, patch or flicker in moving video', 'yes', 'no', 'part'],
  ['Keeps resolution and framing', 'yes', 'part', 'yes'],
  ['Files stay on your device', 'yes', 'part', 'no'],
  ['Whole folders at once', 'yes', 'no', 'part'],
];

const SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: SITE.name, url: abs('/'), logo: abs('/favicon.svg'), email: SITE.supportEmail },
    { '@type': 'WebSite', name: SITE.name, url: abs('/') },
    {
      '@type': 'SoftwareApplication',
      name: SITE.name,
      url: abs('/app'),
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Any (runs in a web browser)',
      description: 'Removes visible AI watermarks from videos and photos by restoring the pixels under the logo, frame by frame, on your own device.',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
  ],
};

const Mark = ({ v }: { v: string }) => (
  <span className={`cmp-mark cmp-${v}`}>{v === 'yes' ? <Check /> : v === 'part' ? 'Partly' : '—'}<span className="sr-only">{v === 'yes' ? 'Yes' : v === 'part' ? 'Partly' : 'No'}</span></span>
);

export function Home() {
  const hero = CLIPS.HERO_WATCH;
  return (
    <>
      <section className="hero hero-center">
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap">
          <div className="hero-copy">
            <Link to="/veo-watermark-remover" className="pill">
              <span className="pill-dot" /> New: removes the Veo text mark too <ArrowRight />
            </Link>
            <h1>
              Remove AI watermarks.<br />
              <span className="grad">Keep every pixel.</span>
            </h1>
            <p className="lede">
              {SITE.name} finds the logo on Gemini and Veo videos and photos and restores the picture underneath, frame by frame, right in your browser.
            </p>
            <div className="cta-row">
              <Link to="/app" className="btn btn-primary btn-lg">Remove a watermark free <ArrowRight /></Link>
              <Link to="/pricing" className="btn btn-ghost btn-lg">See pricing</Link>
            </div>
            <ul className="trust">
              <li><Check /> No upload</li>
              <li><Check /> No sign-up to try</li>
              <li><Check /> Videos and photos</li>
            </ul>
          </div>
          <div className="product">
            <div className="product-glow" aria-hidden="true" />
            <div className="window">
              <div className="window-bar">
                <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="window-title">watch.mp4 <em>· original vs. {SITE.name}</em></span>
                <span className="window-live"><span className="live-dot" />Live preview</span>
              </div>
              <MediaCompare media={hero.media} logo={hero.logo} alt={hero.alt} variant="hero" zoom eager />
            </div>
            <p className="product-note">Real output, unedited. Drag the divider, or zoom in on the logo.</p>
          </div>
        </div>
      </section>

      <section className="works" aria-label="Works with">
        <div className="wrap works-row">
          <span className="works-label">Works with</span>
          <span>Gemini videos</span><span>Veo videos</span><span>Gemini images</span><span>The Veo text mark</span><span>Any steady corner logo</span>
        </div>
      </section>

      <section className="section" aria-labelledby="stats">
        <div className="wrap">
          <h2 id="stats" className="sr-only">At a glance</h2>
          <dl className="stats" data-reveal>
            {STATS.map((s) => (
              <div key={s.value} className="stat"><dt>{s.value}</dt><dd>{s.label}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="results">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Real results</span>
            <h2 id="results" className="section-title">Unedited output. See for yourself.</h2>
            <p className="section-lede">Each clip plays the original and the result side by side, frame for frame. Move across a card to compare.</p>
          </div>
          <Gallery />
        </div>
      </section>

      <section className="section" aria-labelledby="how">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">How it works</span>
            <h2 id="how" className="section-title">Three steps. No upload.</h2>
          </div>
          <ol className="steps" data-reveal>
            {STEPS.map((s, k) => (
              <li key={s.title} className="step-card">
                <span className="step-num">0{k + 1}</span>
                <s.icon className="step-icon" />
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="why">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Why {SITE.name}</span>
            <h2 id="why" className="section-title">Restored, not covered up.</h2>
            <p className="section-lede">The AI sparkle is see-through, so the real picture is still in every frame. We measure the logo in your file and undo it exactly.</p>
          </div>
          <div className="bento" data-reveal>
            <article className="bento-card bento-big">
              <div className="bento-copy">
                <Frames className="bento-icon" />
                <h3>Every frame, really restored</h3>
                <p>Blur tools smudge the corner and inpainting invents new pixels that flicker. {SITE.name} reverses the logo’s blend in each frame, so whatever moves behind it stays sharp. <Link to="/how-it-works">How it works</Link></p>
                <ul className="ticks">
                  <li><Check /> The real pixels come back, not a guess</li>
                  <li><Check /> Steady in motion: no smudge, no flicker</li>
                  <li><Check /> Same resolution, framing and audio</li>
                </ul>
              </div>
              <div className="bento-media">
                <MediaCompare media={PHOTOS[3].media} logo={PHOTOS[3].logo} alt={PHOTOS[3].alt} />
              </div>
            </article>
            <article className="bento-card">
              <Lock className="bento-icon" />
              <h3>Private by design</h3>
              <p>Files never leave your device. No uploads, no queues, nothing stored on a server.</p>
            </article>
            <article className="bento-card">
              <Gauge className="bento-icon" />
              <h3>Quality kept</h3>
              <p>Same resolution, frame rate and frame count. Audio copied bit for bit.</p>
            </article>
            <article className="bento-card">
              <Stack className="bento-icon" />
              <h3>Batch mode</h3>
              <p>Drop a whole folder. The first video shows the rest where the logo sits.</p>
            </article>
            <article className="bento-card">
              <Photo className="bento-icon" />
              <h3>Photos too</h3>
              <p>PNG, JPG and WebP. PNGs stay lossless.</p>
            </article>
            <article className="bento-card">
              <Text className="bento-icon" />
              <h3>Veo text mark</h3>
              <p>Found on its own, wide or vertical. Box in any other steady logo yourself.</p>
            </article>
            <article className="bento-card">
              <Globe className="bento-icon" />
              <h3>Nothing to install</h3>
              <p>Runs in a modern browser on your computer. No app, no plugin, no account to try.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="compare">
        <div className="wrap narrow-l">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Compared</span>
            <h2 id="compare" className="section-title">Why not just blur it?</h2>
          </div>
          <div className="cmp-wrap" data-reveal>
            <table className="cmp">
              <thead>
                <tr><th scope="col"><span className="sr-only">Feature</span></th><th scope="col" className="cmp-us">{SITE.name}</th><th scope="col">Blur / crop tools</th><th scope="col">AI inpainting</th></tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([f, a, b, c]) => (
                  <tr key={f}><th scope="row">{f}</th><td className="cmp-us"><Mark v={a} /></td><td><Mark v={b} /></td><td><Mark v={c} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="made-for">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Made for</span>
            <h2 id="made-for" className="section-title">Whatever you made with AI.</h2>
          </div>
          <ul className="usecases" data-reveal>
            {LANDINGS.map((l, k) => (
              <li key={l.path}>
                <Link to={l.path} className="usecase">
                  <span className="usecase-kind">{['Gemini', 'Veo', 'AI images'][k]}</span>
                  <span className="usecase-title">{l.title}</span>
                  <span className="usecase-go">Learn more <ArrowRight /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="pricing">
        <div className="wrap">
          <div className="section-head center" data-reveal>
            <span className="eyebrow">Pricing</span>
            <h2 id="pricing" className="section-title">Start free. Upgrade when you publish daily.</h2>
          </div>
          <Plans />
        </div>
      </section>

      <section className="section" aria-labelledby="guides">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Guides</span>
            <h2 id="guides" className="section-title">Publish AI video the right way.</h2>
          </div>
          <GuideCards items={GUIDES.slice(0, 3)} />
          <p className="more"><Link to="/guides">All guides <ArrowRight /></Link></p>
        </div>
      </section>

      <section className="section" aria-labelledby="faq">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">FAQ</span>
            <h2 id="faq" className="section-title">Questions, answered.</h2>
            <p className="section-lede">Anything else? <Link to="/contact">Get in touch</Link>.</p>
          </div>
          <div className="faq-cols">
            <FaqList items={FAQ.slice(0, 3)} />
            <FaqList items={FAQ.slice(3, 6)} />
          </div>
          <p className="more"><Link to="/faq">All questions <ArrowRight /></Link></p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="cta-band" data-reveal>
            <div className="cta-glow" aria-hidden="true" />
            <h2>Clean your first video in a minute.</h2>
            <p>No sign-up, no upload. Just drop it in.</p>
            <Link to="/app" className="btn btn-primary btn-lg">Open the remover <ArrowRight /></Link>
          </div>
          <p className="fine center">Use {SITE.name} only on content you have the right to edit. It removes the visible logo, not invisible watermarks such as SynthID, so label AI-generated content where required.</p>
        </div>
      </section>
      <JsonLd data={SCHEMA} />
    </>
  );
}
