import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const LogoMark = (p: P) => (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...p}>
    <rect x="3" y="7" width="34" height="26" rx="4" stroke="currentColor" strokeWidth="2.6" strokeDasharray="5 3.4" />
    <path d="M13 26 27 14" stroke="var(--ink)" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);
export const ArrowRight = (p: P) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const Check = (p: P) => (<svg {...base} strokeWidth={2.2} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>);
export const Upload = (p: P) => (<svg {...base} {...p}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>);
export const Download = (p: P) => (<svg {...base} {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>);
export const Scan = (p: P) => (<svg {...base} {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" /></svg>);
export const Frames = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>);
export const Lock = (p: P) => (<svg {...base} {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const Gauge = (p: P) => (<svg {...base} {...p}><path d="M4 16a8 8 0 1 1 16 0" /><path d="M12 16l4-5" /></svg>);
export const Stack = (p: P) => (<svg {...base} {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);
export const Photo = (p: P) => (<svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>);
export const Text = (p: P) => (<svg {...base} {...p}><path d="M5 6h14M12 6v12M9 18h6" /></svg>);
export const Globe = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>);
export const Menu = (p: P) => (<svg {...base} strokeWidth={2} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const Close = (p: P) => (<svg {...base} strokeWidth={2} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const ChevronDown = (p: P) => (<svg {...base} strokeWidth={2} {...p}><path d="M6 9l6 6 6-6" /></svg>);
export const Sparkle = (p: P) => (<svg {...base} {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" /></svg>);
export const Cloud = (p: P) => (<svg {...base} {...p}><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18z" /></svg>);
export const Film = (p: P) => (<svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M10 9.5v5l4-2.5z" /></svg>);
export const Box = (p: P) => (<svg {...base} {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeDasharray="2 2.4" /><rect x="8" y="8" width="8" height="8" rx="1" /></svg>);
export const Mail = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>);
export const ArrowUp = (p: P) => (<svg {...base} strokeWidth={2} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>);
