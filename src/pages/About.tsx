import { Breadcrumbs, ToolCta } from '../components/Seo';
import { Link } from '../router';
import { SITE } from '../site';

export function About() {
  const n = SITE.name;
  return (
    <>
      <section className="page-head">
        <div className="wrap narrow">
          <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: '/about', label: 'About' }]} />
          <h1>About {n}</h1>
          <p className="lede">A small, independent tool for people who make things with AI video.</p>
        </div>
      </section>
      <section className="section section-tight">
        <div className="wrap narrow prose article">
          <h2>Why we built it</h2>
          <p>AI video tools made it possible to create a beautiful clip in a minute, and every one of those clips came with a logo stamped in the corner. The usual ways to get rid of it, cropping or blurring, damaged the very thing that made the clip worth using. We wanted the clip, exactly as it was generated, without the stamp. {n} is the tool we built to do that properly.</p>

          <h2>What we care about</h2>
          <ul>
            <li><strong>Privacy first.</strong> Your files are processed on your own device and never uploaded. We built it that way from day one.</li>
            <li><strong>Honest results.</strong> Every before/after on this site is real, unretouched output. We tell you where the method has limits.</li>
            <li><strong>Responsible use.</strong> {n} removes the visible logo, not the facts. It doesn’t touch invisible watermarks like SynthID, and we ask everyone to label AI content where it matters. Our <Link to="/terms">Terms</Link> spell this out.</li>
          </ul>

          <h2>Who we are</h2>
          <p>{n} is run by {SITE.operator}, based in {SITE.country}, and built for creators everywhere. We are independent and not affiliated with Google or any AI company.</p>

          <h2>Get in touch</h2>
          <p>Questions, ideas or a file that didn’t come out right? <Link to="/contact">Contact us</Link>; we read everything.</p>

          <ToolCta />
        </div>
      </section>
    </>
  );
}
