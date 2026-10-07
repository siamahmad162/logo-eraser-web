import type { ReactNode } from 'react';
import { Tool } from './Tool';
import { FaqList } from '../faq';
import type { Qa } from '../faq';
import { Link } from '../router';
import { SITE } from '../site';
import { JsonLd } from '../components/Seo';

// The removers that are not about Gemini and Veo: the Sora watermark (found by itself), and any other logo in a
// video or a photo (pointed out with a box). The tool comes first; what it does and does not do is written out below it.
const n = SITE.name;

const asText = (a: ReactNode) => (typeof a === 'string' ? a : '');
function Page({ mode, sections, faq, other }: { mode: 'sora' | 'logo' | 'photo'; sections: { title: string; body: ReactNode }[]; faq: Qa[]; other: ReactNode }) {
  return (
    <>
      <Tool mode={mode} />
      <section className="section">
        <div className="wrap">
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
      <section className="section" aria-labelledby="questions">
        <div className="wrap narrow">
          <h2 id="questions" className="section-title">Questions</h2>
          <FaqList items={faq} />
          <JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: asText(q.a) || q.q } })) }} />
          <p className="also">{other}</p>
        </div>
      </section>
    </>
  );
}

const SORA_FAQ: Qa[] = [
  { id: 'sora-works', q: 'Does it remove the watermark from Sora videos?', a: <p>Yes. The Sora watermark (the white cloud, the word “Sora” and the creator’s name) is found by itself at every moment, wherever it sits, and removed from every frame. You do not draw anything.</p> },
  { id: 'sora-clean', q: 'Will it look exactly like the original?', a: <p>The Sora mark is almost solid, so the pixels under it are gone and cannot be restored the way the see-through Gemini mark can. They are rebuilt: from other moments of the same shot (a still scene comes back as it was) and from around the mark. Busy, fast motion behind the mark can show a soft patch, so look at the result before you use it. The first download is free so you can judge it.</p> },
  { id: 'sora-moves', q: 'It moves around. Does that matter?', a: <p>No, it helps. The mark sits in one place for a few seconds, fades, and appears somewhere else. The place it has left shows the real picture again, which is what the rebuilt picture is copied from.</p> },
  { id: 'sora-upload', q: 'Are my videos uploaded?', a: <p>No. Everything runs in your browser on your own device, so your videos stay private and you do not wait for an upload. How fast it goes depends on your device.</p> },
  { id: 'sora-quality', q: 'Do I lose quality, sound or length?', a: <p>The size, frame rate, length and sound stay the same. Only the area under the mark is changed, and the video is saved again at a higher bitrate than the original so nothing else is lost.</p> },
  { id: 'sora-allowed', q: 'Is it OK to remove the Sora watermark?', a: <p>Use it on videos you made or have the right to edit. The watermark is a label; if you publish AI video, label it where a platform asks for it. This tool does not touch any invisible provenance data.</p> },
  { id: 'sora-more', q: 'What about videos without the mark, or other AI tools?', a: <p>If no Sora mark is found, nothing is changed. For logos from other tools, use the <Link to="/remove-logo-from-video">video logo remover</Link> or the <Link to="/remove-logo-from-photo">photo logo remover</Link> and draw a box around the logo. Gemini and Veo videos have their own <Link to="/app">automatic remover</Link>.</p> },
];

const VIDEO_FAQ: Qa[] = [
  { id: 'logo-any', q: 'Which logos can it remove from a video?', a: <p>Any logo or text that stays in one place: a channel logo, a corner badge, a date stamp, your own old watermark. Draw a box around it and it is removed from every frame. Logos that move around the picture are not supported yet.</p> },
  { id: 'logo-clean', q: 'Will the result look perfect?', a: <p>It depends on what is behind the logo. If the picture moves behind it, the real pixels show up in other frames and are copied back, which can look perfect. On a still background the area is filled in from its surroundings: plain backgrounds and soft textures look natural, detailed patterns may look smooth. Check the result before you download.</p> },
  { id: 'logo-box', q: 'How big should the box be?', a: <p>A little bigger than the logo, with some picture around it. Only the logo’s own pixels inside the box are rebuilt, so a slightly generous box costs nothing, while a box that cuts through the logo leaves a piece of it.</p> },
  { id: 'logo-gemini', q: 'Is this the same as the Gemini and Veo remover?', a: <p>No. The <Link to="/app">Gemini and Veo remover</Link> knows those logos exactly and restores the real pixels under them, with no box to draw. This one works on logos it does not know, so what is under them is rebuilt rather than restored. For the moving Sora mark there is the <Link to="/sora-watermark-remover">Sora remover</Link>.</p> },
  { id: 'logo-upload', q: 'Are my videos uploaded?', a: <p>No. Videos are processed in your browser on your own device and never reach our servers. Speed depends on your device.</p> },
  { id: 'logo-allowed', q: 'Can I remove anyone’s logo?', a: <p>Only from videos you made or have the right to edit. Removing the watermark of a stock library or another creator’s logo from their work is not what this tool is for.</p> },
  { id: 'logo-formats', q: 'Which files work?', a: <p>MP4, MOV, WebM and MKV in any codec your browser can decode; results are saved as MP4. For photos use the <Link to="/remove-logo-from-photo">photo logo remover</Link>. A recent Chrome or Edge on a computer works best.</p> },
];

const PHOTO_FAQ: Qa[] = [
  { id: 'photo-how', q: 'How does it remove a logo from a photo?', a: <p>You draw a box around the logo. The tool then works out which pixels inside the box really are the logo and rebuilds only those, from the picture around them, and puts the photo’s own grain back so the patch does not look smooth. When it cannot tell the logo from the picture (a busy photo, a very faint mark) it rebuilds the whole box instead and says so.</p> },
  { id: 'photo-clean', q: 'Will the result look perfect?', a: <p>On skies, walls, water, studio backgrounds and most AI images it usually does. On detailed textures such as foliage, fabric or crowds the patch can look smooth. Look at the close-ups before you download, and draw a tighter box if something is left.</p> },
  { id: 'photo-many', q: 'Can I remove more than one logo?', a: <p>Yes. After the first box, choose “Add another box” and draw the next one. Every box is removed from the same photo, and “Clear boxes” starts again from the original.</p> },
  { id: 'photo-gemini', q: 'What about the Gemini sparkle on an image?', a: <p>For the Gemini sparkle use the <Link to="/app">Gemini and Veo remover</Link>: it knows the sparkle’s exact shape and gives the real pixels back instead of rebuilding them.</p> },
  { id: 'photo-upload', q: 'Is my photo uploaded?', a: <p>No. The photo is processed in your browser on your own device and never reaches our servers.</p> },
  { id: 'photo-quality', q: 'Do I lose quality?', a: <p>Only the pixels of the logo change. A PNG stays lossless, and a JPG is saved again at high quality. The size and the rest of the picture stay as they were.</p> },
  { id: 'photo-allowed', q: 'Can I remove any watermark?', a: <p>Only from photos you made or have the right to edit. Removing a stock library’s watermark or another photographer’s credit from their work is not what this tool is for.</p> },
];

export function SoraRemover() {
  return (
    <Page
      mode="sora"
      sections={[
        { title: 'What the Sora watermark is', body: <p>Videos downloaded from Sora carry a small white cloud logo, the word “Sora” and the name of the creator. It does not stay in a corner: every few seconds it fades out and returns somewhere else (a corner or the middle of a side). It is almost solid white, so a plain blur or crop never looks right.</p> },
        { title: 'Found by itself, removed at every moment', body: <p>{n} looks through the whole video, learns where the mark sits and when it moves, and removes it from every frame, including the moments when it fades. There is nothing to select. Where the scene stands still, the picture under the mark is copied back from the moments when the mark was elsewhere; where it moves, it is rebuilt from the surroundings.</p> },
        { title: 'Same video, minus the mark', body: <p>Size, frame rate, length and sound stay the same. Only the small area the mark covers is changed. Everything runs on your device, so your videos are never uploaded.</p> },
      ]}
      faq={SORA_FAQ}
      other={<>Other removers: <Link to="/app">Gemini and Veo</Link> · <Link to="/remove-logo-from-video">video logo</Link> · <Link to="/remove-logo-from-photo">photo logo</Link> · <Link to="/tools">all tools</Link></>}
    />
  );
}

export function LogoRemover() {
  return (
    <Page
      mode="logo"
      sections={[
        { title: 'Point at it, and it is gone', body: <p>Add a video, drag a box around the logo and let go. {n} removes it from every frame and shows you the result before you download. It works on any logo or text that stays in one place.</p> },
        { title: 'How the picture under it is rebuilt', body: <p>A logo hides what is behind it, so the picture has to be rebuilt. In a video, moving scenes show the hidden pixels in other frames, and they are copied back. Anything left is filled in from around the logo, frame after frame without flicker.</p> },
        { title: 'What works best, and what does not', body: <p>Small and medium logos over a moving or plain background come out best. A big logo over a detailed, still picture can leave a smooth patch. Logos that move around the picture are not supported yet. Gemini and Veo logos have their own <Link to="/app">automatic remover</Link> that restores the exact pixels.</p> },
      ]}
      faq={VIDEO_FAQ}
      other={<>Other removers: <Link to="/app">Gemini and Veo</Link> · <Link to="/sora-watermark-remover">Sora</Link> · <Link to="/remove-logo-from-photo">photo logo</Link> · <Link to="/tools">all tools</Link></>}
    />
  );
}

export function PhotoRemover() {
  return (
    <Page
      mode="photo"
      sections={[
        { title: 'Box it in, and it is gone', body: <p>Add a photo, drag a box around the logo, the stamp or the watermark and let go. {n} removes it and shows you the result before you download. Add more boxes for more logos.</p> },
        { title: 'Only the logo is rebuilt', body: <p>Inside your box the tool works out which pixels are the logo and which are the picture, and rebuilds only the logo’s pixels from what is around them, then puts the photo’s own grain back. The rest of your box is not touched, so details next to the logo stay sharp.</p> },
        { title: 'What works best, and what does not', body: <p>Logos on skies, walls, water, studio backdrops and most AI images come out best. A logo over fine texture such as foliage, fabric or a crowd can leave a smooth patch; the tool tells you when it had to rebuild the whole box. The Gemini sparkle has its own <Link to="/app">automatic remover</Link> that restores the exact pixels.</p> },
      ]}
      faq={PHOTO_FAQ}
      other={<>Other removers: <Link to="/app">Gemini and Veo</Link> · <Link to="/sora-watermark-remover">Sora</Link> · <Link to="/remove-logo-from-video">video logo</Link> · <Link to="/tools">all tools</Link></>}
    />
  );
}
