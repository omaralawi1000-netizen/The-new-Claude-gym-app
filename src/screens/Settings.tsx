import { troubleReport, troubleThisWeek } from '../lib/trouble';
import { IS_BETA, requestCopyFromReal } from '../lib/beta';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, persistStatus } from '../state/store';
import { useUI, haptic } from '../state/ui';
import { apple, highRefresh, onHighRefresh, setHighRefresh } from '../ui/motion';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { NumInput, Seg, Stepper, Toggle } from '../ui/kit';
import { heavyMode } from '../lib/eating';
import { cmToDisplay, displayToCm, displayToKg, fmtNum, fmtPct, kgToDisplay, KG_PER_LB } from '../lib/units';
import { LB_STEPS, lbStepKg } from '../lib/workout';
import { lastBackup, markBackup, useStorageKept } from '../lib/persist';
import { buildBackup, parseBackup, snapshotData } from '../lib/backup';
import { DriveCard } from './DriveBackup';
import { resetDrive } from '../lib/drive';
import { defaultData } from '../state/defaults';
import { buildDemo } from '../lib/demo';
import { userHasData } from '../lib/stats';
import { clearPhotos, loadPhoto, savePhoto } from '../lib/photos';
import { clearArchive, importArchive } from '../lib/archive';
import { clearWatchDetail, onWatchDetail, watchDetailCount } from '../lib/watchDetail';
import { lastWrite, prepareWrites } from '../lib/hcWrite';
import type { AppData, Lang, Meal, Settings } from '../lib/types';
import { cardsOf } from '../lib/types';
import { uid, kcalOf, scaleMacros, suggestMacros } from '../lib/nutrition';
import { mealName, removeMeal, restoreMeal } from '../lib/derive';
import { addDays, dayKey, diffDays, fmtDate, fmtDuration } from '../lib/dates';
import { useAi } from '../state/ai';
import { clearKeys } from '../lib/keys';
import { VoiceAiSettings } from './VoiceAi';
import { CoachMemory } from './CoachMemory';
import { cardOrder, type TodayCard } from './TodayCards';
import { startDragSort } from '../ui/dragSort';
import { setFpsMeter, useFpsMeterOn } from '../ui/FpsMeter';
import { BG_KINDS, BgBody, setBgPhoto, useBgPhoto, useSkyClock, type BgKind } from '../ui/Backdrop';
import { startStutter, stopStutter, stutterReport, stutterState, subscribeStutter } from '../lib/stutter';
import { coachTrace } from '../lib/coachTrace';
import { lastDone, lastHeard, lastRestLate } from './workout/rest';
import { fmtTime } from '../lib/dates';
import { appOnPhone, inAndroidApp, restCheck, showAppRest } from '../lib/androidApp';
import { hcLastLine, hcLink, hcStatus, noteAsk } from '../lib/healthSync';
import { ACTIVITY_LABEL, INTENSITY_LABEL, activityIcon } from '../lib/activity';
import { useEdgeFade } from '../ui/edgeFade';

const EASE = [0.22, 1, 0.36, 1] as const;
// Moving between Settings pages works like iOS: the page you leave steps aside and fades out quickly, then the next one glides
// in from the side on Apple's spring. The new one starts a beat later, so the two never show as a double image (the titles
// used to overlap into things like "Settings & locale"). Whole transforms, so the browser runs them on its compositor.
const PUSH = apple(0.55); // same glide as pages inside any sheet (ui/Sheet.tsx)
const OUT = { duration: 0.14, ease: [0.4, 0, 1, 1] as const };
const PAGE = {
  enter: (d: number) => ({ opacity: 0, transform: `translateX(${d * 44}px)` }),
  center: { opacity: 1, transform: 'translateX(0px)', transitionEnd: { transform: 'none' }, transition: { transform: { ...PUSH, delay: 0.1 }, opacity: { duration: 0.2, ease: EASE, delay: 0.1 } } },
  exit: (d: number) => ({ opacity: 0, transform: `translateX(${d * -28}px)`, transition: OUT }),
};
const TITLE = {
  enter: (d: number) => ({ opacity: 0, transform: `translateX(${d * 22}px)` }),
  center: { opacity: 1, transform: 'translateX(0px)', transitionEnd: { transform: 'none' }, transition: { transform: { ...PUSH, delay: 0.1 }, opacity: { duration: 0.22, ease: EASE, delay: 0.1 } } },
  exit: (d: number) => ({ opacity: 0, transform: `translateX(${d * -14}px)`, transition: { duration: 0.11, ease: [0.4, 0, 1, 1] as const } }),
};

type Section = null | 'profile' | 'today' | 'targets' | 'training' | 'food' | 'units' | 'look' | 'reminders' | 'data' | 'privacy' | 'ai' | 'memory' | 'watch' | 'about';

function Row({ icon, title, sub, onClick, value, initial }: { icon: any; title: string; sub?: string; onClick: () => void; value?: string; initial?: string }) {
  return (
    <button className="li press" onClick={onClick}>
      {initial
        // you: your initial in a round badge, a touch bigger than the icons below
        ? <span style={{ width: 44, height: 44, margin: -3, borderRadius: '50%', background: 'var(--s2)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--line)', flex: 'none', fontSize: 19, fontWeight: 600 }}>{initial}</span>
        : <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s2)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--line)', flex: 'none' }}><Icon name={icon} size={19} /></span>}
      <div className="grow" style={{ textAlign: 'left', minWidth: 0 }}><div className="li-title">{title}</div>{sub && <div className="li-sub trunc">{sub}</div>}</div>
      {value && <span className="small t2">{value}</span>}<Icon name="chevR" size={16} style={{ color: 'var(--tx3)' }} />
    </button>
  );
}
/** Diagnostic: shows the refresh rate your phone + browser really deliver (see ui/FpsMeter.tsx). */
function FpsField() {
  const t = useT();
  const on = useFpsMeterOn();
  return (
    <ToggleRow label={t('Frame rate readout')} hint={t('Shows your real refresh rate, top-left.')} on={on} onChange={setFpsMeter} />
  );
}

// Each look's Today light (styles.css), so its card can show a small Today screen in those colours
const PALETTES: { id: Settings['palette']; name: string; ac: string; h1: string; h2: string; h3: string }[] = [
  { id: 'ember', name: 'Ember', ac: '#ff7a59', h1: '#8a3fd1', h2: '#ff7a59', h3: '#ff9a3d' },
  { id: 'aurora', name: 'Aurora', ac: '#3de0c8', h1: '#6a5cff', h2: '#3de0c8', h3: '#c25cff' },
  { id: 'mono', name: 'Mono', ac: '#ff7a59', h1: '#9094a8', h2: '#5b6070', h3: '#b8bccb' },
  { id: 'sunset', name: 'Sunset', ac: '#ff6b9d', h1: '#ff4f7b', h2: '#ff9a4d', h3: '#8a4bff' },
  { id: 'forest', name: 'Forest', ac: '#b6f25a', h1: '#1f9d6a', h2: '#b6f25a', h3: '#2fd0a0' },
  { id: 'golden', name: 'Golden hour', ac: '#ffb547', h1: '#ff4a1a', h2: '#ff5a24', h3: '#e8301a' },
  { id: 'midnight', name: 'Midnight', ac: '#9cc4ff', h1: '#1d3fa8', h2: '#4a7dff', h3: '#2a2f8f' },
  { id: 'champagne', name: 'Champagne', ac: '#e8cf9a', h1: '#6e6c78', h2: '#c08c2e', h3: '#4a4a56' },
];
/** A tiny Today screen in one look's colours: its light, the ring, a workout card with the play button, the dock. */
function LookPreview({ p }: { p: (typeof PALETTES)[number] }) {
  return (
    <div className="look-pv" aria-hidden style={{ ['--p-ac' as string]: p.ac, ['--p-h1' as string]: p.h1, ['--p-h2' as string]: p.h2, ['--p-h3' as string]: p.h3 }}>
      <i /><i />
      <span className="lp-ring" />
      <span className="lp-card"><em /><b /></span>
      <span className="lp-dock"><b /></span>
    </div>
  );
}

const BG_NAMES: Record<BgKind, string> = { classic: 'Classic', orb: 'Orb light', tabs: 'Colour per tab', sunrise: 'Sunrise', mesh: 'Mesh', dots: 'Dot field', time: 'Time of day', night: 'Night sky', photo: 'Your photo' };
/**
 * Settings → Appearance → Background: each one shown small, as the real layer under a sketch of Today. Picking one while
 * Background glow is Off turns the glow back on (Off would hide it). Your photo asks for a picture the first time.
 */
/** A sideways row of look tiles that fades out on the side that has more, instead of being cut by the sheet edge. */
function PalRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useEdgeFade<HTMLDivElement>();
  // opens with the chosen tile in view (Golden hour sat off to the right, so the page opened without showing your pick)
  useLayoutEffect(() => {
    const el = ref.current, on = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!el || !on) return;
    const a = el.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (r.left >= a.left && r.right <= a.right) return;
    el.scrollLeft = Math.max(0, Math.round(el.scrollLeft + r.left - a.left - (a.width - r.width) / 2));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="pal fade-x" role="radiogroup" aria-label={label}>{children}</div>;
}

function BackgroundPicker() {
  const t = useT();
  const st = useStore((x) => x.settings);
  const set = useStore((x) => x.updateSettings);
  const photo = useBgPhoto();
  const sky = useSkyClock(true);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const cur = st.background ?? 'classic';
  const tab = useUI((x) => x.tab);
  const pick = (k: BgKind) => {
    if (k === 'photo' && !photo) { file.current?.click(); return; }
    haptic('select');
    set({ background: k, ...(st.glow === 'off' && k !== 'photo' ? { glow: 'full' as const } : {}) });
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { await setBgPhoto(f); haptic('select'); set({ background: 'photo' }); } catch { /* not a picture the phone can read */ } finally { setBusy(false); }
  };
  return (
    <>
      <PalRow label={t('Background')}>
        {BG_KINDS.map((k) => (
          <button key={k} role="radio" aria-checked={cur === k} className={`pal-card press ${cur === k ? 'on' : ''}`} onClick={() => pick(k)}>
            <div className="look-pv bg-pv" aria-hidden style={{ ['--p-ac' as string]: 'var(--ac)' }}>
              <div className={k === 'classic' ? 'aurora' : 'bgx'} data-k={k} data-hue={tab}><BgBody kind={k} preview sky={sky} /></div>
              {k === 'photo' && !photo && <span className="bg-pv-empty"><Icon name={busy ? 'clock' : 'camera'} size={22} /></span>}
              <span className="lp-ring" />
              <span className="lp-card"><em /><b /></span>
              <span className="lp-dock"><b /></span>
            </div>
            <div className="small" style={{ marginTop: 8, fontWeight: 600 }}>{t(BG_NAMES[k])}</div>
          </button>
        ))}
      </PalRow>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {cur === 'photo' && photo && <button className="btn sm press" style={{ marginTop: 10 }} onClick={() => file.current?.click()} disabled={busy}><Icon name="camera" size={16} />{t('Change photo')}</button>}
    </>
  );
}

/**
 * Settings → Today: what the Today screen shows. Under the ring: switches. The cards below the workout: a list you can
 * reorder (drag the grip, as in the routine editor) and switch off. Anything switched off is gone, not hidden behind a button.
 */
function TodaySettings() {
  const t = useT();
  const w = useStore((x) => x.settings.widgets);
  const saved = useStore((x) => x.settings.todayOrder);
  const pins = useStore((x) => x.settings.coachPins !== false);
  const set = useStore((x) => x.updateSettings);
  const listRef = useRef<HTMLDivElement>(null);
  const order = cardOrder(saved);
  const ring: { k: keyof Settings['widgets']; label: string; hint?: string }[] = [
    { k: 'quick', label: t('Quick add buttons'), hint: t('Add, scan and photo under the ring.') },
    { k: 'water', label: t('Water'), hint: t('The water button here and the water card on the Food screen.') },
    { k: 'recents', label: t('Recent foods'), hint: t('One-tap chips for what you eat often.') },
  ];
  const CARD: Record<TodayCard, { label: string; hint: string }> = {
    targets: { label: t('Up next'), hint: t('Next workout and what to beat.') },
    week: { label: t('Week'), hint: t('Week dots, streak and wrestling.') },
    muscles: { label: t('Muscles this week'), hint: t('Hard sets per muscle this week.') },
    records: { label: t('Recent records'), hint: t('Your newest personal bests.') },
    weight: { label: t('Weight trend'), hint: t('Your weight and its trend line.') },
  };
  const move = (from: number, to: number) => { const l = [...order]; const [it] = l.splice(from, 1); l.splice(to, 0, it); set({ todayOrder: l }); };
  return (
    <div className="stack gap16">
      <div className="row-flex between" style={{ gap: 14 }}>
        <div style={{ minWidth: 0 }}><div>{t('The Coach’s pin')}</div><div className="xs t3">{t('Reminders and suggestions it notices, pinned at the top. With a Gemini key it also takes its own look once a day.')}</div></div>
        <Toggle on={pins} onChange={(v) => set({ coachPins: v })} label={t('The Coach’s pin')} />
      </div>
      <div className="row-flex between"><div className="lbl">{t('Cards')}</div><div className="xs t3">{t('Drag to reorder')}</div></div>
      <div ref={listRef} className="stack" style={{ gap: 8, marginTop: -6 }}>
        {order.map((k, i) => (
          <div key={k} data-flip={k} className="plinth rt-card today-card-row">
            <button className="rt-grip" data-no-swipe aria-label={t('Drag to reorder')} onPointerDown={(e) => startDragSort(e, listRef.current, k, move)}><Icon name="grip" size={18} /></button>
            <div style={{ minWidth: 0, flex: 1, opacity: w[k] ? 1 : 0.55, transition: 'opacity 200ms' }}><div>{CARD[k].label}</div><div className="xs t3">{CARD[k].hint}</div></div>
            <div className="sr-only">
              <button disabled={i === 0} onClick={() => move(i, i - 1)}>{t('Move up')}</button>
              <button disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>{t('Move down')}</button>
            </div>
            <Toggle on={w[k]} onChange={(v) => set({ widgets: { ...w, [k]: v } })} label={CARD[k].label} />
          </div>
        ))}
      </div>
      <div className="lbl" style={{ marginTop: 6 }}>{t('Under the ring')}</div>
      {ring.map((r) => (
        <div key={r.k} className="row-flex between" style={{ gap: 14 }}>
          <div style={{ minWidth: 0 }}><div>{r.label}</div>{r.hint && <div className="xs t3">{r.hint}</div>}</div>
          <Toggle on={w[r.k]} onChange={(v) => set({ widgets: { ...w, [r.k]: v } })} label={r.label} />
        </div>
      ))}
    </div>
  );
}

function HrrField() {
  const t = useT();
  const on = useSyncExternalStore(onHighRefresh, highRefresh, () => true);
  return (
    <ToggleRow label={t('High refresh rate')} hint={t('Draws motion at your screen’s full rate (up to 120 Hz).')} on={on} onChange={setHighRefresh} />
  );
}

/** A switch row: what it is (and a line about it) on the left, the switch on the right — the same everywhere in Settings. */
function ToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row-flex between" style={{ gap: 14 }}>
      <div style={{ minWidth: 0 }}><div>{label}</div>{hint && <div className="xs t3">{hint}</div>}</div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="field"><label>{label}</label>{children}{hint && <div className="xs t3">{hint}</div>}</div>;
}

export function SettingsSheet({ props }: { props: { section?: Section } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const [sec, setSecRaw] = useState<Section>(props.section ?? null);
  const [dir, setDir] = useState(1); // 1 = going deeper, -1 = going back: decides which way pages slide
  const setSec = (x: Section) => { setDir(x ? 1 : -1); setSecRaw(x); };
  const ai = useAi();
  const set = s.updateSettings;
  const st = s.settings;
  const titles: Record<string, string> = { profile: t('Profile'), targets: t('Targets'), training: t('Training'), food: t('Food & water'), units: t('Units & locale'), look: t('Appearance'), today: t('Today'), reminders: t('Reminders'), data: t('Data & backup'), privacy: t('Privacy'), ai: t('Voice & AI'), memory: t('Coach memory'), watch: t('Watch'), about: t('About Aven') };
  // Adjust calories / macros in Profile open Targets; back from there returns to Profile
  const fromProfile = useRef(false);
  const goBack = () => (sec && !props.section ? (setSec(sec === 'targets' && fromProfile.current ? 'profile' : null), fromProfile.current = false) : pop());
  const moved = useRef(false); if (sec !== (props.section ?? null)) moved.current = true; // once you've moved between pages, pages settle in
  // Every page opens at its top, and back returns the list to where you left it (the shared scroll used to carry over, so a
  // page reached from far down the list opened half-way down). The page leaving keeps its place while it fades out.
  const bodyRef = useRef<HTMLDivElement>(null);
  const shown = useRef<Section>(sec); const listY = useRef(0);
  useLayoutEffect(() => {
    const el = bodyRef.current; if (!el || shown.current === sec) return;
    const from = el.scrollTop;
    if (shown.current === null) listY.current = from;
    shown.current = sec;
    const to = sec === null ? listY.current : 0;
    if (Math.abs(to - from) < 1) return;
    for (const pg of el.querySelectorAll<HTMLElement>(':scope > .settings-page')) if (pg.dataset.sec !== (sec ?? 'root')) pg.style.translate = `0 ${Math.round(to - from)}px`;
    el.scrollTop = to;
  }, [sec]);

  return (
    <Sheet onClose={pop} tall instant label={t('Settings')} z={100}>
      <SheetHead title={
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.span key={sec ?? 'root'} custom={dir} variants={TITLE} initial="enter" animate="center" exit="exit" style={{ display: 'inline-block', willChange: 'transform' }}>{sec ? titles[sec] : t('Settings')}</motion.span>
        </AnimatePresence>} onClose={sec ? goBack : pop} back={!!sec && !props.section} />
      <div ref={bodyRef} className="sheet-body" style={{ position: 'relative', overflowX: 'hidden' }}>
        {/* both pages move at once (no blank gap): the new one slides in sharpening from blur, the old one drifts out */}
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={sec ?? 'root'} data-sec={sec ?? 'root'} className={`no-rise settings-page ${moved.current ? '' : 'still'}`} custom={dir} variants={PAGE} initial="enter" animate="center" exit="exit" style={{ width: '100%' }}>
            {!sec && (
              <>
                <div className="list">
                  <Row icon="body" initial={st.name.trim()[0]?.toUpperCase()} title={st.name.trim() || t('Profile')} sub={profileSub(st, t, lang)} onClick={() => setSec('profile')} />
                  <Row icon="bolt" title={t('Targets')} sub={st.goals.kcal ? `${fmtNum(st.goals.kcal, lang, 0)} kcal${st.goals.protein ? ` · ${fmtNum(st.goals.protein, lang, 0)} g ${t('protein')}` : ''}` : t('Calories, macros, water — optional')} onClick={() => setSec('targets')} />
                  <Row icon="dumbbell" title={t('Training')} sub={`${t('Rest')} ${fmtDuration(st.restDefaultSec)} · ${st.effort === 'off' ? t('no RPE/RIR') : st.effort.toUpperCase()}`} onClick={() => setSec('training')} />
                  <Row icon="food" title={t('Food & water')} onClick={() => setSec('food')} />
                  <Row icon="globe" title={t('Units & locale')} sub={`${st.units.weight} · ${st.units.distance} · ${st.language === 'da' ? 'Dansk' : 'English'}`} onClick={() => setSec('units')} />
                  <Row icon="moon" title={t('Appearance')} sub={`${t(st.theme === 'system' ? 'System' : st.theme === 'dark' ? 'Dark' : 'Light')} · ${t(st.motion === 'system' ? 'Motion: system' : st.motion === 'reduce' ? 'Reduced motion' : 'Full motion')}`} onClick={() => setSec('look')} />
                  <Row icon="today" title={t('Today')} sub={t('Choose what Today shows')} onClick={() => setSec('today')} />
                  <Row icon="sparkle" title={t('Voice & AI')} sub={ai.hasGroq || ai.hasGemini || ai.hasOpenai ? [ai.hasGroq ? 'Groq' : '', ai.hasOpenai && ai.solFirst ? 'GPT-6.1 Sol' : '', ai.hasGemini ? 'Gemini' : ''].filter(Boolean).join(' + ') : undefined} onClick={() => setSec('ai')} />
                  <Row icon="note" title={t('Coach memory')} sub={s.memory.length ? t(s.memory.length === 1 ? '1 thing the Coach knows about you' : '{n} things the Coach knows about you', { n: s.memory.length }) : t('What the Coach knows about you')} onClick={() => setSec('memory')} />
                  {watchShown() && <Row icon="watch" title={t('Watch')} sub={watchSub(t, lang)} onClick={() => setSec('watch')} />}
                  <Row icon="bell" title={t('Reminders')} onClick={() => setSec('reminders')} />
                  <Row icon="download" title={t('Data & backup')} onClick={() => setSec('data')} />
                  <Row icon="shield" title={t('Privacy')} onClick={() => setSec('privacy')} />
                  <Row icon="info" title={t('About Aven')} onClick={() => setSec('about')} />
                </div>
                <button className="btn block press" style={{ marginTop: 20 }} onClick={() => { useUI.getState().closeAll(); setTimeout(() => push('onboarding', { rerun: true }), 60); }}><Icon name="sparkle" size={18} /> {t('Redo setup')}</button>
              </>
            )}
            {sec === 'profile' && <Profile onAdjust={() => { fromProfile.current = true; setSec('targets'); }} />}
            {sec === 'targets' && <Targets />}
            {sec === 'training' && (
              <div className="stack gap16">
                <Field label={t('Default rest between sets')}><div><Stepper compact label={t('Default rest between sets')} value={st.restDefaultSec} min={15} max={600} step={15} fmt={(v) => fmtDuration(v)} onChange={(v) => set({ restDefaultSec: v })} /></div></Field>
                <Field label={t('Effort tracking')}><Seg value={st.effort} onChange={(v) => set({ effort: v })} options={[{ value: 'off', label: t('Off') }, { value: 'rpe', label: 'RPE' }, { value: 'rir', label: 'RIR' }]} /></Field>
                <Field label={t('Smallest weight jump')}><div className="chips" style={{ margin: 0, padding: 0 }}>{st.units.weight === 'lb'
                  // in pounds: pound steps (kept in kg, as every weight is), so progression lands on real plates
                  ? LB_STEPS.slice(0, 4).map((v) => <button key={v} className={`chip press ${Math.abs(lbStepKg(st.plateStep) - v * KG_PER_LB) < 1e-6 ? 'on' : ''}`} onClick={() => set({ plateStep: v * KG_PER_LB })}>{v} lb</button>)
                  : [1, 1.25, 2.5, 5].map((v) => <button key={v} className={`chip press ${st.plateStep === v ? 'on' : ''}`} onClick={() => set({ plateStep: v })}>{fmtNum(v, lang, 2)} kg</button>)}</div></Field>
                <Field label={t('Workout opens in')} hint={t('Focus shows one exercise at a time. Last used remembers how you left it.')}><Seg value={st.workoutView ?? 'last'} onChange={(v) => set({ workoutView: v })} options={[{ value: 'last', label: t('Last used') }, { value: 'list', label: t('List') }, { value: 'focus', label: t('Focus') }]} /></Field>
                <ToggleRow label={t('Rest-timer sound')} on={st.sound} onChange={(v) => set({ sound: v })} />
                <RestAlertRow />
                <ToggleRow label={t('Haptic feedback')} on={st.haptics} onChange={(v) => set({ haptics: v })} />
              </div>
            )}
            {sec === 'food' && <FoodSettings />}
            {sec === 'units' && (
              <div className="stack gap16">
                <Field label={t('Language')}><Seg value={st.language} onChange={(v) => set({ language: v })} options={[{ value: 'en', label: 'English' }, { value: 'da', label: 'Dansk' }]} /></Field>
                <Field label={t('Weight')}><Seg value={st.units.weight} onChange={(v) => set({ units: { ...st.units, weight: v }, ...(v === 'kg' && ![1, 1.25, 2.5, 5].includes(st.plateStep) ? { plateStep: [1, 1.25, 2.5, 5].reduce((b, x) => (Math.abs(x - st.plateStep) < Math.abs(b - st.plateStep) ? x : b)) } : {}) })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></Field>
                <Field label={t('Distance')}><Seg value={st.units.distance} onChange={(v) => set({ units: { ...st.units, distance: v } })} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }]} /></Field>
                <Field label={t('Body measurements')}><Seg value={st.units.length} onChange={(v) => set({ units: { ...st.units, length: v } })} options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]} /></Field>
                <Field label={t('Week starts on')}><Seg value={st.weekStart} onChange={(v) => set({ weekStart: v })} options={[{ value: 1, label: t('Monday') }, { value: 0, label: t('Sunday') }]} /></Field>
                <Field label={t('New day starts at')} hint={t('Late-night meals before this hour count toward the previous day.')}><Seg value={st.dayStartHour} onChange={(v) => set({ dayStartHour: v })} options={[0, 2, 3, 4, 5].map((h) => ({ value: h, label: `${String(h).padStart(2, '0')}:00` }))} /></Field>
              </div>
            )}
            {sec === 'today' && <TodaySettings />}
            {sec === 'look' && (
              <div className="stack gap16">
                <Field label={t('Colours')}>
                  <PalRow label={t('Colours')}>
                    {PALETTES.map((p) => (
                      <button key={p.id} role="radio" aria-checked={st.palette === p.id} className={`pal-card press ${st.palette === p.id ? 'on' : ''}`} onClick={() => { haptic('select'); set({ palette: p.id }); }}>
                        <LookPreview p={p} />
                        <div className="small" style={{ marginTop: 8, fontWeight: 600 }}>{t(p.name)}</div>
                      </button>
                    ))}
                  </PalRow>
                </Field>
                <Field label={t('Background')} hint={t('Only Classic keeps drifting. The others hold still while you scroll.')}><BackgroundPicker /></Field>
                <Field label={t('Cards')} hint={t('Trial: how much colour comes through the cards on busy backgrounds. E blue (my pick), F richer blue, G almost no colour, H halfway to the light glass you see on launch, J between H and I, I most of the way, A the purple from before.')}><Seg value={cardsOf(st.cards)} onChange={(v) => set({ cards: v })} options={[{ value: 'mix', label: 'H' }, { value: 'between', label: 'J' }, { value: 'light', label: 'I' }, { value: 'blue', label: 'E' }, { value: 'sapphire', label: 'F' }, { value: 'clear', label: 'G' }, { value: 'plum', label: 'A' }]} /></Field>
                <Field label={t('Background glow')} hint={t('How strong the background is. Off leaves it plain.')}><Seg value={st.glow ?? 'full'} onChange={(v) => set({ glow: v })} options={[{ value: 'full', label: t('Full') }, { value: 'soft', label: t('Soft') }, { value: 'off', label: t('Off') }]} /></Field>
                <Field label={t('Theme')}><Seg value={st.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'system', label: t('System') }, { value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }]} /></Field>
                <Field label={t('Motion')}><Seg value={st.motion} onChange={(v) => set({ motion: v })} options={[{ value: 'system', label: t('System') }, { value: 'full', label: t('Full') }, { value: 'reduce', label: t('Reduced') }]} /></Field>
                <HrrField />
                <FpsField />
              </div>
            )}
            {sec === 'reminders' && <Reminders />}
            {sec === 'watch' && <WatchSection />}
            {sec === 'data' && <DataSection />}
            {sec === 'ai' && <VoiceAiSettings />}
            {sec === 'memory' && <CoachMemory />}
            {sec === 'privacy' && (
              <div className="stack gap12 small">
                <p style={{ margin: 0 }}><b>{t('Everything stays on this device.')}</b> {t('Aven has no account and no analytics. Your workouts, meals, weight and photos are stored in this browser’s local storage and IndexedDB.')}</p>
                <p style={{ margin: 0 }}><b>{t('Food lookup')}</b>: {t('when on, the text you search is sent to Aven’s lookup server, which forwards it to Open Food Facts and USDA FoodData Central. Nothing else is sent. Turn it off in Food & water.')}</p>
                <p style={{ margin: 0 }}><b>{t('Dictation')}</b>: {t('without a Groq key, speech-to-text is performed by your browser (on Chrome this is a Google cloud service). With a Groq key, your recording is sent to Groq instead. Either way Aven never stores audio; it only reads the microphone level to animate the sphere while you speak.')}</p>
                <p style={{ margin: 0 }}><b>{t('Voice & AI')}</b>: {t('only if you add keys. Text you dictate or ask the Coach (plus a short summary of your targets and training, and the Coach memory) goes to Google Gemini, or to OpenAI when GPT-6.1 Sol is on. API keys are stored only in this browser and are never part of exports or backups.')}</p>
                <p style={{ margin: 0 }}><b>{t('Photos')}</b>: {t('saved only on this device, stripped of location data, and not included in exports unless you choose.')}</p>
                <p style={{ margin: 0 }}>{t('Clearing browser data removes everything. Export a backup first (Data & backup).')}</p>
              </div>
            )}
            {sec === 'about' && <About />}
          </motion.div>
        </AnimatePresence>
      </div>
      {void lang}
    </Sheet>
  );
}

/**
 * The rest on the lock screen while Aven isn't on screen: "Rest over at 14:32", then a buzzing alert when it ends. A
 * notification, so it needs the browser's permission (asked here, once). Under it: how late the last alert came, so the phone
 * itself shows whether the alert can be trusted.
 */
function RestAlertRow() {
  const t = useT();
  const s = useStore();
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(() => (supported ? Notification.permission : 'denied'));
  const toast = useUI((u) => u.toast);
  const on = s.settings.restNotify !== false && perm === 'granted';
  const toggle = async (v: boolean) => {
    if (v && supported && Notification.permission === 'default') { const r = await Notification.requestPermission().catch(() => 'default' as NotificationPermission); setPerm(r); }
    s.updateSettings({ restNotify: v });
  };
  const lang = useLang();
  const [done, setDone] = useState<Awaited<ReturnType<typeof lastDone>> | null>(null);
  useEffect(() => { if (/Android/i.test(navigator.userAgent)) lastDone().then(setDone).catch(() => {}); }, []);
  if (!supported) return null;
  const late = on ? lastRestLate() : null;
  const app = inAndroidApp();
  // on Android: a test that goes the same way a real rest does (the line saying which link of the chain works lives in
  // About Aven, next to Copy details: it is for whoever is fixing the app, not for this row)
  const android = /Android/i.test(navigator.userAgent);
  // the last Done ✓ from the alert or the watch: where it got to (the worker got the tap → Aven heard it → ticked or why not)
  // (with the day when it wasn't today: "tapped 20:17" from an earlier day read as today, 25 Oct)
  const hhmm = (x: number) => (new Date(x).toDateString() === new Date().toDateString() ? '' : `${new Date(x).toLocaleDateString(lang === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short' })} `) + fmtTime(x, lang);
  const doneLine = !done ? '' : !done.tap && !done.page ? t('Last Done ✓: none has reached Aven yet')
    : done.page && (!done.tap || done.page.at >= done.tap.at - 1000)
      ? `${t('Last Done ✓: tapped {time}', { time: hhmm(done.page.at) })} · ${done.page.why ? t('not ticked ({why})', { why: t(done.page.why) }) : t('ticked at {time}', { time: hhmm(done.page.heard) })}`
      : `${t('Last Done ✓: tapped {time}', { time: hhmm(done.tap!.at) })} · ${t('Aven hasn’t picked it up')} (${done.tap!.sw}, ${done.tap!.wins})`;
  // (for the rest worker: the last button it got and what it made of it, and taps still waiting for Aven)
  const clickLine = done?.click ? `button ${done.click.action}${done.click.action === 'skip' ? (done.click.done ? '→done' : `→skip (${Math.round((done.click.at - done.click.endsAt) / 1000)} s)`) : ''} ${hhmm(done.click.at)}${done.waiting ? ` · waiting ${done.waiting}` : ''}` : done?.waiting ? `waiting ${done.waiting}` : '';
  // (the page's side: the last message from the rest worker, what it said and what the page made of it)
  const heard = android ? lastHeard() : null;
  const sec = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x / 100) / 10} s`;
  const heardLine = heard ? `heard ${heard.action} ${hhmm(heard.at)} (tap ${sec(heard.at - heard.ends)} after the end, ${heard.mine ? 'this rest' : `other rest ${heard.key.split(':')[1] ?? ''}/${heard.start}`}) → ${heard.asDone ? 'done' : 'skip'}` : 'heard nothing';
  const test = async () => {
    let p = Notification.permission;
    if (p === 'default') { p = await Notification.requestPermission().catch(() => 'default' as NotificationPermission); setPerm(p); }
    if (p !== 'granted') { toast(t('Notifications aren’t allowed, so nothing can show.'), { tone: 'bad' }); return; }
    const now = Date.now();
    const words = {
      title: t('Rest timer test'), body: t('Pull down to see the countdown'), icon: `${import.meta.env.BASE_URL}notif-icon.png`,
      badge: `${import.meta.env.BASE_URL}badge-96.png`,
    };
    let via = '';
    if (await showAppRest({
      ...words, key: `test:${now}`, startedAt: now, endsAt: now + 15_000, exercise: words.title, line: words.body,
      overTitle: t('Rest over'), overBody: '', more: t('+30 s'), skip: t('Skip'), sound: useStore.getState().settings.sound,
    })) via = 'app';
    else {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(words.title, { body: words.body, icon: words.icon, badge: words.badge, tag: 'aven-test', timestamp: now + 15_000 } as NotificationOptions);
        via = 'web';
      } catch (e: any) { try { localStorage.setItem('aven.androidApp.err', `web: ${e?.message ?? e}`); } catch { /* ignore */ } }
    }
    toast(via ? t('Test sent ({via}): pull down from the top of the screen.', { via }) : t('The test couldn’t be shown.'), { tone: via ? 'ok' : 'bad' });
  };
  return (
    <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 14 }}>
      <div>
        <div>{t('Rest timer on lock screen')}</div>
        <div className="xs t2" style={{ marginTop: 2 }}>{perm === 'denied' ? (app ? t('Notifications are off for the Aven app. Turn them on in your phone’s Settings › Apps › Aven › Notifications, then force stop Chrome (Settings › Apps › Chrome) so it notices, and open Aven again.') : t('Notifications are blocked for Aven in your browser settings.')) : t('Shows when rest is over and buzzes, even in another app or with the screen off.')}</div>
        {android && doneLine && <div className="xs t3" style={{ marginTop: 4, wordBreak: 'break-word' }}>{doneLine}{clickLine && <> · {clickLine}</>} · {heardLine}</div>}
        {android && (
          <div className="row-flex" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn sm press" onClick={test}>{t('Send a test')}</button>
            {/* the Android app's own log of the rest timer (what it got from Chrome, what it rang, whether a Done ✓ reached Chrome) */}
            {appOnPhone() && <a className="btn sm ghost press" href="intent://restlog#Intent;scheme=aven;package=app.aven.android;end">{t('App log')}</a>}
          </div>
        )}
        {late && <div className="xs t3" style={{ marginTop: 2 }}>{late.ms < 2000 ? t('Last alert came on time.') : t('Last alert came {n} s late.', { n: Math.round(late.ms / 1000) })}</div>}
      </div>
      <Toggle on={on} onChange={toggle} label={t('Rest timer on lock screen')} />
    </div>
  );
}

function BirthYear({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const t = useT();
  const [txt, setTxt] = useState(value ? String(value) : '');
  const year = new Date().getFullYear();
  return <input className="input num" inputMode="numeric" aria-label={t('Birth year')} placeholder="—" value={txt} maxLength={4} onChange={(e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 4); setTxt(d);
    const n = Number(d);
    if (!d) onChange(undefined); else if (d.length === 4 && n >= 1900 && n <= year) onChange(n);
  }} onBlur={() => setTxt(value ? String(value) : '')} />;
}

const GOALS: { v: Settings['profile']['goal']; l: string }[] = [
  { v: 'strength', l: 'Get stronger' }, { v: 'muscle', l: 'Build muscle' }, { v: 'fatloss', l: 'Lose fat' }, { v: 'endurance', l: 'Endurance' }, { v: 'general', l: 'General fitness' },
];
const ageOf = (birthYear: number | undefined) => (birthYear ? new Date().getFullYear() - birthYear : undefined);
function profileSub(st: Settings, t: ReturnType<typeof useT>, lang: Lang): string {
  const b = st.body ?? {};
  const age = ageOf(b.birthYear);
  const h = b.heightCm ? (st.units.length === 'in' ? `${fmtNum(cmToDisplay(b.heightCm, 'in'), lang, 0)} in` : `${fmtNum(b.heightCm, lang, 0)} cm`) : '';
  const goal = GOALS.find((g) => g.v === st.profile.goal);
  return [age !== undefined ? t('{n} years', { n: age }) : '', h, goal ? t(goal.l) : ''].filter(Boolean).join(' · ') || t('Your details and goal');
}

/**
 * Your details and goal, like Lifesum's profile: who you are (age, sex and height feed the health scores), your goal and
 * goal weight next to your latest weigh-in, and the way into your calorie and macro targets. Everything is optional.
 */
function Profile({ onAdjust }: { onAdjust: () => void }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const st = s.settings;
  const b = st.body ?? {};
  const setBody = (patch: Partial<NonNullable<Settings['body']>>) => s.updateSettings({ body: { ...b, ...patch } });
  const wu = st.units.weight;
  const latest = s.weights.slice().sort((a, b2) => b2.date.localeCompare(a.date))[0];
  const year = new Date().getFullYear();
  const g = st.goals;
  const toGo = latest && b.goalWeightKg ? b.goalWeightKg - latest.kg : undefined;
  return (
    <div className="stack gap16">
      <div className="field"><label htmlFor="s-name">{t('Your name')}</label><input id="s-name" className="input" value={st.name} onChange={(e) => s.updateSettings({ name: e.target.value })} placeholder={t('Optional')} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('Birth year')} hint={b.birthYear ? t('{n} years', { n: year - b.birthYear }) : undefined}>
          {/* a plain field: a year is never written 2,006 */}
          <BirthYear value={b.birthYear} onChange={(v) => setBody({ birthYear: v })} />
        </Field>
        <Field label={t('Height')}>
          <NumInput label={t('Height')} value={b.heightCm ? Math.round(cmToDisplay(b.heightCm, st.units.length) * 10) / 10 : undefined} max={st.units.length === 'in' ? 1 : 0} unit={st.units.length} placeholder="—" onChange={(v) => setBody({ heightCm: v ? displayToCm(v, st.units.length) : undefined })} />
        </Field>
      </div>
      <Field label={t('Sex')} hint={t('Used for your sleep need and heart-rate zones.')}>
        <Seg value={b.sex ?? ''} onChange={(v) => setBody({ sex: v || undefined })} options={[{ value: 'male' as const, label: t('Male') }, { value: 'female' as const, label: t('Female') }, { value: '' as const, label: t('Not set') }]} />
      </Field>
      <Field label={t('Goal')}>
        <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {GOALS.map((x) => <button key={x.v} className={`chip press ${st.profile.goal === x.v ? 'on' : ''}`} onClick={() => s.updateSettings({ profile: { ...st.profile, goal: x.v } })}>{t(x.l)}</button>)}
        </div>
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label={t('Current weight')} hint={latest ? fmtDate(latest.date, lang) : t('Log a weigh-in on Today')}>
          {/* drawn exactly like the goal weight next to it (same field, same unit), only not editable */}
          <div className="input-unit has-unit"><input className="input" readOnly tabIndex={-1} aria-label={t('Current weight')} value={latest ? fmtNum(kgToDisplay(latest.kg, wu), lang, 1) : ''} placeholder="—" /><span className="unit">{wu}</span></div>
        </Field>
        <Field label={t('Goal weight')} hint={toGo !== undefined ? (Math.abs(toGo) < 0.05 ? t('Reached') : t('{n} to go', { n: `${fmtNum(kgToDisplay(Math.abs(toGo), wu), lang, 1)} ${wu}` })) : undefined}>
          <NumInput label={t('Goal weight')} value={b.goalWeightKg ? Math.round(kgToDisplay(b.goalWeightKg, wu) * 10) / 10 : undefined} max={1} unit={wu} placeholder="—" onChange={(v) => setBody({ goalWeightKg: v ? displayToKg(v, wu) : undefined })} />
        </Field>
      </div>
      <div className="list">
        <Row icon="flame" title={t('Adjust calories')} sub={g.kcal ? `${fmtNum(g.kcal, lang, 0)} kcal` : undefined} onClick={onAdjust} />
        <Row icon="bolt" title={t('Adjust macros')} sub={g.protein !== undefined && g.carbs !== undefined && g.fat !== undefined ? `${fmtNum(g.protein, lang, 0)} g ${t('protein')} · ${fmtNum(g.carbs, lang, 0)} g ${t('carbs')} · ${fmtNum(g.fat, lang, 0)} g ${t('fat')}` : undefined} onClick={onAdjust} />
      </div>
      <div className="xs t3">{t('What your watch burns is shown on Food, never added to your target.')}</div>
    </div>
  );
}

/**
 * Nutrition targets, with the macros leading: change protein, carbs or fat and the calories follow (4 / 4 / 9); change the
 * calories and all three move with it, keeping their shares. So the numbers always add up.
 */
function Targets() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const g = s.settings.goals;
  const set = (k: keyof typeof g) => (v: number | undefined) => s.updateSettings({ goals: { ...g, [k]: v } });
  const full = g.protein !== undefined && g.carbs !== undefined && g.fat !== undefined;
  // while the calories are typed digit by digit, the macros scale from where they were when typing began (scaling from
  // "2", then "25", then "250" would round the shares away)
  const anchor = useRef<{ protein: number; carbs: number; fat: number } | null>(null);
  const setKcal = (v: number | undefined) => {
    if (!full || v === undefined || v < 400) { s.updateSettings({ goals: { ...g, kcal: v } }); return; }
    anchor.current ??= { protein: g.protein!, carbs: g.carbs!, fat: g.fat! };
    s.updateSettings({ goals: { ...g, kcal: v, ...scaleMacros(anchor.current, v) } });
  };
  const setMacro = (k: 'protein' | 'carbs' | 'fat') => (v: number | undefined) => {
    anchor.current = null;
    const next = { ...g, [k]: v };
    const all = next.protein !== undefined && next.carbs !== undefined && next.fat !== undefined;
    s.updateSettings({ goals: all ? { ...next, kcal: kcalOf({ protein: next.protein!, carbs: next.carbs!, fat: next.fat! }) } : next });
  };
  const weight = s.weights.slice().sort((a, b) => b.date.localeCompare(a.date))[0]?.kg;
  const suggest = () => {
    anchor.current = null; haptic('light');
    const m = suggestMacros(g.kcal!, weight);
    if (g.protein) { m.protein = g.protein; m.carbs = Math.max(0, Math.round((g.kcal! - m.protein * 4 - m.fat * 9) / 4)); } // a protein target you set stays
    s.updateSettings({ goals: { ...g, ...m } });
  };
  const total = full ? kcalOf({ protein: g.protein!, carbs: g.carbs!, fat: g.fat! }) : 0;
  const share = (k: 'protein' | 'carbs' | 'fat') => (total ? ((g[k] ?? 0) * (k === 'fat' ? 9 : 4)) / total : 0);
  return (
    <div className="stack gap16">
      <Field label={t('Calories')}><NumInput label={t('Calories')} value={g.kcal} onChange={setKcal} unit="kcal" max={0} placeholder="—" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label={t('Protein')}><NumInput label={t('Protein')} value={g.protein} onChange={setMacro('protein')} unit="g" max={0} placeholder="—" /></Field>
        <Field label={t('Carbs')}><NumInput label={t('Carbs')} value={g.carbs} onChange={setMacro('carbs')} unit="g" max={0} placeholder="—" /></Field>
        <Field label={t('Fat')}><NumInput label={t('Fat')} value={g.fat} onChange={setMacro('fat')} unit="g" max={0} placeholder="—" /></Field>
      </div>
      {total > 0 ? (
        // where the calories come from, live
        <div>
          <div className="macro-bar" aria-hidden>
            {(['protein', 'carbs', 'fat'] as const).map((k) => <i key={k} style={{ flexGrow: Math.max(0.0001, share(k)), background: `var(--c-${k})` }} />)}
          </div>
          <div className="row-flex xs t2 num" style={{ gap: 14, marginTop: 8 }}>
            {(['protein', 'carbs', 'fat'] as const).map((k) => <span key={k}>{({ protein: t('Protein'), carbs: t('Carbs'), fat: t('Fat') })[k]} {fmtPct(Math.round(share(k) * 100), lang)}</span>)}
          </div>
        </div>
      ) : g.kcal ? (
        <button className="btn sm press" style={{ alignSelf: 'flex-start' }} onClick={suggest}><Icon name="sparkle" size={15} /> {t('Suggest macros')}</button>
      ) : null}
      <Field label={t('Fibre')}><NumInput label={t('Fibre')} value={g.fibre} onChange={set('fibre')} unit="g" max={0} placeholder="—" /></Field>
      <Field label={t('Water')}><NumInput label={t('Water')} value={g.waterMl} onChange={(v) => v && set('waterMl')(v)} unit="ml" max={0} /></Field>
      <Field label={t('Heavy-day notices')} hint={t('After a day clearly over target. On: noticed, and the Coach decides if a small trim helps (Undo always). Quiet: only the Coach knows. Off: not noticed.')}>
        <Seg value={heavyMode(s.settings)} onChange={(v) => s.updateSettings({ heavyDays: v })} options={[{ value: 'on', label: t('On') }, { value: 'quiet', label: t('Quiet') }, { value: 'off', label: t('Off') }]} />
      </Field>
      <button className="btn ghost press" onClick={() => { anchor.current = null; s.updateSettings({ goals: { waterMl: g.waterMl } }); }}>{t('Clear nutrition targets')}</button>
    </div>
  );
}

function FoodSettings() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const st = s.settings;
  const toast = useUI((u) => u.toast);
  const [meals, setMeals] = useState<Meal[]>(st.meals);
  useEffect(() => setMeals(st.meals), [st.meals]); // an Undo puts a removed meal back from outside
  const save = (m: Meal[]) => { setMeals(m); s.setMeals(m); };
  // the field being typed in shows exactly what is typed (even nothing); the default name comes back only when you leave it
  const [editing, setEditing] = useState<{ id: string; text: string; was: string } | null>(null);
  return (
    <div className="stack gap16">
      <Field label={t('Meals')}>
        <div className="stack gap8">
          {meals.map((m, i) => (
            <div key={m.id} className="row-flex" style={{ gap: 8 }}>
              <input className="input" value={editing?.id === m.id ? editing.text : mealName(m, lang)} aria-label={`${t('Meal')} ${i + 1}`}
                onFocus={() => setEditing({ id: m.id, text: mealName(m, lang), was: m.name })}
                onChange={(e) => { const text = e.target.value; setEditing((x) => (x ? { ...x, text } : x)); save(meals.map((x, j) => (j === i ? { ...x, name: text.trim() ? text : '' } : x))); }}
                onBlur={() => {
                  // left empty: a built-in meal shows its default name again; your own meal (no default) keeps the name it had
                  if (editing?.id === m.id && !editing.text.trim() && mealName({ ...m, name: '' }, lang) === m.id) save(meals.map((x) => (x.id === m.id ? { ...x, name: editing.was } : x)));
                  setEditing(null);
                }} />
              <button className="icon-btn flat press" aria-label={t('Remove')} disabled={meals.length <= 1} style={{ opacity: meals.length <= 1 ? 0.3 : 1 }} onClick={() => {
                const st0 = useStore.getState();
                const r = removeMeal(meals, st0.entries, m.id);
                if (!r) return;
                st0.patch({ entries: r.entries });
                save(r.meals);
                const undo = () => {
                  const x = useStore.getState();
                  const back = restoreMeal(x.settings.meals, x.entries, r.removed);
                  x.patch({ entries: back.entries });
                  x.setMeals(back.meals);
                };
                toast(t('Entries moved to {meal}', { meal: mealName(r.removed.target, lang) }), { actionLabel: t('Undo'), onAction: undo });
              }}><Icon name="close" size={18} /></button>
            </div>
          ))}
          <button className="btn sm press" onClick={() => save([...meals, { id: uid('meal'), name: t('New meal') }])}><Icon name="plus" size={16} /> {t('Add meal')}</button>
        </div>
      </Field>
      <Field label={t('Water quick amounts (ml)')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>{st.waterQuick.map((v, i) => <NumInput key={i} value={v} max={0} unit="ml" onChange={(n) => n && n > 0 && s.updateSettings({ waterQuick: st.waterQuick.map((x, j) => (j === i ? n : x)) })} />)}</div>
      </Field>
      <ToggleRow label={t('Online food lookup')} on={st.foodLookup} onChange={(v) => s.updateSettings({ foodLookup: v })} />
    </div>
  );
}

/** Settings shows the watch where it can work: in the Android app (or once it has been there), and in Aven Beta on Android. */
function watchShown(): boolean {
  if (!/Android/i.test(navigator.userAgent)) return false;
  let seen = false; try { seen = !!localStorage.getItem('aven.androidApp'); } catch { /* fine */ }
  return inAndroidApp() || seen || !!hcStatus() || IS_BETA;
}
function watchSub(t: ReturnType<typeof useT>, lang: Lang): string {
  const h = hcStatus();
  if (!h?.on) return t('Steps and workouts from your watch');
  return h.lastSync ? t('Connected · synced {when}', { when: fmtWhen(h.lastSync, lang, t) }) : t('Connected');
}
const fmtWhen = (at: number, lang: Lang, t: ReturnType<typeof useT>) => {
  const d = new Date(at), now = new Date();
  const time = d.toLocaleTimeString(lang === 'da' ? 'da-DK' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? `${t('today')} ${time}` : `${d.toLocaleDateString(lang === 'da' ? 'da-DK' : 'en-GB', { day: 'numeric', month: 'short' })}, ${time}`;
};

/**
 * Settings → Watch: your watch's steps and workouts, automatic (Galaxy Watch → Samsung Health → Health Connect → the
 * Android app, which hands them to this page whenever Aven opens). Read only; the burned calories are shown, never eaten
 * back. Buttons go through the Android app (lib/healthSync.ts `hcLink`).
 */
function WatchSection() {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const [, bump] = useState(0);
  // the button just tapped, while the Android app does its part (Health Connect's question, then the read); a few seconds
  // with nothing back and still here: it didn't open, said plainly
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const f = () => { setBusy(null); setStuck(false); bump((n) => n + 1); };
    window.addEventListener('aven-hc', f);
    return () => window.removeEventListener('aven-hc', f);
  }, []);
  useEffect(() => {
    if (!busy) return;
    let left = false;
    const vis = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', vis);
    const id = setTimeout(() => { setBusy(null); if (!left) setStuck(true); }, left ? 12000 : 7000);
    return () => { clearTimeout(id); document.removeEventListener('visibilitychange', vis); };
  }, [busy]);
  const h = hcStatus();
  // how many days of minute-by-minute detail are on the phone (lib/watchDetail.ts)
  const [detailDays, setDetailDays] = useState(0);
  useEffect(() => {
    let live = true;
    const f = () => { void watchDetailCount().then((n) => { if (live) setDetailDays(n); }); };
    f();
    const off = onWatchDetail(f);
    return () => { live = false; off(); };
  }, []);
  const go = (what: 'connect' | 'sync' | 'off') => {
    haptic('light');
    setStuck(false);
    if (what !== 'off') setBusy(what);
    noteAsk(what);
    // your weigh-ins and food totals ride along, to be written into Health Connect (lib/hcWrite.ts)
    location.href = hcLink(what, what === 'off' ? null : prepareWrites(useStore.getState(), today));
  };
  const on = !!(h?.on && h.granted);
  const today = dayKey(Date.now(), s.settings.dayStartHour);
  const inWeek = (d: string) => diffDays(today, d) < 7 && diffDays(today, d) >= 0;
  const watchActs = s.activities.filter((a) => a.source === 'watch');
  const week = watchActs.filter((a) => inWeek(a.date));
  const weekMin = Math.round(week.reduce((n, a) => n + a.durationSec, 0) / 60);
  const stepsBy = new Map((s.steps ?? []).map((x) => [x.date, x.count]));
  const days = Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { d, n: stepsBy.get(d) ?? 0 }; });
  const counted = days.filter((x) => x.n > 0);
  const perDay = counted.length ? Math.round(counted.reduce((n, x) => n + x.n, 0) / counted.length) : 0;
  const top = Math.max(1, ...days.map((x) => x.n));
  const recent = [...watchActs].sort((x, y) => (y.startAt ?? y.at) - (x.startAt ?? x.at)).slice(0, 3);
  const state = !h ? null : h.note === 'unavailable' || !h.avail ? t('Health Connect needs Android 14 or newer.') : h.note === 'denied' || (h.on && !h.granted) ? t('Aven isn’t allowed to read your watch yet. In your phone’s Settings, search for Health Connect, open App permissions › Aven and allow all. Then tap Connect watch.') : h.note === 'slow' || h.note === 'failed' ? t('Health Connect didn’t answer in time. Try Sync now.') : null;
  const u = s.settings.units;
  return (
    <div className="stack gap16 watch">
      <div className="plinth watch-hero">
        <div className="row-flex" style={{ gap: 14, alignItems: 'center' }}>
          <span className={`watch-ic${on ? ' on' : ''}`} aria-hidden><Icon name="watch" size={24} /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="watch-state">{on && <i className="watch-dot" aria-hidden />}{on ? t('Connected') : t('Not connected')}</div>
            <div className="xs t2" style={{ marginTop: 3 }}>{on ? (h?.lastSync ? t('Synced {when}', { when: fmtWhen(h.lastSync, lang, t) }) : t('Waiting for the first sync')) : t('Your watch’s workouts and steps, by themselves')}</div>
          </div>
        </div>
        {on ? (
          <>
            <div className="watch-cap">{t('This week')}</div>
            <div className="watch-stats">
              <div><div className="num">{week.length}</div><div className="xs t2">{t(week.length === 1 ? 'workout' : 'workouts')}</div></div>
              <div><div className="num">{weekMin}</div><div className="xs t2">{t('active min')}</div></div>
              <div><div className="num">{perDay ? fmtNum(perDay, lang, 0) : '—'}</div><div className="xs t2">{t('steps a day')}</div></div>
            </div>
            <div className="watch-bars" aria-label={t('Steps, the last 7 days')}>
              {days.map((x, i) => (
                <div key={x.d} className={`watch-bar${x.d === today ? ' today' : ''}${x.n ? '' : ' none'}`}>
                  <span><i style={{ transform: `scaleY(${(x.n ? Math.max(0.06, x.n / top) : 0.06).toFixed(3)})`, animationDelay: `${i * 40}ms` }} /></span>
                  <b>{fmtDate(x.d, lang, { weekday: 'narrow' })}</b>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="watch-flow" aria-hidden>
            <span><Icon name="watch" size={17} /><b>{t('Your watch')}</b></span>
            <i />
            <span><Icon name="heart" size={17} /><b>Health Connect</b></span>
            <i />
            <span><Icon name="sparkle" size={17} /><b>Aven</b></span>
          </div>
        )}
      </div>
      {state && <div className="small" style={{ color: 'var(--warn)' }}>{state}</div>}
      {stuck && <div className="small t2">{t('Nothing opened? Open Aven from its app icon on your home screen, then tap again.')}</div>}
      {on && recent.length > 0 && (
        <div className="plinth" style={{ padding: '6px 16px' }}>
          <div className="list watch-recent">
            {recent.map((x) => (
              <div key={x.id} className="li">
                <span className="watch-kind" aria-hidden><Icon name={activityIcon(x.kind)} size={18} /></span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="li-title trunc">{x.name ? t(x.name) : t(ACTIVITY_LABEL[x.kind] === 'Other' ? 'Activity' : ACTIVITY_LABEL[x.kind])}</div>
                  <div className="li-sub num trunc">{fmtDate(x.date, lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.round(x.durationSec / 60)} min{x.avgHr ? ` · ${x.avgHr} bpm` : x.distanceM ? ` · ${fmtNum(u.distance === 'mi' ? x.distanceM / 1609.344 : x.distanceM / 1000, lang, 1)} ${u.distance}` : ''}</div>
                </div>
                {x.intensity && <span className={x.intensity > 1 ? 'chip sm hot' : 'chip sm'}>{t(INTENSITY_LABEL[x.intensity])}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {on ? (
        <div className="row-flex" style={{ gap: 10 }}>
          <button className="btn grow press" onClick={() => go('sync')} disabled={busy === 'sync'}><Icon name="repeat" size={17} className={busy === 'sync' ? 'spin-slow' : undefined} /> {busy === 'sync' ? t('Syncing…') : t('Sync now')}</button>
          <button className="btn press" style={{ color: 'var(--tx2)' }} onClick={() => go('off')}>{t('Disconnect')}</button>
        </div>
      ) : (
        <button className="btn primary block press" onClick={() => go('connect')} disabled={busy === 'connect'}><Icon name="watch" size={18} /> {busy === 'connect' ? t('Opening Health Connect…') : t('Connect watch')}</button>
      )}
      <div className="xs t3 stack gap8" style={{ padding: '0 4px' }}>
        <div>{t('Syncs by itself every time you open Aven. Works with a Galaxy Watch, or any watch that saves to Health Connect.')}</div>
        {on && h?.bg === true && <div>{t('Also reads your watch by itself every half hour while Aven is closed, so it opens up to date.')}</div>}
        {on && h?.bg === false && <div>{t('To keep it up to date while Aven is closed too: in your phone’s Settings, search for Health Connect, open App permissions › Aven and allow access in the background.')}</div>}
        {on && lastWrite()?.state === 'denied'
          ? <div>{t('To send your weight and food to Samsung Health too: in your phone’s Settings, search for Health Connect, open App permissions › Aven and allow Weight and Nutrition.')}</div>
          : on && <div>{t('Your weigh-ins and each day’s food totals go to Health Connect each time you tap Sync now, so Samsung Health sees them too.')}</div>}
        {on && detailDays > 0 && <div>{t('Heart rate and steps minute by minute, and every sleep stage: {n} days on this phone.', { n: detailDays })}</div>}
        <div>{t('Read only, and it stays on this phone. Calories a workout burned are shown, but never added to your food target.')}</div>
        {!appOnPhone() && <div>{t('Needs the Aven Android app. Without it, the button offers to download it.')}</div>}
        {/* (until the watch is connected: what the Android app last sent back, for a screenshot) */}
        {!on && <div style={{ opacity: 0.7 }}>{hcLastLine()}</div>}
      </div>
    </div>
  );
}

function Reminders() {
  const t = useT();
  const s = useStore();
  const st = s.settings;
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const ask = async () => { if (typeof Notification === 'undefined') return; setPerm(await Notification.requestPermission()); };
  return (
    <div className="stack gap16">
      <div className="plinth-2 small" style={{ padding: 12 }}><b>{t('Honest limits')}</b><div className="t2" style={{ marginTop: 4 }}>{t('A web app can only notify you while Aven is open or installed and running in the background. Reliable scheduled reminders when the app is closed need a push server, which isn’t built yet. Rest-timer alerts (sound and vibration) work while you train.')}</div></div>
      <div className="row-flex between"><span>{t('Training-day reminder')}</span><Toggle on={st.remindersEnabled} onChange={(v) => { s.updateSettings({ remindersEnabled: v }); if (v && perm === 'default') ask(); }} label={t('Training-day reminder')} /></div>
      {st.remindersEnabled && (
        <>
          <Field label={t('Time')}><input type="time" className="input" value={st.reminderTime} onChange={(e) => s.updateSettings({ reminderTime: e.target.value })} /></Field>
          <div className="small t2">{perm === 'granted' ? t('Notifications are allowed. Aven will remind you at that time on planned training days while it is running.') : perm === 'denied' ? t('Notifications are blocked in your browser. You’ll see an in-app nudge on Today instead.') : perm === 'unsupported' ? t('This browser doesn’t support notifications. You’ll see an in-app nudge on Today instead.') : <button className="btn sm primary press" onClick={ask}>{t('Allow notifications')}</button>}</div>
        </>
      )}
    </div>
  );
}

function download(name: string, blob: Blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

function DataSection() {
  const t = useT();
  const s = useStore();
  const toast = useUI((u) => u.toast);
  const closeAll = useUI((u) => u.closeAll);
  const push = useUI((u) => u.push);
  const file = useRef<HTMLInputElement>(null);
  const [withPhotos, setWithPhotos] = useState(false);
  const [pending, setPending] = useState<{ data: AppData; photos?: Record<string, string>; chat?: unknown[] } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const has = userHasData(s);
  const lang = useLang();
  const kept = useStorageKept();
  const [backedUp, setBackedUp] = useState(lastBackup);

  const doExport = async () => {
    const payload: any = buildBackup();
    const photos = payload.data.photos as AppData['photos'];
    if (withPhotos && photos.length) {
      payload.photos = {};
      for (const p of photos) { const b = await loadPhoto(p.id).catch(() => undefined); if (b) payload.photos[p.id] = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); }); }
    }
    download(`aven-backup-${dayKey(Date.now(), s.settings.dayStartHour)}.json`, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    markBackup(); setBackedUp(lastBackup());
    toast(t('Backup downloaded'), { tone: 'ok' });
  };
  const onFile = async (f?: File | null) => {
    if (!f) return;
    try {
      setPending(parseBackup(await f.text(), s.settings.language));
    } catch (e: any) { toast(e?.message === 'newer' ? t('That backup is from a newer version of Aven.') : t('That file isn’t a valid Aven backup.'), { tone: 'bad' }); }
  };
  const doImport = async () => {
    if (!pending) return;
    const before = useStore.getState();
    const prev = snapshotData();
    before.replaceAll(pending.data);
    if (pending.photos) for (const [id, url] of Object.entries(pending.photos)) { try { await savePhoto(id, await (await fetch(url)).blob()); } catch { /* skip */ } }
    importArchive(pending.chat); // the conversation: merged in, nothing here is lost
    setPending(null);
    toast(t('Backup restored'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => useStore.getState().replaceAll(prev), duration: 10000 });
  };
  const doDelete = async () => { resetDrive(); useStore.getState().resetAll(); await clearPhotos().catch(() => {}); await clearArchive(); await clearWatchDetail(); try { Object.keys(localStorage).filter((k) => k.startsWith('aven')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } clearKeys(); useAi.getState().patch({ stt: 'accurate', voiceLang: 'auto', voice: 'Achird', brain: true, solFirst: true, effortOrb: 'medium', effortCoach: 'medium', models: { fast: '', brain: '', fastAlt: '', brainAlt: '', tts: '', sol: '', solAuto: '', quick: '' }, solChecked: 0, noQuick: false }); setConfirmDel(false); closeAll(); setTimeout(() => push('onboarding', {}), 80); };
  const demo = () => { const d = buildDemo(s.settings); useStore.getState().patch(d); toast(t('Demo data loaded'), { tone: 'ok' }); };
  const removeDemo = () => { const lang = s.settings.language; const settings = s.settings; useStore.getState().replaceAll({ ...defaultData(lang), settings }); toast(t('Demo data removed'), { tone: 'ok' }); };

  return (
    <div className="stack gap16">
      {persistStatus.error && <div className="plinth-2 small" style={{ padding: 12, color: 'var(--bad)' }}>{persistStatus.error === 'quota' ? t('Storage is full — export a backup and free space.') : t('Couldn’t save to this browser’s storage. Export a backup now.')}</div>}
      <div className="plinth" style={{ padding: 16 }}>
        <div className="li-title">{t('Export backup')}</div>
        <div className="li-sub" style={{ marginTop: 2 }}>{t('One JSON file with everything: workouts, food, plans, settings.')}</div>
        {/* when you last saved a copy, and whether the browser could clear the data on its own (lib/persist.ts) */}
        {has && <div className="xs t3 num" style={{ marginTop: 8 }}>{backedUp ? t('Last backup: {date}', { date: fmtDate(dayKey(backedUp, s.settings.dayStartHour), lang, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('No backup yet')}</div>}
        {has && kept === false && <div className="xs t2" style={{ marginTop: 6 }}>{t('This browser may clear Aven’s data if the phone runs low on space. A backup now and then keeps it safe.')}</div>}
        {s.photos.length > 0 && <label className="row-flex small" style={{ gap: 10, marginTop: 12 }}><Toggle on={withPhotos} onChange={setWithPhotos} label={t('Include photos')} /> {t('Include progress photos (larger file)')}</label>}
        <button className="btn primary block press" style={{ marginTop: 14 }} onClick={doExport}><Icon name="download" size={18} /> {t('Download backup')}</button>
      </div>
      <DriveCard onRestore={(p) => { setPending(p); toast(t('Backup read from Drive. Check it below, then replace.'), { tone: 'ok' }); }} />
      <div className="plinth" style={{ padding: 16 }}>
        <div className="li-title">{t('Import backup')}</div>
        <div className="li-sub" style={{ marginTop: 2 }}>{t('Replaces everything on this device. You can undo right after.')}</div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="btn block press" style={{ marginTop: 14 }} onClick={() => file.current?.click()}><Icon name="upload" size={18} /> {t('Choose file')}</button>
        {pending && (
          <div className="plinth-2 small" style={{ padding: 12, marginTop: 12 }}>
            <b>{t('Ready to restore')}</b>
            <div className="t2 num" style={{ marginTop: 4 }}>{pending.data.sessions.length} {t('workouts')} · {pending.data.entries.length} {t('food entries')} · {pending.data.routines.length} {t('routines')} · {pending.data.weights.length} {t('weigh-ins')}</div>
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}><button className="btn sm primary press" onClick={doImport}>{t('Replace my data')}</button><button className="btn sm press" onClick={() => setPending(null)}>{t('Cancel')}</button></div>
          </div>
        )}
      </div>
      {/* only while there is something to do with it (it was an empty card titled "Demo data" once you had your own) */}
      {(s.demo || !has) && <div className="plinth" style={{ padding: 16 }}>
        <div className="li-title">{t('Demo data')}</div>
        {s.demo ? <button className="btn block press" style={{ marginTop: 14 }} onClick={removeDemo}>{t('Remove demo data')}</button>
          : <button className="btn block press" style={{ marginTop: 14 }} onClick={demo}>{t('Load demo data')}</button>}
      </div>}
      <div className="plinth" style={{ padding: 16 }}>
        <div className="li-title" style={{ color: 'var(--bad)' }}>{t('Delete everything')}</div>
        <div className="li-sub" style={{ marginTop: 2 }}>{t('Permanently erases all Aven data and photos from this device.')}</div>
        {!confirmDel ? <button className="btn danger block press" style={{ marginTop: 14 }} onClick={() => setConfirmDel(true)}><Icon name="trash" size={18} /> {t('Delete all data')}</button> : (
          <div className="row-flex" style={{ gap: 8, marginTop: 14 }}><button className="btn danger grow press" onClick={doDelete}>{t('Yes, delete everything')}</button><button className="btn grow press" onClick={() => setConfirmDel(false)}>{t('Keep')}</button></div>
        )}
      </div>
    </div>
  );
}

/** Settings → About: record five minutes of stutters on this phone, then copy the report to paste back (lib/stutter.ts). */
function StutterRecorder() {
  const t = useT();
  // a stable snapshot (on + count); the time left is read on each render, which the 1 s tick below drives
  const st = useSyncExternalStore(subscribeStutter, () => { const x = stutterState(); return `${x.on ? 1 : 0}:${x.count}`; });
  const [onS, countS] = st.split(':');
  const on = onS === '1', count = Number(countS), left = stutterState().left;
  const [, tick] = useState(0);
  useEffect(() => { if (!on) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [on]);
  const copy = async () => { try { await navigator.clipboard.writeText(stutterReport()); useUI.getState().toast(t('Report copied'), { tone: 'ok' }); } catch { useUI.getState().toast(t('Couldn’t copy'), { tone: 'bad' }); } };
  return (
    <div className="plinth-2" style={{ padding: 14 }}>
      <b>{t('Record stutters')}</b>
      <div className="t2" style={{ marginTop: 4 }}>{on ? t('Recording — use the app as normal. {m} left, {n} caught.', { m: fmtDuration(Math.ceil(left / 1000)), n: count }) : t('Notes every frame your phone had to wait for, for five minutes, so the next fix is aimed at what you felt. Only timings and screen names.')}</div>
      <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
        <button className={`btn sm press ${on ? '' : 'primary'}`} onClick={() => (on ? stopStutter() : startStutter())}>{on ? t('Stop') : t('Start recording')}</button>
        {(count > 0 || !!coachTrace()) && <button className="btn sm press" onClick={copy}><Icon name="copy" size={15} /> {t('Copy report')}</button>}
      </div>
      <CoachRawCopy />
    </div>
  );
}

/** Which link of the lock-screen rest chain works (browser, phone, permission, app, rest worker, last error): Android only. */
function useRestLine() {
  const t = useT();
  const android = /Android/i.test(navigator.userAgent) && typeof Notification !== 'undefined';
  const [check, setCheck] = useState<Awaited<ReturnType<typeof restCheck>> | null>(null);
  useEffect(() => { if (android) restCheck().then(setCheck).catch(() => {}); }, [android]);
  return check && [check.browser, [check.model, check.android && `Android ${check.android}`].filter(Boolean).join(' '),
    `${t('notifications')} ${check.permission}`, `app ${check.inApp ? 'yes' : check.seen ? 'seen' : 'no'}`, `worker ${check.worker}`,
    check.err && `err ${check.err}`].filter(Boolean).join(' · ');
}

/**
 * How the Coach's AI has been doing: the app counts its own trouble (an answer it couldn't read, part of one dropped, a
 * fallback, a failed search) on this phone, and copies the details plus the last raw answer (kept in memory only) for
 * whoever is fixing the app. Nothing is sent anywhere; no keys, no messages.
 */
function CoachRawCopy() {
  const t = useT();
  const [n] = useState(() => troubleThisWeek());
  const rest = useRestLine();
  const copy = async () => {
    const { lastRawAnswer } = await import('../lib/agentTurn');
    const r = lastRawAnswer();
    const raw = r ? `Last answer · ${new Date(r.at).toISOString()} · ${r.by}${r.plain.length ? ` · plain JSON mode: ${r.plain.join(', ')}` : ''}\n${r.text}` : 'Last answer: none since the app was opened.';
    const text = `Aven ${__APP_VERSION__}\n${rest ? `Rest timer: ${rest}\n` : ''}${troubleReport()}\n\n${raw}`;
    try { await navigator.clipboard.writeText(text); useUI.getState().toast(t('Copied'), { tone: 'ok' }); } catch { useUI.getState().toast(t('Couldn’t copy'), { tone: 'bad' }); }
  };
  return (
    <div style={{ marginTop: 14 }}>
      <b>{t('How the Coach is doing')}</b>
      <div className="t2" style={{ marginTop: 4 }}>{n === 0 ? t('No AI trouble this week.') : n === 1 ? t('The Coach had trouble once this week.') : t('The Coach had trouble {n} times this week.', { n })}</div>
      <div className="t3 xs" style={{ marginTop: 4 }}>{t('Counted on this phone only. If something seems off, copy the details and paste them to whoever is fixing the app. No keys, no messages.')}</div>
      <button className="btn sm press" style={{ marginTop: 10 }} onClick={copy}><Icon name="copy" size={15} /> {t('Copy details')}</button>
      {rest && <div className="xs t3" style={{ marginTop: 8, wordBreak: 'break-word' }}>{t('Rest timer on lock screen')}: {rest}</div>}
    </div>
  );
}

/** Aven Beta only: says so, and copies the real app's data in (one way; the real app is only read). */
function BetaBox() {
  const t = useT();
  const [ask, setAsk] = useState(false);
  return (
    <div className="plinth" style={{ padding: 18 }}>
      <div className="display display-md">{t('Aven Beta')}</div>
      <div className="t2" style={{ marginTop: 4 }}>{t('This is the test copy. Its workouts, food and settings are separate from your real Aven, and nothing you do here changes the real app.')}</div>
      {!ask ? <button className="btn block press" style={{ marginTop: 14 }} onClick={() => setAsk(true)}>{t('Copy my real Aven data in')}</button> : (
        <div style={{ marginTop: 14 }}>
          <div className="t2">{t('This replaces everything in the Beta with a copy of your real Aven (including your API keys), then restarts the Beta. Your real Aven is not touched.')}</div>
          <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn grow press" onClick={() => { if (requestCopyFromReal()) location.reload(); }}>{t('Yes, copy it')}</button>
            <button className="btn grow press" onClick={() => setAsk(false)}>{t('Cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function About() {
  const t = useT();
  return (
    <div className="stack gap12 small">
      {IS_BETA && <BetaBox />}
      <StutterRecorder />
      <div className="plinth dots" style={{ padding: 18 }}><div className="display display-lg">{IS_BETA ? 'Aven Beta' : 'Aven'}</div><div className="t2" style={{ marginTop: 4 }}>{t('Training, food and progress in one place.')} · v{__APP_VERSION__}{IS_BETA ? ' beta' : ''}</div></div>
      <div><b>{t('Food data')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Bundled foods are approximate reference values. Online results come from Open Food Facts (© contributors, ODbL — open database licence) and USDA FoodData Central (public domain, CC0).')}</div></div>
      <div><b>{t('Exercise clips')}</b><div className="t2" style={{ marginTop: 4 }}>{t('The muscle figure is Aven’s own render, built on the Z-Anatomy model (CC BY-SA 4.0).')}</div></div>
      <div><b>{t('What’s simulated or not built')}</b><div className="t2" style={{ marginTop: 4 }}>{t('No accounts or cloud sync (Google Drive is only used for backups). Photo food estimates are AI guesses: check them before you log. The Coach can log and change your data when you ask it to. Background reminders need a push server.')}</div></div>
    </div>
  );
}
export type { Settings };
