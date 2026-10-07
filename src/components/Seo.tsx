import { Link } from '../router';
import { SITE } from '../site';

// Structured data for search engines (schema.org JSON-LD).
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export const abs = (path: string) => (SITE.url ? SITE.url + path : undefined);

export function Breadcrumbs({ items }: { items: { to: string; label: string }[] }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, k) => ({ '@type': 'ListItem', position: k + 1, name: it.label, item: abs(it.to) })),
  };
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((it, k) => (
          <li key={it.to}>
            {k < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
          </li>
        ))}
      </ol>
      <JsonLd data={data} />
    </nav>
  );
}

export function ToolCta({ title = 'Try it on your own video', text = 'Free, with no sign-up. Nothing is uploaded: it all runs in your browser.' }: { title?: string; text?: string }) {
  return (
    <aside className="tool-cta">
      <div>
        <p className="tool-cta-title">{title}</p>
        <p>{text}</p>
      </div>
      <Link to="/app" className="btn btn-primary">Open the remover</Link>
    </aside>
  );
}
