import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { Icon } from '../ui/Icon';
import { NumInput, Seg, Toggle } from '../ui/kit';
import { SphereSlot } from '../ui/Sphere';
import { useVoice } from '../state/voice';
import { useEffect } from 'react';
import type { EquipmentAccess, Experience, Goal } from '../lib/types';
import { SEED_EXERCISES } from '../data/exercises';
import { assignWeek, buildStarter } from '../lib/starter';
import { buildDemo } from '../lib/demo';
import { fmtWeekdayShort } from '../lib/dates';
import { useOverlayZ } from '../ui/Sheet';

const GOALS: { v: Goal; l: string; s: string }[] = [
  { v: 'strength', l: 'Get stronger', s: 'Heavier lifts, lower reps' },
  { v: 'muscle', l: 'Build muscle', s: 'Volume and progression' },
  { v: 'fatloss', l: 'Lose fat', s: 'Training plus food awareness' },
  { v: 'endurance', l: 'Endurance', s: 'Higher reps, shorter rests' },
  { v: 'general', l: 'General fitness', s: 'A bit of everything' },
];

/** Six short steps, every one skippable. Nothing here is permanent — all of it is editable in Settings. */
export function Onboarding({ props }: { props: { rerun?: boolean; starterOnly?: boolean } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const closeAll = useUI((u) => u.closeAll);
  const toast = useUI((u) => u.toast);
  const st = s.settings;
  const z = useOverlayZ(120);
  const [step, setStep] = useState(props.starterOnly ? 1 : 0);
  const [dir, setDir] = useState(1);
  const [name, setName] = useState(st.name);
  const [goal, setGoal] = useState<Goal>(st.profile.goal);
  const [exp, setExp] = useState<Experience>(st.profile.experience);
  const [eq, setEq] = useState<EquipmentAccess>(st.profile.equipment);
  const [days, setDays] = useState<number[]>(st.profile.days);
  const [units, setUnits] = useState(st.units.weight);
  const [lang2, setLang2] = useState(st.language);
  const [kcal, setKcal] = useState<number | undefined>(st.goals.kcal);
  const [prot, setProt] = useState<number | undefined>(st.goals.protein);
  const [plan, setPlan] = useState(s.routines.length === 0);
  const last = 5;
  const go = (n: number) => { setDir(n > step ? 1 : -1); setStep(n); buzz(6); };
  const tt = (k: string) => (lang2 !== lang ? k : t(k));

  // the onboarding sphere is the same stage sphere, parked in this slot
  useEffect(() => { useVoice.getState().go('idle'); }, []);

  const finish = (opts: { demo?: boolean } = {}) => {
    const settings = { ...st, name: name.trim(), language: lang2, units: { ...st.units, weight: units, distance: units === 'lb' ? ('mi' as const) : ('km' as const), length: units === 'lb' ? ('in' as const) : ('cm' as const) }, goals: { ...st.goals, kcal, protein: prot }, profile: { goal, experience: exp, equipment: eq, days }, onboarded: true };
    if (opts.demo) { const d = buildDemo(settings); useStore.getState().patch(d); toast(t('Demo data loaded — remove it any time in Settings'), { tone: 'ok', duration: 4500 }); }
    else {
      useStore.getState().patch({ settings });
      if (plan && days.length) {
        const routines = buildStarter({ days: days.length, goal, experience: exp, access: eq }, SEED_EXERCISES).filter((r) => r.items.length);
        if (routines.length) { useStore.getState().patch((x) => ({ routines: [...x.routines, ...routines], schedule: { ...x.schedule, mode: 'weekly', weekly: assignWeek(days, routines) } })); toast(t('Starter plan created — edit it in Train'), { tone: 'ok' }); }
      }
    }
    closeAll();
  };
  const skipAll = () => { useStore.getState().patch({ settings: { ...st, onboarded: true } }); closeAll(); };

  const screens = [
    // 0 welcome + goal
    <div key="0">
      <div className="display display-xl">{tt('Let’s set up Aven.')}</div>
      <div className="field" style={{ marginTop: 22 }}><label htmlFor="ob-name">{tt('What should I call you?')}</label><input id="ob-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tt('Optional')} /></div>
      <div className="lbl" style={{ margin: '22px 0 10px' }}>{tt('What’s your main goal?')}</div>
      <div className="stack gap8">{GOALS.map((g) => <button key={g.v} className="plinth press" style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', outline: goal === g.v ? '2px solid var(--ac)' : undefined }} onClick={() => setGoal(g.v)}><div className="grow"><div className="li-title">{tt(g.l)}</div><div className="li-sub">{tt(g.s)}</div></div>{goal === g.v && <Icon name="check" size={20} style={{ color: 'var(--ac-text)' }} />}</button>)}</div>
    </div>,
    // 1 experience + equipment
    <div key="1">
      <div className="display display-lg">{tt('Your experience')}</div>
      <div style={{ marginTop: 16 }}><Seg value={exp} onChange={setExp} options={[{ value: 'new', label: tt('New') }, { value: 'some', label: tt('Some') }, { value: 'experienced', label: tt('Experienced') }]} /></div>
      <div className="display display-lg" style={{ marginTop: 28 }}>{tt('What can you train with?')}</div>
      <div className="stack gap8" style={{ marginTop: 14 }}>{([['fullGym', 'Full gym', 'Barbells, machines, cables'], ['barbellHome', 'Home with barbell', 'Barbell, dumbbells, bench'], ['homeDumbbells', 'Home with dumbbells', 'Dumbbells, kettlebell, bands'], ['bodyweight', 'Bodyweight only', 'No equipment']] as [EquipmentAccess, string, string][]).map(([v, l, sub]) => (
        <button key={v} className="plinth press" style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', outline: eq === v ? '2px solid var(--ac)' : undefined }} onClick={() => setEq(v)}><div className="grow"><div className="li-title">{tt(l)}</div><div className="li-sub">{tt(sub)}</div></div>{eq === v && <Icon name="check" size={20} style={{ color: 'var(--ac-text)' }} />}</button>))}</div>
    </div>,
    // 2 schedule
    <div key="2">
      <div className="display display-lg">{tt('Which days can you train?')}</div>
      <div className="row-flex" style={{ gap: 6, marginTop: 22, justifyContent: 'space-between' }}>
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => { const on = days.includes(wd); return <button key={wd} className="press" aria-pressed={on} onClick={() => setDays(on ? days.filter((x) => x !== wd) : [...days, wd])} style={{ flex: 1, height: 64, borderRadius: 16, background: on ? 'var(--ac)' : 'var(--s2)', color: on ? 'var(--ac-ink)' : 'var(--tx2)', fontWeight: 700, boxShadow: on ? '0 8px 18px -8px color-mix(in srgb, var(--ac) 70%, transparent)' : 'inset 0 0 0 1px var(--line)', transition: 'background .2s, color .2s' }}>{fmtWeekdayShort(wd, lang2, true)}</button>; })}
      </div>
      <div className="small t2 num" style={{ marginTop: 14 }}>{days.length} {tt('days a week')}</div>
    </div>,
    // 3 units
    <div key="3">
      <div className="display display-lg">{tt('Units & language')}</div>
      <div className="lbl" style={{ margin: '20px 0 8px' }}>{tt('Weight')}</div>
      <Seg value={units} onChange={setUnits} options={[{ value: 'kg', label: 'kg (metric)' }, { value: 'lb', label: 'lb' }]} />
      <div className="lbl" style={{ margin: '20px 0 8px' }}>{tt('Language')}</div>
      <Seg value={lang2} onChange={(v) => { setLang2(v); useStore.getState().updateSettings({ language: v }); }} options={[{ value: 'en', label: 'English' }, { value: 'da', label: 'Dansk' }]} />
    </div>,
    // 4 nutrition
    <div key="4">
      <div className="display display-lg">{tt('Nutrition targets')}</div>
      <div className="stack gap16" style={{ marginTop: 22 }}>
        <div className="field"><label>{tt('Calories per day')}</label><NumInput value={kcal} onChange={setKcal} unit="kcal" max={0} placeholder="—" /></div>
        <div className="field"><label>{tt('Protein per day')}</label><NumInput value={prot} onChange={setProt} unit="g" max={0} placeholder="—" /></div>
      </div>
    </div>,
    // 5 finish
    <div key="5">
      <div className="display display-lg">{tt('Ready.')}</div>
      <div className="plinth" style={{ padding: 16, marginTop: 20 }}>
        <div className="row-flex between"><div><div className="li-title">{tt('Create a starter plan')}</div><div className="li-sub" style={{ maxWidth: 240 }}>{days.length ? `${days.length} ${tt('days a week')} · ${tt('editable')}` : tt('Pick training days first')}</div></div><Toggle on={plan && days.length > 0} onChange={setPlan} label={tt('Create a starter plan')} /></div>
      </div>
      {!props.starterOnly && <button className="btn block press" style={{ marginTop: 22 }} onClick={() => finish({ demo: true })}><Icon name="sparkle" size={18} /> {tt('Explore with demo data instead')}</button>}
    </div>,
  ];

  if (props.starterOnly) {
    // condensed: steps 1,2 then finish
  }
  const isLast = step === last;
  return (
    <motion.div data-hue="today" style={{ position: 'fixed', inset: 0, zIndex: z, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={tt('Setup')}>
      <div className="aurora in" aria-hidden><i /><i /><i /></div>
      <div className="aurora in" aria-hidden><i /><i /><i /></div>
      <div style={{ padding: 'calc(var(--sat) + 12px) 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="ticks grow" style={{ height: 14 }} aria-hidden>{Array.from({ length: last + 1 }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} style={{ height: '100%' }} />)}</div>
        <button className="small t2 press" style={{ padding: 8 }} onClick={skipAll}>{tt('Skip all')}</button>
      </div>
      <div style={{ display: 'grid', placeItems: 'center', height: step === 0 ? 150 : 70, transition: 'height .4s cubic-bezier(.22,1,.36,1)', marginTop: 6 }}>
        <SphereSlot id="onb" priority={10} style={{ width: step === 0 ? 140 : 56, height: step === 0 ? 140 : 56, transition: 'width .4s cubic-bezier(.22,1,.36,1), height .4s cubic-bezier(.22,1,.36,1)' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 22px 20px', position: 'relative' }} className="hide-scroll">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 36 }} transition={{ duration: 0.22 }}>
            {screens[step]}
          </motion.div>
        </AnimatePresence>
      </div>
      <div style={{ padding: '12px 20px calc(var(--sab) + 16px)', display: 'flex', gap: 10, borderTop: '1px solid var(--line)' }}>
        {step > (props.starterOnly ? 1 : 0) && <button className="btn press" onClick={() => go(step - 1)} aria-label={tt('Back')}><Icon name="chevL" size={18} /></button>}
        {!isLast && <button className="btn ghost press" onClick={() => go(step + 1)}>{tt('Skip')}</button>}
        <button className="btn primary grow press" onClick={() => (isLast ? finish() : go(step + 1))}>{isLast ? tt('Start') : tt('Continue')}</button>
      </div>
    </motion.div>
  );
}
