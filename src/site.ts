// Everything brand- or business-specific lives here, so a rename or a price change is a one-file edit.
export const SITE = {
  name: 'ClearFrame',
  // Full origin of the live site, without a trailing slash (e.g. 'https://clearframe.app').
  // Leave empty until the domain is bought; canonical links and the sitemap are added once it is set.
  url: '',
  supportEmail: 'support@example.com',
  // Who runs the service, as it should appear in the legal pages.
  operator: 'ClearFrame',
  country: 'Bangladesh',
  legalUpdated: '2 October 2026',
  // Flip to true once checkout is wired up (stage 3).
  paymentsLive: false,
};

export type Plan = {
  id: 'free' | 'pro';
  name: string;
  monthly: number;
  yearly: number; // price per year
  blurb: string;
  features: string[];
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    blurb: 'Try it on a few files.',
    features: [
      '3 videos a day, up to 20 seconds each',
      '10 photos a day',
      'Full resolution, frame rate and audio kept',
      'Files never leave your device',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly: 9.99,
    yearly: 79,
    blurb: 'For creators who publish every day.',
    highlight: true,
    features: [
      'Unlimited videos, up to 10 minutes each',
      'Unlimited photos',
      'Batch mode: drop in dozens of files at once',
      'Download everything as one ZIP',
      'Maximum-quality export',
      'Priority email support',
    ],
  },
];
