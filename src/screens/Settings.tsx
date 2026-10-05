import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, flushSave, persistStatus } from '../state/store';
import { useUI } from '../state/ui';
import { apple, highRefresh, onHighRefresh, setHighRefresh } from '../ui/motion';
import { useT, useLang } from '../lib/i18n';
import { Sheet, SheetHead, useIsPage } from '../ui/Sheet';
import { Icon } from '../ui/Icon';
import { NumInput, Seg, Toggle } from '../ui/kit';
import { defaultData, normaliseData, DATA_VERSION } from '../state/defaults';
import { buildDemo } from '../lib/demo';
import { userHasData } from '../lib/stats';
import { clearPhotos, loadPhoto, savePhoto } from '../lib/photos';
import type { AppData, Meal, Settings } from '../lib/types';
import { uid } from '../lib/nutrition';
import { mealName } from '../lib/derive';
import { dayKey } from '../lib/dates';
import { useAi } from '../state/ai';
import { clearKeys } from '../lib/keys';
import { VoiceAiSettings } from './VoiceAi';
import { setFpsMeter, useFpsMeterOn } from '../ui/FpsMeter';

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

// Settings pages settle row by row only the first time they are opened (see `.settings-page.seen` in styles.css)
const seenPages = new Set<string>();

type Section = null | 'targets' | 'training' | 'food' | 'units' | 'look' | 'reminders' | 'data' | 'privacy' | 'ai' | 'about';

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
    <Field label={t('Frame rate readout')} hint={t('Shows your real refresh rate, top-left.')}>
      <Toggle on={on} onChange={setFpsMeter} label={t('Frame rate readout')} />
    </Field>
  );
}

function HrrField() {
  const t = useT();
  const on = useSyncExternalStore(onHighRefresh, highRefresh, () => true);
  return (
    <Field label={t('High refresh rate')} hint={t('Draws motion at your screen’s full rate (up to 120 Hz).')}>
      <Toggle on={on} onChange={setHighRefresh} label={t('High refresh rate')} />
    </Field>
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
  const firstOf = useRef<Record<string, boolean>>({});
  const pageKey = sec ?? 'root';
  if (!(pageKey in firstOf.current)) firstOf.current[pageKey] = !seenPages.has(pageKey);
  useEffect(() => { seenPages.add(pageKey); }, [pageKey]);
  const ai = useAi();
  const set = s.updateSettings;
  const st = s.settings;
  const titles: Record<string, string> = { targets: t('Targets'), training: t('Training'), food: t('Food & water'), units: t('Units & locale'), look: t('Appearance'), reminders: t('Reminders'), data: t('Data & backup'), privacy: t('Privacy'), ai: t('Voice & AI'), about: t('About Aven') };
  const goBack = () => (sec && !props.section ? setSec(null) : pop());
  const asPage = useIsPage(); // opened inside another sheet (e.g. from the Coach): its Back arrow is the way out

  return (
    <Sheet onClose={pop} tall label={t('Settings')} z={100}>
      <SheetHead title={
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.span key={sec ?? 'root'} custom={dir} variants={TITLE} initial="enter" animate="center" exit="exit" style={{ display: 'inline-block' }}>{sec ? titles[sec] : t('Settings')}</motion.span>
        </AnimatePresence>} onClose={sec ? goBack : pop} back={!!sec && !props.section} right={sec && props.section && !asPage ? <button className="icon-btn flat" onClick={pop} aria-label={t('Close')}><Icon name="close" /></button> : undefined} />
      <div className="sheet-body" style={{ position: 'relative', overflowX: 'hidden' }}>
        {/* both pages move at once (no blank gap): the new one slides in sharpening from blur, the old one drifts out */}
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={sec ?? 'root'} className={`no-rise settings-page ${firstOf.current[pageKey] ? '' : 'seen'}`} custom={dir} variants={PAGE} initial="enter" animate="center" exit="exit" style={{ width: '100%' }}>
            {!sec && (
              <>
                <div className="field"><label htmlFor="s-name">{t('Your name')}</label><input id="s-name" className="input" value={st.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('Optional')} /></div>
                <div className="list" style={{ marginTop: 14 }}>
                  <Row icon="bolt" title={t('Targets')} sub={st.goals.kcal ? `${st.goals.kcal} kcal${st.goals.protein ? ` · ${st.goals.protein} g ${t('protein')}` : ''}` : t('Calories, macros, water — optional')} onClick={() => setSec('targets')} />
                  <Row icon="dumbbell" title={t('Training')} sub={`${t('Rest')} ${st.restDefaultSec}s · ${st.effort === 'off' ? t('no RPE/RIR') : st.effort.toUpperCase()}`} onClick={() => setSec('training')} />
                  <Row icon="food" title={t('Food & water')} onClick={() => setSec('food')} />
                  <Row icon="globe" title={t('Units & locale')} sub={`${st.units.weight} · ${st.units.distance} · ${st.language === 'da' ? 'Dansk' : 'English'}`} onClick={() => setSec('units')} />
                  <Row icon="moon" title={t('Appearance')} sub={`${t(st.theme === 'system' ? 'System' : st.theme === 'dark' ? 'Dark' : 'Light')} · ${t(st.motion === 'system' ? 'Motion: system' : st.motion === 'reduce' ? 'Reduced motion' : 'Full motion')}`} onClick={() => setSec('look')} />
                  <Row icon="sparkle" title={t('Voice & AI')} sub={ai.hasGroq || ai.hasGemini ? [ai.hasGroq ? 'Groq' : '', ai.hasGemini ? 'Gemini' : ''].filter(Boolean).join(' + ') : undefined} onClick={() => setSec('ai')} />
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
                <Field label={t('Default rest between sets')}><div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{[45, 60, 90, 120, 150, 180].map((v) => <button key={v} className={`chip press ${st.restDefaultSec === v ? 'on' : ''}`} onClick={() => set({ restDefaultSec: v })}>{v}s</button>)}</div></Field>
                <Field label={t('Effort tracking')}><Seg value={st.effort} onChange={(v) => set({ effort: v })} options={[{ value: 'off', label: t('Off') }, { value: 'rpe', label: 'RPE' }, { value: 'rir', label: 'RIR' }]} /></Field>
                <Field label={t('Smallest weight jump')}><div className="chips" style={{ margin: 0, padding: 0 }}>{[1, 1.25, 2.5, 5].map((v) => <button key={v} className={`chip press ${st.plateStep === v ? 'on' : ''}`} onClick={() => set({ plateStep: v })}>{v} kg</button>)}</div></Field>
                <div className="row-flex between"><span>{t('Rest-timer sound')}</span><Toggle on={st.sound} onChange={(v) => set({ sound: v })} label={t('Rest-timer sound')} /></div>
                <div className="row-flex between"><span>{t('Haptic feedback')}</span><Toggle on={st.haptics} onChange={(v) => set({ haptics: v })} label={t('Haptic feedback')} /></div>
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
                <Field label={t('New day starts at')} hint={t('Late-night meals before this hour count toward the previous day.')}><div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{[0, 2, 3, 4, 5].map((h) => <button key={h} className={`chip press ${st.dayStartHour === h ? 'on' : ''}`} onClick={() => set({ dayStartHour: h })}>{String(h).padStart(2, '0')}:00</button>)}</div></Field>
              </div>
            )}
            {sec === 'look' && (
              <div className="stack gap16">
                <Field label={t('Theme')}><Seg value={st.theme} onChange={(v) => set({ theme: v })} options={[{ value: 'system', label: t('System') }, { value: 'light', label: t('Light') }, { value: 'dark', label: t('Dark') }]} /></Field>
                <Field label={t('Motion')}><Seg value={st.motion} onChange={(v) => set({ motion: v })} options={[{ value: 'system', label: t('System') }, { value: 'full', label: t('Full') }, { value: 'reduce', label: t('Reduced') }]} /></Field>
                <HrrField />
                <FpsField />
              </div>
            )}
            {sec === 'reminders' && <Reminders />}
            {sec === 'data' && <DataSection />}
            {sec === 'ai' && <VoiceAiSettings />}
            {sec === 'privacy' && (
              <div className="stack gap12 small">
                <p style={{ margin: 0 }}><b>{t('Everything stays on this device.')}</b> {t('Aven has no account and no analytics. Your workouts, meals, weight and photos are stored in this browser’s local storage and IndexedDB.')}</p>
                <p style={{ margin: 0 }}><b>{t('Food lookup')}</b>: {t('when on, the text you search is sent to Aven’s lookup server, which forwards it to Open Food Facts and USDA FoodData Central. Nothing else is sent. Turn it off in Food & water.')}</p>
                <p style={{ margin: 0 }}><b>{t('Dictation')}</b>: {t('without a Groq key, speech-to-text is performed by your browser (on Chrome this is a Google cloud service). With a Groq key, your recording is sent to Groq instead. Either way Aven never stores audio; it only reads the microphone level to animate the sphere while you speak.')}</p>
                <p style={{ margin: 0 }}><b>{t('Voice & AI')}</b>: {t('only if you add keys. Text you dictate or ask the Coach (plus a short summary of your targets and training for the Coach) goes to Google Gemini. API keys are stored only in this browser and are never part of exports or backups.')}</p>
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

function Targets() {
  const t = useT();
  const s = useStore();
  const g = s.settings.goals;
  const set = (k: keyof typeof g) => (v: number | undefined) => s.updateSettings({ goals: { ...g, [k]: v } });
  const kcalFromMacros = g.protein !== undefined && g.carbs !== undefined && g.fat !== undefined ? Math.round(g.protein * 4 + g.carbs * 4 + g.fat * 9) : null;
  return (
    <div className="stack gap16">
      <Field label={t('Calories')}><NumInput label={t('Calories')} value={g.kcal} onChange={set('kcal')} unit="kcal" max={0} placeholder="—" /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label={t('Protein')}><NumInput label={t('Protein')} value={g.protein} onChange={set('protein')} unit="g" max={0} placeholder="—" /></Field>
        <Field label={t('Carbs')}><NumInput label={t('Carbs')} value={g.carbs} onChange={set('carbs')} unit="g" max={0} placeholder="—" /></Field>
        <Field label={t('Fat')}><NumInput label={t('Fat')} value={g.fat} onChange={set('fat')} unit="g" max={0} placeholder="—" /></Field>
      </div>
      {kcalFromMacros !== null && g.kcal !== undefined && Math.abs(kcalFromMacros - g.kcal) > g.kcal * 0.08 && <div className="small" style={{ color: 'var(--warn)' }}>{t('Your macros add up to about {n} kcal, which differs from your calorie target.', { n: kcalFromMacros })}</div>}
      <Field label={t('Fibre')}><NumInput label={t('Fibre')} value={g.fibre} onChange={set('fibre')} unit="g" max={0} placeholder="—" /></Field>
      <Field label={t('Water')}><NumInput label={t('Water')} value={g.waterMl} onChange={(v) => v && set('waterMl')(v)} unit="ml" max={0} /></Field>
      <button className="btn ghost press" onClick={() => s.updateSettings({ goals: { waterMl: g.waterMl } })}>{t('Clear nutrition targets')}</button>
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

  const doExport = async () => {
    flushSave();
    const { settings, foods, favourites, savedMeals, recipes, entries, water, exercises, routines, schedule, sessions, active, weights, measurements, photos, activities, notes, demo, choices } = useStore.getState();
    const payload: any = { app: 'aven', v: DATA_VERSION, exportedAt: new Date().toISOString(), data: { v: DATA_VERSION, settings, foods, favourites, savedMeals, recipes, entries, water, exercises, routines, schedule, sessions, active, weights, measurements, photos, activities, notes, demo, choices } };
    if (withPhotos && photos.length) {
      payload.photos = {};
      for (const p of photos) { const b = await loadPhoto(p.id).catch(() => undefined); if (b) payload.photos[p.id] = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); }); }
    }
    download(`aven-backup-${dayKey(Date.now(), s.settings.dayStartHour)}.json`, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    toast(t('Backup downloaded'), { tone: 'ok' });
  };
  const onFile = async (f?: File | null) => {
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== 'aven' || !j.data) throw new Error('format');
      if (typeof j.v !== 'number' || j.v > DATA_VERSION) throw new Error('newer');
      setPending({ data: normaliseData(j.data, s.settings.language), photos: j.photos });
    } catch (e: any) { toast(e?.message === 'newer' ? t('That backup is from a newer version of Aven.') : t('That file isn’t a valid Aven backup.'), { tone: 'bad' }); }
  };
  const doImport = async () => {
    if (!pending) return;
    const before = useStore.getState();
    const prev = { settings: before.settings, foods: before.foods, favourites: before.favourites, savedMeals: before.savedMeals, recipes: before.recipes, entries: before.entries, water: before.water, exercises: before.exercises, routines: before.routines, schedule: before.schedule, sessions: before.sessions, active: before.active, weights: before.weights, measurements: before.measurements, photos: before.photos, activities: before.activities, notes: before.notes, demo: before.demo, choices: before.choices, v: DATA_VERSION } as AppData;
    before.replaceAll(pending.data);
    if (pending.photos) for (const [id, url] of Object.entries(pending.photos)) { try { await savePhoto(id, await (await fetch(url)).blob()); } catch { /* skip */ } }
    setPending(null);
    toast(t('Backup restored'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => useStore.getState().replaceAll(prev), duration: 10000 });
  };
  const doDelete = async () => { useStore.getState().resetAll(); await clearPhotos().catch(() => {}); try { Object.keys(localStorage).filter((k) => k.startsWith('aven')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } clearKeys(); useAi.getState().patch({ stt: 'accurate', voiceLang: 'auto', speak: false, voice: 'Achird', brain: true, models: { fast: '', brain: '', fastAlt: '', brainAlt: '', tts: '' } }); setConfirmDel(false); closeAll(); setTimeout(() => push('onboarding', {}), 80); };
  const demo = () => { const d = buildDemo(s.settings); useStore.getState().patch(d); toast(t('Demo data loaded'), { tone: 'ok' }); };
  const removeDemo = () => { const lang = s.settings.language; const settings = s.settings; useStore.getState().replaceAll({ ...defaultData(lang), settings }); toast(t('Demo data removed'), { tone: 'ok' }); };

  return (
    <div className="stack gap16">
      {persistStatus.error && <div className="plinth-2 small" style={{ padding: 12, color: 'var(--bad)' }}>{persistStatus.error === 'quota' ? t('Storage is full — export a backup and free space.') : t('Couldn’t save to this browser’s storage. Export a backup now.')}</div>}
      <div className="plinth" style={{ padding: 16 }}>
        <div className="li-title">{t('Export backup')}</div>
        <div className="li-sub" style={{ marginTop: 2 }}>{t('One JSON file with everything: workouts, food, plans, settings.')}</div>
        {s.photos.length > 0 && <label className="row-flex small" style={{ gap: 10, marginTop: 12 }}><Toggle on={withPhotos} onChange={setWithPhotos} label={t('Include photos')} /> {t('Include progress photos (larger file)')}</label>}
        <button className="btn primary block press" style={{ marginTop: 14 }} onClick={doExport}><Icon name="download" size={18} /> {t('Download backup')}</button>
      </div>
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
      <div className="plinth" style={{ padding: 16 }}>
        <div className="li-title">{t('Demo data')}</div>
        {s.demo ? <button className="btn block press" style={{ marginTop: 14 }} onClick={removeDemo}>{t('Remove demo data')}</button>
          : has ? null
          : <button className="btn block press" style={{ marginTop: 14 }} onClick={demo}>{t('Load demo data')}</button>}
      </div>
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

function About() {
  const t = useT();
  return (
    <div className="stack gap12 small">
      <div className="plinth dots" style={{ padding: 18 }}><div className="display display-lg">Aven</div><div className="t2" style={{ marginTop: 4 }}>{t('Training, food and progress in one place.')} · v0.1</div></div>
      <div><b>{t('Food data')}</b><div className="t2" style={{ marginTop: 4 }}>{t('Bundled foods are approximate reference values. Online results come from Open Food Facts (© contributors, ODbL — open database licence) and USDA FoodData Central (public domain, CC0).')}</div></div>
      <div><b>{t('What’s simulated or not built')}</b><div className="t2" style={{ marginTop: 4 }}>{t('No cloud sync or accounts. No photo-based food estimation. The Coach only advises and never changes your data. Background reminders need a push server.')}</div></div>
    </div>
  );
}
export type { Settings };
