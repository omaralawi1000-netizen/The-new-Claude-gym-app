import { useEffect, useState, type ReactNode } from 'react';

const seen = new Set<string>();

/**
 * A part of a screen that is swapped as a whole (Train's Plan / Library / History, Food's day). The first time it is shown in a
 * session its blocks rise in one after another (`.subpage > *` in styles.css), like a screen's blocks do. Coming back to it, or
 * flipping to the next day, the whole part just glides in together (`.subpage.seen`): replaying the cascade every time you tap
 * back and forth reads as slowness, not polish. `id` says which part this is (days of the food log are all one part).
 */
export function Subpage({ id, children }: { id: string; children: ReactNode }) {
  const [first] = useState(() => !seen.has(id));
  useEffect(() => { seen.add(id); }, [id]);
  return <div className={first ? 'subpage' : 'subpage seen'}>{children}</div>;
}
