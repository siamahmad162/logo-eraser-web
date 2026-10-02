// Titles and descriptions of the content pages (kept apart from the page bodies so the route table
// can use them without pulling in any JSX).

export type GuideMeta = {
  slug: string;
  title: string;
  description: string;
  published: string; // ISO date
  updated: string;
  minutes: number;
};

export const GUIDES: GuideMeta[] = [
  {
    slug: 'remove-gemini-watermark-from-video',
    title: 'How to remove the Gemini watermark from a video, step by step',
    description: 'A step-by-step guide to removing the sparkle logo from Gemini and Veo videos without blurring, cropping or losing quality.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 5,
  },
  {
    slug: 'blur-crop-or-restore',
    title: 'Blur, crop or restore? Three ways to remove a watermark, compared',
    description: 'Why blurred and cropped watermarks look bad, why AI inpainting flickers in video, and how restoring the pixels under a see-through logo works.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 6,
  },
  {
    slug: 'visible-watermark-vs-synthid',
    title: 'Visible watermark vs SynthID: what removing the logo does, and doesn’t do',
    description: 'The visible sparkle and Google’s invisible SynthID watermark are different things. Here is what changes when you remove the logo and what stays.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 4,
  },
  {
    slug: 'label-ai-generated-content',
    title: 'How to label AI-generated videos on YouTube, TikTok, Instagram and Facebook',
    description: 'Where to find the AI disclosure setting on each platform, when you need it, and why labelling protects your account.',
    published: '2026-10-02',
    updated: '2026-10-02',
    minutes: 5,
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

export const LANDINGS: LandingMeta[] = [
  {
    path: '/gemini-watermark-remover',
    title: 'Gemini watermark remover for videos and photos',
    description: 'Remove the sparkle logo from Gemini videos and images. Each frame is restored, not blurred, and your files never leave your device.',
  },
  {
    path: '/veo-watermark-remover',
    title: 'Veo watermark remover: clean AI videos frame by frame',
    description: 'Remove the sparkle and the “Veo” text logo from Veo videos while keeping the resolution, frame rate and audio exactly as they were.',
  },
  {
    path: '/ai-image-watermark-remover',
    title: 'Remove the sparkle watermark from AI images',
    description: 'Clean the corner logo off AI-generated PNG, JPG and WebP images in seconds. Lossless for PNG, private and in your browser.',
  },
];
