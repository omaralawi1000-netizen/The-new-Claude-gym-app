import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStore, foodPool } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Food, FoodSnapshot, Quantity } from '../../lib/types';
import { allowedUnits, entryFromSnapshot, scale, snapshotOf, toBase, uid, NUTRIENT_KEYS } from '../../lib/nutrition';
import { fmtNum } from '../../lib/units';
import { fmtNutrient, NUTRIENT_LABEL, NUTRIENT_UNIT, sourceLabel } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Count, NumInput, Seg } from '../../ui/kit';
import { MorphSheet, Sheet, SOFT } from '../../ui/Sheet';
import { mealName } from '../../lib/derive';
import { fmtDate, relativeDay } from '../../lib/dates';
import { useToday } from '../../lib/derive';
import { pct } from '../../lib/nutrition';

function snapToFood(s: FoodSnapshot): Food {
  return { id: s.foodId ?? uid('snap'), name: s.name, brand: s.brand, source: s.source, sourceId: s.sourceId, basis: s.basis, per100: s.per100, portions: s.portions, density: s.density, state: s.state };
}

/** Countable foods (a banana, a slice, a can) default to their portion; bulk foods (skyr, rice, oats) default to 100 g. */
const COUNTABLE = /^(1 (medium|large|small|slice|can|bottle|glass|cup|scoop|square|breast|fillet|tub|serving|handful)|½)/i;
function defaultQty(food: Food, last?: Quantity): Quantity {
  if (last) {
    if (last.unit === 'portion' && food.portions.some((p) => p.id === last.portionId)) return last;
    if (last.unit !== 'portion' && allowedUnits(food).includes(last.unit)) return last;
  }
  const verified = food.portions.find((x) => x.verified);
  if (verified) return { amount: 1, unit: 'portion', portionId: verified.id };
  const p = food.portions[0];
  if (p && COUNTABLE.test(p.label) && !/tub|serving|handful/i.test(p.label)) return { amount: 1, unit: 'portion', portionId: p.id };
  return { amount: 100, unit: food.basis };
}
export { defaultQty };

/** Food detail + portion controls. Opens as a morph from its source row; edits an existing entry when `entryId` is set. */
export function FoodDetail({ props }: { props: { food?: Food; foodId?: string; entryId?: string; date: string; mealId: string; morph?: string; afterSave?: 'close' | 'closeAll' } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pool = foodPool(s.foods, s.recipes);
  const pop = useUI((u) => u.pop);
  const closeAll = useUI((u) => u.closeAll);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const today = useToday();
  const entry = props.entryId ? s.entries.find((e) => e.id === props.entryId) : undefined;
  const initialFood = useMemo<Food | undefined>(() => {
    if (entry) return snapToFood(entry.snap);
    if (props.food) return props.food;
    return pool.find((f) => f.id === props.foodId);
    // eslint-disable-next-line
  }, []);
  const [food, setFood] = useState<Food | undefined>(initialFood);
  const last = useMemo(() => {
    if (entry) return entry.qty;
    const prev = [...s.entries].reverse().find((e) => e.snap.foodId === initialFood?.id);
    return prev?.qty;
    // eslint-disable-next-line
  }, []);
  const [qty, setQty] = useState<Quantity>(() => (entry ? entry.qty : initialFood ? defaultQty(initialFood, last) : { amount: 100, unit: 'g' }));
  const [mealId, setMealId] = useState(props.mealId);
  const [date, setDate] = useState(props.date);
  const [note, setNote] = useState(entry?.note ?? '');
  const entryId = useRef(props.entryId ?? uid('e'));
  const saving = useRef(false);

  useEffect(() => { if (!food) pop(); }, [food, pop]);
  if (!food) return null;

  const base = toBase(food, qty);
  const n = base.ok ? scale(food.per100, base.base) : {};
  const units = allowedUnits(food);
  const variants = food.variantGroup ? pool.filter((f) => f.variantGroup === food.variantGroup && f.source === food.source) : [];
  const goals = s.settings.goals;
  const fav = s.favourites.includes(food.id);
  const editing = !!entry;
  const meal = s.settings.meals.find((m) => m.id === mealId);

  const setUnit = (unit: 'g' | 'ml' | 'portion', portionId?: string) => {
    if (unit === 'portion') setQty({ amount: 1, unit, portionId });
    else setQty({ amount: base.ok ? Math.round(base.base * (unit === food.basis ? 1 : unit === 'g' ? food.density ?? 1 : 1 / (food.density ?? 1))) || 100 : 100, unit });
  };

  const save = () => {
    if (saving.current || !base.ok || qty.amount <= 0) return;
    saving.current = true;
    buzz(14);
    const snap = snapshotOf(food);
    const make = (date: string) => entryFromSnapshot(snap, qty, date, mealId, { id: entryId.current, note: note.trim() || undefined, at: entry?.at });
    const e = make(date);
    if (!e) { saving.current = false; return; }
    if (food.source === 'off' || food.source === 'usda') s.saveFood(food); // keep looked-up foods available offline
    if (editing) {
      const before = entry!;
      s.updateEntry(entry!.id, { ...e, at: before.at });
      toast(t('Saved changes'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.updateEntry(before.id, before) });
    } else {
      const [added] = s.logEntries([e]);
      if (added) toast(t('Added to {meal}', { meal: meal ? mealName(meal, lang) : '' }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeEntry(added.id) });
    }
    if (props.afterSave === 'closeAll' || !editing) closeAll(); else pop();
  };

  const remove = () => {
    if (!entry) return;
    const e = entry;
    s.removeEntry(e.id);
    pop();
    toast(t('{name} removed', { name: e.snap.name }), { actionLabel: t('Undo'), onAction: () => s.restoreEntries([e]) });
  };

  const body = (
    <>
      <div className="sheet-head" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="micro">{editing ? t('Edit entry') : t('Food')}</div>
          <div className="display display-md" style={{ marginTop: 4, lineHeight: 1 }}>{food.name}</div>
          <div className="small t2" style={{ marginTop: 6 }}>{food.brand ? `${food.brand} · ` : ''}{fmtNum(100, lang, 0)} {food.basis} · {sourceLabel(food.source, t)}{food.barcode ? ` · ${food.barcode}` : ''}</div>
        </div>
        <button className="icon-btn press" aria-label={fav ? t('Remove favourite') : t('Favourite')} onClick={() => { buzz(6); if (!s.foods.some((f) => f.id === food.id) && food.source !== 'reference' && food.source !== 'recipe') s.saveFood(food); s.toggleFavourite(food.id); }} style={{ color: fav ? 'var(--ac-text)' : undefined }}>
          <Icon name="star" style={{ fill: fav ? 'currentColor' : 'none' }} />
        </button>
        <button className="icon-btn flat" onClick={pop} aria-label={t('Close')}><Icon name="close" /></button>
      </div>

      <div className="sheet-body">
        {/* live preview */}
        <div className="plinth dots" style={{ padding: '18px 18px 16px', borderRadius: 'var(--r-lg)' }}>
          <div className="row-flex between" style={{ alignItems: 'flex-end' }}>
            <div>
              <div className="micro">{t('This portion')}</div>
              <div className="display display-xl" style={{ marginTop: 4 }}>
                {n.kcal === undefined ? <span className="t3">—</span> : <Count value={n.kcal} format={(v) => fmtNum(Math.round(v), lang, 0)} />}
                <span className="display-sm t3" style={{ marginLeft: 6, fontStretch: '100%', fontWeight: 600 }}>kcal</span>
              </div>
            </div>
            <div className="small t2 num" style={{ textAlign: 'right' }}>
              {base.ok && (base.base > 2500 || (n.kcal ?? 0) > 3000) && <div style={{ color: 'var(--bad)', fontWeight: 600 }}>{t('That’s a lot — check the amount')}</div>}
              {base.ok ? <>{fmtNum(base.base, lang, 1)} {food.basis}{base.estimated && <div style={{ color: 'var(--warn)' }}>~ {t('estimated portion')}</div>}</> : <span style={{ color: 'var(--bad)' }}>{t('Unit not available')}</span>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 16 }}>
            {([['protein', 'Protein', 'var(--c-protein)'], ['carbs', 'Carbs', 'var(--c-carbs)'], ['fat', 'Fat', 'var(--c-fat)']] as const).map(([k, label, c]) => (
              <div key={k}>
                <div className="micro">{t(label)}</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 650 }}>{n[k] === undefined ? <span className="t3">—</span> : <Count value={n[k]!} format={(v) => fmtNutrient(k, v, lang)} />}<span className="t3 small"> g</span></div>
                <div className="bar" style={{ height: 4, marginTop: 6 }}><motion.i style={{ background: c }} initial={false} animate={{ width: `${pct(n[k] ?? 0, goals[k] ?? 100) * 100}%` }} transition={SOFT} /></div>
              </div>
            ))}
          </div>
        </div>

        {/* raw / cooked */}
        {variants.length > 1 && (
          <div style={{ marginTop: 18 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>{t('Prepared as')}</div>
            <Seg value={food.id} onChange={(id) => { const v = variants.find((x) => x.id === id)!; setFood(v); setQty((q) => (q.unit === 'portion' ? defaultQty(v) : q)); }}
              options={variants.map((v) => ({ value: v.id, label: t(v.state === 'raw' ? 'Raw' : v.state === 'cooked' ? 'Cooked' : v.state === 'dry' ? 'Dry' : 'Other') }))} />
            <div className="xs t3" style={{ marginTop: 6 }}>{t('Raw and cooked weights are not interchangeable — cooking changes water content.')}</div>
          </div>
        )}

        {/* amount */}
        <div style={{ marginTop: 20 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Amount')}</div>
          <div className="row-flex" style={{ gap: 10 }}>
            <NumInput big value={qty.amount} min={0} max={qty.unit === 'portion' ? 2 : 1} onChange={(v) => setQty((q) => ({ ...q, amount: v ?? 0 }))} unit={qty.unit === 'portion' ? '×' : qty.unit} label={t('Amount')} onEnter={save} />
            <div className="row-flex" style={{ gap: 6 }}>
              <button className="icon-btn press" aria-label={t('Less')} onClick={() => setQty((q) => ({ ...q, amount: Math.max(0, Math.round((q.amount - (q.unit === 'portion' ? 0.5 : q.amount > 200 ? 25 : 10)) * 100) / 100) }))}><Icon name="minus" /></button>
              <button className="icon-btn press" aria-label={t('More')} onClick={() => setQty((q) => ({ ...q, amount: Math.round((q.amount + (q.unit === 'portion' ? 0.5 : q.amount >= 200 ? 25 : 10)) * 100) / 100 }))}><Icon name="plus" /></button>
            </div>
          </div>
          <div className="chips" style={{ marginTop: 12 }}>
            {units.map((u) => <button key={u} className={`chip press ${qty.unit === u ? 'on' : ''}`} onClick={() => setUnit(u)}>{u}</button>)}
            {food.portions.map((p) => (
              <button key={p.id} className={`chip press ${qty.unit === 'portion' && qty.portionId === p.id ? 'on' : ''}`} onClick={() => setUnit('portion', p.id)} title={p.verified ? t('Verified serving size') : t('Typical size, not verified')}>
                {p.verified ? <Icon name="check" size={14} sw={2.4} /> : <span style={{ opacity: 0.7 }}>~</span>} {p.label}
              </button>
            ))}
          </div>
          {units.length === 1 && <div className="xs t3" style={{ marginTop: 8 }}>{food.basis === 'g' ? t('Millilitres are hidden: this food has no known density, so ml ≠ g can’t be assumed.') : t('Grams are hidden: this food has no known density.')}</div>}
        </div>

        {/* meal + date */}
        <div style={{ marginTop: 20 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Meal')}</div>
          <div className="chips">
            {s.settings.meals.map((m) => <button key={m.id} className={`chip press ${mealId === m.id ? 'on' : ''}`} onClick={() => setMealId(m.id)}>{mealName(m, lang)}</button>)}
          </div>
          <button className="row-flex press small t2" style={{ marginTop: 10, gap: 6 }} onClick={() => push('datePicker', { value: date, title: t('Log on day'), onPick: (d: string) => setDate(d) })}>
            <Icon name="calendar" size={16} /> {relativeDay(date, today, lang) ?? fmtDate(date, lang)} · {t('change day')}
          </button>
        </div>

        {/* full nutrition */}
        <div style={{ marginTop: 22 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>{t('Nutrition')}</div>
          <div className="list">
            <div className="li row-flex between" style={{ minHeight: 32, padding: '4px 0' }}><span className="xs t3">&nbsp;</span><span className="xs t3 num" style={{ width: 84, textAlign: 'right' }}>{t('portion')}</span><span className="xs t3 num" style={{ width: 84, textAlign: 'right' }}>{t('per')} 100 {food.basis}</span></div>
            {NUTRIENT_KEYS.map((k) => (
              <div key={k} className="li" style={{ minHeight: 40, padding: '6px 0' }}>
                <span className="grow small">{t(NUTRIENT_LABEL[k])}</span>
                <span className="num small" style={{ width: 84, textAlign: 'right', fontWeight: 600 }}>{n[k] === undefined ? <span className="t3">—</span> : `${fmtNutrient(k, n[k], lang)} ${NUTRIENT_UNIT[k]}`}</span>
                <span className="num small t2" style={{ width: 84, textAlign: 'right' }}>{food.per100[k] === undefined ? <span className="t3">{t('no data')}</span> : `${fmtNutrient(k, food.per100[k], lang)} ${NUTRIENT_UNIT[k]}`}</span>
              </div>
            ))}
          </div>
          <div className="xs t3" style={{ marginTop: 8 }}>{t('"—" means the source has no value — it is not counted as zero.')}</div>
          {food.source === 'reference' && <div className="xs t3" style={{ marginTop: 4 }}>{t('Bundled reference values are typical averages. Correct them by making your own copy.')}</div>}
        </div>

        {editing && (
          <div style={{ marginTop: 20 }} className="field">
            <label htmlFor="entry-note">{t('Note')}</label>
            <textarea id="entry-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional')} />
          </div>
        )}

        <div className="row-flex" style={{ marginTop: 22, gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm press" onClick={() => push('customFood', { from: food, afterSave: 'replaceDetail', date, mealId })}><Icon name="edit" size={16} /> {food.source === 'custom' ? t('Edit food') : t('Correct → my copy')}</button>
          {editing && <button className="btn sm danger press" onClick={remove}><Icon name="trash" size={16} /> {t('Delete entry')}</button>}
        </div>
      </div>
    </>
  );

  const foot = (
    <button className="btn primary block press" onClick={save} disabled={!base.ok || qty.amount <= 0}>
      {editing ? t('Save changes') : t('Add to {meal}', { meal: meal ? mealName(meal, lang) : '' })}
      {n.kcal !== undefined && <span className="num" style={{ opacity: 0.7 }}> · {fmtNum(Math.round(n.kcal), lang, 0)} kcal</span>}
    </button>
  );

  return props.morph
    ? <MorphSheet layoutId={props.morph} onClose={pop} label={food.name} foot={foot}>{body}</MorphSheet>
    : <Sheet onClose={pop} tall label={food.name} foot={foot}>{body}</Sheet>;
}
