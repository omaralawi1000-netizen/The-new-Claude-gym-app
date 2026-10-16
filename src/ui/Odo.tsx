import { odoCols } from '../screens/workout/finishMoment';

/** A number drawn as an odometer: each digit a column that rolls up to land on itself (finishMoment.ts plays it). At rest,
 * and with reduced motion, it simply shows the number. */
export function Odo({ text }: { text: string }) {
  return (
    <span className="odo" aria-label={text} role="text">
      {odoCols(text).map((c, i) => c.travel > 0
        ? <span key={i} className="odo-c" aria-hidden><span className="odo-s" data-travel={c.travel} style={{ transform: `translate3d(0, ${-c.travel * 1.15}em, 0)` }}>{Array.from({ length: c.travel + 1 }, (_, k) => <span key={k}>{k % 10}</span>)}</span></span>
        : <span key={i} className="odo-k" aria-hidden>{c.ch}</span>)}
    </span>
  );
}
