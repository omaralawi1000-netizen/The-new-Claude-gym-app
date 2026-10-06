import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore, foodPool } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import type { Food, Quantity } from '../../lib/types';
import { searchFoods } from '../../lib/foodText';
import { entryFromSnapshot, snapshotOf, uid } from '../../lib/nutrition';
import { fmtNutrient, sourceLabel } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { mealName } from '../../lib/derive';
import { searchOnline, type LookupStatus } from '../../lib/foodApi';
import { defaultQty } from './Detail';

type Filter = 'all' | 'recent' | 'fav' | 'mine';

export function FoodSearch({ props }: { props: { date: string; mealId: string } }) {
  const t = useT();
  const lang = useLang();
  const s = useStore();
  const pool = foodPool(s.foods, s.recipes);
  const push = useUI((u) => u.push);
  const pop = useUI((u) => u.pop);
  const toast = useUI((u) => u.toast);
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [online, setOnline] = useState<{ foods: Food[]; status: LookupStatus | 'loading' | 'idle' }>({ foods: [], status: 'idle' });
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const meal = s.settings.meals.find((m) => m.id === props.mealId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const id = setTimeout(() => setDq(q.trim()), 220); return () => clearTimeout(id); }, [q]);

  // recents, most recent first, with the last-used quantity
  const recents = useMemo(() => {
    const seen = new Map<string, { food: Food; at: number; qty: Quantity; count: number }>();
    for (const e of [...s.entries].sort((a, b) => b.at - a.at)) {
      if (e.quick || !e.snap.foodId) continue;
      const cur = seen.get(e.snap.foodId);
      if (cur) { cur.count++; continue; }
      const food = pool.find((f) => f.id === e.snap.foodId) ?? { id: e.snap.foodId, name: e.snap.name, brand: e.snap.brand, source: e.snap.source, basis: e.snap.basis, per100: e.snap.per100, portions: e.snap.portions, density: e.snap.density, state: e.snap.state } as Food;
      seen.set(e.snap.foodId, { food, at: e.at, qty: e.qty, count: 1 });
    }
    return [...seen.values()];
    // eslint-disable-next-line
  }, [s.entries, s.foods, s.recipes]);

  const boost = (f: Food) => (s.favourites.includes(f.id) ? 0.05 : 0) + (recents.some((r) => r.food.id === f.id) ? 0.04 : 0) + (f.source === 'custom' || f.source === 'recipe' ? 0.03 : 0);

  const results = useMemo(() => {
    let list: Food[];
    if (dq) list = searchFoods(dq, pool, boost).map((x) => x.food);
    else if (filter === 'fav') list = pool.filter((f) => s.favourites.includes(f.id));
    else if (filter === 'mine') list = pool.filter((f) => f.source === 'custom' || f.source === 'recipe');
    else list = recents.map((r) => r.food);
    if (dq && filter === 'fav') list = list.filter((f) => s.favourites.includes(f.id));
    if (dq && filter === 'mine') list = list.filter((f) => f.source === 'custom' || f.source === 'recipe');
    if (dq && filter === 'recent') list = list.filter((f) => recents.some((r) => r.food.id === f.id));
    return list;
    // eslint-disable-next-line
  }, [dq, filter, pool, recents, s.favourites]);

  // online lookup — only for real queries, only when enabled; always optional
  useEffect(() => {
    if (!s.settings.foodLookup || dq.length < 2) { setOnline({ foods: [], status: 'idle' }); return; }
    let live = true;
    setOnline((o) => ({ ...o, status: 'loading' }));
    searchOnline(dq).then((r) => { if (live) setOnline({ foods: r.foods, status: r.status }); });
    return () => { live = false; };
  }, [dq, s.settings.foodLookup]);

  const onlineShown = online.foods.filter((f) => !results.some((r) => r.sourceId && r.sourceId === f.sourceId && r.source === f.source));

  const quickAdd = (food: Food) => {
    const last = recents.find((r) => r.food.id === food.id)?.qty;
    const qty = defaultQty(food, last);
    const e = entryFromSnapshot(snapshotOf(food), qty, props.date, props.mealId, { id: uid('e') });
    if (!e) return;
    buzz(10);
    if (food.source === 'off' || food.source === 'usda') s.saveFood(food);
    const [ok] = s.logEntries([e]);
    if (!ok) return;
    setAdded((a) => [...a, { id: ok.id, name: food.name }]);
    toast(t('Added {name}', { name: food.name }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => { s.removeEntry(ok.id); setAdded((a) => a.filter((x) => x.id !== ok.id)); } });
  };

  const open = (food: Food) => push('foodDetail', { food: pool.some((f) => f.id === food.id) ? undefined : food, foodId: pool.some((f) => f.id === food.id) ? food.id : undefined, date: props.date, mealId: props.mealId });

  const actions: { icon: any; label: string; run: () => void }[] = [
    // what you'd reach for first, then your own library; talking is the orb's job (it's always in the dock)
    { icon: 'barcode', label: t('Scan'), run: () => push('scanner', { date: props.date, mealId: props.mealId }) },
    { icon: 'camera', label: t('Photo'), run: () => push('photoFood', { date: props.date, mealId: props.mealId }) },
    { icon: 'bolt', label: t('Quick add'), run: () => push('quickAdd', { date: props.date, mealId: props.mealId }) },
    { icon: 'edit', label: t('New food'), run: () => push('customFood', { afterSave: 'openDetail', date: props.date, mealId: props.mealId }) },
    { icon: 'recipe', label: t('Recipes'), run: () => push('recipes', { date: props.date, mealId: props.mealId }) },
    { icon: 'copy', label: t('Saved meals'), run: () => push('savedMeals', { date: props.date, mealId: props.mealId }) },
  ];

  return (
    <Sheet onClose={pop} size="full" label={t('Add food')}>
      <SheetHead title={t('Add to {meal}', { meal: meal ? mealName(meal, lang) : '' })} sub={added.length ? t('{n} added — tap + to add more', { n: added.length }) : undefined} onClose={pop}
        right={added.length > 0 ? <button className="btn sm primary press" onClick={pop}>{t('Done')} · {added.length}</button> : undefined} />
      <div style={{ padding: '0 20px 10px' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--tx3)' }} />
          <input ref={inputRef} className="input" style={{ paddingLeft: 42, paddingRight: 42 }} placeholder={t('Search foods and brands')} value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" aria-label={t('Search foods and brands')} />
          {q && <button className="icon-btn flat sm" style={{ position: 'absolute', right: 6, top: 7 }} aria-label={t('Clear')} onClick={() => { setQ(''); inputRef.current?.focus(); }}><Icon name="close" size={16} /></button>}
        </div>
        <div className="tools">
          {actions.map((a) => <button key={a.label} className="tool press" onClick={a.run}><Icon name={a.icon} size={19} /><span>{a.label}</span></button>)}
        </div>
      </div>
      <div className="sheet-body" style={{ paddingTop: 4 }}>
        <div className="chips" style={{ marginBottom: 8 }}>
          {([['all', dq ? t('All') : t('Recent')], ['fav', t('Favourites')], ['mine', t('My foods')]] as [Filter, string][]).map(([k, label]) => (
            <button key={k} className={`chip sm press ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>

        {results.length === 0 && !dq && (
          <div className="empty">
            <div className="display display-sm">{filter === 'fav' ? t('No favourites yet') : filter === 'mine' ? t('No personal foods yet') : t('Start typing to find food')}</div>
            <div className="small" style={{ maxWidth: 290, margin: '6px auto 0' }}>{filter === 'fav' ? t('Tap the star on any food to keep it close.') : filter === 'mine' ? t('Create your own foods and recipes — they are kept on this device.') : t('Foods you log will show up here for one-tap repeats.')}</div>
          </div>
        )}

        <div className="list">
          <AnimatePresence initial={false}>
            {results.map((f) => <FoodResult key={f.id} food={f} open={() => open(f)} add={() => quickAdd(f)} />)}
          </AnimatePresence>
        </div>

        {dq && results.length === 0 && online.status !== 'loading' && onlineShown.length === 0 && (
          <div className="empty">
            <div className="display display-sm">{t('No match for “{q}”', { q: dq })}</div>
            <div className="small" style={{ maxWidth: 290, margin: '6px auto 16px' }}>{t('Create it once and it is yours to reuse.')}</div>
            <button className="btn primary press" onClick={() => push('customFood', { name: dq, afterSave: 'openDetail', date: props.date, mealId: props.mealId })}><Icon name="plus" size={18} /> {t('Create “{q}”', { q: dq })}</button>
          </div>
        )}

        {/* online */}
        {s.settings.foodLookup && dq.length >= 2 && (
          <div style={{ marginTop: 14 }}>
            <div className="micro" style={{ margin: '4px 0 6px' }}>{t('Online lookup')}</div>
            {online.status === 'loading' && <div className="small t2 row-flex" style={{ gap: 8, padding: '10px 0' }}><span className="pulse-dot" /> {t('Searching Open Food Facts and USDA…')}</div>}
            {online.status === 'ok' && onlineShown.length === 0 && <div className="small t2" style={{ padding: '10px 0' }}>{t('Nothing extra online.')}</div>}
            {(online.status === 'unavailable' || online.status === 'offline' || online.status === 'rate') && (
              <div className="plinth-2 small" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="wifiOff" size={18} style={{ flex: 'none', marginTop: 1, color: 'var(--tx3)' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{online.status === 'offline' ? t('You’re offline') : online.status === 'rate' ? t('Lookup is rate-limited — try again shortly') : t('Online lookup isn’t available')}</div>
                  <div className="t2" style={{ marginTop: 2 }}>{t('Bundled foods, your saved foods and manual entry all still work.')}</div>
                </div>
              </div>
            )}
            <div className="list">
              {onlineShown.map((f) => <FoodResult key={f.id} food={f} open={() => open(f)} add={() => quickAdd(f)} />)}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function FoodResult({ food, open, add }: { food: Food; open: () => void; add: () => void }) {
  const t = useT();
  const lang = useLang();
  const favs = useStore((s) => s.favourites);
  return (
    <motion.div layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SOFT} className="li" style={{ position: 'relative', padding: 0 }}>
      <button className="press grow" onClick={open} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 6px', textAlign: 'left', minWidth: 0, position: 'relative', minHeight: 62, borderRadius: 14 }}>
        <div className="grow" style={{ position: 'relative', minWidth: 0 }}>
          <div className="li-title trunc">{food.name}{favs.includes(food.id) && <Icon name="star" size={13} style={{ fill: 'var(--ac-text)', color: 'var(--ac-text)', marginLeft: 6, verticalAlign: '-1px' }} />}</div>
          <div className="li-sub trunc num">{food.brand ? `${food.brand} · ` : ''}{food.per100.kcal === undefined ? t('no calorie data') : `${fmtNutrient('kcal', food.per100.kcal, lang)} kcal`} / 100 {food.basis}{' · '}<span className="t3">{sourceLabel(food.source, t)}</span></div>
        </div>
      </button>
      <button className="icon-btn press" aria-label={`${t('Quick add')} ${food.name}`} onClick={add} style={{ flex: 'none' }}><Icon name="plus" /></button>
    </motion.div>
  );
}
