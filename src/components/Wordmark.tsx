import { SITE } from '../site';

// The name in two weights of colour: the first word in the text colour, the second in the accent ("Vanish" + "Logo").
export function Wordmark() {
  const m = SITE.name.match(/^(.+?)([A-Z][a-z]+)$/);
  return m ? <span className="wordmark">{m[1]}<span className="wordmark-accent">{m[2]}</span></span> : <span className="wordmark">{SITE.name}</span>;
}
