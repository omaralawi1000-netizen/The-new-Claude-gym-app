import type { ReactNode } from 'react';

/**
 * Large titles that hand over to a small one in a frosted top bar, as on iOS. Nothing here runs per frame: both sides are
 * scroll-driven animations the browser draws on its compositor (styles.css, "Collapsing titles").
 *
 * - `LargeTitle` sits in the page's header. As it slides up under the bar it fades and settles back a little.
 * - `TopBar` sits next to the page's scroller (not inside it). Its frost is one still layer that only fades in by opacity,
 *   with the small title rising into it, while the large title passes under the bar's lower edge. At rest it is invisible.
 *
 * The two are tied by the large title's own view timeline (`--lt`, scoped to the tab pane), so each page hands over at
 * exactly the point where its title meets the bar, whatever sits above the title.
 */
export function LargeTitle({ children }: { children: ReactNode }) {
  return <div className="large-title">{children}</div>;
}

export function TopBar({ title }: { title: ReactNode }) {
  return (
    <div className="topbar" aria-hidden>
      <span className="topbar-title trunc">{title}</span>
    </div>
  );
}
