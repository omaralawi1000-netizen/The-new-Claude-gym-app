import { useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { addDays, fmtDate, fmtWeekdayShort, parseKey, relativeDay, startOfWeek } from '../../lib/dates';
import { Icon } from '../../ui/Icon';
import { NumInput } from '../../ui/kit';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { mealName, useToday } from '../../lib/derive';
import { uid } from '../../lib/nutrition';
import { fmtNum } from '../../lib/units';
import { AnimatePresence, motion } from 'motion/react';

/** Month grid. `marks` = 'food' | 'train' shows a dot on days with data. */
export function DatePicker({ props }: { props: { value: string; onPick: (d: string) => void; title?: string; marks?: 'food' | 'train' } }) {
  const t = useT();
  const lang = useLang();
  const today = useToday();
  const pop = useUI((u) => u.pop);
  const s = useStore();
  const [month, setMonth] = useState(props.value.slice(0, 7));
  const [dir, setDir] = useState(1);
  const first = `${month}-01`;
  const gridStart = startOfWeek(first, s.settings.weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const marked = useMemo(() => {
    const set = new Set<string>();
    if (props.marks === 'food') s.entries.forEach((e) => set.add(e.date));
    if (props.marks === 'train') s.sessions.forEach((e) => set.add(e.date));
    return set;
  }, [s.entries, s.sessions, props.marks]);
  const go = (n: number) => { setDir(n); const d = parseKey(first); d.setMonth(d.getMonth() + n); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const heads = Array.from({ length: 7 }, (_, i) => fmtWeekdayShort((s.settings.weekStart + i) % 7, lang, true));
  return (
    <Sheet onClose={pop} size="small" label={props.title ?? t('Pick a day')} z={100}>
      <SheetHead title={props.title ?? t('Pick a day')} onClose={pop} />
      <div className="sheet-body">
        <div className="row-flex between" style={{ marginBottom: 10 }}>
          <button className="icon-btn press" aria-label={t('Previous month')} onClick={() => go(-1)}><Icon name="chevL" /></button>
          <div className="display display-sm" style={{ textTransform: 'capitalize' }}>{fmtDate(first, lang, { month: 'long', year: 'numeric' })}</div>
          <button className="icon-btn press" aria-label={t('Next month')} onClick={() => go(1)}><Icon name="chevR" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {heads.map((h, i) => <div key={i} className="micro" style={{ padding: 6 }}>{h}</div>)}
        </div>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={month} custom={dir} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -dir * 24 }} transition={{ duration: 0.2 }} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === month;
              const sel = d === props.value;
              return (
                <button key={d} className="press" aria-label={fmtDate(d, lang, { day: 'numeric', month: 'long' })} aria-pressed={sel} onClick={() => { buzz(6); props.onPick(d); pop(); }}
                  style={{ height: 46, borderRadius: 14, position: 'relative', display: 'grid', placeItems: 'center', fontWeight: sel || d === today ? 700 : 500, background: sel ? 'var(--ac)' : 'transparent', color: sel ? 'var(--ac-ink)' : inMonth ? 'var(--tx)' : 'var(--tx3)', boxShadow: d === today && !sel ? 'inset 0 0 0 1.5px var(--ac)' : undefined }}>
                  <span className="num">{Number(d.slice(8))}</span>
                  {marked.has(d) && <i style={{ position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 4, background: sel ? 'var(--ac-ink)' : 'var(--ac)' }} />}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
        <div className="chips" style={{ marginTop: 16 }}>
          {[0, -1, 1].map((n) => { const d = addDays(today, n); return <button key={n} className="chip press" onClick={() => { props.onPick(d); pop(); }}>{relativeDay(d, today, lang)}</button>; })}
        </div>
      </div>
    </Sheet>
  );
}

/** ⋯ menu for a day or a single meal. */
export function EntryMenu({ props }: { props: { kind: 'day' | 'meal'; date: string; mealId?: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const swap = useUI((u) => u.swap);
  const toast = useUI((u) => u.toast);
  const meal = props.mealId ? s.settings.meals.find((m) => m.id === props.mealId) : undefined;
  const entries = s.entries.filter((e) => e.date === props.date && (!props.mealId || e.mealId === props.mealId));
  const items: { icon: any; label: string; sub?: string; run: () => void; danger?: boolean }[] = [];
  items.push({ icon: 'copy', label: props.kind === 'meal' ? t('Copy meal to…') : t('Copy day to…'), run: () => swap(1, 'mealCopy', { from: { date: props.date, mealId: props.mealId } }) }); // a menu hands over to what you picked rather than staying underneath it
  if (props.kind === 'meal') items.push({ icon: 'star', label: t('Save as meal'), sub: t('Reuse these foods in one tap'), run: () => {
    const name = `${meal ? mealName(meal, lang) : t('Meal')} · ${fmtDate(props.date, lang, { day: 'numeric', month: 'short' })}`;
    s.saveMeal({ id: uid('sm'), name, items: entries.filter((e) => !e.quick).map((e) => ({ snap: e.snap, qty: e.qty })), createdAt: Date.now() });
    pop(); toast(t('Saved “{name}”', { name }), { tone: 'ok' });
  } });
  if (props.kind === 'day') items.push({ icon: 'note', label: t('Notes'), run: () => swap(1, 'dayNotes', { date: props.date }) });
  items.push({ icon: 'trash', label: props.kind === 'meal' ? t('Clear meal') : t('Clear day'), danger: true, run: () => {
    const removed = entries; removed.forEach((e) => s.removeEntry(e.id)); pop();
    toast(t('{n} entries cleared', { n: removed.length }), { actionLabel: t('Undo'), onAction: () => s.restoreEntries(removed) });
  } });
  return (
    <Sheet onClose={pop} size="small" label={t('Options')} z={80}>
      <SheetHead title={props.kind === 'meal' && meal ? mealName(meal, lang) : fmtDate(props.date, lang)} sub={entries.length === 0 ? t('Nothing logged') : entries.length === 1 ? t('1 entry') : t('{n} entries', { n: entries.length })} onClose={pop} />
      <div className="sheet-body">
        <div className="list">
          {items.map((i) => (
            <button key={i.label} className="li press" style={{ color: i.danger ? 'var(--bad)' : undefined }} onClick={i.run} disabled={!entries.length && i.label !== t('Notes')}>
              <Icon name={i.icon} size={20} /><div className="grow" style={{ textAlign: 'left' }}><div className="li-title">{i.label}</div>{i.sub && <div className="li-sub">{i.sub}</div>}</div>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

/** Copy a meal or a whole day to another date (and meal). Undoable. */
export function MealCopy({ props }: { props: { from: { date: string; mealId?: string } } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const today = useToday();
  const pop = useUI((u) => u.pop);
  const closeAll = useUI((u) => u.closeAll);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const [to, setTo] = useState(props.from.date === today ? addDays(today, 1) : today);
  const [mealId, setMealId] = useState<string | undefined>(props.from.mealId);
  const done = useRef(false);
  const go = () => {
    if (done.current) return;
    done.current = true;
    const copies = s.copyEntries(props.from, { date: to, mealId });
    buzz(12);
    closeAll();
    toast(t('Copied {n} entries to {day}', { n: copies.length, day: relativeDay(to, today, lang) ?? fmtDate(to, lang) }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => copies.forEach((e) => s.removeEntry(e.id)) });
  };
  return (
    <Sheet onClose={pop} label={t('Copy')} z={90} foot={<button className="btn primary block press" onClick={go}>{t('Copy to {day}', { day: relativeDay(to, today, lang) ?? fmtDate(to, lang) })}</button>}>
      <SheetHead title={t('Copy to…')} onClose={pop} />
      <div className="sheet-body">
        <div className="lbl" style={{ marginBottom: 8 }}>{t('Day')}</div>
        <div className="chips">
          {[-1, 0, 1].map((n) => { const d = addDays(today, n); return <button key={n} className={`chip press ${to === d ? 'on' : ''}`} onClick={() => setTo(d)}>{relativeDay(d, today, lang)}</button>; })}
          <button className="chip press" onClick={() => push('datePicker', { value: to, onPick: setTo, marks: 'food', title: t('Copy to day') })}><Icon name="calendar" size={16} /> {t('Pick')}</button>
        </div>
        <div className="small t2" style={{ marginTop: 8 }}>{fmtDate(to, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        {props.from.mealId && (
          <>
            <div className="lbl" style={{ margin: '18px 0 8px' }}>{t('Into meal')}</div>
            <div className="chips">{s.settings.meals.map((m) => <button key={m.id} className={`chip press ${mealId === m.id ? 'on' : ''}`} onClick={() => setMealId(m.id)}>{mealName(m, lang)}</button>)}</div>
          </>
        )}
      </div>
    </Sheet>
  );
}

export function WaterSheet({ props }: { props: { date: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const list = s.water.filter((w) => w.date === props.date).sort((a, b) => b.at - a.at);
  const q = s.settings.waterQuick;
  return (
    <Sheet onClose={pop} label={t('Water')} z={80}>
      <SheetHead title={t('Water')} onClose={pop} />
      <div className="sheet-body">
        <div className="lbl" style={{ marginBottom: 8 }}>{t('Quick amounts (ml)')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {q.map((v, i) => <NumInput key={i} value={v} max={0} unit="ml" onChange={(n) => n && n > 0 && s.updateSettings({ waterQuick: q.map((x, j) => (j === i ? n : x)) })} label={`${t('Quick amount')} ${i + 1}`} />)}
        </div>
        <div className="field" style={{ marginTop: 16 }}><label>{t('Daily goal')}</label><NumInput value={s.settings.goals.waterMl} max={0} unit="ml" onChange={(n) => n && n > 0 && s.updateSettings({ goals: { ...s.settings.goals, waterMl: n } })} /></div>
        <div className="lbl" style={{ margin: '22px 0 6px' }}>{t('Logged')}</div>
        {list.length === 0 ? <div className="small t2">{t('Nothing yet today.')}</div> : (
          <div className="list">{list.map((w) => (
            <div key={w.id} className="li" style={{ minHeight: 48 }}>
              <Icon name="drop" size={18} style={{ color: 'var(--c-water)' }} /><div className="grow num">{fmtNum(w.ml, lang, 0)} ml</div>
              <div className="small t3 num">{new Date(w.at).toLocaleTimeString(lang === 'da' ? 'da-DK' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
              <button className="icon-btn flat" aria-label={t('Delete')} onClick={() => { s.removeWater(w.id); useUI.getState().toast(t('Removed'), { actionLabel: t('Undo'), onAction: () => s.addWater(w.ml, w.date) }); }}><Icon name="trash" size={18} /></button>
            </div>
          ))}</div>
        )}
      </div>
    </Sheet>
  );
}

export function DayNotes({ props }: { props: { date: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const note = s.notes.find((n) => n.date === props.date);
  return (
    <Sheet onClose={pop} label={t('Notes')} z={90}>
      <SheetHead title={t('Notes')} sub={fmtDate(props.date, lang, { weekday: 'long', day: 'numeric', month: 'long' })} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="n-train">{t('Training')}</label><textarea id="n-train" className="input" value={note?.training ?? ''} onChange={(e) => s.setNote(props.date, { training: e.target.value })} placeholder={t('Sleep, energy, niggles…')} /></div>
        <div className="field" style={{ marginTop: 14 }}><label htmlFor="n-nut">{t('Nutrition')}</label><textarea id="n-nut" className="input" value={note?.nutrition ?? ''} onChange={(e) => s.setNote(props.date, { nutrition: e.target.value })} placeholder={t('Hunger, cravings, eating out…')} /></div>
      </div>
    </Sheet>
  );
}
