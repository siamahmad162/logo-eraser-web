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
            <ToolCta />
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
