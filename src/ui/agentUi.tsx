import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang, useT } from '../lib/i18n';
import { Icon, type IconName } from './Icon';
import { useStore } from '../state/store';
import { dayKey } from '../lib/dates';
import { mealName } from '../lib/derive';
import type { AgentResult } from '../lib/agent';

/**
 * Things worth saying to the assistant right now, made from what is actually in the app: the foods logged today, the
 * running workout, your routines. So the examples are never generic ("move the oats to lunch" names YOUR oats).
 */
export function useSuggestions(max = 6): string[] {
  const t = useT();
  const lang = useLang();
  const entries = useStore((s) => s.entries);
  const meals = useStore((s) => s.settings.meals);
  const routines = useStore((s) => s.routines);
  const active = useStore((s) => !!s.active);
  const dayStart = useStore((s) => s.settings.dayStartHour);
  return useMemo(() => {
    const today = dayKey(Date.now(), dayStart);
    const mine = entries.filter((e) => e.date === today && !e.quick).sort((a, b) => b.at - a.at);
    const short = (n: string) => n.split(',')[0].trim();
    const out: string[] = [];
    const e = mine[0];
    if (e) {
      const other = meals.find((m) => m.id !== e.mealId && m.id !== 'snacks') ?? meals.find((m) => m.id !== e.mealId);
      if (other) out.push(t('Move {food} to {meal}', { food: short(e.snap.name), meal: mealName(other, lang) }));
      const e2 = mine[1];
      if (e2) out.push(t('Replace {food} with a banana', { food: short(e2.snap.name) }));
      else out.push(t('Remove {food}', { food: short(e.snap.name) }));
    } else out.push(t('Log a banana'));
    if (active) out.push(t('Add face pulls to my workout'), t('Make my last set 2.5 kg heavier'));
    else out.push(t('Bench press 80 kg for 8, 8, 6'));
    if (routines[0]) out.push(t('Put {routine} on Friday', { routine: routines[0].name }), t('What should I change in {routine}?', { routine: routines[0].name }));
    else out.push(t('Build me a push, pull, legs routine'));
    out.push(t('How is my week going?'), t('Save today’s lunch as a meal'), t('How do I change the theme?'));
    return [...new Set(out)].slice(0, max);
  }, [entries, meals, routines, active, dayStart, lang, t, max]);
}

/** One example at a time, softly replacing each other — the orb screen's "what can I say". */
export function RotatingHint() {
  const list = useSuggestions(7);
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((v) => v + 1), 3400); return () => clearInterval(id); }, []);
  const text = list[i % Math.max(1, list.length)];
  return <span key={text} className="hint-rot">“{text}”</span>;
}

const KIND_ICON: Record<string, IconName> = { food: 'recipe', sets: 'dumbbell', water: 'drop', weight: 'scale', activity: 'wrestle', workout: 'dumbbell', routine: 'list', nav: 'info', setting: 'settings', miss: 'info' };

/** Pieces shared by the Coach chat and the orb screen: how the assistant's words and actions are shown. */

/**
 * Minimal, safe rendering of the model's text: paragraphs, "- " bullets, **bold**. No HTML is ever injected.
 * Every word is its own span keyed by position, so while a reply streams in only the NEW words mount — and each one
 * blurs in (CSS .w). Words already on screen never re-animate.
 */
export function Words({ text, k }: { text: string; k: string }) {
  const parts = text.split(/(\s+)/);
  // words that arrive together cascade one after another; a word keeps the delay it was born with
  const born = useRef<Record<number, number>>({});
  const seen = useRef(0);
  const first = seen.current;
  useEffect(() => { seen.current = parts.length; });
  return <>{parts.map((w, i) => {
    if (/^\s+$/.test(w) || !w) return w || null;
    if (born.current[i] === undefined) born.current[i] = Math.min(520, Math.max(0, (i - first) / 2) * 34);
    return <span key={`${k}-${i}`} className="w" style={{ animationDelay: `${born.current[i]}ms` }}>{w}</span>;
  })}</>;
}
export function Rich({ text }: { text: string }) {
  const lines = text.split('\n');
  const bold = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}><Words text={p.slice(2, -2)} k={`${k}b${i}`} /></b> : <Words key={i} text={p} k={`${k}t${i}`} />));
  return <>{lines.map((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) return <div key={i} style={{ display: 'flex', gap: 8, marginTop: 4 }}><span aria-hidden className="w" style={{ color: 'var(--tx3)' }}>•</span><span>{bold(m[1], `l${i}`)}</span></div>;
    return l.trim() ? <div key={i} style={{ marginTop: i ? 8 : 0 }}>{bold(l, `l${i}`)}</div> : null;
  })}</>;
}

/** While the Coach thinks: three lines of light sweep across, then the real words ink in where they were. */
export function Thinking() {
  return <div className="thinking" aria-label="…">{[92, 78, 52].map((w, i) => <i key={i} style={{ width: `${w}%`, animationDelay: `${i * 160}ms, ${i * 70}ms` }} />)}</div>;
}



/** Why speech-to-text failed, in words (never a stack trace). */
export function sttMessage(code: string, t: (k: string) => string): string {
  return ({
    nokey: t('Add your Groq key in Settings → Voice & AI.'), offline: t('You’re offline, so nothing was sent. Type it instead.'),
    network: t('Couldn’t reach Groq. Try again, or type it.'), timeout: t('Groq took too long. Try again, or type it.'),
    badkey: t('Groq rejected the key. Check it in Settings → Voice & AI.'), busy: t('Groq is rate-limiting right now. Wait a moment, then try again.'),
  } as Record<string, string>)[code] ?? t('Groq couldn’t transcribe that. Try again, or type it.');
}

/** What the Coach just did, as a card: what was logged, one tap to undo — or the question it is waiting on. */
export function ActionCard({ r, undone, confirmed, onUndo, onConfirm }: { r: AgentResult; undone: boolean; confirmed: boolean; onUndo: () => void; onConfirm: () => void }) {
  const t = useT();
  const miss = r.kind === 'miss';
  return (
    <div className={`plinth action-card ${undone ? 'undone' : ''} ${miss ? 'miss' : ''}`} style={{ padding: '12px 14px 12px 12px' }}>
      <div className="row-flex" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="action-ic" aria-hidden><Icon name={miss || (r.pending && !confirmed) ? 'info' : (KIND_ICON[r.kind] ?? 'check')} size={16} sw={2.2} /></span>
        <div className="grow">
          <div className="small" style={{ fontWeight: 650 }}>{undone ? t('Undone') : confirmed ? t('Done') : r.title}</div>
          {r.lines.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {r.lines.map((l, i) => (
                <div key={i} className={`action-line ${l.sub && l.sub.length > 22 ? 'stack' : 'row-flex between'}`} style={{ gap: 10, padding: '5px 0', borderTop: i ? '1px solid var(--line)' : 'none', animationDelay: `${120 + i * 70}ms` }}>
                  <span className="small" style={{ color: l.warn ? 'var(--warn)' : 'var(--tx)', minWidth: 0, overflowWrap: 'anywhere' }}>{l.text}</span>
                  {l.sub && <span className="xs t2 num" style={l.sub.length > 22 ? { display: 'block', marginTop: 1 } : { textAlign: 'right', flex: 'none', maxWidth: '62%' }}>{l.sub}</span>}
                </div>
              ))}
            </div>
          )}
          {!undone && !confirmed && (r.button || r.undo) && (
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              {r.button && <button className={`btn sm press ${r.pending ? 'primary' : ''}`} onClick={r.pending ? onConfirm : r.button.run}>{r.button.label}</button>}
              {r.undo && !r.pending && <button className="btn sm ghost press" onClick={onUndo}><Icon name="undo" size={15} /> {t('Undo')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
