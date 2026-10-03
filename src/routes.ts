import { GUIDES, LANDINGS } from './content/meta';
import { SITE } from './site';

export type RouteMeta = { path: string; title: string; description: string };

const n = SITE.name;
export const ROUTES: RouteMeta[] = [
  {
    path: '/',
    title: `${n} — Remove AI watermarks from videos and photos`,
    description: 'Remove the corner sparkle and text watermarks from AI-generated videos and photos. Frame-by-frame restoration that runs in your browser — nothing is uploaded.',
  },
  {
    path: '/app',
    title: `Watermark remover — ${n}`,
    description: 'Drop in videos or photos and remove the AI watermark frame by frame, right in your browser.',
  },
  {
    path: '/sora-watermark-remover',
    title: `Sora Watermark Remover — Free to Try, No Upload`,
    description: 'Remove the moving Sora watermark from your videos automatically. Found at every moment, rebuilt frame by frame, in your browser. Nothing is uploaded.',
  },
  {
    path: '/remove-logo',
    title: `Remove a Logo from Any Video or Photo — ${n}`,
    description: 'Drag a box around a logo, a badge or a date stamp and it is removed from the video or photo. Runs in your browser; nothing is uploaded.',
  },
  {
    path: '/pricing',
    title: `Pricing — ${n}`,
    description: `Start free. Upgrade to ${n} Pro for unlimited videos, batch mode and ZIP downloads.`,
  },
  {
    path: '/faq',
    title: `FAQ — ${n}`,
    description: `How ${n} removes watermarks, which files it supports, privacy, and billing.`,
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
  { path: '/contact', title: `Contact — ${n}`, description: `Get help with ${n}, billing questions or business enquiries.` },
  { path: '/terms', title: `Terms of Service — ${n}`, description: `The terms for using ${n}.` },
  { path: '/privacy', title: `Privacy Policy — ${n}`, description: `How ${n} handles your data. Your files are processed on your device.` },
  { path: '/refunds', title: `Refund Policy — ${n}`, description: `Refunds and cancellations for ${n} subscriptions.` },
];

export const NOT_FOUND: RouteMeta = { path: '/404', title: `Page not found — ${n}`, description: 'This page does not exist.' };

export const normalizePath = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
export const metaFor = (path: string) => ROUTES.find((r) => r.path === normalizePath(path)) || NOT_FOUND;
