import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, persistStatus } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { apple, highRefresh, onHighRefresh, setHighRefresh } from '../ui/motion';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { NumInput, Seg, Stepper, Toggle } from '../ui/kit';
import { fmtNum, fmtPct } from '../lib/units';
import { lastBackup, markBackup, useStorageKept } from '../lib/persist';
import { buildBackup, parseBackup, snapshotData } from '../lib/backup';
import { DriveCard } from './DriveBackup';
import { resetDrive } from '../lib/drive';
import { defaultData } from '../state/defaults';
import { buildDemo } from '../lib/demo';
import { userHasData } from '../lib/stats';
import { clearPhotos, loadPhoto, savePhoto } from '../lib/photos';
import type { AppData, Meal, Settings } from '../lib/types';
import { uid, kcalOf, scaleMacros, suggestMacros } from '../lib/nutrition';
import { mealName } from '../lib/derive';
import { dayKey, fmtDate, fmtDuration } from '../lib/dates';
import { useAi } from '../state/ai';
import { clearKeys } from '../lib/keys';
import { VoiceAiSettings } from './VoiceAi';
import { CoachMemory } from './CoachMemory';
import { cardOrder, type TodayCard } from './TodayCards';
import { startDragSort } from '../ui/dragSort';
import { setFpsMeter, useFpsMeterOn } from '../ui/FpsMeter';
import { startStutter, stopStutter, stutterReport, stutterState, subscribeStutter } from '../lib/stutter';

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

type Section = null | 'today' | 'targets' | 'training' | 'food' | 'units' | 'look' | 'reminders' | 'data' | 'privacy' | 'ai' | 'memory' | 'about';

function Row({ icon, title, sub, onClick, value }: { icon: any; title: string; sub?: string; onClick: () => void; value?: string }) {
  return (
    <button className="li press" onClick={onClick}>
      <span style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--s2)', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--line)', flex: 'none' }}><Icon name={icon} size={19} /></span>
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

const PALETTES: { id: Settings['palette']; name: string; c: [string, string, string] }[] = [
  { id: 'ember', name: 'Ember', c: ['#ff7a59', '#7c5cff', '#ff7a59'] },
  { id: 'aurora', name: 'Aurora', c: ['#3de0c8', '#6a5cff', '#c25cff'] },
  { id: 'mono', name: 'Mono', c: ['#e9eaf0', '#9094a8', '#5b6070'] },
  { id: 'sunset', name: 'Sunset', c: ['#ff6b9d', '#ff4f7b', '#ff9a4d'] },
  { id: 'forest', name: 'Forest', c: ['#b6f25a', '#1f9d6a', '#2fd0a0'] },
];

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
  const titles: Record<string, string> = { targets: t('Targets'), training: t('Training'), food: t('Food & water'), units: t('Units & locale'), look: t('Appearance'), today: t('Today'), reminders: t('Reminders'), data: t('Data & backup'), privacy: t('Privacy'), ai: t('Voice & AI'), memory: t('Coach memory'), about: t('About Aven') };
  const goBack = () => (sec && !props.section ? setSec(null) : pop());
  const moved = useRef(false); if (sec !== (props.section ?? null)) moved.current = true; // once you've moved between pages, pages settle in

  return (
    <Sheet onClose={pop} tall instant label={t('Settings')} z={100}>
      <SheetHead title={
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.span key={sec ?? 'root'} custom={dir} variants={TITLE} initial="enter" animate="center" exit="exit" style={{ display: 'inline-block' }}>{sec ? titles[sec] : t('Settings')}</motion.span>
        </AnimatePresence>} onClose={sec ? goBack : pop} back={!!sec && !props.section} />
      <div className="sheet-body" style={{ position: 'relative', overflowX: 'hidden' }}>
        {/* both pages move at once (no blank gap): the new one slides in sharpening from blur, the old one drifts out */}
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={sec ?? 'root'} className={`no-rise settings-page ${moved.current ? '' : 'still'}`} custom={dir} variants={PAGE} initial="enter" animate="center" exit="exit" style={{ width: '100%' }}>
            {!sec && (
              <>
                <div className="field"><label htmlFor="s-name">{t('Your name')}</label><input id="s-name" className="input" value={st.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('Optional')} /></div>
                <div className="list" style={{ marginTop: 14 }}>
                  <Row icon="bolt" title={t('Targets')} sub={st.goals.kcal ? `${fmtNum(st.goals.kcal, lang, 0)} kcal${st.goals.protein ? ` · ${fmtNum(st.goals.protein, lang, 0)} g ${t('protein')}` : ''}` : t('Calories, macros, water — optional')} onClick={() => setSec('targets')} />
                  <Row icon="dumbbell" title={t('Training')} sub={`${t('Rest')} ${fmtDuration(st.restDefaultSec)} · ${st.effort === 'off' ? t('no RPE/RIR') : st.effort.toUpperCase()}`} onClick={() => setSec('training')} />
                  <Row icon="food" title={t('Food & water')} onClick={() => setSec('food')} />
                  <Row icon="globe" title={t('Units & locale')} sub={`${st.units.weight} · ${st.units.distance} · ${st.language === 'da' ? 'Dansk' : 'English'}`} onClick={() => setSec('units')} />
                  <Row icon="moon" title={t('Appearance')} sub={`${t(st.theme === 'system' ? 'System' : st.theme === 'dark' ? 'Dark' : 'Light')} · ${t(st.motion === 'system' ? 'Motion: system' : st.motion === 'reduce' ? 'Reduced motion' : 'Full motion')}`} onClick={() => setSec('look')} />
                  <Row icon="today" title={t('Today')} sub={t('Choose what Today shows')} onClick={() => setSec('today')} />
                  <Row icon="sparkle" title={t('Voice & AI')} sub={ai.hasGroq || ai.hasGemini || ai.hasOpenai ? [ai.hasGroq ? 'Groq' : '', ai.hasOpenai && ai.solFirst ? 'GPT-6.1 Sol' : '', ai.hasGemini ? 'Gemini' : ''].filter(Boolean).join(' + ') : undefined} onClick={() => setSec('ai')} />
                  <Row icon="note" title={t('Coach memory')} sub={s.memory.length ? t('{n} things the Coach knows about you', { n: s.memory.length }) : t('What the Coach knows about you')} onClick={() => setSec('memory')} />
                  <Row icon="bell" title={t('Reminders')} onClick={() => setSec('reminders')} />
                  <Row icon="download" title={t('Data & backup')} onClick={() => setSec('data')} />
                  <Row icon="shield" title={t('Privacy')} onClick={() => setSec('privacy')} />
                  <Row icon="info" title={t('About Aven')} onClick={() => setSec('about')} />
                </div>
                <button className="btn block press" style={{ marginTop: 20 }} onClick={() => { useUI.getState().closeAll(); setTimeout(() => push('onboarding', { rerun: true }), 60); }}><Icon name="sparkle" size={18} /> {t('Redo setup')}</button>
              </>
            )}
            {sec === 'targets' && <Targets />}
            {sec === 'training' && (
              <div className="stack gap16">
                <Field label={t('Default rest between sets')}><div><Stepper compact label={t('Default rest between sets')} value={st.restDefaultSec} min={15} max={600} step={15} fmt={(v) => fmtDuration(v)} onChange={(v) => set({ restDefaultSec: v })} /></div></Field>
                <Field label={t('Effort tracking')}><Seg value={st.effort} onChange={(v) => set({ effort: v })} options={[{ value: 'off', label: t('Off') }, { value: 'rpe', label: 'RPE' }, { value: 'rir', label: 'RIR' }]} /></Field>
                <Field label={t('Smallest weight jump')}><div className="chips" style={{ margin: 0, padding: 0 }}>{[1, 1.25, 2.5, 5].map((v) => <button key={v} className={`chip press ${st.plateStep === v ? 'on' : ''}`} onClick={() => set({ plateStep: v })}>{v} kg</button>)}</div></Field>
                <ToggleRow label={t('Rest-timer sound')} on={st.sound} onChange={(v) => set({ sound: v })} />
                <RestAlertRow />
                <ToggleRow label={t('Haptic feedback')} on={st.haptics} onChange={(v) => set({ haptics: v })} />
              </div>
            )}
            {sec === 'food' && <FoodSettings />}
            {sec === 'units' && (
              <div className="stack gap16">
                <Field label={t('Language')}><Seg value={st.language} onChange={(v) => set({ language: v })} options={[{ value: 'en', label: 'English' }, { value: 'da', label: 'Dansk' }]} /></Field>
                <Field label={t('Weight')}><Seg value={st.units.weight} onChange={(v) => set({ units: { ...st.units, weight: v } })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></Field>
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
                  <div className="pal" role="radiogroup" aria-label={t('Colours')}>
                    {PALETTES.map((p) => (
                      <button key={p.id} role="radio" aria-checked={st.palette === p.id} className={`pal-card press ${st.palette === p.id ? 'on' : ''}`} onClick={() => { buzz(6); set({ palette: p.id }); }}>
                        <div className="pal-sw" style={{ ['--p0' as string]: p.c[0], ['--p1' as string]: p.c[1], ['--p2' as string]: p.c[2] }}><i /><i /><b /></div>
                        <div className="small" style={{ marginTop: 8, fontWeight: 600 }}>{t(p.name)}</div>
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={t('Theme')}><Seg value={st.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'system', label: t('System') }, { value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }]} /></Field>
                <Field label={t('Motion')}><Seg value={st.motion} onChange={(v) => set({ motion: v })} options={[{ value: 'system', label: t('System') }, { value: 'full', label: t('Full') }, { value: 'reduce', label: t('Reduced') }]} /></Field>
                <HrrField />
                <FpsField />
              </div>
            )}
            {sec === 'reminders' && <Reminders />}
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

/** The rest-over alert while Aven isn't on screen: a notification, so it needs the browser's permission (asked here, once). */
function RestAlertRow() {
  const t = useT();
  const s = useStore();
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(() => (supported ? Notification.permission : 'denied'));
  const on = s.settings.restNotify !== false && perm === 'granted';
  const toggle = async (v: boolean) => {
    if (v && supported && Notification.permission === 'default') { const r = await Notification.requestPermission().catch(() => 'default' as NotificationPermission); setPerm(r); }
    s.updateSettings({ restNotify: v });
  };
  if (!supported) return null;
  return (
    <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 14 }}>
      <div><div>{t('Alert when rest is over')}</div><div className="xs t2" style={{ marginTop: 2 }}>{perm === 'denied' ? t('Notifications are blocked for Aven in your browser settings.') : t('Even with the phone in your pocket.')}</div></div>
      <Toggle on={on} onChange={toggle} label={t('Alert when rest is over')} />
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
    anchor.current = null; buzz(8);
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
  const save = (m: Meal[]) => { setMeals(m); s.setMeals(m); };
  return (
    <div className="stack gap16">
      <Field label={t('Meals')}>
        <div className="stack gap8">
          {meals.map((m, i) => (
            <div key={m.id} className="row-flex" style={{ gap: 8 }}>
              <input className="input" value={m.name || mealName(m, lang)} onChange={(e) => save(meals.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`${t('Meal')} ${i + 1}`} />
              <button className="icon-btn flat" aria-label={t('Remove')} disabled={meals.length <= 1} style={{ opacity: meals.length <= 1 ? 0.3 : 1 }} onClick={() => {
                const target = meals.find((_, j) => j !== i)!;
                useStore.getState().patch((x) => ({ entries: x.entries.map((e) => (e.mealId === m.id ? { ...e, mealId: target.id } : e)) }));
                save(meals.filter((_, j) => j !== i));
                toast(t('Entries moved to {meal}', { meal: target.name || mealName(target, lang) }));
              }}><Icon name="close" size={18} /></button>
            </div>
          ))}
          <button className="btn sm press" onClick={() => save([...meals, { id: uid('meal'), name: t('New meal') }])}><Icon name="plus" size={16} /> {t('Add meal')}</button>
        </div>
      </Field>
      <Field label={t('Water quick amounts (ml)')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>{st.waterQuick.map((v, i) => <NumInput key={i} value={v} max={0} unit="ml" onChange={(n) => n && n > 0 && s.updateSettings({ waterQuick: st.waterQuick.map((x, j) => (j === i ? n : x)) })} />)}</div>
      </Field>
      <div className="row-flex between" style={{ alignItems: 'flex-start', gap: 14 }}>
        <div><div style={{ fontWeight: 600 }}>{t('Online food lookup')}</div></div>
        <Toggle on={st.foodLookup} onChange={(v) => s.updateSettings({ foodLookup: v })} label={t('Online food lookup')} />
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
  const [pending, setPending] = useState<{ data: AppData; photos?: Record<string, string> } | null>(null);
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
    setPending(null);
    toast(t('Backup restored'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => useStore.getState().replaceAll(prev), duration: 10000 });
  };
  const doDelete = async () => { resetDrive(); useStore.getState().resetAll(); await clearPhotos().catch(() => {}); try { Object.keys(localStorage).filter((k) => k.startsWith('aven')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } clearKeys(); useAi.getState().patch({ stt: 'accurate', voiceLang: 'auto', voice: 'Achird', brain: true, solFirst: true, effortOrb: 'medium', effortCoach: 'high', models: { fast: '', brain: '', fastAlt: '', brainAlt: '', tts: '' } }); setConfirmDel(false); closeAll(); setTimeout(() => push('onboarding', {}), 80); };
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
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}><button className="btn sm primary press" onClick={doImport}>{t('Replace my data')}</button><button className="btn sm ghost press" onClick={() => setPending(null)}>{t('Cancel')}</button></div>
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
        {count > 0 && <button className="btn sm press" onClick={copy}><Icon name="copy" size={15} /> {t('Copy report')}</button>}
      </div>
    </div>
  );
}

function About() {
  const t = useT();
  return (
    <div className="stack gap12 small">
      <StutterRecorder />
      <div className="plinth dots" style={{ padding: 18 }}><div className="display display-lg">Aven</div><div className="t2" style={{ marginTop: 4 }}>{t('Training, food and progress in one place.')} · v0.1</div></div>
      <div><b>{t('Food data')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Bundled foods are approximate reference values. Online results come from Open Food Facts (© contributors, ODbL — open database licence) and USDA FoodData Central (public domain, CC0).')}</div></div>
      <div><b>{t('What’s simulated or not built')}</b><div className="t2" style={{ marginTop: 4 }}>{t('No cloud sync or accounts. No photo-based food estimation. The Coach only advises and never changes your data. Background reminders need a push server.')}</div></div>
    </div>
  );
}
export type { Settings };
