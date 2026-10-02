# ClearFrame

A website for removing AI watermarks (the corner sparkle in Gemini/Veo videos and photos, the Veo
text logo, and other steady corner logos). The removal runs entirely in the visitor's browser: files
are never uploaded.

- **Home** `/` – before/after demo, how it works, features, pricing, FAQ
- **Remover** `/app` – the tool itself
- **Pricing** `/pricing`, **FAQ** `/faq`
- **Legal** `/terms`, `/privacy`, `/refunds`

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run preview    # serve dist/ at http://localhost:4173
```

## Deploy (Cloudflare Pages, free)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick this repository.
2. Framework preset: **None**. Build command: `npm run build`. Build output directory: `dist`.
3. Save and deploy. Every push to `main` redeploys automatically.
4. Add your domain under **Custom domains**, then set `url` in `src/site.ts` to it (this turns on
   canonical links, the sitemap and the social preview image).

`public/_headers` sets caching and security headers on Cloudflare Pages. `vercel.json` does the
same job if you host on Vercel instead.

## Where things are

| What | Where |
| --- | --- |
| Name, prices, support email, legal details | `src/site.ts` |
| Page titles and descriptions (SEO) | `src/routes.ts` |
| FAQ answers | `src/faq.tsx` |
| Pages | `src/pages/` |
| Styles and colours | `src/styles.css` (tool: `src/engine/tool.css`) |
| Removal engine | `src/engine/core.js` |
| Tool page logic and markup | `src/engine/tool.js`, `src/engine/tool-markup.html` |
| Before/after demo images | `public/demo/` |

Every page is prerendered to its own HTML file at build time (`scripts/prerender.mjs`), so pages
load fast and search engines can read them without running JavaScript.

## Roadmap

1. ✅ Static site: home, remover, pricing, FAQ, legal pages
2. Accounts (Google sign-in) and free-plan limits with Supabase
3. Payments (Paddle or Lemon Squeezy as merchant of record), Pro plan
4. More languages, blog and SEO pages

## Before taking payments

- Replace `supportEmail` in `src/site.ts` with a real address on your domain.
- Have the Terms, Privacy and Refund pages reviewed for your business and country.
- Keep the honest wording: the tool removes the *visible* logo only; invisible watermarks such as
  SynthID remain, and users must have the rights to the content they edit.

Video decoding and encoding use [Mediabunny](https://mediabunny.dev) (MPL-2.0).
