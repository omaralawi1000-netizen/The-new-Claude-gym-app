import { useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../state/store';
import { useUI, buzz } from '../state/ui';
import { useT, useLang } from '../lib/i18n';
import { useDaySummary, useToday, mealName, perMeal, defaultMealId } from '../lib/derive';
import { addDays, fmtDate, relativeDay } from '../lib/dates';
import { sumNutrients } from '../lib/nutrition';
import { Icon } from '../ui/Icon';
import { Subpage } from '../ui/Subpage';
import { Ledger } from './food/Ledger';
import { EntryRow } from './food/EntryRow';
import { fmtNutrient } from '../lib/format';
import { fmtNum } from '../lib/units';
import { Count } from '../ui/kit';
import type { FoodEntry } from '../lib/types';
import { WaterTile } from './food/Water';
import { WeekStrip } from './food/WeekStrip';

export function FoodScreen() {
  const t = useT();
  const lang = useLang();
  const today = useToday();
  const foodDate = useUI((s) => s.foodDate);
  const setFoodDate = useUI((s) => s.setFoodDate);
  const push = useUI((s) => s.push);
  const toast = useUI((s) => s.toast);
  const date = foodDate ?? today;
  const settings = useStore((s) => s.settings);
  const { list, sum } = useDaySummary(date);
  const removeEntry = useStore((s) => s.removeEntry);
  const restoreEntries = useStore((s) => s.restoreEntries);
  const fresh = useRef(new Set<string>());
  const seen = useRef(new Set<string>());
  const first = useRef(true);
  // entries that appear after first render get the settle highlight
  useMemo(() => {
    if (first.current) { list.forEach((e) => seen.current.add(e.id)); first.current = false; return; }
    list.forEach((e) => { if (!seen.current.has(e.id)) { fresh.current.add(e.id); seen.current.add(e.id); setTimeout(() => fresh.current.delete(e.id), 1600); } });
  }, [list]);

  const rel = relativeDay(date, today, lang);
  const isFuture = date > today;

  const del = (e: FoodEntry) => {
    removeEntry(e.id);
    toast(t('{name} removed', { name: e.snap.name }), { actionLabel: t('Undo'), onAction: () => restoreEntries([e]) });
  };
  const add = (mealId: string) => push('foodSearch', { date, mealId });
  const mealId = defaultMealId(settings.meals);

  return (
    <div className="screen">
      <header>
        <div className="row-flex between">
          <div className="row-flex" style={{ gap: 4 }}>
            <button className="icon-btn press" aria-label={t('Previous day')} onClick={() => { buzz(4); setFoodDate(addDays(date, -1)); }}><Icon name="chevL" /></button>
            <button className="icon-btn press" aria-label={t('Next day')} onClick={() => { buzz(4); setFoodDate(addDays(date, 1) === today ? null : addDays(date, 1)); }}><Icon name="chevR" /></button>
          </div>
          <div className="row-flex" style={{ gap: 8 }}>
            {date !== today && <button className="chip acc press" onClick={() => setFoodDate(null)}>{t('Today')}</button>}
            <button className="icon-btn press" aria-label={t('Pick date')} onClick={() => push('datePicker', { value: date, onPick: (d: string) => setFoodDate(d === today ? null : d), title: t('Go to day'), marks: 'food' })}><Icon name="calendar" /></button>
            <button className="icon-btn press" aria-label={t('Day options')} onClick={() => push('entryMenu', { kind: 'day', date })}><Icon name="more" /></button>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h1 key={date} className="display display-lg" style={{ margin: 0, fontStyle: 'italic' }} initial={{ opacity: 0, y: 14, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }} exit={{ opacity: 0, y: -14, filter: 'blur(10px)' }} transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}>
              {rel ?? fmtDate(date, lang, { day: 'numeric', month: 'long' })}
            </motion.h1>
          </AnimatePresence>
          <div className="small t3" style={{ marginTop: 2 }}>{fmtDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long' })}{isFuture ? ' ↗' : ''}</div>
        </div>
      </header>

      <Subpage key={date}>
      <Ledger sum={sum} />

      {list.length === 0 && (
        <div className="plinth" style={{ padding: '22px 18px', textAlign: 'center' }}>
          <div className="display display-sm" style={{ marginBottom: 14, fontStyle: 'italic' }}>{date === today ? t('Nothing logged yet') : t('No entries for this day')}</div>
          <div className="row-flex" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn primary press" onClick={() => add(mealId)}><Icon name="plus" size={18} /> {t('Add food')}</button>
            <button className="btn press" onClick={() => push('voice', { mode: 'food', date, mealId })}><Icon name="mic" size={18} /> {t('Dictate')}</button>
          </div>
        </div>
      )}

      {settings.meals.map((m) => {
        const items = perMeal(list, m.id);
        const ms = sumNutrients(items.map((e) => e.nutrients)).totals;
        // the meal's calories split by macro, as one thin bar
        const pk = (ms.protein ?? 0) * 4, ck = (ms.carbs ?? 0) * 4, fk = (ms.fat ?? 0) * 9, tk = Math.max(1, pk + ck + fk);
        return (
          <section key={m.id} className={`plinth meal ${items.length ? '' : 'bare'}`} aria-label={mealName(m, lang)}>
            <div className="meal-head">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="meal-name display">{mealName(m, lang)}</div>
                <div className="meal-meta num">
                  {items.length
                    ? <><b><Count value={ms.kcal ?? 0} format={(n) => fmtNum(Math.round(n), lang, 0)} /></b> kcal<span className="dot" />P {fmtNutrient('protein', ms.protein, lang)} g</>
                    : <span className="t3">{t('nothing logged')}</span>}
                </div>
              </div>
              {items.length > 0 && <button className="icon-btn flat sm press" aria-label={t('Meal options')} onClick={() => push('entryMenu', { kind: 'meal', date, mealId: m.id })}><Icon name="more" size={20} /></button>}
              <button className="meal-add press" aria-label={`${t('Add to')} ${mealName(m, lang)}`} onClick={() => { buzz(6); add(m.id); }}><Icon name="plus" size={20} /></button>
            </div>
            {items.length > 0 && (
              <>
                <div className="meal-bar" aria-hidden>
                  <i style={{ flexGrow: pk / tk, background: 'var(--c-protein)' }} />
                  <i style={{ flexGrow: ck / tk, background: 'var(--c-carbs)' }} />
                  <i style={{ flexGrow: fk / tk, background: 'var(--c-fat)' }} />
                </div>
                <div className="meal-list">
                  <AnimatePresence initial={false}>
                    {items.map((e) => <EntryRow key={e.id} e={e} fresh={fresh.current.has(e.id)} onOpen={() => push('foodDetail', { entryId: e.id, date: e.date, mealId: e.mealId })} onDelete={() => del(e)} />)}
                  </AnimatePresence>
                </div>
              </>
            )}
          </section>
        );
      })}

      <WaterTile date={date} />
      <WeekStrip date={date} onPick={(d) => setFoodDate(d === today ? null : d)} />
      </Subpage>
    </div>
  );
}
