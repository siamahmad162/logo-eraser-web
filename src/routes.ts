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
    path: '/pricing',
    title: `Pricing — ${n}`,
    description: `Start free. Upgrade to ${n} Pro for unlimited videos, batch mode and ZIP downloads.`,
  },
  {
    path: '/faq',
    title: `FAQ — ${n}`,
    description: `How ${n} removes watermarks, which files it supports, privacy, and billing.`,
  },
  { path: '/terms', title: `Terms of Service — ${n}`, description: `The terms for using ${n}.` },
  { path: '/privacy', title: `Privacy Policy — ${n}`, description: `How ${n} handles your data. Your files are processed on your device.` },
  { path: '/refunds', title: `Refund Policy — ${n}`, description: `Refunds and cancellations for ${n} subscriptions.` },
];

export const NOT_FOUND: RouteMeta = { path: '/404', title: `Page not found — ${n}`, description: 'This page does not exist.' };

export const normalizePath = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
export const metaFor = (path: string) => ROUTES.find((r) => r.path === normalizePath(path)) || NOT_FOUND;
