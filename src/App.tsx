import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { useRouter } from './router';
import { Home } from './pages/Home';
import { Tool } from './pages/Tool';
import { Pricing } from './pages/Pricing';
import { Faq } from './pages/Faq';
import { Terms, Privacy, Refunds } from './pages/Legal';
import { NotFound } from './pages/NotFound';

const PAGES: Record<string, () => React.JSX.Element> = {
  '/': Home,
  '/app': Tool,
  '/pricing': Pricing,
  '/faq': Faq,
  '/terms': Terms,
  '/privacy': Privacy,
  '/refunds': Refunds,
};

export function App() {
  const { path } = useRouter();
  const Page = PAGES[path] || NotFound;
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header />
      <main id="main" className={path === '/app' ? 'main main-tool' : 'main'}>
        <Page key={path} />
      </main>
      <Footer />
    </>
  );
}
