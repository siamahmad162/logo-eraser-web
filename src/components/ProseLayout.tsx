import type { ReactNode } from 'react';
import { AdRect, sideOn, usePreviewFlag } from './AdSlot';
import { Link } from '../router';
import { TOOLS } from '../content/tools';
import { ADS } from '../site';

// The title block of such a page lines up with the text under it.
export function ProseHead({ children }: { children: ReactNode }) {
  const preview = usePreviewFlag();
  return sideOn() || preview ? <div className="wrap"><div className="head-col">{children}</div></div> : <div className="wrap narrow">{children}</div>;
}

// Text with a 300x250 ad beside it on screens from 1100 px (below that the text just runs on its own).
// Without a "side" ad, or when it is switched off, the page is the plain centred text it always was.
export function ProseLayout({ children }: { children: ReactNode }) {
  const preview = usePreviewFlag();
  const on = sideOn() || preview;
  if (!on) return <div className="wrap narrow">{children}</div>;
  return (
    <div className="wrap">
      <div className="prose-layout has-side" style={{ ['--side-w' as string]: (ADS.rect.width || 300) + 'px' }}>
        <div className="prose-main">{children}</div>
        <aside className="prose-side" aria-label="More from the site">
          <div className="prose-side-in">
            <AdRect place="side" />
            <nav className="side-tools" aria-label="Tools">
              <b>Tools</b>
              {TOOLS.map((t) => <Link key={t.id} to={t.path}>{t.name}</Link>)}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
