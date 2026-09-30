import { useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { energyMismatch, quickEntry, uid, NUTRIENT_KEYS } from '../../lib/nutrition';
import type { Food, FoodState, Nutrients, Portion } from '../../lib/types';
import { NumInput, Seg } from '../../ui/kit';
import { Sheet, SheetHead } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { mealName } from '../../lib/derive';
import { NUTRIENT_LABEL, NUTRIENT_UNIT } from '../../lib/format';

/** Quick calorie/macro entry. Anything left blank stays unknown — it is not recorded as zero. */
export function QuickAdd({ props }: { props: { date: string; mealId: string; entryId?: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const closeAll = useUI((u) => u.closeAll);
  const toast = useUI((u) => u.toast);
  const existing = props.entryId ? s.entries.find((e) => e.id === props.entryId) : undefined;
  const [label, setLabel] = useState(existing?.snap.name ?? '');
  const [n, setN] = useState<Nutrients>(existing?.nutrients ?? {});
  const [mealId, setMealId] = useState(existing?.mealId ?? props.mealId);
  const saved = useRef(false);
  const set = (k: keyof Nutrients) => (v: number | undefined) => setN((x) => { const c = { ...x }; if (v === undefined) delete c[k]; else c[k] = v; return c; });
  const mm = energyMismatch(n);
  const ok = n.kcal !== undefined || n.protein !== undefined || n.carbs !== undefined || n.fat !== undefined;
  const save = () => {
    if (saved.current || !ok) return;
    saved.current = true;
    buzz(12);
    const fresh = quickEntry(label.trim() || t('Quick entry'), n, existing?.date ?? props.date, mealId);
    if (existing) {
      const before = existing;
      s.updateEntry(existing.id, { ...fresh, id: existing.id, at: existing.at });
      toast(t('Saved changes'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.updateEntry(before.id, before) });
      pop();
    } else {
      const [a] = s.logEntries([fresh]);
      if (a) toast(t('Quick entry added'), { tone: 'ok', actionLabel: t('Undo'), onAction: () => s.removeEntry(a.id) });
      closeAll();
    }
  };
  const del = () => { if (!existing) return; const e = existing; s.removeEntry(e.id); pop(); toast(t('{name} removed', { name: e.snap.name }), { actionLabel: t('Undo'), onAction: () => s.restoreEntries([e]) }); };
  return (
    <Sheet onClose={pop} label={t('Quick add')} foot={<button className="btn primary block press" disabled={!ok} onClick={save}>{existing ? t('Save changes') : t('Add')}</button>}>
      <SheetHead title={t('Quick add')} sub={t('Log calories and macros without picking a food.')} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="q-label">{t('Label')}</label><input id="q-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('e.g. Restaurant pasta')} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
            <div key={k} className="field"><label>{t(NUTRIENT_LABEL[k])}</label><NumInput value={n[k]} onChange={set(k)} unit={NUTRIENT_UNIT[k]} max={1} placeholder="—" label={t(NUTRIENT_LABEL[k])} autoFocus={k === 'kcal'} /></div>
          ))}
        </div>
        {mm !== null && mm > 0.25 && <div className="small" style={{ color: 'var(--warn)', marginTop: 12 }}>{t('Calories and macros differ by more than 25% (4/4/9 kcal per g). Double-check — alcohol and fibre can explain some of it.')}</div>}
        <div className="xs t3" style={{ marginTop: 12 }}>{t('Blank fields are stored as unknown, not zero.')}</div>
        <div style={{ marginTop: 18 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Meal')}</div>
          <div className="chips">{s.settings.meals.map((m) => <button key={m.id} className={`chip press ${mealId === m.id ? 'on' : ''}`} onClick={() => setMealId(m.id)}>{mealName(m, lang)}</button>)}</div>
        </div>
        {existing && <button className="btn sm danger press" style={{ marginTop: 20 }} onClick={del}><Icon name="trash" size={16} /> {t('Delete entry')}</button>}
      </div>
    </Sheet>
  );
}

/** Create or correct a personal food. Copies keep nothing from the source except the values you see. */
export function CustomFood({ props }: { props: { from?: Food; name?: string; barcode?: string; afterSave?: 'replaceDetail' | 'openDetail'; date?: string; mealId?: string } }) {
  const t = useT();
  const s = useStore();
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const src = props.from;
  const editingOwn = src?.source === 'custom';
  const [name, setName] = useState(src?.name ?? props.name ?? '');
  const [brand, setBrand] = useState(src?.brand ?? '');
  const [basis, setBasis] = useState<'g' | 'ml'>(src?.basis ?? 'g');
  const [per, setPer] = useState<'100' | 'serving'>('100');
  const [serving, setServing] = useState<number | undefined>(undefined);
  const [n, setN] = useState<Nutrients>(src?.per100 ?? {});
  const [state, setState] = useState<FoodState | ''>(src?.state ?? '');
  const [density, setDensity] = useState<number | undefined>(src?.density);
  const [barcode, setBarcode] = useState(src?.barcode ?? props.barcode ?? '');
  const [portions, setPortions] = useState<Portion[]>(src?.portions.map((p) => ({ ...p })) ?? []);
  const [showMore, setShowMore] = useState(false);
  const set = (k: keyof Nutrients) => (v: number | undefined) => setN((x) => { const c = { ...x }; if (v === undefined) delete c[k]; else c[k] = v; return c; });
  const factor = per === 'serving' && serving ? 100 / serving : 1;
  const per100: Nutrients = {};
  for (const k of NUTRIENT_KEYS) if (n[k] !== undefined) per100[k] = n[k]! * factor;
  const mm = energyMismatch(per100);
  const valid = name.trim().length > 0 && per100.kcal !== undefined && (per === '100' || (serving ?? 0) > 0);
  const saved = useRef(false);

  const save = () => {
    if (!valid || saved.current) return;
    saved.current = true;
    buzz(12);
    const ps = portions.filter((p) => p.label.trim() && p.amount > 0).map((p) => ({ ...p, verified: true }));
    if (per === 'serving' && serving) ps.unshift({ id: uid('p'), label: `1 serving (${serving} ${basis})`, amount: serving, verified: true });
    const food: Food = {
      id: editingOwn ? src!.id : uid('food'), name: name.trim(), brand: brand.trim() || undefined, source: 'custom', basis, per100, portions: ps,
      density: density && density > 0 ? density : undefined, state: state || undefined, variantGroup: undefined, barcode: barcode.trim() || undefined,
      note: src && !editingOwn ? `Copy of ${src.name} (${src.source})` : undefined, createdAt: src?.createdAt ?? Date.now(), updatedAt: Date.now(),
    };
    s.saveFood(food);
    toast(editingOwn ? t('Food updated — past entries keep their old values') : t('Saved “{name}”', { name: food.name }), { tone: 'ok' });
    if (props.afterSave === 'replaceDetail' && props.date && props.mealId) useUI.getState().swap(2, 'foodDetail', { food, date: props.date, mealId: props.mealId });
    else if (props.afterSave === 'openDetail' && props.date && props.mealId) useUI.getState().swap(1, 'foodDetail', { food, date: props.date, mealId: props.mealId });
    else pop();
  };

  const fields: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'satFat', 'sodium'];
  return (
    <Sheet onClose={pop} tall label={t('Personal food')} z={80} foot={<button className="btn primary block press" disabled={!valid} onClick={save}>{editingOwn ? t('Save food') : src ? t('Save my copy') : t('Create food')}</button>}>
      <SheetHead title={editingOwn ? t('Edit food') : src ? t('Your copy of this food') : t('New food')} sub={src && !editingOwn ? t('The original stays untouched; yours is used from now on.') : undefined} onClose={pop} />
      <div className="sheet-body">
        <div className="field"><label htmlFor="cf-name">{t('Name')}</label><input id="cf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="cf-brand">{t('Brand (optional)')}</label><input id="cf-brand" className="input" value={brand} onChange={(e) => setBrand(e.target.value)} /></div>

        <div style={{ marginTop: 18 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Measured in')}</div>
          <Seg value={basis} onChange={setBasis} options={[{ value: 'g', label: t('Grams (solids)') }, { value: 'ml', label: t('Millilitres (drinks)') }]} />
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{t('Nutrition values are…')}</div>
          <Seg value={per} onChange={setPer} options={[{ value: '100', label: `${t('per')} 100 ${basis}` }, { value: 'serving', label: t('per serving') }]} />
          {per === 'serving' && <div className="field" style={{ marginTop: 10 }}><label>{t('Serving size')}</label><NumInput value={serving} onChange={setServing} unit={basis} max={1} placeholder="e.g. 30" /></div>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          {fields.slice(0, 4).map((k) => <div key={k} className="field"><label>{t(NUTRIENT_LABEL[k])}{k === 'kcal' ? ' *' : ''}</label><NumInput value={n[k]} onChange={set(k)} unit={NUTRIENT_UNIT[k]} max={2} placeholder={k === 'kcal' ? t('required') : '—'} /></div>)}
        </div>
        <button className="row-flex press small t2" style={{ marginTop: 14, gap: 6 }} onClick={() => setShowMore((v) => !v)}><Icon name={showMore ? 'chevU' : 'chevD'} size={16} />{t('More nutrients, portions and details')}</button>
        {showMore && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {fields.slice(4).map((k) => <div key={k} className="field"><label>{t(NUTRIENT_LABEL[k])}</label><NumInput value={n[k]} onChange={set(k)} unit={NUTRIENT_UNIT[k]} max={2} placeholder="—" /></div>)}
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>{t('Prepared as')}</label>
              <Seg value={state} onChange={(v) => setState(v as any)} options={[{ value: '', label: '—' }, { value: 'raw', label: t('Raw') }, { value: 'dry', label: t('Dry') }, { value: 'cooked', label: t('Cooked') }]} />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label>{t('Density (g per ml) — only if you know it')}</label>
              <NumInput value={density} onChange={setDensity} unit="g/ml" max={3} placeholder="—" />
              <div className="xs t3">{t('Needed to convert between grams and millilitres. Leave blank if unsure.')}</div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>{t('Portions')}</div>
              {portions.map((p, i) => (
                <div key={p.id} className="row-flex" style={{ gap: 8, marginBottom: 8 }}>
                  <input className="input grow" placeholder={t('e.g. 1 slice')} value={p.label} onChange={(e) => setPortions((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                  <div style={{ width: 110 }}><NumInput value={p.amount || undefined} onChange={(v) => setPortions((x) => x.map((y, j) => (j === i ? { ...y, amount: v ?? 0 } : y)))} unit={basis} max={1} /></div>
                  <button className="icon-btn flat" aria-label={t('Remove')} onClick={() => setPortions((x) => x.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>
                </div>
              ))}
              <button className="btn sm press" onClick={() => setPortions((x) => [...x, { id: uid('p'), label: '', amount: 0, verified: true }])}><Icon name="plus" size={16} /> {t('Add portion')}</button>
            </div>
            <div className="field" style={{ marginTop: 14 }}><label>{t('Barcode (optional)')}</label><input className="input" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
        )}
        {mm !== null && mm > 0.25 && <div className="small" style={{ color: 'var(--warn)', marginTop: 14 }}>{t('Calories and macros differ by more than 25%. Check the label — alcohol and fibre can explain some of it.')}</div>}
        <div className="xs t3" style={{ marginTop: 14 }}>{t('Changing a food never rewrites entries you already logged.')}</div>
      </div>
    </Sheet>
  );
}
