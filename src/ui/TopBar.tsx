import type { ReactNode } from 'react';

/**
 * Large titles that hand over to a small one at the top of the page, as on iOS (no bar: the top keeps its soft fade).
 * Nothing here runs per frame: both sides are scroll-driven animations the browser draws on its compositor (styles.css, "Collapsing titles").
 *
 * - `LargeTitle` sits in the page's header. As it slides up into the top fade it fades and settles back a little.
 * - `TopBar` sits next to the page's scroller (not inside it): only the small title, which rises in as the large one goes.
 *   It has no background or blur. At rest it is invisible.
 *
 * The two are tied by the large title's own view timeline (`--lt`, scoped to the tab pane), so each page hands over at
 * exactly the point where its title reaches the top, whatever sits above the title.
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
