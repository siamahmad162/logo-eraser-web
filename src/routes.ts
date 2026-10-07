import { GUIDES, LANDINGS } from './content/meta';
import { SITE } from './site';

export type RouteMeta = { path: string; title: string; description: string };

const n = SITE.name;
export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: `${n} — Remove AI watermarks from videos and photos`,
    description: 'Free tools that remove the Gemini, Veo and Sora watermarks, or any logo, from videos and photos. They run in your browser: nothing is uploaded, no sign-up.',
  },
  {
    path: '/app',
    title: `Watermark remover — ${n}`,
    description: 'Drop in videos or photos and remove the AI watermark frame by frame, right in your browser.',
  },
  {
    path: '/sora-watermark-remover',
    title: `Sora Watermark Remover — No Upload`,
    description: 'Remove the moving Sora watermark from your videos automatically. Found at every moment, rebuilt frame by frame, in your browser. Nothing is uploaded.',
  },
  {
    path: '/remove-logo-from-video',
    title: `Remove a Logo from a Video — ${n}`,
    description: 'Drag a box around a logo, a badge or a date stamp and it is removed from every frame of the video. Runs in your browser; nothing is uploaded.',
  },
  {
    path: '/remove-logo-from-photo',
    title: `Remove a Logo from a Photo — ${n}`,
    description: 'Drag a box around a logo, a stamp or a watermark and it is removed from the photo. Only the logo itself is rebuilt. Runs in your browser; nothing is uploaded.',
  },
  {
    path: '/tools',
    title: `All tools: Gemini, Veo, Sora and any-logo removers — ${n}`,
    description: 'Four watermark and logo removers for videos and photos: Gemini and Veo, Sora, any logo in a video, any logo in a photo. All run in your browser.',
  },
  {
    path: '/faq',
    title: `FAQ — ${n}`,
    description: `How ${n} removes watermarks, which files it supports, privacy, and why it is free.`,
  },
  ...LANDINGS.map((l) => ({ path: l.path, title: `${l.title} — ${n}`, description: l.description })),
  {
    path: '/how-it-works',
    title: `How ${n} removes watermarks — ${n}`,
    description: 'The maths behind restoring the pixels under a see-through watermark, step by step, and why it all happens on your own device.',
  },
  {
    path: '/guides',
    title: `Guides — ${n}`,
    description: 'Practical guides to removing AI watermarks, keeping video quality and labelling AI-generated content correctly.',
  },
  ...GUIDES.map((g) => ({ path: `/guides/${g.slug}`, title: `${g.title} — ${n}`, description: g.description })),
  { path: '/about', title: `About — ${n}`, description: `Who makes ${n}, and the principles behind it: privacy, honest results and responsible use.` },
  { path: '/contact', title: `Contact — ${n}`, description: `Get help with ${n}, report an ad, or write to us about business enquiries.` },
  { path: '/terms', title: `Terms of Service — ${n}`, description: `The terms for using ${n}.` },
  { path: '/privacy', title: `Privacy Policy — ${n}`, description: `How ${n} handles your data. Your files are processed on your device.` },
];

export const NOT_FOUND: RouteMeta = { path: '/404', title: `Page not found — ${n}`, description: 'This page does not exist.' };

export const normalizePath = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
export const metaFor = (path: string) => ROUTES.find((r) => r.path === normalizePath(path)) || NOT_FOUND;
