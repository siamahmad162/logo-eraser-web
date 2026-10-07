import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import { Router } from './router';
export { ROUTES, NOT_FOUND } from './routes';
export { SITE, ADS } from './site';

export function render(path: string) {
  return renderToString(
    <StrictMode>
      <Router initialPath={path}>
        <App />
      </Router>
    </StrictMode>,
  );
}
