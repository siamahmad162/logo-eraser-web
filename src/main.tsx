import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { App } from './App';
import { currentPath, Router } from './router';
import { metaFor, ROUTES } from './routes';

const root = document.getElementById('root')!;
const path = currentPath();
const tree = (
  <StrictMode>
    <Router initialPath={path}>
      <App />
    </Router>
  </StrictMode>
);
// Each page ships prerendered. Hosts that answer unknown paths with index.html would hand us the
// wrong page's markup, so only hydrate markup that was rendered for this path.
const expected = ROUTES.some((r) => r.path === path) ? path : '/404';
if (root.firstElementChild && root.dataset.page === expected) hydrateRoot(root, tree);
else {
  root.textContent = '';
  document.title = metaFor(path).title;
  createRoot(root).render(tree);
}
