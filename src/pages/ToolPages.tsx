import type { ReactNode } from 'react';
import { Tool, type ToolMode } from './Tool';
import { AdSlot } from '../components/AdSlot';
import { FAQ, FaqList } from '../faq';
import type { Qa } from '../faq';
import { Link } from '../router';
import { SITE } from '../site';
import { Breadcrumbs, JsonLd, abs, faqSchema } from '../components/Seo';
import { Check } from '../components/Icons';
import { toolById } from '../content/tools';
import { TOOL_SEO } from '../content/toolseo';
import { GUIDES, type GuideMeta } from '../content/meta';
import { GuideCards } from './Guides';

// The three removers. They share one engine, but each has its own page: the tool comes first, and what it does and
// does not do is written out below it, for its own kind of file.
const n = SITE.name;

const SHARED = ['allowed', 'free', 'google'];
const shared = () => FAQ.filter((x) => SHARED.includes(x.id));

const USE_CASE: Record<ToolMode, string> = { omni: '/use-cases/gemini-omni-videos', veo: '/use-cases/veo-videos', gphoto: '/use-cases/gemini-images' };
function Page({ mode, sections, faq, other }: { mode: ToolMode; sections: { title: string; body: ReactNode }[]; faq: Qa[]; other: ReactNode }) {
  const tool = toolById(mode), seo = TOOL_SEO[mode];
  const trouble: Qa[] = seo.trouble.map((x, i) => ({ id: `fix-${mode}-${i}`, q: x.q, a: <p>{x.a}</p> }));
  const guides = seo.guides.map((slug) => GUIDES.find((g) => g.slug === slug)).filter((g): g is GuideMeta => !!g);
  const qa = [...faq, ...trouble, ...shared()];
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication', name: tool.name, url: abs(tool.path), description: seo.summary, applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any (runs in a web browser)', browserRequirements: 'Requires a recent browser with WebCodecs (Chrome or Edge recommended)', inLanguage: 'en',
        isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: seo.features,
      },
      {
        '@type': 'HowTo', name: seo.howTo.name, description: seo.summary,
        step: seo.howTo.steps.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st.name, text: st.text })),
      },
      faqSchema(qa),
    ],
  };
  return (
    <>
      <Tool mode={mode} />
      <AdSlot place="tool1" />
      <section className="section section-tight">
        <div className="wrap">
          <Breadcrumbs items={[{ to: '/', label: 'Home' }, { to: '/tools', label: 'Tools' }, { to: tool.path, label: tool.name }]} />
          <div className="explain" data-reveal>
            {sections.map((s) => (
              <div key={s.title} className="explain-item">
                <h2>{s.title}</h2>
                {s.body}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section section-tight" aria-labelledby="how-to">
        <div className="wrap">
          <h2 id="how-to" className="section-title">{seo.howTo.name}</h2>
          <ol className="howto" data-reveal>
            {seo.howTo.steps.map((st, i) => (
              <li key={st.name}><span className="howto-n">{i + 1}</span><h3>{st.name}</h3><p>{st.text}</p></li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section section-tight" aria-labelledby="uses">
        <div className="wrap">
          <h2 id="uses" className="section-title">What people use it for</h2>
          <ul className="uses" data-reveal>
            {seo.uses.map((u) => (<li key={u.title}><h3>{u.title}</h3><p>{u.text}</p></li>))}
          </ul>
        </div>
      </section>
      <AdSlot place="tool2" />
      <section className="section section-tight" aria-labelledby="files">
        <div className="wrap narrow-l">
          <h2 id="files" className="section-title">Supported files and what you get</h2>
          <table className="spec" data-reveal>
            <tbody>
              {seo.files.map(([k, v]) => (<tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="section section-tight" aria-labelledby="tips">
        <div className="wrap narrow-l">
          <h2 id="tips" className="section-title">Tips for the best result</h2>
          <ul className="ticks" data-reveal>
            {seo.tips.map((t) => (<li key={t}><Check /> {t}</li>))}
          </ul>
        </div>
      </section>
      <section className="section section-tight" aria-labelledby="questions">
        <div className="wrap narrow">
          <h2 id="questions" className="section-title">Questions and fixes</h2>
          <FaqList items={qa} />
          <JsonLd data={schema} />
        </div>
      </section>
      <section className="section section-tight" aria-labelledby="read">
        <div className="wrap">
          <h2 id="read" className="section-title">Read more</h2>
          <GuideCards items={guides} />
          <p className="also">{other}</p>
          <p className="also">Who it is for and where it helps: <Link to={USE_CASE[mode]}>read the use case</Link>.</p>
        </div>
      </section>
    </>
  );
}

const OMNI_FAQ: Qa[] = [
  { id: 'omni-what', q: 'What is the Gemini Omni watermark?', a: <p>It is the small four-pointed sparkle that sits near the bottom-right corner of videos made with Gemini. It is white and partly see-through, always the same shape, and in a video it stays in exactly the same spot in every frame.</p> },
  { id: 'omni-how', q: 'How can it be removed without blurring the corner?', a: <p>Because the sparkle is see-through, the real picture is still in every frame, only blended with white. {n} measures the sparkle’s exact shape and strength in your file and reverses that blend frame by frame, so whatever moves behind it stays sharp. Where a part of the mark is fully solid there is nothing underneath to recover, and those few pixels are filled in from around them.</p> },
  { id: 'omni-clean', q: 'How do I know nothing is left behind?', a: <p>When a video is finished, {n} looks at the written file again and compares the picture just inside the sparkle’s outline with the picture just outside it. Where the logo is gone the two match, and the card says it was checked. If a faint trace or a dark patch is found, the card turns amber and shows the worst moment so you can look at it before you use the video.</p> },
  { id: 'omni-quality', q: 'Do I lose quality, sound or length?', a: <p>No. Resolution, frame rate and the number of frames stay exactly the same, and the sound is copied across untouched. Because pixels change, the video has to be saved again: Best quality uses about 2.5 times the original bitrate, so the difference cannot be seen.</p> },
  { id: 'omni-upload', q: 'Are my videos uploaded?', a: <p>No. Everything runs in your browser on your own device, so your videos never reach our servers and you do not wait for an upload. How fast it goes depends on your computer.</p> },
  { id: 'omni-others', q: 'What about Veo clips or Gemini images?', a: <p>Veo clips can carry a text mark as well as the sparkle: use the <Link to="/veo-watermark-remover">Veo watermark remover</Link>. For images use the <Link to="/gemini-photo-watermark-remover">Gemini photo watermark remover</Link>. They run the same engine, each on its own page.</p> },
  { id: 'omni-synthid', q: 'Does it remove SynthID too?', a: <p>No. It removes the visible sparkle only. Google’s invisible SynthID watermark is a different thing and is not touched. Read <Link to="/guides/visible-watermark-vs-synthid">what removing the logo does and does not do</Link>.</p> },
];

const VEO_FAQ: Qa[] = [
  { id: 'veo-marks', q: 'Which marks does it remove from a Veo clip?', a: <p>Both kinds. Depending on where a Veo video was made it can carry the four-pointed sparkle in the corner, the small “Veo” text mark, or both. Each one is found by itself and removed in the same pass.</p> },
  { id: 'veo-text', q: 'How is the “Veo” text mark found?', a: <p>The sparkle is found by its shape. The text mark is found by noticing what stays perfectly still while the scene around it moves, and its exact shape and strength are then measured in your clip. If it is ever missed, drag a box around it and {n} learns it from your box.</p> },
  { id: 'veo-motion', q: 'Why does it work better than covering the corner?', a: <p>Veo clips are full of motion: camera moves, water, particles, light. Covering or blurring the logo leaves a patch that stands still while everything else moves. Reversing the logo’s blend works on each frame from that frame’s own pixels, so whatever passes behind it comes through sharp.</p> },
  { id: 'veo-vertical', q: 'Does it work on vertical clips?', a: <p>Yes. Vertical (9:16) clips for Reels, Shorts and TikTok are handled exactly like wide ones. The preview is made larger for tall clips so you can see the corner clearly.</p> },
  { id: 'veo-quality', q: 'Will the clip keep its size, frame rate and sound?', a: <p>Yes. The resolution, frame rate, length and sound stay as they were. Best quality saves the clip again at about 2.5 times the original bitrate, so nothing outside the logo can be told apart from the original.</p> },
  { id: 'veo-upload', q: 'Are my clips uploaded?', a: <p>No. Clips are processed in your browser on your own device and never reach our servers.</p> },
  { id: 'veo-others', q: 'What about Gemini videos or images?', a: <p>The Gemini sparkle on a video has its own page: the <Link to="/gemini-omni-watermark-remover">Gemini Omni watermark remover</Link>. For images use the <Link to="/gemini-photo-watermark-remover">Gemini photo watermark remover</Link>.</p> },
  { id: 'veo-label', q: 'Should I still label the clip as AI-made?', a: <p>Yes, where a platform asks for it. Removing the visible logo does not change where a clip came from. See <Link to="/guides/label-ai-generated-content">how to label AI videos on each platform</Link>.</p> },
];

const GPHOTO_FAQ: Qa[] = [
  { id: 'gphoto-what', q: 'What does it remove from a Gemini image?', a: <p>The small four-pointed sparkle near the bottom-right corner that Gemini puts on generated images. It is white and partly see-through, and always the same shape.</p> },
  { id: 'gphoto-how', q: 'How is the sparkle removed from a single picture?', a: <p>A photo has only one frame, so there is nothing to learn the sparkle from over time. Instead {n} starts from the sparkle’s known shape and fits its exact place, size, sharpness and strength to your image, then reverses it on each colour channel. The picture underneath comes back; nothing is painted over.</p> },
  { id: 'gphoto-formats', q: 'Which image types work, and what do I get back?', a: <p>PNG, JPG and WebP. The image keeps its exact dimensions. A PNG is saved losslessly, a JPG is saved again at 95% quality, and a WebP comes back as a PNG so nothing is lost.</p> },
  { id: 'gphoto-upload', q: 'Is my image uploaded?', a: <p>No. The image is opened, cleaned and saved by your browser on your own device. It never reaches our servers.</p> },
  { id: 'gphoto-many', q: 'Can I clean many images at once?', a: <p>Yes. Add as many as you like, or a whole folder. They are cleaned one after another, and you can download them all as one ZIP.</p> },
  { id: 'gphoto-videos', q: 'What about Gemini and Veo videos?', a: <p>Videos have their own pages: the <Link to="/gemini-omni-watermark-remover">Gemini Omni watermark remover</Link> for the sparkle in a Gemini video, and the <Link to="/veo-watermark-remover">Veo watermark remover</Link> for Veo clips.</p> },
  { id: 'gphoto-synthid', q: 'Does it remove SynthID?', a: <p>No. Only the visible sparkle is removed. Google’s invisible SynthID watermark is not touched, and many platforms still ask you to label AI-made images. See <Link to="/guides/visible-watermark-vs-synthid">visible watermark vs SynthID</Link>.</p> },
];

export function OmniRemover() {
  return (
    <Page
      mode="omni"
      sections={[
        { title: 'Found by itself, to the pixel', body: <p>Drop in a Gemini video and {n} looks at frames from across the whole of it, finds the four-pointed sparkle by its shape and measures its exact strength in your file. Cleaning starts by itself: there is nothing to draw and no button to press.</p> },
        { title: 'Restored, not covered up', body: <p>The sparkle is see-through, so the real picture is still in every frame, only blended with white. {n} reverses that blend frame by frame. Moving backgrounds stay sharp, and there is no smudge and no flicker, which is what a blur or a patch cannot give you. <Link to="/how-it-works">See how it works</Link>.</p> },
        { title: 'Same video, minus the sparkle', body: <p>Resolution, frame rate, length and sound stay the same. A whole folder can be added at once, and everything runs in your browser, so your videos are never uploaded. It is free, with no sign-up.</p> },
      ]}
      faq={OMNI_FAQ}
      other={<>Other removers: <Link to="/veo-watermark-remover">Veo watermark remover</Link> · <Link to="/gemini-photo-watermark-remover">Gemini photo watermark remover</Link> · <Link to="/tools">all tools</Link></>}
    />
  );
}

export function VeoRemover() {
  return (
    <Page
      mode="veo"
      sections={[
        { title: 'Two kinds of Veo mark, one pass', body: <p>A Veo clip can carry the four-pointed sparkle, the small “Veo” text mark, or both. Drop the clip in and {n} finds each by itself: the sparkle by its shape, the text by noticing what stays still while the scene moves. There is nothing to draw, and if a mark is ever missed you can drag a box around it.</p> },
        { title: 'Made for moving pictures', body: <p>Veo clips are full of motion. Covering the logo leaves a patch that stands still while everything else moves. {n} works on each frame from that frame’s own pixels, so whatever passes behind the mark comes through sharp, in wide and in vertical clips alike.</p> },
        { title: 'The clip, exactly as it was', body: <p>Resolution, frame rate, length and sound stay the same, and the clip is saved again at a high bitrate so nothing outside the mark changes. Everything runs on your device, so your clips are never uploaded.</p> },
      ]}
      faq={VEO_FAQ}
      other={<>Other removers: <Link to="/gemini-omni-watermark-remover">Gemini Omni watermark remover</Link> · <Link to="/gemini-photo-watermark-remover">Gemini photo watermark remover</Link> · <Link to="/tools">all tools</Link></>}
    />
  );
}

export function GeminiPhotoRemover() {
  return (
    <Page
      mode="gphoto"
      sections={[
        { title: 'Fitted to your image', body: <p>Drop in a Gemini image and {n} finds the sparkle in the corner and fits its exact place, size, sharpness and strength to your picture. There is nothing to draw and nothing to select, and it takes seconds.</p> },
        { title: 'Reversed, not painted over', body: <p>The sparkle is see-through, so the picture underneath is still there. {n} reverses the sparkle on each colour channel instead of blurring the corner or inventing new pixels, so the detail next to it stays exactly as it was. <Link to="/guides/blur-crop-or-restore">Why that beats blur or crop</Link>.</p> },
        { title: 'No quality loss', body: <p>The image keeps its exact dimensions. A PNG is saved losslessly, a JPG at 95% quality, and a WebP comes back as a PNG. Add one image or a whole folder; everything runs in your browser, so nothing is uploaded.</p> },
      ]}
      faq={GPHOTO_FAQ}
      other={<>Other removers: <Link to="/gemini-omni-watermark-remover">Gemini Omni watermark remover</Link> · <Link to="/veo-watermark-remover">Veo watermark remover</Link> · <Link to="/tools">all tools</Link></>}
    />
  );
}
