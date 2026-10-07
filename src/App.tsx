import { Fragment, useEffect } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { useRouter } from './router';
import { Home } from './pages/Home';
import { Tool } from './pages/Tool';
import { Pricing } from './pages/Pricing';
import { Faq } from './pages/Faq';
import { Terms, Privacy, Refunds } from './pages/Legal';
import { NotFound } from './pages/NotFound';
import { Landing } from './pages/Landing';
import { Guide, Guides } from './pages/Guides';
import { HowItWorks } from './pages/HowItWorks';
import { About } from './pages/About';
import { Contact } from './pages/Contact';
import { SoraRemover, LogoRemover, PhotoRemover } from './pages/OtherTools';
import { Tools } from './pages/Tools';
import { TOOL_PATHS as TOOL_LIST } from './content/tools';
import { GUIDES, LANDINGS } from './content/meta';

const TOOL_PATHS = new Set(TOOL_LIST);
const PAGES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/app': () => <Tool />,
  '/sora-watermark-remover': SoraRemover,
  '/remove-logo-from-video': LogoRemover,
  '/remove-logo-from-photo': PhotoRemover,
  '/tools': Tools,
  '/pricing': Pricing,
  '/faq': Faq,
  '/terms': Terms,
  '/privacy': Privacy,
  '/refunds': Refunds,
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
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" className={TOOL_PATHS.has(path) ? 'main main-tool' : 'main'}>
        <Fragment key={path}>{renderPage(path)}</Fragment>
      </main>
      <Footer />
    </>
  );
}
