import { AdSlot } from '../components/AdSlot';
import { ProseHead, ProseLayout } from '../components/ProseLayout';
import { Breadcrumbs, ToolCta } from '../components/Seo';
import { Link } from '../router';
import { SITE } from '../site';

export function HowItWorks() {
  const n = SITE.name;
  return (
    <>
      <section className="page-head">
        <ProseHead>
          <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: '/how-it-works', label: 'How it works' }]} />
          <h1>How {n} removes watermarks</h1>
          <p className="lede">Most watermark removers hide the logo. {n} undoes it: the real picture is still inside every frame, and some careful arithmetic brings it back.</p>
        </ProseHead>
      </section>
      <section className="section section-tight">
        <ProseLayout>
        <div className="prose article">
          <h2>The short version</h2>
          <ul>
            <li>The AI sparkle watermark is see-through, so the original pixels are still there, only lightened.</li>
            <li>{n} finds the logo, measures exactly how see-through each of its pixels is in your file, and reverses the blend in every frame.</li>
            <li>A final pass cleans up compression noise along the logo’s edge.</li>
            <li>It all runs in your browser. Your files never leave your device.</li>
          </ul>

          <h2>1. Find the logo</h2>
          <p>{n} samples frames from across the whole video and averages them. The AI sparkle has a known shape, so it is located by matching that shape, which works even when the background never changes. Other logos, such as a text mark, are found by what stays still while the scene moves. If detection is ever wrong, you can draw the box yourself.</p>

          <h2>2. Measure the transparency</h2>
          <p>Every pixel of the logo blends the logo’s colour with the picture behind it in a fixed proportion, its opacity α. The exact values vary from file to file, because every encoder softens the logo’s edge a little differently. So {n} measures them in your video:</p>
          <ul>
            <li>In frames where the area around the logo is plain, the background behind the logo can be worked out from its surroundings, and each pixel’s opacity measured directly.</li>
            <li>Over many such frames these measurements add up to a precise opacity map, built separately for brightness and colour.</li>
            <li>Dark frames get a map of their own, because compression treats the logo differently over dark backgrounds.</li>
            <li>Where a video never shows a plain background behind the logo, the known shape of the sparkle, fitted to your file, fills the gaps.</li>
          </ul>

          <h2>3. Reverse the blend</h2>
          <p>With the opacity α and the logo colour L known, every frame is corrected pixel by pixel:</p>
          <p className="formula">shown = (1 − α) × real + α × L</p>
          <p className="formula">real = (shown − α × L) ÷ (1 − α)</p>
          <p>Videos are corrected directly in the form the video is stored in (brightness and colour planes), without converting colours back and forth, so the correction itself touches nothing outside the logo.</p>

          <h2>4. Clean the edge</h2>
          <p>Compression adds small errors to every frame, and the division above enlarges them slightly where the logo is most opaque. Left alone they could show as a faint outline. {n} checks each pixel along the edge: where the numbers show leftover traces of the logo, the pixel is rebuilt from its neighbours; where they show real detail, it is left as it is. Single stray specks are removed the same way.</p>

          <h2>5. Save a new file</h2>
          <p>Changed pixels mean the video must be encoded again. {n} keeps the resolution, frame rate and number of frames identical, copies the audio untouched, and uses a generous bitrate so the re-encoding can’t be seen. PNG photos stay lossless and JPEGs stay JPEGs.</p>

          <h2>Why it runs on your device</h2>
          <p>Modern browsers can decode and encode video themselves (through a feature called WebCodecs). {n} uses that to do all the work locally. It is more private, there are no uploads to wait for, and there is no server holding copies of your files. The only trade-off is that speed depends on your computer.</p>

          <h2>Limits, honestly</h2>
          <ul>
            <li><strong>Fully opaque pixels</strong> hide everything behind them. They are filled in from their surroundings instead.</li>
            <li><strong>Very heavily compressed videos</strong> can keep faint traces, because the compression has already damaged the detail under the logo.</li>
            <li><strong>Invisible watermarks</strong> such as SynthID are not affected. See <Link to="/guides/visible-watermark-vs-synthid">visible watermark vs SynthID</Link>.</li>
          </ul>

          <AdSlot place="article1" />
          <ToolCta title="See it on your own file" />
        </div>
        </ProseLayout>
      </section>
    </>
  );
}
