import { useMemo, useRef, useState } from 'react';
import { useStore, foodPool } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { FoodEntry, Recipe, RecipeIngredient, Food, Quantity } from '../../lib/types';
import { allowedUnits, calcRecipe, entryFromSnapshot, recipeToFood, scale, snapshotOf, sumNutrients, toBase, uid } from '../../lib/nutrition';
import { searchFoods } from '../../lib/foodText';
import { fmtNum } from '../../lib/units';
import { fmtNutrient } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Empty, NumInput } from '../../ui/kit';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { mealName } from '../../lib/derive';

/** Saved meals: a named set of foods you log together. */
export function SavedMeals({ props }: { props: { date: string; mealId: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const closeAll = useUI((u) => u.closeAll);
  const toast = useUI((u) => u.toast);
  const meal = s.settings.meals.find((m) => m.id === props.mealId);
  const log = (id: string) => {
    const m = s.savedMeals.find((x) => x.id === id)!;
    const entries = m.items.map((it) => entryFromSnapshot(it.snap, it.qty, props.date, props.mealId)).filter(Boolean) as FoodEntry[];
    const added = s.logEntries(entries);
    buzz(12);
    closeAll();
    toast(t('Added {name}', { name: m.name }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => added.forEach((e) => s.removeEntry(e.id)) });
  };
  const del = (id: string) => { const m = s.deleteMeal(id); if (m) toast(t('{name} removed', { name: m.name }), { actionLabel: t('Undo'), onAction: () => s.saveMeal(m) }); };
  return (
    <Sheet onClose={pop} tall label={t('Saved meals')} z={80}>
      <SheetHead title={t('Saved meals')} sub={meal ? t('Add to {meal}', { meal: mealName(meal, lang) }) : undefined} onClose={pop} />
      <div className="sheet-body">
        {s.savedMeals.length === 0 ? <Empty icon="copy" title={t('No saved meals yet')} body={t('Open a meal in your diary, tap ⋯ and choose “Save as meal”.')} /> : (
          <div className="list">
            {s.savedMeals.map((m) => {
              const sum = sumNutrients(m.items.map((it) => { const b = toBase(it.snap, it.qty); return b.ok ? scale(it.snap.per100, b.base) : {}; }));
              return (
                <div key={m.id} className="li">
                  <button className="grow press" style={{ textAlign: 'left' }} onClick={() => log(m.id)}>
                    <div className="li-title">{m.name}</div>
                    <div className="li-sub trunc">{m.items.map((i) => i.snap.name).join(', ')}</div>
                    <div className="xs t3 num">{fmtNutrient('kcal', sum.totals.kcal, lang)} kcal · P {fmtNutrient('protein', sum.totals.protein, lang)} g</div>
                  </button>
                  <button className="icon-btn flat" aria-label={t('Delete')} onClick={() => del(m.id)}><Icon name="trash" size={18} /></button>
                  <button className="icon-btn press" aria-label={t('Log')} onClick={() => log(m.id)}><Icon name="plus" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function RecipeList({ props }: { props: { date: string; mealId: string } }) {
  const t = useT();
  const lang = useLang();
  const recipes = useStore((s) => s.recipes);
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  return (
    <Sheet onClose={pop} tall label={t('Recipes')} z={80} foot={<button className="btn primary block press" onClick={() => push('recipe', { date: props.date, mealId: props.mealId })}><Icon name="plus" size={18} /> {t('New recipe')}</button>}>
      <SheetHead title={t('Recipes')} onClose={pop} />
      <div className="sheet-body">
        {recipes.length === 0 ? <Empty icon="recipe" title={t('No recipes yet')} body={t('Combine ingredients once, then log servings in two taps.')} /> : (
          <div className="list">
            {recipes.map((r) => {
              const c = calcRecipe(r);
              const food = recipeToFood(r);
              return (
                <div key={r.id} className="li">
                  <button className="grow press" style={{ textAlign: 'left' }} disabled={!food} onClick={() => food && push('foodDetail', { food, date: props.date, mealId: props.mealId })}>
                    <div className="li-title">{r.name}</div>
                    <div className="li-sub num">{r.servings} {t('servings')} · {c.perServing.kcal !== undefined ? `${fmtNutrient('kcal', c.perServing.kcal, lang)} kcal / ${t('serving')}` : t('needs a prepared weight')}</div>
                  </button>
                  <button className="icon-btn flat" aria-label={t('Edit')} onClick={() => push('recipe', { id: r.id, date: props.date, mealId: props.mealId })}><Icon name="edit" size={18} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function RecipeEditor({ props }: { props: { id?: string; date: string; mealId: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pool = foodPool(s.foods, s.recipes);
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const existing = props.id ? s.recipes.find((r) => r.id === props.id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [servings, setServings] = useState<number | undefined>(existing?.servings ?? 2);
  const [weight, setWeight] = useState<number | undefined>(existing?.totalWeightG);
  const [ings, setIngs] = useState<RecipeIngredient[]>(existing?.ingredients ?? []);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<{ food: Food; qty: Quantity } | null>(null);
  const saved = useRef(false);
  const draft: Pick<Recipe, 'ingredients' | 'servings' | 'totalWeightG'> = { ingredients: ings, servings: servings ?? 1, totalWeightG: weight };
  const c = calcRecipe(draft);
  const hits = useMemo(() => (q.trim().length > 0 ? searchFoods(q, pool.filter((f) => f.source !== 'recipe')).slice(0, 6).map((x) => x.food) : []), [q, pool]);

  const addIngredient = () => {
    if (!pick) return;
    const b = toBase(pick.food, pick.qty);
    if (!b.ok || pick.qty.amount <= 0) return;
    setIngs((x) => [...x, { id: uid('i'), snap: snapshotOf(pick.food), qty: pick.qty, base: b.base }]);
    setPick(null); setQ(''); buzz(8);
  };
  const save = () => {
    if (saved.current || !name.trim() || ings.length === 0) return;
    saved.current = true;
    const r: Recipe = { id: existing?.id ?? uid('rc'), name: name.trim(), ingredients: ings, servings: servings ?? 1, totalWeightG: weight, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() };
    s.upsertRecipe(r);
    toast(t('Recipe saved — past entries are unchanged'), { tone: 'ok' });
    pop();
  };
  const del = () => { if (!existing) return; const r = s.deleteRecipe(existing.id); pop(); if (r) toast(t('{name} removed', { name: r.name }), { actionLabel: t('Undo'), onAction: () => s.restoreRecipe(r) }); };

  return (
    <Sheet onClose={pop} tall label={t('Recipe')} z={90} foot={<button className="btn primary block press" disabled={!name.trim() || !ings.length} onClick={save}>{t('Save recipe')}</button>}>
      <SheetHead title={existing ? t('Edit recipe') : t('New recipe')} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="r-name">{t('Name')}</label><input id="r-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Overnight oats')} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <div className="field"><label>{t('Servings')}</label><NumInput value={servings} onChange={setServings} max={2} min={0.25} unit="×" label={t('Servings')} /></div>
          <div className="field"><label>{t('Prepared weight')}</label><NumInput value={weight} onChange={setWeight} max={0} unit="g" placeholder={c.weightIsSum && c.weightG ? String(Math.round(c.weightG)) : t('optional')} label={t('Prepared weight')} /></div>
        </div>
        <div className="xs t3" style={{ marginTop: 6 }}>{t('Weigh the finished dish for accurate servings. Without it, the ingredient weights are added up.')}</div>

        <div className="lbl" style={{ margin: '20px 0 6px' }}>{t('Ingredients')}</div>
        {ings.length === 0 && <div className="small t2" style={{ padding: '6px 0 10px' }}>{t('Add your first ingredient below.')}</div>}
        <div className="list">
          {ings.map((i) => (
            <div key={i.id} className="li" style={{ minHeight: 52 }}>
              <div className="grow"><div className="li-title small trunc">{i.snap.name}</div><div className="li-sub num">{fmtNum(i.qty.amount, lang, 1)} {i.qty.unit === 'portion' ? `× ${i.snap.portions.find((p) => p.id === i.qty.portionId)?.label ?? ''}` : i.qty.unit} · {fmtNutrient('kcal', scale(i.snap.per100, i.base).kcal, lang)} kcal</div></div>
              <button className="icon-btn flat" aria-label={t('Remove')} onClick={() => setIngs((x) => x.filter((y) => y.id !== i.id))}><Icon name="close" size={18} /></button>
            </div>
          ))}
        </div>

        <div className="plinth-2" style={{ padding: 12, marginTop: 10 }}>
          {!pick ? (
            <>
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--tx3)' }} />
                <input className="input" style={{ paddingLeft: 42 }} placeholder={t('Add ingredient — search foods')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Add ingredient — search foods')} />
              </div>
              {hits.map((f) => (
                <button key={f.id} className="li press" style={{ borderTop: '1px solid var(--line)', minHeight: 48 }} onClick={() => setPick({ food: f, qty: { amount: 100, unit: f.basis } })}>
                  <div className="grow" style={{ textAlign: 'left' }}><div className="li-title small">{f.name}</div><div className="li-sub num">{fmtNutrient('kcal', f.per100.kcal, lang)} kcal / 100 {f.basis}</div></div><Icon name="plus" size={18} />
                </button>
              ))}
            </>
          ) : (
            <div>
              <div className="row-flex between"><div className="li-title small">{pick.food.name}</div><button className="icon-btn flat sm" aria-label={t('Cancel')} onClick={() => setPick(null)}><Icon name="close" size={16} /></button></div>
              <div className="row-flex" style={{ gap: 8, marginTop: 8 }}>
                <div className="grow"><NumInput value={pick.qty.amount} max={2} onChange={(v) => setPick({ ...pick, qty: { ...pick.qty, amount: v ?? 0 } })} unit={pick.qty.unit === 'portion' ? '×' : pick.qty.unit} autoFocus onEnter={addIngredient} label={t('Amount')} /></div>
                <button className="btn primary press" onClick={addIngredient}>{t('Add')}</button>
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                {allowedUnits(pick.food).map((u) => <button key={u} className={`chip sm press ${pick.qty.unit === u ? 'on' : ''}`} onClick={() => setPick({ ...pick, qty: { amount: 100, unit: u } })}>{u}</button>)}
                {pick.food.portions.map((p) => <button key={p.id} className={`chip sm press ${pick.qty.unit === 'portion' && pick.qty.portionId === p.id ? 'on' : ''}`} onClick={() => setPick({ ...pick, qty: { amount: 1, unit: 'portion', portionId: p.id } })}>{p.verified ? '✓' : '~'} {p.label}</button>)}
              </div>
            </div>
          )}
        </div>

        {ings.length > 0 && (
          <div className="plinth dots" style={{ padding: 16, marginTop: 18, borderRadius: 'var(--r-lg)' }}>
            <div className="micro">{t('Per serving')}</div>
            {c.needsWeight && <div className="small" style={{ color: 'var(--warn)', marginTop: 6 }}>{t('Some ingredients are in ml with no known density — enter the prepared weight so serving sizes can be computed.')}</div>}
            <div className="row-flex between" style={{ marginTop: 6, alignItems: 'flex-end' }}>
              <div className="display display-lg num">{c.perServing.kcal === undefined ? '—' : fmtNutrient('kcal', c.perServing.kcal, lang)}<span className="display-sm t3" style={{ fontStretch: '100%', fontWeight: 600 }}> kcal</span></div>
              <div className="small t2 num" style={{ textAlign: 'right' }}>{c.servingG ? `${fmtNum(Math.round(c.servingG), lang, 0)} g / ${t('serving')}` : ''}<br />{c.weightG ? `${fmtNum(Math.round(c.weightG), lang, 0)} g ${t('total')}${c.weightIsSum ? ` (${t('summed')})` : ''}` : ''}</div>
            </div>
            <div className="num small t2" style={{ marginTop: 8 }}>P {fmtNutrient('protein', c.perServing.protein, lang)} · C {fmtNutrient('carbs', c.perServing.carbs, lang)} · F {fmtNutrient('fat', c.perServing.fat, lang)} g</div>
            <div className="xs t3 num" style={{ marginTop: 6 }}>{t('Whole recipe')}: {fmtNutrient('kcal', c.totals.kcal, lang)} kcal</div>
          </div>
        )}
        {existing && <button className="btn sm danger press" style={{ marginTop: 20 }} onClick={del}><Icon name="trash" size={16} /> {t('Delete recipe')}</button>}
      </div>
    </Sheet>
  );
}
