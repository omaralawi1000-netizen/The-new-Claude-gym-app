// Temporary: ask Open Food Facts the real questions from a machine with internet. Prints compact results.
const Q = process.argv.slice(2).length ? process.argv.slice(2) : [
  'cheasy vaniljeskyr 0% fedt', 'cheasy vaniljeskyr', 'cheasy vanilje skyr', 'cheasy skyr vanilje', 'arla cheasy vanilje',
  'cheasy vanilje', 'cheesy vaniljeskyr', 'vaniljeskyr', 'skyr', 'rugbrød', 'leverpostej', 'rugbrød med leverpostej', 'greek yogurt', 'chicken breast',
];
const F = 'code,product_name,product_name_da,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments,countries_tags,lang';
const E = {
  sal: (q) => `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&langs=da,en&page_size=10&fields=${F}`,
  sal_nolangs: (q) => `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=10&fields=${F}`,
  cgi_dk: (q) => `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&cc=dk&lc=da&fields=${F}`,
  cgi_dkhost: (q) => `https://dk.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=${F}`,
};
const H = { Accept: 'application/json', Origin: 'https://omaralawi1000-netizen.github.io', 'User-Agent': 'Aven/probe (omar gym app)' };
for (const q of Q) {
  console.log(`\n===== "${q}"`);
  for (const [k, mk] of Object.entries(E)) {
    const t0 = Date.now();
    try {
      const r = await fetch(mk(q), { headers: H, signal: AbortSignal.timeout(20000) });
      const ms = Date.now() - t0;
      const cors = r.headers.get('access-control-allow-origin');
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { console.log(`  [${k}] ${r.status} ${ms}ms cors=${cors} NOT JSON: ${txt.slice(0, 120).replace(/\s+/g, ' ')}`); continue; }
      const list = j.hits ?? j.products ?? [];
      console.log(`  [${k}] ${r.status} ${ms}ms cors=${cors} count=${j.count ?? j.total ?? '?'} got=${list.length}`);
      for (const p of list.slice(0, 6)) {
        const n = p.nutriments ?? {};
        console.log(`     - ${JSON.stringify(p.product_name_da ?? null)} | ${JSON.stringify(p.product_name ?? null)} | brands=${JSON.stringify(p.brands)} | kcal=${n['energy-kcal_100g']} p=${n.proteins_100g} c=${n.carbohydrates_100g} f=${n.fat_100g} | ${p.quantity ?? ''} | ${(p.countries_tags ?? []).slice(0,3).join(',')}`);
      }
    } catch (e) { console.log(`  [${k}] ERROR ${Date.now() - t0}ms ${e.message}`); }
  }
}
