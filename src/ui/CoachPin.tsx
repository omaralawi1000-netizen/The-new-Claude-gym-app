import { useEffect, useMemo, useReducer, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useStore, exerciseMap } from '../state/store';
import { useUI, haptic } from '../state/ui';
import { useAi, solOn } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { dayKey } from '../lib/dates';
import { hideNudge, rankNotes, type Nudge, type NudgeAction } from '../lib/nudges';
import type { Insight } from '../lib/gemini';
import { userHasData } from '../lib/stats';
import { Icon } from './Icon';
import { Collapse } from './kit';
import { exName } from '../screens/workout/common';
import type { AppData } from '../lib/types';

// ── once a day, the Coach's own look (Gemini key only; its free tier covers it) ──
const INSIGHTS = 'aven.insights';
interface Cached { date: string; items: Insight[] }
const readCache = (): Cached | null => { try { return JSON.parse(localStorage.getItem(INSIGHTS) || 'null'); } catch { return null; } };
/** Today's insights from the cache alone (Health reads them this way: opening it never asks the Coach anything). */
export const cachedInsights = (today: string): Insight[] => { const c = readCache(); return c?.date === today ? c.items : []; };
// the Coach's insights set aside with ✕: the model is told, so it doesn't bring the same thing back tomorrow in new words
const DECLINED = 'aven.insightsNo';
const declined = (): string[] => { try { const v = JSON.parse(localStorage.getItem(DECLINED) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
const decline = (title: string) => { try { localStorage.setItem(DECLINED, JSON.stringify([...declined().filter((x) => x !== title), title].slice(-20))); } catch { /* fine */ } };
let asking = false;
const TRIED = 'aven.insights.tried';
const tried = () => { try { return localStorage.getItem(TRIED); } catch { return null; } };
const markTried = (day: string) => { try { localStorage.setItem(TRIED, day); } catch { /* fine */ } };
/** Fetches today's insights once (a few seconds after opening, when the phone is idle) and returns them. */
function useInsights(d: AppData, today: string): Insight[] {
  const hasGemini = useAi((a) => a.hasGemini || solOn(a));
  const lang = useLang();
  const [cache, setCache] = useState<Cached | null>(readCache);
  const on = d.settings.coachPins !== false;
  const has = userHasData(d) && !(d as { demo?: boolean }).demo;
  useEffect(() => {
    // (one try a day: a failed one is not tried again on every opening)
    if (!on || !hasGemini || asking || cache?.date === today || !has || tried() === today) return;
    const id = setTimeout(async () => {
      asking = true;
      try {
        // the Coach's code is loaded with the Coach (a file of its own), not when the app opens
        const [{ INSIGHT_SYSTEM, INSIGHT_SCHEMA, readInsights }, { brainFor }, { buildCoachContext, memoryBlock }, { thinkJson }, { HANDBOOK_CORE, TASK_STYLE: HOW_TO_TALK }, { personLines }, { dataTrustLines }] = await Promise.all([import('../lib/gemini'), import('../lib/agentTurn'), import('../lib/coachContext'), import('../lib/brain'), import('../lib/handbook'), import('../lib/person'), import('../lib/dataQuality')]);
        const brain = brainFor({ big: true, surface: 'coach' });
        if (!brain) return;
        markTried(today);
        const map = exerciseMap(d.exercises);
        const name = (x: string) => { const e = map.get(x); return e ? exName(e, lang) : x; };
        // what they told the Coach (an injury, how they train, what they don't want) and what they already turned down
        const no = declined();
        const ctx = `${buildCoachContext(d, today, name, (x) => map.get(x)?.muscles)}\n${[...personLines(d, today), ...dataTrustLines(d, today)].join('\n')}\n\n${memoryBlock(d, name)}${no.length ? `\n\nTHEY SET THESE ASIDE (never suggest them again, in any wording): ${no.map((x) => `"${x}"`).join('; ')}.` : ''}`;
        const app = `\nApp setup: Today shows ${Object.entries(d.settings.widgets).filter(([, v]) => v).map(([k]) => k).join(', ')}; hidden: ${Object.entries(d.settings.widgets).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'none'}.`;
        // (once a day, on the main brain: what a good coach would bring up unasked)
        const items = readInsights(await thinkJson({ ...brain, sol: brain.sol ? { ...brain.sol, effort: 'medium' } : undefined }, { system: `${INSIGHT_SYSTEM(lang)}\n\n${HOW_TO_TALK}\n\n${HANDBOOK_CORE}`, prompt: ctx + app, schema: INSIGHT_SCHEMA, name: 'insights' }));
        const c = { date: today, items };
        try { localStorage.setItem(INSIGHTS, JSON.stringify(c)); } catch { /* ignore */ }
        setCache(c);
      } catch { /* quiet: tried again tomorrow */ } finally { asking = false; }
    }, 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, [on, hasGemini, today, has]);
  return on && cache?.date === today ? cache.items : [];
}

/** Everything the Coach has noticed right now, most important first, minus what you set aside. */
export function useNudges(d: AppData): { list: Nudge[]; hide: (id: string, forGood: boolean) => void } {
  const t = useT();
  const lang = useLang();
  const today = dayKey(Date.now(), d.settings.dayStartHour);
  const hour = new Date().getHours();
  const [v, bump] = useReducer((n: number) => n + 1, 0);
  const insights = useInsights(d, today);
  const list = useMemo(() => {
    const map = exerciseMap(d.exercises);
    return rankNotes(d, today, hour, t, lang, (id) => { const e = map.get(id); return e ? exName(e, lang) : '?'; }, insights).slice(0, 4);
    // eslint-disable-next-line
  }, [d.sessions, d.entries, d.weights, d.schedule, d.routines, d.active, d.settings, d.exercises, d.memory, d.targets, d.health, today, hour, insights, v, lang]);
  return { list, hide: (id, forGood) => { if (forGood && id.startsWith('ai:')) { const n = list.find((x) => x.id === id); if (n) decline(n.title); } hideNudge(id, forGood); bump(); } };
}

export function runNudge(a: NudgeAction, today: string) {
  const ui = useUI.getState();
  const st = useStore.getState();
  if (a.type === 'coach') ui.push('coach', { ask: a.prompt });
  else if (a.type === 'open') ui.push(a.overlay as never, a.props);
  else if (a.type === 'start') {
    const r = st.routines.find((x) => x.id === a.routineId);
    if (!st.active) st.startWorkout({ routine: r, plannedDate: r ? today : undefined });
    ui.push('workout', { origin: 'hero' });
  } else if (a.type === 'setting') st.updateSettings(a.patch as never);
}

/**
 * The Coach's pin at the top of Today: one quiet line with what it noticed first. Tap it and it opens into the list —
 * each with why, one thing to do about it, "Not now" (back tomorrow) and ✕ (gone for good).
 */
export function CoachPin({ d }: { d: AppData }) {
  const t = useT();
  const { list, hide } = useNudges(d);
  const [open, setOpen] = useState(false);
  const today = dayKey(Date.now(), d.settings.dayStartHour);
  if (!list.length) return null;
  const top = list[0];
  const act = (n: Nudge) => { if (!n.action) return; haptic('light'); hide(n.id, false); runNudge(n.action.run, today); };
  return (
    <section className={`pin${open ? ' open' : ''}`} aria-label={t('Pinned for you')}>
      <button className="pin-head press" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="pin-mark"><Icon name="sparkle" size={14} /></span>
        <span className="pin-line">
          {open ? <span className="pin-label">{t('The Coach noticed')}</span> : <span className="pin-title trunc">{top.title}</span>}
        </span>
        {list.length > 1 && !open && <span className="pin-count num">+{list.length - 1}</span>}
        <Icon name="chevD" size={16} className="pin-chev" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <Collapse key="list" appear ms={380}>
            <div className="pin-list">
              <AnimatePresence initial={false}>
                {list.map((n) => (
                  <Collapse key={n.id} ms={300}>
                    <div className={`pin-item k-${n.kind}`}>
                      <span className="pin-icon"><Icon name={n.icon} size={16} /></span>
                      <div className="pin-text">
                        <div className="pin-t">{n.title}</div>
                        {n.body && <div className="pin-b">{n.body}</div>}
                        <div className="pin-acts">
                          {n.action && <button className="chip sm acc press" onClick={() => act(n)}>{n.action.label}</button>}
                          <button className="chip sm press" onClick={() => hide(n.id, false)}>{t('Not now')}</button>
                        </div>
                      </div>
                      <button className="icon-btn flat sm press pin-x" aria-label={t('Dismiss')} onClick={() => hide(n.id, true)}><Icon name="close" size={15} /></button>
                    </div>
                  </Collapse>
                ))}
              </AnimatePresence>
            </div>
          </Collapse>
        )}
      </AnimatePresence>
    </section>
  );
}
