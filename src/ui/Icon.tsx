import type { CSSProperties, ReactNode } from 'react';

/** Aven icon set — authored on a 24 grid, 1.8 stroke, round joins. */
const P: Record<string, ReactNode> = {
  today: <><path d="M4 18.5V9l8-5.5L20 9v9.5" /><path d="M9 18.5v-5h6v5" /><path d="M3 18.5h18" /></>,
  train: <><path d="M6.5 7v10M17.5 7v10" /><path d="M3.5 9.5v5M20.5 9.5v5" /><path d="M6.5 12h11" /></>,
  food: <><path d="M7 3v7a2.5 2.5 0 0 0 2.5 2.5V21" /><path d="M11.8 3v7.2" /><path d="M4.2 3v7.2" /><path d="M17 21V3c-2.4 1.2-3.5 4-3.5 7.5 0 1.5.9 2.5 2 2.5H17" /></>,
  progress: <><path d="M4 19.5h16" /><path d="M6 15.5l4-4.5 3.2 2.8L19 7" /><path d="M15.5 7H19v3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevR: <path d="M9.5 6l6 6-6 6" />,
  chevL: <path d="M14.5 6l-6 6 6 6" />,
  chevD: <path d="M6 9.5l6 6 6-6" />,
  chevU: <path d="M6 14.5l6-6 6 6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>,
  drop: <path d="M12 3.5c3.6 4.2 5.5 7 5.5 9.8a5.5 5.5 0 0 1-11 0c0-2.8 1.9-5.6 5.5-9.8z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  barcode: <><path d="M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12" strokeWidth="1.4" /><path d="M2.5 9V4.5H7M17 4.5h4.5V9M21.5 15v4.5H17M7 19.5H2.5V15" /></>,
  trash: <><path d="M5 7h14" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l.8 12.5h9.4L17.5 7" /></>,
  edit: <><path d="M4 20l1-4.2L16.5 4.3a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.2 19z" /><path d="M14.5 6.5l3 3" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" /></>,
  star: <path d="M12 3.8l2.4 5 5.5.7-4 3.8 1 5.4L12 16l-4.9 2.7 1-5.4-4-3.8 5.5-.7z" />,
  undo: <><path d="M8.5 7L4.5 11l4 4" /><path d="M5 11h9.5a4.5 4.5 0 0 1 0 9H11" /></>,
  more: <><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></>,
  pause: <><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" /></>,
  play: <path d="M8 5.2v13.6a.6.6 0 0 0 .9.5l10.8-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  note: <><path d="M5.5 4h10L19 7.5V20H5.5z" /><path d="M8.5 11h7M8.5 14.5h7" /></>,
  swap: <><path d="M7 4L3.5 7.5 7 11" /><path d="M3.5 7.5h13" /><path d="M17 13l3.5 3.5L17 20" /><path d="M20.5 16.5h-13" /></>,
  grip: <><circle cx="9" cy="7" r="1.2" fill="currentColor" /><circle cx="15" cy="7" r="1.2" fill="currentColor" /><circle cx="9" cy="12" r="1.2" fill="currentColor" /><circle cx="15" cy="12" r="1.2" fill="currentColor" /><circle cx="9" cy="17" r="1.2" fill="currentColor" /><circle cx="15" cy="17" r="1.2" fill="currentColor" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  scale: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M8.5 9.5a4.5 4.5 0 0 1 7 0" /><path d="M12 9.5l1.6-1.4" /></>,
  camera: <><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.3" /></>,
  download: <><path d="M12 4v11" /><path d="M7.5 11L12 15.5 16.5 11" /><path d="M5 19.5h14" /></>,
  upload: <><path d="M12 15.5V4.5" /><path d="M7.5 9L12 4.5 16.5 9" /><path d="M5 19.5h14" /></>,
  bolt: <path d="M13 3L5.5 13h5L10 21l8-10.5h-5.2z" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".6" fill="currentColor" /></>,
  filter: <path d="M4 6.5h16M7 12h10M10 17.5h4" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  repeat: <><path d="M17 3.5l3 3-3 3" /><path d="M4 11V9.5A3 3 0 0 1 7 6.5h13" /><path d="M7 20.5l-3-3 3-3" /><path d="M20 13v1.5a3 3 0 0 1-3 3H4" /></>,
  flame: <path d="M12 3c.5 3-2 4.5-3.6 6.6A6.5 6.5 0 0 0 7 13.5a5 5 0 0 0 10 0c0-2-.9-3.4-2-4.6.1 1.4-.4 2.3-1.2 2.9C14 8 13.6 5 12 3z" />,
  dumbbell: <><path d="M6 8v8M18 8v8M3.5 10v4M20.5 10v4M6 12h12" /></>,
  run: <><circle cx="14.5" cy="5" r="1.8" /><path d="M8 20l2.5-5 3 1.5 1.5 4" /><path d="M10.5 15l1-5 3.5 1.5 2-2" /><path d="M6 10.5l3.5-1.5 2-2" /></>,
  moon: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" /></>,
  shield: <path d="M12 3.5l7 2.5v5.5c0 4.3-3 7.5-7 9-4-1.5-7-4.7-7-9V6z" />,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  list: <><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.5" cy="6.5" r=".9" fill="currentColor" /><circle cx="4.5" cy="12" r=".9" fill="currentColor" /><circle cx="4.5" cy="17.5" r=".9" fill="currentColor" /></>,
  recipe: <><path d="M5 11.5h14v2a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z" /><path d="M9 8.5c0-1.2 1-1.3 1-2.5M13 8.5c0-1.2 1-1.3 1-2.5" /></>,
  sparkle: <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  body: <><circle cx="12" cy="5" r="2" /><path d="M6.5 9.5l5.5 1.5 5.5-1.5M12 11v4.5M9 21l3-5.5 3 5.5" /></>,
  lock: <><rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>,
  eye: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" /><circle cx="12" cy="12" r="2.6" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M4 12h16" /></>,
  wifiOff: <><path d="M3.5 3.5l17 17" /><path d="M8.5 15.5a5 5 0 0 1 4-1.3M5 12a9 9 0 0 1 3-2M12 19.2h.01" /></>,
};

export function Icon({ name, size = 22, sw = 1.8, style, className }: { name: keyof typeof P | string; size?: number; sw?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {P[name] ?? null}
    </svg>
  );
}
export type IconName = keyof typeof P;
