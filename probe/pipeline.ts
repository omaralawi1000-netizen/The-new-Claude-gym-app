// Temporary: run Aven's real online lookup + picker against the live Open Food Facts.
import { searchOnline } from '../src/lib/foodApi';
import { pickOnline } from '../src/lib/foodText';
const Q = ['cheasy vaniljeskyr 0% fedt', 'cheasy vaniljeskyr', 'skyr', 'rugbrød', 'leverpostej', 'rugbrød med leverpostej', 'greek yogurt', 'chicken breast'];
for (const q of Q) {
  const t0 = Date.now();
  const r = await searchOnline(q);
  const ms = Date.now() - t0;
  const pick = pickOnline(q, r.foods);
  console.log(`"${q}" -> status=${r.status} via=${r.via} n=${r.foods.length} ${ms}ms (orb gives up at 4000ms)  PICK=${pick ? `${pick.name} [${pick.brand ?? ''}] ${pick.per100.kcal} kcal` : 'NONE'}`);
  for (const f of r.foods.slice(0, 5)) console.log(`    ${f.name} [${f.brand ?? ''}] ${f.per100.kcal}`);
}
