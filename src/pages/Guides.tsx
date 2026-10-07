import { AdSlot } from '../components/AdSlot';
import { ProseHead, ProseLayout } from '../components/ProseLayout';
import { ArrowRight } from '../components/Icons';
import { Breadcrumbs, JsonLd, ToolCta, abs } from '../components/Seo';
import { GUIDE_BODIES } from '../content/guides';
import { GUIDES, type GuideMeta } from '../content/meta';
import { Link } from '../router';
import { SITE } from '../site';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

const GUIDE_TOOL: Record<string, { to: string; label: string; title: string }> = {
  'remove-sora-watermark': { to: '/sora-watermark-remover', label: 'Open the Sora remover', title: 'Try it on your Sora video' },
  'remove-logo-from-video': { to: '/remove-logo-from-video', label: 'Open the video logo remover', title: 'Remove a logo from your video' },
  'remove-logo-from-photo': { to: '/remove-logo-from-photo', label: 'Open the photo logo remover', title: 'Remove a logo from your photo' },
  'watermark-remover-without-upload': { to: '/tools', label: 'See all tools', title: 'Pick the tool for your file' },
};

export function GuideCards({ items }: { items: GuideMeta[] }) {
  return (
    <ul className="guide-cards">
      {items.map((g) => (
        <li key={g.slug}>
          <Link to={`/guides/${g.slug}`} className="guide-card">
            <span className="guide-card-title">{g.title}</span>
            <span className="guide-card-text">{g.description}</span>
            <span className="guide-card-meta">{g.minutes} min read <ArrowRight /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Guides() {
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: '/guides', label: 'Guides' }]} />
          <h1>Guides</h1>
          <p className="lede">Practical help with removing AI watermarks, keeping your video quality, and publishing AI content the right way.</p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="wrap">
          <p className="lede">New to watermark removal? Start with <Link to="/guides/blur-crop-or-restore">blur, crop or restore</Link> to see why the method matters, then pick the guide for your file: a <Link to="/guides/remove-gemini-watermark-from-video">Gemini or Veo video</Link>, a <Link to="/guides/remove-sora-watermark">Sora video</Link>, a <Link to="/guides/remove-logo-from-video">logo in a video</Link> or a <Link to="/guides/remove-logo-from-photo">logo in a photo</Link>. Everything runs in your browser, so your files stay private. See <Link to="/guides/watermark-remover-without-upload">how a tool works without uploading</Link>.</p>
          <GuideCards items={GUIDES} />
        </div>
      </section>
    </>
  );
}

export function Guide({ slug }: { slug: string }) {
  const g = GUIDES.find((x) => x.slug === slug)!;
  const Body = GUIDE_BODIES[slug];
  const path = `/guides/${slug}`;
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: g.title,
    description: g.description,
    datePublished: g.published,
    dateModified: g.updated,
    author: { '@type': 'Organization', name: SITE.name, url: abs('/') },
    publisher: { '@type': 'Organization', name: SITE.name, url: abs('/') },
    mainEntityOfPage: abs(path),
    image: abs('/og.png'),
  };
  const related = GUIDES.filter((x) => x.slug !== slug).slice(0, 3);
  return (
    <>
      <article>
        <header className="page-head">
          <ProseHead>
            <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: '/guides', label: 'Guides' }, { to: path, label: g.title }]} />
            <h1>{g.title}</h1>
            <p className="article-meta">
              Updated <time dateTime={g.updated}>{fmt(g.updated)}</time> · {g.minutes} min read
            </p>
          </ProseHead>
        </header>
        <div className="section section-tight">
          <ProseLayout>
            <div className="prose article">
              <Body />
            </div>
            <AdSlot place="article1" />
            <ToolCta {...(GUIDE_TOOL[slug] || {})} />
          </ProseLayout>
        </div>
        <JsonLd data={article} />
      </article>
      <AdSlot place="article2" />
      <section className="section section-alt" aria-labelledby="more-guides">
        <div className="wrap">
          <h2 id="more-guides" className="section-title">More guides</h2>
          <GuideCards items={related} />
        </div>
      </section>
    </>
  );
}
