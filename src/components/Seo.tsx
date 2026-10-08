import type { ReactNode } from 'react';
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

export function ToolCta({ title = 'Try it on your own video', text = 'Free, with no sign-up. Nothing is uploaded: it all runs in your browser.', to = '/tools', label = 'Choose a remover' }: { title?: string; text?: string; to?: string; label?: string }) {
  return (
    <aside className="tool-cta">
      <div>
        <p className="tool-cta-title">{title}</p>
        <p>{text}</p>
      </div>
      <Link to={to} className="btn btn-primary">{label}</Link>
    </aside>
  );
}

// the words of an answer, for structured data (links and paragraphs flattened)
export const plainText = (a: ReactNode): string => {
  if (a == null || typeof a === 'boolean') return '';
  if (typeof a === 'string' || typeof a === 'number') return String(a);
  if (Array.isArray(a)) return a.map(plainText).join(' ').replace(/\s+/g, ' ').trim();
  return plainText((a as { props?: { children?: ReactNode } }).props?.children).replace(/\s+/g, ' ').trim();
};
export function faqSchema(items: { q: string; a: ReactNode }[]) {
  return { '@type': 'FAQPage', mainEntity: items.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: plainText(q.a) || q.q } })) };
}
