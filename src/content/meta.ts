// Titles and descriptions of the content pages (kept apart from the page bodies so the route table
// can use them without pulling in any JSX).

export type GuideMeta = {
  slug: string;
  title: string;
  /** a shorter title for search results (the page itself keeps the long one) */
  seoTitle?: string;
  description: string;
  published: string; // ISO date
  updated: string;
  minutes: number;
};

export const GUIDES: GuideMeta[] = [
  {
    slug: 'remove-gemini-watermark-from-video',
    seoTitle: 'Remove the Gemini Watermark from a Video',
    title: 'How to remove the Gemini watermark from a video, step by step',
    description: 'A step-by-step guide to removing the sparkle logo from Gemini and Veo videos without blurring, cropping or losing quality.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 5,
  },
  {
    slug: 'blur-crop-or-restore',
    seoTitle: 'Blur, Crop or Restore a Watermark? Compared',
    title: 'Blur, crop or restore? Three ways to remove a watermark, compared',
    description: 'Why blurred and cropped watermarks look bad, why AI inpainting flickers in video, and how restoring the pixels under a see-through logo works.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 6,
  },
  {
    slug: 'visible-watermark-vs-synthid',
    seoTitle: 'Visible Watermark vs SynthID: What Changes',
    title: 'Visible watermark vs SynthID: what removing the logo does, and doesn’t do',
    description: 'The visible sparkle and Google’s invisible SynthID watermark are different things. Here is what changes when you remove the logo and what stays.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 4,
  },
  {
    slug: 'label-ai-generated-content',
    seoTitle: 'How to Label AI Videos on YouTube, TikTok, Instagram',
    title: 'How to label AI-generated videos on YouTube, TikTok, Instagram and Facebook',
    description: 'Where to find the AI disclosure setting on each platform, when you need it, and why labelling protects your account.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 5,
  },
  {
    slug: 'watermark-remover-without-upload',
    seoTitle: 'Watermark Remover Without Upload: Is It Safe?',
    title: 'Watermark remover without upload: is it safe, and how does it work?',
    description: 'Why a watermark remover that runs in your browser keeps your videos and photos private, how it works, and what to check in any online tool.',
    published: '2026-10-07',
    updated: '2026-10-07',
    minutes: 4,
  },
  {
    slug: 'batch-remove-watermarks',
    title: 'How to remove watermarks from many videos at once',
    description: 'Use batch mode to clean a whole folder of AI videos and photos in one go, then download everything as a single ZIP.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 4,
  },
];

export type LandingMeta = { path: string; title: string; description: string };

// the use-case pages (their content is in landings.ts)
import { LANDINGS as LANDING_PAGES, USE_CASES_HUB } from './landings';
export const LANDINGS: LandingMeta[] = LANDING_PAGES.map((l) => ({ path: l.path, title: l.title, description: l.description }));
export const HUB: LandingMeta = USE_CASES_HUB;
