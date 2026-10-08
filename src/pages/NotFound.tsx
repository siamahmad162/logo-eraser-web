import { Link } from '../router';

export function NotFound() {
  return (
    <section className="page-head not-found">
      <div className="wrap narrow">
        <p className="eyebrow">404</p>
        <h1>This page doesn’t exist.</h1>
        <p className="lede">It may have moved, or the link has a typo.</p>
        <div className="cta-row">
          <Link to="/" className="btn btn-primary">Go home</Link>
          <Link to="/tools" className="btn btn-ghost">See all tools</Link>
        </div>
      </div>
    </section>
  );
}
