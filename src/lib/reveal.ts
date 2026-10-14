/**
 * An answer is shown a word at a time at a steady pace, however the network delivers it (a model's stream lands in uneven
 * clumps). These are the pure parts: where each shown word ends in the text, and the text up to the n-th word, closed so
 * that it renders as it will when complete (a bold phrase is bold from its first word; a "- " is a bullet from its first).
 */

const MARKER = /^(?:[-*•]|\d+\.|#{1,6})$/; // a bullet or heading mark at the start of a line: arrives with its first word

/** Where each word ends, as an index into `text`. While it is still arriving, the last (possibly cut-off) word is left out. */
export function wordEnds(text: string, live: boolean): number[] {
  const src = live ? text.replace(/\S+$/, '') : text;
  const ends: number[] = [];
  for (const m of src.matchAll(/\S+/g)) {
    const at = m.index ?? 0;
    if (MARKER.test(m[0]) && /^[ \t]*$/.test(src.slice(src.lastIndexOf('\n', at - 1) + 1, at))) continue;
    ends.push(at + m[0].length);
  }
  return ends;
}

/** The text up to and including word `n` (of `ends`), with an open "**" closed so the words already there are bold. */
export function revealPrefix(text: string, ends: number[], n: number): string {
  if (n <= 0) return '';
  let s = n >= ends.length ? text.slice(0, ends[ends.length - 1] ?? 0) : text.slice(0, ends[n - 1]);
  if ((s.match(/\*\*/g)?.length ?? 0) % 2) s = s.endsWith('**') ? s.slice(0, -2) : `${s}**`;
  return s;
}

/**
 * How many words a second to show. It follows what is waiting (so it keeps pace with the stream and never runs dry
 * between its clumps) within calm limits; once everything has arrived it finishes at no less than a steady reading pace.
 */
export function revealRate(backlog: number, live: boolean): number {
  return Math.min(45, Math.max(live ? 6 : 24, backlog / 0.9)); // (at most 45 a second: 70 read as text spat out in bursts)
}
