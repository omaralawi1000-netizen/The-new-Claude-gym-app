import type { ReactNode } from 'react';

/**
 * A part of a screen that is swapped as a whole (Train's Plan / Library / History, Food's day): give it a `key` and its blocks
 * rise in again one after another when it changes (`.subpage > *` in styles.css), like a screen's blocks do.
 */
export function Subpage({ children }: { children: ReactNode }) {
  return <div className="subpage">{children}</div>;
}
