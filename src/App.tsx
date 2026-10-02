import { Fragment } from 'react';
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
import { GUIDES, LANDINGS } from './content/meta';

const PAGES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/app': Tool,
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

export function App() {
  const { path } = useRouter();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" className={path === '/app' ? 'main main-tool' : 'main'}>
        <Fragment key={path}>{renderPage(path)}</Fragment>
      </main>
      <Footer />
    </>
  );
}
