import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';
import { App } from './App';
import { Router } from './router';
import { metaFor, normalizePath, ROUTES } from './routes';

const root = document.getElementById('root')!;
const tree = (
  <StrictMode>
    <Router initialPath={location.pathname}>
      <App />
    </Router>
  </StrictMode>
);
// Each page ships prerendered. Hosts that answer unknown paths with index.html would hand us the
// wrong page's markup, so only hydrate markup that was rendered for this path.
const path = normalizePath(location.pathname);
const expected = ROUTES.some((r) => r.path === path) ? path : '/404';
if (root.firstElementChild && root.dataset.page === expected) hydrateRoot(root, tree);
else {
  root.textContent = '';
  document.title = metaFor(path).title;
  createRoot(root).render(tree);
}
