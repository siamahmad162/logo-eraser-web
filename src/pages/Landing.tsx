import { useState } from 'react';
import { AdSlot } from '../components/AdSlot';
import { MediaCompare } from '../components/MediaCompare';
import { CLIPS, PHOTOS, TOOL_DEMOS, type Demo } from '../media';
import { ArrowRight, Check, Stack } from '../components/Icons';
import { Breadcrumbs, JsonLd, ToolCta, abs } from '../components/Seo';
import { ToolIcon } from '../components/ToolIcon';
import { GUIDES, HUB } from '../content/meta';
import { LANDINGS, landingByPath, type Landing as LandingData } from '../content/landings';
import { TOOLS } from '../content/tools';
import { Link } from '../router';
import { SITE } from '../site';
import { GuideCards } from './Guides';

// Use-case pages: who each remover is for and why it works, with a way on to the working page.
const n = SITE.name;
// The examples each page can show in its first screen: real output, one is shown at a time and the rest are a click away.
const DEMOS: Record<string, Demo[]> = {
  '/gemini-watermark-remover': [CLIPS.G_GARDEN, CLIPS.V_JELLY, PHOTOS[3], CLIPS.G_OCEAN],
  '/use-cases/gemini-omni-videos': [CLIPS.G_ALLEY, CLIPS.G_OCEAN, CLIPS.G_GARDEN, CLIPS.HERO_WATCH, CLIPS.G_RAMEN],
  '/use-cases/veo-videos': [CLIPS.V_AURORA, CLIPS.V_JELLY, CLIPS.V_LAVA, CLIPS.V_BOAT],
  '/use-cases/gemini-images': [PHOTOS[0], PHOTOS[1], PHOTOS[2], PHOTOS[3], PHOTOS[4], PHOTOS[5]],
};

const Crumbs = ({ page }: { page: LandingData }) => (
  <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: HUB.path, label: 'Use cases' }, { to: page.path, label: page.name }]} />
);

export function Landing({ path }: { path: string }) {
  const p = landingByPath(path)!;
  const demos = DEMOS[path] || [TOOL_DEMOS.omni];
  const [pick, setPick] = useState(0);
  const demo = demos[pick] || demos[0];
  const related = p.related.map((r) => landingByPath(r)!).filter(Boolean);
  const guides = p.guides.map((s) => GUIDES.find((g) => g.slug === s)!).filter(Boolean);
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', name: p.title, url: abs(p.path), description: p.description, isPartOf: { '@type': 'WebSite', name: n, url: abs('/') } },
      { '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
    ],
  };
  return (
    <>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <Crumbs page={p} />
            <span className="eyebrow">{p.eyebrow}</span>
            <h1 className="h1-long">{p.h1[0]}<span className="grad">{p.h1[1]}</span></h1>
            <p className="lede">{p.lede}</p>
            <div className="cta-row">
              {p.go.map((g, k) => (
                <Link key={g.to} to={g.to} className={k === 0 ? 'btn btn-primary btn-lg' : 'btn btn-ghost btn-lg'}>{g.label} {k === 0 && <ArrowRight />}</Link>
              ))}
            </div>
            <ul className="trust">
              <li><Check /> No upload</li>
              <li><Check /> Free, no sign-up</li>
              <li><Check /> Real pixels restored</li>
            </ul>
          </div>
          <div className="product">
            <div className="product-glow" aria-hidden="true" />
            <div className="window" style={demo.media.h > demo.media.w ? { maxWidth: 300, marginInline: 'auto' } : undefined}>
              <div className="window-bar">
                <span className="dots" aria-hidden="true"><i /><i /><i /></span>
                <span className="window-title">{demo.title} <em>· original vs. result</em></span>
              </div>
              <MediaCompare key={demo.id} media={demo.media} logo={demo.logo} alt={demo.alt} variant="hero" zoom eager />
            </div>
            {demos.length > 1 && (
              <div className="ex-pick" role="group" aria-label="More examples">
                {demos.map((d, k) => (
                  <button key={d.id} type="button" className="ex-chip" aria-pressed={k === pick} onClick={() => setPick(k)}>{d.title}</button>
                ))}
              </div>
            )}
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
                {s.paras.map((t) => <p key={t}>{t}</p>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <AdSlot place="article1" />

      <section className="section" aria-labelledby="who">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Who it is for</span>
            <h2 id="who" className="section-title">Who uses {p.subject} watermark removal</h2>
          </div>
          <ul className="aud" data-reveal>
            {p.audiences.map((a) => (
              <li key={a.title}><h3>{a.title}</h3><p>{a.text}</p></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="steps">
        <div className="wrap">
          <h2 id="steps" className="section-title">Four steps to a clean {p.subject} file</h2>
          <ol className="steps">
            {p.steps.map((s, k) => (
              <li key={s.title} className="step-card">
                <span className="step-num">{k + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" aria-labelledby="versus">
        <div className="wrap">
          <h2 id="versus" className="section-title">Why not crop, blur or fill a {p.subject} watermark?</h2>
          <div className="cmp-wrap" data-reveal>
            <table className="cmp cmp-text">
              <thead>
                <tr><th scope="col">Way of removing it</th><th scope="col" className="cmp-us">{n}</th><th scope="col">The alternative</th></tr>
              </thead>
              <tbody>
                {p.compare.map((r) => (
                  <tr key={r.what}><th scope="row">{r.what}</th><td className="cmp-us">{r.us}</td><td>{r.other}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <ToolCta title="Ready when you are" text="Free, with no sign-up. Nothing is uploaded: it all runs in your browser." to={p.go[0].to} label={p.go[0].label} />
        </div>
      </section>

      <section className="section" aria-labelledby="questions">
        <div className="wrap narrow">
          <h2 id="questions" className="section-title">{p.subject} watermark remover: questions and answers</h2>
          <div className="faq">
            {p.faq.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <div className="faq-a"><p>{f.a}</p></div>
              </details>
            ))}
          </div>
          <JsonLd data={schema} />
        </div>
      </section>

      <AdSlot place="article2" />

      <section className="section" aria-labelledby="read">
        <div className="wrap">
          <h2 id="read" className="section-title">Guides to read next</h2>
          <GuideCards items={guides} />
          <p className="also">
            More use cases: {related.map((r, k) => (<span key={r.path}>{k > 0 && ' · '}<Link to={r.path}>{r.name}</Link></span>))}
          </p>
        </div>
      </section>
    </>
  );
}

// The hub: every use case, with a line on who it is for.
export function UseCases() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage', name: HUB.title, url: abs(HUB.path), description: HUB.description,
    mainEntity: { '@type': 'ItemList', itemListElement: LANDINGS.map((l, k) => ({ '@type': 'ListItem', position: k + 1, name: l.name, url: abs(l.path) })) },
  };
  return (
    <>
      <section className="hero hero-slim">
        <div className="hero-bg" aria-hidden="true" />
        <div className="wrap">
          <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: HUB.path, label: 'Use cases' }]} />
          <span className="eyebrow">Use cases</span>
          <h1 className="h1-long">AI watermark removal use cases: <span className="grad">videos, clips and images</span></h1>
          <p className="lede">The same free engine, explained for each kind of file: who it helps, what it keeps, and where to start. Everything runs in your browser, and nothing is uploaded.</p>
        </div>
      </section>

      <section className="section" aria-labelledby="cases">
        <div className="wrap">
          <h2 id="cases" className="sr-only">All watermark removal use cases</h2>
          <ul className="usecases usecases-4" data-reveal>
            {LANDINGS.map((l) => (
              <li key={l.path}>
                <Link to={l.path} className="usecase">
                  <span className="usecase-ico">{l.icon === 'overview' ? <Stack /> : <ToolIcon id={l.icon} />}</span>
                  <span className="usecase-kind">{l.kind}</span>
                  <span className="usecase-title">{l.name}</span>
                  <span className="usecase-text">{l.description}</span>
                  <span className="usecase-go">Read more <ArrowRight /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="choose">
        <div className="wrap">
          <div className="explain" data-reveal>
            <div className="explain-item">
              <h2 id="choose">How to pick the right watermark remover</h2>
              <p>Start from the file you have. A video made with Gemini belongs to the Gemini Omni page, a clip made with Veo to the Veo page, and a still picture to the Gemini images page. If you are not sure, the overview explains what the Gemini watermark is and how the three differ.</p>
            </div>
            <div className="explain-item">
              <h2>What every use case has in common</h2>
              <p>Every page uses the same engine. It finds the logo, measures how it was blended into your picture, and reverses that blend, so the real pixels come back instead of a blur. It runs on your own device, so nothing is uploaded, and it is free.</p>
            </div>
            <div className="explain-item">
              <h2>Ready to remove a watermark?</h2>
              <p>The use-case pages explain; the tools do the work. Open the <Link to={TOOLS[0].path}>Gemini Omni remover</Link>, the <Link to={TOOLS[1].path}>Veo remover</Link> or the <Link to={TOOLS[2].path}>Gemini photo remover</Link>, or see <Link to="/tools">all tools with examples</Link>.</p>
            </div>
          </div>
        </div>
      </section>

      <AdSlot place="article1" />

      <section className="section" aria-labelledby="read">
        <div className="wrap">
          <h2 id="read" className="section-title">Guides to read next</h2>
          <GuideCards items={['remove-gemini-watermark-from-video', 'blur-crop-or-restore', 'label-ai-generated-content'].map((s) => GUIDES.find((g) => g.slug === s)!)} />
          <JsonLd data={schema} />
        </div>
      </section>
    </>
  );
}
