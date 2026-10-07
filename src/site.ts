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
  legalUpdated: '7 October 2026',
};

// ---------------------------------------------------------------------------------------------------------------
// Ads. Any ad company works: it gives you a small piece of HTML ("ad code" / "tag" / "script") for each ad size.
// Paste each one into `code` below, with the size it was made for. A unit with an empty `code` shows nothing, and
// until one is filled in no ad script is loaded and no space is reserved anywhere. Preview where ads will go with
// ?ads=preview at the end of any page address (for example /tools?ads=preview).
//
//   banner   horizontal ads inside the pages (home, tools, text pages). `desktop` is used on wide screens, `phone`
//            on narrow ones; use the same code for both if the company only has one responsive tag.
//   rail     vertical ads on the left and right of every page, shown on wide screens (about 1560 px and up).
//            160x600 is the usual size; for 300x600 set the width and they show from about 1900 px.
// ---------------------------------------------------------------------------------------------------------------
export type AdUnit = { width: number; height: number; code: string };
export type AdPlace = 'home1' | 'home2' | 'tools1' | 'tool1' | 'tool2' | 'article1' | 'article2';

export const ADS = {
  banner: {
    desktop: { width: 728, height: 90, code: '' } as AdUnit,
    phone: { width: 320, height: 100, code: '' } as AdUnit,
  },
  rail: {
    left: { width: 160, height: 600, code: '' } as AdUnit,
    right: { width: 160, height: 600, code: '' } as AdUnit,
  },
  // which in-page places carry a banner (set one to false to leave that place without an ad)
  places: { home1: true, home2: true, tools1: true, tool1: true, tool2: true, article1: true, article2: true } as Record<AdPlace, boolean>,
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
