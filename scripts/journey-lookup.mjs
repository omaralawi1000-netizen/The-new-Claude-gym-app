import { launch, wait, skipOnboarding } from './lib.mjs';
import assert from 'node:assert/strict';
const { b, p, errors } = await launch({});
// Simulate a STATIC host (no Aven server): /api/* answers with index.html like Netlify/Pages would.
await p.route('**/api/food/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }));
const OFF = (code, name, brand, n) => ({ code, product_name: name, brands: brand, quantity: '450 g', serving_size: '150 g', serving_quantity: 150, nutriments: n });
const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
let searchCalls = 0;
await p.route('https://search.openfoodfacts.org/**', (r) => { searchCalls++; r.fulfill({ status: 200, headers: cors, body: JSON.stringify({ hits: [OFF('5701000000017', 'Skyr Naturel', 'TestMejeri', { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 }), OFF('5701000000024', 'Skyr Vanille', 'TestMejeri', { 'energy-kcal_100g': 72, proteins_100g: 10, carbohydrates_100g: 7.5, fat_100g: 0.2 })] }) }); });
await p.route('https://world.openfoodfacts.org/api/v2/product/**', (r) => { const code = r.request().url().match(/product\/(\d+)/)[1]; code === '5701000000017' ? r.fulfill({ status: 200, headers: cors, body: JSON.stringify({ status: 1, product: OFF(code, 'Skyr Naturel', 'TestMejeri', { 'energy-kcal_100g': 63, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 }) }) }) : r.fulfill({ status: 404, headers: cors, body: JSON.stringify({ status: 0 }) }); });
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p);
await p.locator('.tabbar').getByRole('button', { name: 'Food', exact: true }).click(); await wait(p, 500);
await p.getByRole('button', { name: 'Add food' }).first().click(); await wait(p, 500);
await p.getByPlaceholder('Search foods and brands').fill('skyr'); await wait(p, 2000);
assert(await p.getByText('TestMejeri').first().isVisible(), 'direct Open Food Facts results shown without an Aven server');
assert(searchCalls >= 1);
await p.screenshot({ path: 'shots/lk-1-direct.png' });
await p.getByRole('button', { name: 'Scan' }).first().click(); await wait(p, 700);
await p.getByLabel('Barcode number').fill('5701000000017'); await p.getByRole('button', { name: 'Look up' }).click(); await wait(p, 1500);
assert(await p.getByRole('dialog').last().getByText('Skyr Naturel').first().isVisible(), 'barcode lookup direct');
await p.keyboard.press('Escape'); await wait(p, 500);
// ── wasm reader on a generated EAN-13 (native BarcodeDetector deliberately removed) ──
const r = await p.evaluate(async () => {
  const code = '5701234567892'; // valid check digit? computed below
  const digits = code.slice(0, 12).split('').map(Number);
  const cs = (10 - (digits.reduce((s, d, i) => s + d * (i % 2 ? 3 : 1), 0) % 10)) % 10;
  const full = code.slice(0, 12) + cs;
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
  const par = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'][+full[0]];
  let bits = '101'; for (let i = 0; i < 6; i++) bits += (par[i] === 'L' ? L : G)[+full[1 + i]]; bits += '01010'; for (let i = 0; i < 6; i++) bits += R[+full[7 + i]]; bits += '101';
  const m = 4, quiet = 12, W = (bits.length + quiet * 2) * m, H = 160;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.fillStyle = '#000';
  [...bits].forEach((bit, i) => { if (bit === '1') x.fillRect((quiet + i) * m, 10, m, H - 20); });
  delete window.BarcodeDetector;
  const { createReader, extractCode } = await import('/src/lib/barcode.ts');
  const reader = await createReader();
  const got = await reader.detect(c);
  return { expected: full, got, kind: reader.kind, qr: extractCode('https://world.openfoodfacts.org/product/5701000000017/skyr') };
});
console.log('wasm reader', r);
assert.equal(r.kind, 'wasm'); assert.equal(r.got, r.expected); assert.equal(r.qr, '5701000000017');
console.log('errors', errors.filter((e) => !/Failed to load resource/.test(e)).length);
await b.close(); process.exit(0);
