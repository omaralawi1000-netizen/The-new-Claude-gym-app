import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, foodPool, allExercises } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useVoice } from '../state/voice';
import { useT, useLang } from '../lib/i18n';
import { mic } from '../lib/mic';
import { speechSupported, startSpeech, type SpeechError, type SpeechHandle } from '../lib/speech';
import { parseFoodText, resolveRows, rowQuantity, searchFoods, fold, type ResolvedRow } from '../lib/foodText';
import { matchExercises, parseWorkoutText, type ParsedSet, type ParsedWorkoutRow } from '../lib/workoutText';
import { allowedUnits, entryFromSnapshot, scale, snapshotOf, toBase, uid } from '../lib/nutrition';
import type { Exercise, Food, FoodEntry, Quantity, SetRecord } from '../lib/types';
import { SphereSlot } from '../ui/Sphere';
import { Icon } from '../ui/Icon';
import { NumInput, Seg } from '../ui/kit';
import { SOFT, useOverlayZ } from '../ui/Sheet';
import { fmtNutrient } from '../lib/format';
import { fmtNum, displayToKg, kgToDisplay } from '../lib/units';
import { mealName, defaultMealId } from '../lib/derive';
import { dayKey } from '../lib/dates';
import { searchOnline } from '../lib/foodApi';
import { exName } from './workout/common';
import { addExercises } from './workout/actions';

type Mode = 'food' | 'workout';
interface FoodRow extends ResolvedRow { qtyOverride?: Quantity; removed?: boolean; picked?: boolean }
interface WRow extends ParsedWorkoutRow { ex?: Exercise; candidates: { ex: Exercise; score: number }[]; status: 'resolved' | 'ambiguous' | 'unmatched'; removed?: boolean }

export function VoiceComposer({ props }: { props: { mode?: Mode; date?: string; mealId?: string } }) {
  const t = useT();
  const lang = useLang();
  const z = useOverlayZ(65);
  const s = useStore();
  const pool = foodPool(s.foods, s.recipes);
  const exercises = allExercises(s.exercises);
  const toast = useUI((u) => u.toast);
  const voice = useVoice();
  const phase = voice.phase;
  const [mode, setMode] = useState<Mode>(props.mode ?? 'food');
  const [final, setFinal] = useState('');
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(!speechSupported());
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<FoodRow[]>([]);
  const [wrows, setWrows] = useState<WRow[]>([]);
  const [mealId, setMealId] = useState(props.mealId ?? defaultMealId(s.settings.meals));
  const date = props.date ?? useUI.getState().foodDate ?? undefined;
  const handle = useRef<SpeechHandle | null>(null);
  const confirmed = useRef(false);
  const alive = useRef(true);
  const supported = speechSupported();

  const teardown = useCallback(() => {
    handle.current?.abort(); handle.current = null;
    mic.release('voice');
    useVoice.getState().set({ micLive: false });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useUI.getState().pop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    alive.current = true;
    const unsub = mic.subscribe(() => useVoice.getState().set({ micLive: mic.active }));
    return () => { alive.current = false; unsub(); teardown(); useVoice.getState().go('idle'); };
  }, [teardown]);

  // ── listening ──
  const begin = useCallback(async () => {
    setErr(null); setFinal(''); setInterim(''); setRows([]); setWrows([]);
    if (!supported) { useVoice.getState().go('idle'); setTyping(true); return; }
    useVoice.getState().go('requesting');
    const h = startSpeech({
      lang: lang === 'da' ? 'da-DK' : 'en-GB',
      onStart: () => { if (alive.current) useVoice.getState().go('listening'); },
      onText: (f, i) => { setFinal(f); setInterim(i); },
      onError: (e: SpeechError) => {
        if (!alive.current) return;
        if (e === 'denied') { teardown(); setErr(t('Microphone or speech permission was denied. You can allow it in your browser settings, or type instead.')); useVoice.getState().go('unavailable'); setTyping(true); }
        else if (e === 'network') { teardown(); setErr(t('The browser’s speech service isn’t reachable (it needs a connection). Type instead — nothing was recorded.')); useVoice.getState().go('error'); setTyping(true); }
        else if (e === 'no-speech') { /* ended naturally; onEnd handles */ }
        else if (e === 'audio') { setErr(t('No microphone was found or it is in use by another app.')); teardown(); useVoice.getState().go('error'); setTyping(true); }
        else if (e !== 'aborted') { setErr(t('Speech recognition stopped unexpectedly.')); }
      },
      onEnd: () => { if (alive.current && useVoice.getState().phase === 'listening') finish(); },
    });
    if (!h) { setErr(t('Speech recognition couldn’t start.')); useVoice.getState().go('error'); setTyping(true); return; }
    handle.current = h;
    // real input level for the sphere; failure here only means "no level", not "not listening"
    const r = await mic.acquire('voice');
    if (!r.ok && alive.current && r.reason === 'denied') { /* recognition reports its own denial */ }
    // eslint-disable-next-line
  }, [supported, lang]);

  useEffect(() => { if (supported) begin(); else setTyping(true); /* eslint-disable-next-line */ }, []);

  const textNow = () => (typing ? typed : [final, interim].filter(Boolean).join(' ')).trim();

  const finish = useCallback(async (overrideText?: string) => {
    const phaseNow = useVoice.getState().phase;
    if (phaseNow === 'processing' || phaseNow === 'review') return;
    const text = (overrideText ?? textNow()).trim();
    handle.current?.stop();
    mic.release('voice');
    if (!text) { useVoice.getState().go('idle'); setErr(t('Didn’t catch anything. Tap the sphere to try again, or type it.')); return; }
    setErr(null);
    useVoice.getState().go('processing');
    const started = performance.now();
    if (mode === 'food') {
      const st = useStore.getState();
      const p = foodPool(st.foods, st.recipes);
      const fav = new Set(st.favourites);
      let res: FoodRow[] = resolveRows(parseFoodText(text), p, st.choices, (f) => (fav.has(f.id) ? 0.05 : 0));
      // unmatched rows: one optional online attempt, bounded
      if (st.settings.foodLookup && res.some((r) => r.status === 'unmatched')) {
        const ctl = await Promise.race([
          Promise.all(res.map(async (r) => (r.status === 'unmatched' ? { id: r.id, foods: (await searchOnline(r.query)).foods.slice(0, 5) } : null))),
          new Promise<null>((ok) => setTimeout(() => ok(null), 4500)),
        ]);
        if (ctl) res = res.map((r) => {
          const hit = ctl.find((x) => x && x.id === r.id);
          if (hit && hit.foods.length) return { ...r, status: 'ambiguous', candidates: hit.foods.map((food, i) => ({ food, score: 0.6 - i * 0.02 })), suggestionId: hit.foods[0].id };
          return r;
        });
      }
      if (!alive.current) return;
      setRows(res);
    } else {
      const parsed = parseWorkoutText(text);
      const usage = new Map<string, number>(); // how often each exercise was logged: a gentle tie-breaker, never hides alternatives
      for (const ses of useStore.getState().sessions) for (const e of ses.exercises) usage.set(e.exerciseId, (usage.get(e.exerciseId) ?? 0) + 1);
      const res: WRow[] = parsed.map((r) => {
        const c = matchExercises(r.query, exercises, lang, 5, (e) => Math.min(0.12, (usage.get(e.id) ?? 0) * 0.02));
        const top = c[0]?.score ?? 0;
        const tied = c.filter((x) => top - x.score < 0.06);
        const ok = c.length > 0 && top >= 0.7 && tied.length === 1;
        return { ...r, candidates: c, ex: ok ? c[0].ex : undefined, status: !c.length ? 'unmatched' : ok ? 'resolved' : 'ambiguous' };
      });
      setWrows(res);
    }
    const wait = Math.max(0, 650 - (performance.now() - started)); // short, honest minimum so the state change is legible
    await new Promise((r) => setTimeout(r, wait));
    if (alive.current) useVoice.getState().go('review');
    // eslint-disable-next-line
  }, [mode, typed, final, interim, typing, exercises, lang]);

  // ── review derivations (food) ──
  const foodOf = (r: FoodRow): Food | undefined => r.choiceId ? (r.candidates.find((c) => c.food.id === r.choiceId)?.food ?? pool.find((f) => f.id === r.choiceId)) : undefined;
  const calc = (r: FoodRow) => {
    const food = foodOf(r);
    if (!food) return null;
    const rq = r.qtyOverride ? { qty: r.qtyOverride, estimated: toBase(food, r.qtyOverride).ok && (toBase(food, r.qtyOverride) as any).estimated } : rowQuantity(r, food);
    const b = rq.qty ? toBase(food, rq.qty) : null;
    return { food, qty: rq.qty, estimated: rq.estimated, problem: (rq as any).problem as string | undefined, base: b && b.ok ? b.base : undefined };
  };
  const active = rows.filter((r) => !r.removed);
  const ready = active.length > 0 && active.every((r) => { const c = calc(r); return c && c.qty && c.base !== undefined && (r.status === 'resolved' || r.picked); });
  const pending = active.filter((r) => { const c = calc(r); return !(c && c.qty && c.base !== undefined && (r.status === 'resolved' || r.picked)); }).length;

  const confirmFood = () => {
    if (confirmed.current || !ready) return;
    confirmed.current = true;
    const d = date ?? useUI.getState().foodDate ?? dayKey(Date.now(), useStore.getState().settings.dayStartHour);
    const entries: FoodEntry[] = [];
    for (const r of active) {
      const c = calc(r)!;
      const e = entryFromSnapshot(snapshotOf(c.food), c.qty!, d, mealId, { id: uid('e') });
      if (e) entries.push(e);
      if (c.food.source === 'off' || c.food.source === 'usda') s.saveFood(c.food);
      if (r.picked || r.status === 'ambiguous') s.setChoice(fold(r.query), c.food.id); // remember what the user explicitly chose
    }
    const added = s.logEntries(entries);
    buzz(16);
    useVoice.getState().go('confirmed');
    setTimeout(() => {
      useUI.getState().closeAll();
      toast(t('Added {n} items to {meal}', { n: added.length, meal: mealName(s.settings.meals.find((m) => m.id === mealId)!, lang) }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => added.forEach((e) => s.removeEntry(e.id)) });
    }, 820);
  };

  // ── workout confirm ──
  const wActive = wrows.filter((r) => !r.removed);
  const wReady = wActive.length > 0 && wActive.every((r) => r.ex && r.sets.length > 0);
  const confirmWorkout = () => {
    if (confirmed.current || !wReady) return;
    confirmed.current = true;
    const st = useStore.getState();
    if (!st.active) st.startWorkout({ name: '' });
    let n = 0;
    for (const r of wActive) {
      addExercises([r.ex!.id]);
      st.mutateActive((a) => {
        const exs = a.exercises.map((e) => ({ ...e }));
        const target = [...exs].reverse().find((e) => e.exerciseId === r.ex!.id);
        if (!target) return a;
        const sets: SetRecord[] = r.sets.map((x) => ({ id: uid('s'), type: 'working', weightKg: x.weightKg, reps: x.reps, durationSec: x.durationSec, distanceM: x.distanceM, done: true, completedAt: Date.now() }));
        n += sets.length;
        // fill unfilled planned sets first, then append
        let i = 0;
        const out = target.sets.map((q) => (!q.done && i < sets.length ? { ...sets[i++], id: q.id, type: q.type === 'warmup' ? 'working' : q.type, target: q.target } as SetRecord : q));
        while (i < sets.length) out.push(sets[i++]);
        target.sets = out;
        return { ...a, exercises: exs };
      });
    }
    buzz(16);
    useVoice.getState().go('confirmed');
    setTimeout(() => { useUI.getState().pop(); toast(t('Logged {n} sets', { n }), { tone: 'ok' }); }, 820);
  };

  const inReview = phase === 'review' || phase === 'confirmed';
  const listening = phase === 'listening' || phase === 'requesting';
  const label = ({
    idle: t('Tap the sphere and speak'), requesting: t('Starting the microphone…'), listening: mic.active ? t('Listening') : t('Listening (no level meter)'), processing: t('Understanding…'),
    review: t('Check and confirm'), confirmed: t('Done'), error: t('Couldn’t listen'), unavailable: t('Microphone unavailable'),
  } as Record<string, string>)[phase];

  const example = mode === 'food' ? t('“200 grams of skyr, one banana and 60 grams of oats”') : t('“Bench press 80 kilos for 8, 8 and 6”');

  return (
    <motion.div className="voice" style={{ position: 'fixed', inset: 0, zIndex: z, display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }} role="dialog" aria-modal="true" aria-label={t('Dictation')}>
      <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--bg) 78%, transparent)', WebkitBackdropFilter: 'blur(30px) saturate(1.4)', backdropFilter: 'blur(30px) saturate(1.4)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', padding: `calc(var(--sat) + 12px) 18px 0` }}>
        <div className="row-flex between">
          <button className="icon-btn press" aria-label={t('Close')} onClick={() => useUI.getState().pop()}><Icon name="close" /></button>
          <div style={{ width: 210 }}><Seg value={mode} onChange={(m) => { if (phase === 'processing' || inReview) return; setMode(m); }} options={[{ value: 'food', label: t('Food') }, { value: 'workout', label: t('Workout') }]} /></div>
        </div>

        {/* sphere */}
        <motion.div layout style={{ display: 'grid', placeItems: 'center', marginTop: inReview ? 6 : 26 }} transition={SOFT}>
          <SphereSlot id="voice" priority={10} style={{ width: inReview ? 76 : 'min(62vw, 250px)', height: inReview ? 76 : 'min(62vw, 250px)', transition: 'width .45s cubic-bezier(.22,1,.36,1), height .45s cubic-bezier(.22,1,.36,1)' }} />
        </motion.div>
        {!inReview && (
          <button aria-label={listening ? t('Stop and review') : t('Start listening')} onClick={() => { buzz(10); if (listening) finish(); else if (phase === 'idle' || phase === 'error' || phase === 'unavailable') begin(); }}
            style={{ position: 'absolute', left: '50%', top: 78, width: 'min(62vw, 250px)', height: 'min(62vw, 250px)', transform: 'translateX(-50%)', borderRadius: 999 }} />
        )}

        <div style={{ textAlign: 'center', marginTop: inReview ? 6 : 14 }}>
          <div className="micro" aria-live="polite" style={{ color: phase === 'listening' ? 'var(--ac-text)' : undefined }}>{label}</div>
        </div>

        {/* transcript / typed */}
        {!inReview && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginTop: 14, textAlign: 'center' }} className="hide-scroll">
            {!typing && phase !== 'processing' && (
              <div className="display display-md" style={{ lineHeight: 1.12, padding: '0 6px' }}>
                {final || interim ? <><span>{final}</span>{interim && <span style={{ color: 'var(--tx3)' }}> {interim}</span>}</> : <span style={{ color: 'var(--tx3)', fontSize: 18, fontStretch: '100%', fontWeight: 560 }}><span className="micro" style={{ display: 'block', marginBottom: 6 }}>{t('Try saying')}</span>{example}</span>}
              </div>
            )}
            {phase === 'processing' && <div className="display display-md" style={{ color: 'var(--tx2)' }}>{textNow()}</div>}
            {err && <div className="plinth-2 small" style={{ padding: '12px 14px', margin: '16px 0 0', textAlign: 'left' }}>{err}</div>}
            {typing && phase !== 'processing' && (
              <div style={{ textAlign: 'left', marginTop: 8 }}>
                <textarea className="input" style={{ minHeight: 110 }} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={example} aria-label={t('Type what you ate or did')} autoFocus />
                {!supported && <div className="xs t3" style={{ marginTop: 8 }}>{t('Speech recognition isn’t available in this browser. Type it, or use your keyboard’s microphone key.')}</div>}
              </div>
            )}
          </div>
        )}

        {!inReview && (
          <div style={{ padding: '10px 0 calc(var(--sab) + 18px)' }}>
            <div className="row-flex" style={{ gap: 10 }}>
              {supported && <button className="btn press grow" onClick={() => { if (typing) { setTyping(false); begin(); } else { handle.current?.abort(); mic.release('voice'); useVoice.getState().go('idle'); setTyping(true); } }}>{typing ? <><Icon name="mic" size={18} /> {t('Speak instead')}</> : <><Icon name="edit" size={18} /> {t('Type instead')}</>}</button>}
              <button className="btn primary press grow" disabled={phase === 'processing' || (!textNow() && !listening)} onClick={() => finish()}>{phase === 'processing' ? t('Working…') : listening ? t('Done speaking') : t('Review')}</button>
            </div>
            <div className="xs t3" style={{ textAlign: 'center', marginTop: 10 }}>{supported ? t('Speech-to-text is done by your browser’s speech service (often a cloud service). Audio is never stored by Aven.') : t('Nothing is recorded or sent anywhere.')}</div>
          </div>
        )}

        {/* review */}
        {inReview && mode === 'food' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="small t2" style={{ textAlign: 'center', padding: '0 10px 10px' }}>“{textNow()}”</div>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }} className="hide-scroll">
              {rows.length === 0 && <div className="empty"><div className="display display-sm">{t('Nothing to add')}</div><div className="small">{t('I couldn’t find any foods in that. Try “150 grams of rice and a banana”.')}</div></div>}
              <AnimatePresence initial={false}>
                {rows.map((r) => !r.removed && (
                  <FoodReviewRow key={r.id} row={r} food={foodOf(r)} info={calc(r)} pool={pool}
                    onPick={(f) => setRows((x) => x.map((y) => (y.id === r.id ? { ...y, choiceId: f.id, picked: true, candidates: y.candidates.some((c) => c.food.id === f.id) ? y.candidates : [{ food: f, score: 1 }, ...y.candidates], qtyOverride: undefined } : y)))}
                    onQty={(q) => setRows((x) => x.map((y) => (y.id === r.id ? { ...y, qtyOverride: q } : y)))}
                    onRemove={() => setRows((x) => x.map((y) => (y.id === r.id ? { ...y, removed: true } : y)))} />
                ))}
              </AnimatePresence>
            </div>
            <div style={{ padding: '8px 0 calc(var(--sab) + 16px)', borderTop: '1px solid var(--line)' }}>
              <div className="chips" style={{ marginBottom: 10 }}>{s.settings.meals.map((m) => <button key={m.id} className={`chip sm press ${mealId === m.id ? 'on' : ''}`} onClick={() => setMealId(m.id)}>{mealName(m, lang)}</button>)}</div>
              <div className="row-flex" style={{ gap: 10 }}>
                <button className="btn press" onClick={() => { confirmed.current = false; useVoice.getState().go('idle'); setTyped(textNow()); setTyping(true); }}><Icon name="edit" size={18} /> {t('Edit text')}</button>
                <button className="btn primary press grow" disabled={!ready || phase === 'confirmed'} onClick={confirmFood}>{pending > 0 ? t('{n} to resolve', { n: pending }) : active.length === 1 ? t('Log 1 item') : t('Log {n} items', { n: active.length })}</button>
              </div>
            </div>
          </div>
        )}
        {inReview && mode === 'workout' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="small t2" style={{ textAlign: 'center', padding: '0 10px 10px' }}>“{textNow()}”</div>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }} className="hide-scroll">
              {wrows.length === 0 && <div className="empty"><div className="display display-sm">{t('Nothing to add')}</div><div className="small">{t('Try “squat 100 kilos for 5, 5 and 5”.')}</div></div>}
              {wrows.map((r) => !r.removed && (
                <WorkoutReviewRow key={r.id} row={r} exercises={exercises}
                  onPick={(ex) => setWrows((x) => x.map((y) => (y.id === r.id ? { ...y, ex, status: 'resolved' } : y)))}
                  onSets={(sets) => setWrows((x) => x.map((y) => (y.id === r.id ? { ...y, sets } : y)))}
                  onRemove={() => setWrows((x) => x.map((y) => (y.id === r.id ? { ...y, removed: true } : y)))} />
              ))}
            </div>
            <div style={{ padding: '8px 0 calc(var(--sab) + 16px)', borderTop: '1px solid var(--line)' }}>
              {!s.active && <div className="xs t3" style={{ marginBottom: 8 }}>{t('No workout is running — confirming will start one.')}</div>}
              <div className="row-flex" style={{ gap: 10 }}>
                <button className="btn press" onClick={() => { confirmed.current = false; useVoice.getState().go('idle'); setTyped(textNow()); setTyping(true); }}><Icon name="edit" size={18} /> {t('Edit text')}</button>
                <button className="btn primary press grow" disabled={!wReady || phase === 'confirmed'} onClick={confirmWorkout}>{wActive.length === 1 ? t('Log 1 exercise') : t('Log {n} exercises', { n: wActive.length })}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── rows ────────────────────────────────────────────────────

function FoodReviewRow({ row, food, info, pool, onPick, onQty, onRemove }: {
  row: FoodRow; food?: Food; info: ReturnType<typeof Object> | null; pool: Food[]; onPick: (f: Food) => void; onQty: (q: Quantity) => void; onRemove: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const c = info as { food: Food; qty: Quantity | null; estimated: boolean; problem?: string; base?: number } | null;
  const hits = useMemo(() => (q ? searchFoods(q, pool).slice(0, 5).map((x) => x.food) : []), [q, pool]);
  const n = c && c.base !== undefined ? scale(c.food.per100, c.base) : undefined;
  const needsChoice = !food || (row.status === 'ambiguous' && !row.picked);
  const badge = row.status === 'resolved' || row.picked
    ? { text: row.remembered ? t('Remembered') : t('Matched'), tone: 'var(--ok)', icon: 'check' }
    : row.status === 'ambiguous' ? { text: t('Choose'), tone: 'var(--warn)', icon: 'info' } : { text: t('Not found'), tone: 'var(--bad)', icon: 'info' };
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={SOFT} className="plinth" style={{ padding: 14, marginBottom: 10 }}>
      <div className="row-flex between">
        <div className="xs t3 trunc">“{row.raw}”</div>
        <div className="row-flex" style={{ gap: 4 }}>
          <span className="chip sm" style={{ color: badge.tone, background: 'transparent', boxShadow: `inset 0 0 0 1px ${badge.tone}` }}><Icon name={badge.icon} size={13} sw={2.4} /> {badge.text}</span>
          <button className="icon-btn flat sm" aria-label={t('Remove')} onClick={onRemove}><Icon name="close" size={16} /></button>
        </div>
      </div>
      {food && !needsChoice && (
        <>
          <div className="row-flex between" style={{ marginTop: 8, alignItems: 'flex-end' }}>
            <div className="grow" style={{ minWidth: 0 }}><div className="li-title trunc">{food.name}</div>{food.brand && <div className="xs t3">{food.brand}</div>}</div>
            <div className="num" style={{ fontWeight: 700, fontSize: 18 }}>{n ? fmtNutrient('kcal', n.kcal, lang) : '—'}<span className="t3 small"> kcal</span></div>
          </div>
          {c?.qty ? (
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              <div style={{ width: 120 }}><NumInput value={c.qty.amount} max={2} onChange={(v) => onQty({ ...c.qty!, amount: v ?? 0 })} unit={c.qty.unit === 'portion' ? '×' : c.qty.unit} label={t('Amount')} /></div>
              <div className="chips grow" style={{ margin: 0, padding: 0 }}>
                {allowedUnits(food).map((u) => <button key={u} className={`chip sm press ${c.qty!.unit === u ? 'on' : ''}`} onClick={() => onQty({ amount: c.base ? Math.round(c.base) : 100, unit: u })}>{u}</button>)}
                {food.portions.map((p) => <button key={p.id} className={`chip sm press ${c.qty!.unit === 'portion' && c.qty!.portionId === p.id ? 'on' : ''}`} onClick={() => onQty({ amount: 1, unit: 'portion', portionId: p.id })}>{p.verified ? '✓' : '~'} {p.label}</button>)}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="small" style={{ color: 'var(--warn)', marginBottom: 6 }}>{c?.problem === 'needsGrams' ? t('“{u}” can’t be converted for this food (no known density or portion). Enter grams:', { u: row.raw }) : t('How much?')}</div>
              <div className="row-flex" style={{ gap: 8 }}><div style={{ width: 130 }}><NumInput value={undefined} max={1} unit={food.basis} onChange={(v) => v && onQty({ amount: v, unit: food.basis })} placeholder="100" autoFocus /></div></div>
            </div>
          )}
          {c?.estimated && <div className="xs" style={{ color: 'var(--warn)', marginTop: 8 }}>~ {t('Portion size is a typical estimate — adjust if you know the weight.')}</div>}
          {row.status === 'ambiguous' && <button className="small t2 press" style={{ marginTop: 6 }} onClick={() => setSearching((v) => !v)}>{t('Not this food?')}</button>}
        </>
      )}
      {needsChoice && (
        <div style={{ marginTop: 10 }}>
          <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{row.status === 'unmatched' ? t('No match for “{q}”', { q: row.query }) : t('Which “{q}”?', { q: row.query })}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {row.candidates.map((cand) => (
              <button key={cand.food.id} className="plinth-2 press" style={{ textAlign: 'left', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, outline: cand.food.id === row.suggestionId ? '1.5px solid color-mix(in srgb, var(--ac) 50%, transparent)' : undefined }} onClick={() => onPick(cand.food)}>
                <div className="grow"><div className="li-title small">{cand.food.name}{cand.food.id === row.suggestionId && <span className="accent xs"> · {t('suggested')}</span>}</div><div className="xs t3 num">{cand.food.brand ? `${cand.food.brand} · ` : ''}{fmtNutrient('kcal', cand.food.per100.kcal, lang)} kcal / 100 {cand.food.basis}{cand.food.source === 'off' || cand.food.source === 'usda' ? ` · ${cand.food.source === 'off' ? 'Open Food Facts' : 'USDA'}` : ''}</div></div>
                <Icon name="chevR" size={16} />
              </button>
            ))}
          </div>
          <button className="small t2 press" style={{ marginTop: 8 }} onClick={() => setSearching((v) => !v)}>{t('Search something else')}</button>
        </div>
      )}
      {searching && (
        <div style={{ marginTop: 8 }}>
          <input className="input" autoFocus placeholder={t('Search foods')} value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((f) => <button key={f.id} className="li press" style={{ borderTop: '1px solid var(--line)', minHeight: 44, width: '100%' }} onClick={() => { onPick(f); setSearching(false); setQ(''); }}><div className="grow li-title small" style={{ textAlign: 'left' }}>{f.name}</div></button>)}
        </div>
      )}
    </motion.div>
  );
}

function WorkoutReviewRow({ row, exercises, onPick, onSets, onRemove }: { row: WRow; exercises: Exercise[]; onPick: (e: Exercise) => void; onSets: (s: ParsedSet[]) => void; onRemove: () => void }) {
  const t = useT();
  const lang = useLang();
  const units = useStore((s) => s.settings.units);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const hits = q ? matchExercises(q, exercises, lang, 6) : [];
  const setField = (i: number, patch: Partial<ParsedSet>) => onSets(row.sets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <motion.div layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={SOFT} className="plinth" style={{ padding: 14, marginBottom: 10 }}>
      <div className="row-flex between"><div className="xs t3 trunc">“{row.raw}”</div><button className="icon-btn flat sm" aria-label={t('Remove')} onClick={onRemove}><Icon name="close" size={16} /></button></div>
      {row.ex ? (
        <div className="row-flex between" style={{ marginTop: 6 }}><div className="li-title">{exName(row.ex, lang)}</div><button className="small t2 press" onClick={() => setSearching(true)}>{t('Change')}</button></div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{row.candidates.length ? t('Which exercise?') : t('No exercise matched “{q}”', { q: row.query })}</div>
          {row.candidates.map((c) => <button key={c.ex.id} className="plinth-2 press" style={{ display: 'flex', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6, alignItems: 'center' }} onClick={() => onPick(c.ex)}><span className="grow li-title small">{exName(c.ex, lang)}</span><Icon name="chevR" size={16} /></button>)}
          <button className="small t2 press" onClick={() => setSearching(true)}>{t('Search exercises')}</button>
        </div>
      )}
      {searching && (
        <div style={{ marginTop: 8 }}>
          <input className="input" autoFocus placeholder={t('Search exercises')} value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((h) => <button key={h.ex.id} className="li press" style={{ borderTop: '1px solid var(--line)', minHeight: 44, width: '100%' }} onClick={() => { onPick(h.ex); setSearching(false); setQ(''); }}><span className="grow li-title small" style={{ textAlign: 'left' }}>{exName(h.ex, lang)}</span></button>)}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {row.sets.length === 0 && <div className="small" style={{ color: 'var(--warn)' }}>{t('No sets found. Try “80 kilos for 8”.')}</div>}
        {row.sets.map((x, i) => (
          <div key={i} className="row-flex" style={{ gap: 8, marginBottom: 8 }}>
            <span className="micro" style={{ width: 18 }}>{i + 1}</span>
            {x.weightKg !== undefined || x.reps !== undefined ? <>
              <div style={{ flex: 1 }}><NumInput value={x.weightKg === undefined ? undefined : kgToDisplay(x.weightKg, units.weight)} max={2} unit={units.weight} onChange={(v) => setField(i, { weightKg: v === undefined ? undefined : displayToKg(v, units.weight) })} label={t('Weight')} /></div>
              <div style={{ flex: 1 }}><NumInput value={x.reps} max={0} unit={t('reps')} onChange={(v) => setField(i, { reps: v })} label={t('Reps')} /></div>
            </> : <div className="grow small num">{x.durationSec ? `${fmtNum(x.durationSec / 60, lang, 1)} min` : ''} {x.distanceM ? `${fmtNum(x.distanceM / 1000, lang, 2)} km` : ''}</div>}
            <button className="icon-btn flat sm" aria-label={t('Remove set')} onClick={() => onSets(row.sets.filter((_, j) => j !== i))}><Icon name="minus" size={16} /></button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
