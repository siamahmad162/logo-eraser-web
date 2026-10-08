import { TOOLS } from '../content/tools';
import { TOOL_DEMOS } from '../media';
import { Link } from '../router';
import { ArrowRight, Check } from './Icons';
import { MediaCompare } from './MediaCompare';
import { ToolIcon } from './ToolIcon';

// The three removers, each with its own before/after example and a link to open it.
export function ToolShowcase({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <ul className="showcase">
      {TOOLS.map((t, k) => {
        const d = TOOL_DEMOS[t.id], portrait = d.media.h > d.media.w;
        return (
          <li key={t.id} className="sc-row" data-reveal data-flip={k % 2 ? '' : undefined} id={`tool-${t.id}`}>
            <div className="sc-copy">
              <div className="sc-tags">
                <span className="sc-ico"><ToolIcon id={t.id} /></span>
                <span className="chip">{t.files}</span>
                <span className={`chip ${t.how === 'Automatic' ? 'chip-auto' : 'chip-box'}`}>{t.how}</span>
              </div>
              <H className="sc-title">{t.name}</H>
              <p>{t.long}</p>
              <ul className="ticks">
                {t.points.map((p) => <li key={p}><Check /> {p}</li>)}
              </ul>
              <div className="sc-cta">
                <Link to={t.path} className="btn btn-primary">Open the {t.name} <ArrowRight /></Link>
              </div>
            </div>
            <figure className="sc-demo" data-portrait={portrait || undefined}>
              <MediaCompare media={d.media} logo={d.logo} alt={d.alt} />
              <figcaption><span className={`src src-${d.source.toLowerCase()}`}>{d.source}</span><span className="g-title">{d.title}</span></figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}
