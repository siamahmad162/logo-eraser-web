import { GUIDES, HUB, LANDINGS } from './content/meta';
import { SITE } from './site';

export type RouteMeta = { path: string; title: string; description: string };

const n = SITE.name;
export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: `${n}: Free Watermark Remover for AI Videos and Photos`,
    description: 'Free online tools to remove the Gemini Omni, Veo and Gemini photo watermark from your videos and images. They run in your browser: no upload, no sign-up.',
  },
  {
    path: '/gemini-omni-watermark-remover',
    title: `Gemini Omni Watermark Remover, Free — ${n}`,
    description: 'Remove the Gemini sparkle from your videos for free. It is found by itself and the real picture under it is restored frame by frame, in your browser. No upload.',
  },
  {
    path: '/veo-watermark-remover',
    title: `Veo Watermark Remover, Free — No Upload | ${n}`,
    description: 'Remove the Veo text mark and the sparkle from your clips for free, wide or vertical. Found automatically and removed from every frame in your browser. No upload.',
  },
  {
    path: '/gemini-photo-watermark-remover',
    title: `Gemini Photo Watermark Remover, Free — ${n}`,
    description: 'Remove the Gemini sparkle from your images for free. It is fitted to your picture and reversed in seconds, with no blur. PNG stays lossless. Nothing is uploaded.',
  },
  {
    path: '/tools',
    title: `Free Gemini, Veo and AI Watermark Removers — ${n}`,
    description: 'Three free removers: Gemini Omni for videos, Veo for clips and Gemini photo for images. Before and after examples for each. They run in your browser: no upload.',
  },
  {
    path: '/faq',
    title: `FAQ: Watermark Removal, Files, Privacy and Cost — ${n}`,
    description: `Answers about how ${n} removes watermarks, which videos and photos it takes, what stays private and why the tools are free.`,
  },
  { path: HUB.path, title: `${HUB.title} — ${n}`, description: HUB.description },
  ...LANDINGS.map((l) => ({ path: l.path, title: `${l.title} — ${n}`, description: l.description })),
  {
    path: '/how-it-works',
    title: `How a Watermark Is Removed, Step by Step — ${n}`,
    description: 'How the pixels under a see-through watermark are restored, how a solid logo is rebuilt, and why it all happens on your own device.',
  },
  {
    path: '/guides',
    title: `Guides: Remove AI Watermarks and Logos — ${n}`,
    description: 'Practical guides to removing the Gemini and Veo watermarks from videos and images, keeping quality, working in batches and labelling AI content.',
  },
  ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, title: `${g.seoTitle || g.title} — ${n}`, description: g.description })),
  { path: '/about', title: `About ${n}: Free, Private Watermark Removal`, description: `Who makes ${n}, and the principles behind it: privacy, honest results and responsible use.` },
  { path: '/contact', title: `Contact ${n}: Help, Feedback and Business`, description: `Get help with a file, report an ad, send feedback or write to us about business enquiries. We usually reply within one or two working days.` },
  { path: '/terms', title: `Terms of Service — ${n}`, description: `The terms for using ${n}: what you may process, acceptable use, how the free, ad-supported service works, and our limits of liability.` },
  { path: '/privacy', title: `Privacy Policy — ${n}`, description: `How ${n} handles your data: your files are processed on your device and never uploaded; what the website collects and how advertising works.` },
];

export const NOT_FOUND: RouteMeta = { path: '/404', title: `Page not found — ${n}`, description: 'This page does not exist.' };

export const normalizePath = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
export const metaFor = (path: string) => ROUTES.find((r) => r.path === normalizePath(path)) || NOT_FOUND;
