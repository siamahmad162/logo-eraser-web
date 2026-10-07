import { GUIDES, LANDINGS } from './content/meta';
import { SITE } from './site';

export type RouteMeta = { path: string; title: string; description: string };

const n = SITE.name;
export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: `${n}: Free Watermark Remover for AI Videos and Photos`,
    description: 'Free online tools to remove the Gemini, Veo and Sora watermark, or any logo, from videos and photos. They run in your browser: no upload, no sign-up.',
  },
  {
    path: '/app',
    title: `Gemini & Veo Watermark Remover, Free — ${n}`,
    description: 'Remove the Gemini sparkle and the Veo text mark from videos and photos for free. The real pixels are restored frame by frame in your browser, with no upload.',
  },
  {
    path: '/sora-watermark-remover',
    title: `Sora Watermark Remover, Free — No Upload | ${n}`,
    description: 'Remove the moving Sora watermark from your videos for free. It is found at every moment and rebuilt frame by frame, in your browser. Nothing is uploaded.',
  },
  {
    path: '/remove-logo-from-video',
    title: `Remove a Logo from a Video, Free — ${n}`,
    description: 'Remove a logo, badge or date stamp from a video for free. Draw one box and it is rebuilt in every frame, right in your browser. Nothing is uploaded.',
  },
  {
    path: '/remove-logo-from-photo',
    title: `Remove a Logo from a Photo, Free — ${n}`,
    description: 'Remove a logo, stamp or watermark from a photo for free. Draw a box and only the logo’s own pixels are rebuilt. It runs in your browser; nothing is uploaded.',
  },
  {
    path: '/tools',
    title: `Free Watermark and Logo Removers for Video and Photo — ${n}`,
    description: 'Four free removers for videos and photos: Gemini and Veo, Sora, any logo in a video and any logo in a photo. Before and after examples. No upload.',
  },
  {
    path: '/faq',
    title: `FAQ: Watermark Removal, Files, Privacy and Cost — ${n}`,
    description: `Answers about how ${n} removes watermarks, which videos and photos it takes, what stays private and why the tools are free.`,
  },
  ...LANDINGS.map((l) => ({ path: l.path, title: `${l.title} — ${n}`, description: l.description })),
  {
    path: '/how-it-works',
    title: `How a Watermark Is Removed, Step by Step — ${n}`,
    description: 'How the pixels under a see-through watermark are restored, how a solid logo is rebuilt, and why it all happens on your own device.',
  },
  {
    path: '/guides',
    title: `Guides: Remove AI Watermarks and Logos — ${n}`,
    description: 'Practical guides to removing the Gemini, Veo and Sora watermarks and any logo from videos and photos, keeping quality and labelling AI content.',
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
