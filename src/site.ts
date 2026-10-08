// Everything brand- or business-specific lives here, so a rename or a price change is a one-file edit.
export const SITE = {
  name: 'ClearFrame',
  // Full origin of the live site, without a trailing slash. Canonical links, og:url, the sitemap and the
  // absolute URLs in the structured data all come from it; leave it empty only while there is no live domain.
  url: 'https://vanishlogo.toollyo.com',
  supportEmail: 'support@example.com',
  // Who runs the service, as it should appear in the legal pages.
  operator: 'ClearFrame',
  country: 'Bangladesh',
  legalUpdated: '7 October 2026',
};

// ---------------------------------------------------------------------------------------------------------------
// Ads. Any ad company works: it gives you a small piece of HTML ("ad code" / "tag" / "script") for each ad size.
// Paste each one into `code` below, with the size it was made for, and that unit shows the company's ads.
// A unit whose `code` is empty shows a clearly labelled DEMO ad of the same size (so the layout can be judged and
// nothing else changes when the real code arrives). Set `demo` to false to show nothing instead.
//
//   banner   horizontal ads inside the pages (home, tools, text pages, under every tool). `desktop` is used on wide
//            screens, `phone` on narrow ones; use the same code for both if the company only has one responsive tag.
//   rect     a 300x250 box. It sits beside the drop zone of every tool, in the file list once files are added (so it is
//            on screen while they are cleaned), and beside the text of guides on screens from 1100 px.
//   rail     vertical ads beside every page: on both sides from about 1340 px, on the right only from about 1170 px
//            (narrower screens have no room beside the page). 160x600 is the usual size; for 300x600 set the width and
//            they show from about 1620 px (both) and 1330 px (right only).
// ---------------------------------------------------------------------------------------------------------------
export type AdUnit = { width: number; height: number; code: string };
export type AdPlace = 'home1' | 'home2' | 'home3' | 'tools1' | 'tools2' | 'tool1' | 'tool2' | 'article1' | 'article2' | 'faq1' | 'welcome' | 'work' | 'side';

export const ADS = {
  banner: {
    desktop: { width: 728, height: 90, code: '' } as AdUnit,
    phone: { width: 320, height: 100, code: '' } as AdUnit,
  },
  rect: { width: 300, height: 250, code: '' } as AdUnit,
  rail: {
    left: { width: 160, height: 600, code: '' } as AdUnit,
    right: { width: 160, height: 600, code: '' } as AdUnit,
  },
  // Show a demo ad wherever a unit has no code yet. Set to false once all real codes are in (or to run without ads).
  demo: true,
  // vertical ads on both sides of every page on wide screens (false: none)
  rails: true,
  // which places carry an ad (set one to false to leave that place without an ad)
  places: { home1: true, home2: true, home3: true, tools1: true, tools2: true, tool1: true, tool2: true, article1: true, article2: true, faq1: true, welcome: true, work: true, side: true } as Record<AdPlace, boolean>,
  // Start the ad in the file list while files are being cleaned (that is when visitors wait and look). Cleaning is not
  // slowed by an ordinary banner; if a video-ad company's ads make it stutter, set this to false.
  workWhileBusy: true,
  // Scripts the ad company asks you to add once for the whole site (addresses only). Loaded after the page has settled.
  scripts: [] as string[],
  // Lines for /ads.txt, exactly as the ad company gives them (one per entry). Left empty, no ads.txt is written.
  adsTxt: [] as string[],
  // Run each ad in its own sandboxed frame, so ad code can never reach the page (and the files you are cleaning).
  // Switch to false only if a company's ads do not show while sandboxed.
  isolate: true,
  // Ask visitors before ads that use cookies are loaded: 'eu' (only where a visitor's time zone is in Europe),
  // 'all' (everyone) or 'off' (never ask; only if the ad company handles consent itself).
  consent: 'eu' as 'eu' | 'all' | 'off',
};
