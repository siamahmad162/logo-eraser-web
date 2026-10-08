import type { ReactNode } from 'react';
import { Link } from './router';
import { SITE } from './site';

export type Qa = { id: string; q: string; a: ReactNode };

export const FAQ: Qa[] = [
  {
    id: 'which-watermarks',
    q: 'Which watermarks can it remove?',
    a: (
      <>
        <p>The four-pointed sparkle that Google Gemini puts in the corner of generated videos and images, and the “Veo” text logo that Veo clips can carry. Each has its own remover, and all three find the logo on their own: the <Link to="/gemini-omni-watermark-remover">Gemini Omni watermark remover</Link> for videos, the <Link to="/veo-watermark-remover">Veo watermark remover</Link> for Veo clips and the <Link to="/gemini-photo-watermark-remover">Gemini photo watermark remover</Link> for images.</p>
        <p>See <Link to="/tools">all tools</Link> to pick the one that matches your file.</p>
      </>
    ),
  },
  {
    id: 'clean',
    q: 'Is anything left behind?',
    a: (
      <>
        <p>The sparkle is see-through, so the real picture is still in every frame, just blended with white. {SITE.name} measures the logo’s exact shape and opacity in your file, reverses that blend in every frame, and then cleans the compression noise along its edge. On most videos nothing is left to see, even zoomed in.</p>
        <p>Where a logo is fully opaque there is nothing underneath to recover, so those pixels are filled in from their surroundings.</p>
      </>
    ),
  },
  {
    id: 'upload',
    q: 'Are my files uploaded anywhere?',
    a: <p>No. Everything runs in your browser on your own device. Your videos and photos never reach our servers, so they stay private and you don’t wait for uploads.</p>,
  },
  {
    id: 'quality',
    q: 'Will I lose quality?',
    a: (
      <>
        <p>Resolution, frame rate and the number of frames stay exactly the same, and the audio is copied untouched. Because pixels change, the video has to be re-encoded: Maximum quality uses about 2.5× the original bitrate, so the difference isn’t visible.</p>
        <p>PNG photos stay lossless. JPEGs are saved at 95% quality. WebP photos come back as PNG.</p>
      </>
    ),
  },
  {
    id: 'formats',
    q: 'Which files and browsers work?',
    a: (
      <>
        <p>Videos: MP4, MOV, WebM and MKV, in any codec your browser can decode (H.264, HEVC, VP9, AV1). Results are saved as MP4. Photos: PNG, JPG and WebP.</p>
        <p>A recent Chrome or Edge on a computer works best. Recent Safari and Firefox handle most files. Phones are fine for photos and short clips.</p>
      </>
    ),
  },
  {
    id: 'speed',
    q: 'How long does it take?',
    a: <p>It depends on your computer and on the video’s length and resolution. Each file shows its own progress, and batch mode works through the whole list while you do something else.</p>,
  },
  {
    id: 'allowed',
    q: 'Am I allowed to remove the watermark?',
    a: (
      <>
        <p>Only use {SITE.name} on content you created or have the right to edit, and follow the terms of the service that generated it.</p>
        <p>Removing the visible logo doesn’t change where the content came from. AI media also carries invisible watermarks such as Google’s SynthID, which {SITE.name} does not remove, and many platforms and laws require AI-generated content to be labelled. Please keep doing that. See our <Link to="/terms">Terms</Link>.</p>
      </>
    ),
  },
  {
    id: 'free',
    q: 'Is it really free?',
    a: (
      <>
        <p>Yes. Every tool is free, with no sign-up, no limit on how many files you clean and no watermark of ours added to your results.</p>
        <p>{SITE.name} is paid for by ads on the pages around the tools. Ads are never placed inside a tool or next to its buttons, and they never see your files, because your files never leave your device.</p>
      </>
    ),
  },
  {
    id: 'google',
    q: `Is ${SITE.name} made by Google?`,
    a: <p>No. {SITE.name} is an independent tool, not affiliated with or endorsed by Google. Gemini and Veo are trademarks of Google LLC, mentioned only to describe compatibility.</p>,
  },
];

export function FaqList({ items }: { items: Qa[] }) {
  return (
    <div className="faq">
      {items.map((x) => (
        <details key={x.id} id={x.id} className="faq-item">
          <summary>{x.q}</summary>
          <div className="faq-a">{x.a}</div>
        </details>
      ))}
    </div>
  );
}
