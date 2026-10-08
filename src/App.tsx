import { Fragment, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { AdRail, useRails } from './components/AdSlot';
import { ConsentBar } from './components/ConsentBar';
import { useRouter } from './router';
import { Home } from './pages/Home';
import { Faq } from './pages/Faq';
import { Terms, Privacy } from './pages/Legal';
import { NotFound } from './pages/NotFound';
import { Landing } from './pages/Landing';
import { Guide, Guides } from './pages/Guides';
import { HowItWorks } from './pages/HowItWorks';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { OmniRemover, VeoRemover, GeminiPhotoRemover } from './pages/ToolPages';
import { Tools } from './pages/Tools';
import { TOOL_PATHS as TOOL_LIST } from './content/tools';
import { GUIDES, LANDINGS } from './content/meta';

const TOOL_PATHS = new Set(TOOL_LIST);
const PAGES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/gemini-omni-watermark-remover': OmniRemover,
  '/veo-watermark-remover': VeoRemover,
  '/gemini-photo-watermark-remover': GeminiPhotoRemover,
  '/tools': Tools,
  '/faq': Faq,
  '/terms': Terms,
  '/privacy': Privacy,
  '/how-it-works': HowItWorks,
  '/guides': Guides,
  '/about': About,
  '/contact': Contact,
};

function renderPage(path: string) {
  const Page = PAGES[path];
  if (Page) return <Page />;
  if (LANDINGS.some((l) => l.path === path)) return <Landing path={path} />;
  const slug = path.startsWith('/guides/') ? path.slice(8) : '';
  if (GUIDES.some((g) => g.slug === slug)) return <Guide slug={slug} />;
  return <NotFound />;
}

// Sections marked data-reveal fade in as they scroll into view (after hydration, per page).
function useReveal(path: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') { document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    const scan = () => document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.getElementById('main')!, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [path]);
}

export function App() {
  const { path } = useRouter();
  useReveal(path);
  const rails = useRails();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      {rails.on && <style>{`@media (min-width:${rails.one}px){.page-frame.has-rails{display:grid;grid-template-columns:minmax(0,1fr) ${rails.width}px;column-gap:12px;padding-inline:16px}.page-frame.has-rails>.rail-right{display:block}}@media (min-width:${rails.both}px){.page-frame.has-rails{grid-template-columns:${rails.width}px minmax(0,1fr) ${rails.width}px}.page-frame.has-rails>.rail-left{display:block}}`}</style>}
      <div className={rails.on ? 'page-frame has-rails' : 'page-frame'}>
        {rails.on && <AdRail side="left" width={rails.width} one={rails.one} both={rails.both} preview={rails.preview} />}
        <main id="main" className={TOOL_PATHS.has(path) ? 'main main-tool' : 'main'}>
          <Fragment key={path}>{renderPage(path)}</Fragment>
        </main>
        {rails.on && <AdRail side="right" width={rails.width} one={rails.one} both={rails.both} preview={rails.preview} />}
      </div>
      <Footer />
      <ConsentBar />
    </>
  );
}
