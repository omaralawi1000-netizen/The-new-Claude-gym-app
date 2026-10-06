import { useEffect, useMemo, useReducer, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useStore, exerciseMap } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useAi } from '../state/ai';
import { useT, useLang } from '../lib/i18n';
import { dayKey } from '../lib/dates';
import { findNudges, hideNudge, visibleNudges, type Nudge, type NudgeAction } from '../lib/nudges';
import { aiInsights, type Insight } from '../lib/gemini';
import { agentModels } from '../lib/agentTurn';
import { getKey } from '../lib/keys';
import { buildCoachContext } from '../lib/coachContext';
import { userHasData } from '../lib/stats';
import { Icon, type IconName } from './Icon';
import { Collapse } from './kit';
import { exName } from '../screens/workout/common';
import type { AppData } from '../lib/types';

// ── once a day, the Coach's own look (Gemini key only; its free tier covers it) ──
const INSIGHTS = 'aven.insights';
interface Cached { date: string; items: Insight[] }
const readCache = (): Cached | null => { try { return JSON.parse(localStorage.getItem(INSIGHTS) || 'null'); } catch { return null; } };
let asking = false;
/** Fetches today's insights once (a few seconds after opening, when the phone is idle) and returns them. */
function useInsights(d: AppData, today: string): Insight[] {
  const hasGemini = useAi((a) => a.hasGemini);
  const lang = useLang();
  const [cache, setCache] = useState<Cached | null>(readCache);
  const on = d.settings.coachPins !== false;
  const has = userHasData(d) && !(d as { demo?: boolean }).demo;
  useEffect(() => {
    if (!on || !hasGemini || asking || cache?.date === today || !has) return;
    const id = setTimeout(() => {
      asking = true;
      const map = exerciseMap(d.exercises);
      const ctx = buildCoachContext(d, today, (x) => { const e = map.get(x); return e ? exName(e, lang) : x; }, (x) => map.get(x)?.muscles);
      const app = `\nApp setup: Today shows ${Object.entries(d.settings.widgets).filter(([, v]) => v).map(([k]) => k).join(', ')}; hidden: ${Object.entries(d.settings.widgets).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'none'}.`;
      aiInsights(ctx + app, { key: getKey('gemini'), models: agentModels(false) }, lang)
        .then((items) => { const c = { date: today, items }; try { localStorage.setItem(INSIGHTS, JSON.stringify(c)); } catch { /* ignore */ } setCache(c); })
        .catch(() => { /* quiet: tried again next time the app opens */ })
        .finally(() => { asking = false; });
    }, 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line
  }, [on, hasGemini, today, has]);
  return on && cache?.date === today ? cache.items : [];
}

const KIND_ICON: Record<Insight['kind'], IconName> = { reminder: 'bell', suggestion: 'sparkle', warning: 'info', app: 'settings' };

/** Everything the Coach has noticed right now, most important first, minus what you set aside. */
export function useNudges(d: AppData): { list: Nudge[]; hide: (id: string, forGood: boolean) => void } {
  const t = useT();
  const lang = useLang();
  const today = dayKey(Date.now(), d.settings.dayStartHour);
  const hour = new Date().getHours();
  const [v, bump] = useReducer((n: number) => n + 1, 0);
  const insights = useInsights(d, today);
  const list = useMemo(() => {
    if (d.settings.coachPins === false) return [];
    const map = exerciseMap(d.exercises);
    const own = findNudges(d, today, hour, t, lang, (id) => { const e = map.get(id); return e ? exName(e, lang) : '?'; });
    const ai: Nudge[] = insights.map((x, i) => ({ id: `ai:${today}:${i}:${x.title}`, kind: 'insight', icon: KIND_ICON[x.kind], priority: x.kind === 'warning' ? 66 : 48, title: x.title, body: x.body, action: { label: t('Ask the Coach'), run: { type: 'coach', prompt: x.ask } } }));
    return visibleNudges([...own, ...ai].sort((a, b) => b.priority - a.priority)).slice(0, 4);
    // eslint-disable-next-line
  }, [d.sessions, d.entries, d.weights, d.schedule, d.routines, d.active, d.settings, d.exercises, today, hour, insights, v, lang]);
  return { list, hide: (id, forGood) => { hideNudge(id, forGood); bump(); } };
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
  const act = (n: Nudge) => { if (!n.action) return; buzz(10); hide(n.id, false); runNudge(n.action.run, today); };
  return (
    <section className={`pin${open ? ' open' : ''}`} aria-label={t('Pinned for you')}>
      <button className="pin-head press" onClick={() => { buzz(6); setOpen((o) => !o); }} aria-expanded={open}>
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
                          <button className="chip sm press" onClick={() => { buzz(6); hide(n.id, false); }}>{t('Not now')}</button>
                        </div>
                      </div>
                      <button className="icon-btn flat sm press pin-x" aria-label={t('Dismiss')} onClick={() => { buzz(6); hide(n.id, true); }}><Icon name="close" size={15} /></button>
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
