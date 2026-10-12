// Temporary probe 2: CORS, pacing (are the 503s just our own burst?), and better query shapes.
const O = 'https://omaralawi1000-netizen.github.io';
const F = 'code,product_name,product_name_da,brands,nutriments,countries_tags';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function show(label, url, init = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, headers: { Accept: 'application/json', Origin: O, ...(init.headers || {}) }, signal: AbortSignal.timeout(20000) });
    const ms = Date.now() - t0;
    const h = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'vary', 'retry-after'].map((k) => `${k}=${r.headers.get(k)}`).join(' ');
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch {}
    const list = j?.hits ?? j?.products ?? [];
    console.log(`[${label}] ${r.status} ${ms}ms ${h} count=${j?.count ?? '-'}`);
    if (!j && init.method !== 'OPTIONS') console.log('   body:', txt.slice(0, 200).replace(/\s+/g, ' '));
    for (const p of list.slice(0, 5)) { const n = p.nutriments ?? {}; console.log(`    - ${p.product_name_da ?? ''} | ${p.product_name ?? ''} | ${JSON.stringify(p.brands)} | ${n['energy-kcal_100g']} kcal | ${(p.countries_tags ?? []).slice(0, 2)}`); }
  } catch (e) { console.log(`[${label}] ERROR ${e.message}`); }
}
const sal = (q, extra = '') => `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=10&fields=${F}${extra}`;
console.log('--- CORS on search-a-licious');
await show('sal OPTIONS', sal('skyr'), { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'accept' } });
await show('sal GET', sal('skyr'));
await show('sal GET no-accept', sal('skyr'), { headers: { Accept: '*/*' } });
console.log('--- search-a-licious query shapes');
for (const q of ['cheasy vanilje skyr', 'brands:cheasy vanilje skyr', 'cheasy skyr vanilje 0% fedt', 'skyr vanilje', 'leverpostej', 'rugbrød leverpostej'])
  await show(`sal "${q}"`, sal(q, '&langs=da,en'));
console.log('--- legacy search, paced 7 s apart (rate limit is ~10/min)');
const cgi = (host, q, extra = '') => `https://${host}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=10&fields=${F}${extra}`;
for (const [label, url] of [
  ['world cc=dk "cheasy vanilje skyr"', cgi('world.openfoodfacts.org', 'cheasy vanilje skyr', '&cc=dk&lc=da')],
  ['world (no cc) "cheasy vanilje skyr"', cgi('world.openfoodfacts.org', 'cheasy vanilje skyr')],
  ['world cc=dk "leverpostej"', cgi('world.openfoodfacts.org', 'leverpostej', '&cc=dk&lc=da')],
  ['world (no cc) "chicken breast"', cgi('world.openfoodfacts.org', 'chicken breast')],
  ['world cc=dk "vaniljeskyr"', cgi('world.openfoodfacts.org', 'vaniljeskyr', '&cc=dk&lc=da')],
  ['v2 brands_tags=cheasy', `https://world.openfoodfacts.org/api/v2/search?brands_tags=cheasy&countries_tags_en=denmark&page_size=50&fields=${F}`],
]) { await show(label, url); await sleep(7000); }
