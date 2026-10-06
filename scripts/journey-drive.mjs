// Google Drive backup, with Google STUBBED at the network layer (sign-in script and Drive API): proves the wiring —
// connect, first backup, after-workout backup, restore, a new phone that must not overwrite the backup, no token stored.
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const drive = { content: null, id: null, posts: 0, patches: 0, auth: new Set() };
const GIS_STUB = `window.google={accounts:{oauth2:{initTokenClient:function(c){return{requestAccessToken:function(o){(window.__gis=window.__gis||[]).push(o&&o.prompt);setTimeout(function(){c.callback({access_token:'ya29.TESTTOKEN',expires_in:3600})},40)}}},revoke:function(t,cb){cb&&cb()}}}};`;
async function stub(p) {
  await p.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: GIS_STUB }));
  await p.route('https://www.googleapis.com/**', async (r) => {
    const req = r.request(); const url = req.url(); const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    drive.auth.add(req.headers().authorization);
    const json = (o) => r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
    if (req.method() === 'GET' && url.includes('alt=media')) return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: drive.content });
    if (req.method() === 'GET') return json({ files: drive.id ? [{ id: drive.id, modifiedTime: new Date().toISOString() }] : [] });
    if (req.method() === 'POST') { drive.posts++; const body = req.postData(); const parts = body.split(/\r\n--aven\w+/); drive.content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n'); drive.id = 'file1'; return json({ id: 'file1' }); }
    if (req.method() === 'PATCH') { drive.patches++; drive.content = req.postData(); return json({ id: drive.id }); }
    return r.fulfill({ status: 400, headers: cors });
  });
}
const ID = '123456-abcdef.apps.googleusercontent.com';
const openData = async (p) => { await closeSheets(p); await p.getByRole('button', { name: 'Settings' }).first().click(); await wait(p, 700); await p.getByText('Data & backup').click(); await wait(p, 800); };
const closeSheets = async (p) => { for (let i = 0; i < 3; i++) { await p.keyboard.press('Escape'); await wait(p, 450); } };

// ── phone 1: own data, connect, back up ──
const { b, p, errors } = await launch({});
await stub(p);
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
// your own data (demo data never goes to Drive): the demo, imported back as a normal backup with a memory and a weight jump
const own = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('aven.v1')); d.demo = false; d.memory = [{ id: 'm1', text: 'No leg day; wrestling covers legs.', kind: 'preference', at: Date.now() }]; d.increments = { x: 5 }; return JSON.stringify({ app: 'aven', v: d.v, data: d }); });
fs.writeFileSync('/tmp/aven-own.json', own);
await openData(p);
await p.locator('input[type=file][accept*="json"]').setInputFiles('/tmp/aven-own.json'); await wait(p, 500);
await p.getByRole('button', { name: 'Replace my data' }).click(); await wait(p, 900);
await p.getByLabel('Google client ID').fill(ID);
await p.getByRole('button', { name: 'Connect Google Drive' }).click(); await wait(p, 1500);
assert.equal(drive.posts, 1, 'the first backup created the file');
const first = JSON.parse(drive.content);
assert.equal(first.app, 'aven');
assert(first.data.sessions.length > 0, 'workouts are in it');
assert.equal(first.data.memory?.length, 1, 'the Coach memory is in the backup');
assert.deepEqual(first.data.increments, { x: 5 }, 'per-exercise weight jumps are in the backup');
assert(await p.getByText(/“Aven backup.json” in your Drive · last/).isVisible(), 'connected state shows the file and time');
await p.screenshot({ path: 'shots/drive-1-connected.png' });
const stored = await p.evaluate(() => JSON.stringify(localStorage));
assert(!/ya29/.test(stored), 'the Google pass is never stored');
assert([...drive.auth].every((a) => a === 'Bearer ya29.TESTTOKEN'), 'Drive calls carry the pass');
await closeSheets(p);

// ── after a workout: backed up again on Done ──
await p.getByRole('button', { name: /Start workout/ }).first().click(); await wait(p, 2500);
await p.getByRole('button', { name: 'Complete set' }).first().click(); await wait(p, 500);
await p.getByRole('button', { name: 'Finish', exact: true }).click(); await wait(p, 700);
await p.getByRole('button', { name: /Finish and save/ }).click(); await wait(p, 2000);
const before = drive.patches;
await p.getByRole('button', { name: 'Done', exact: true }).click(); await wait(p, 1500);
assert.equal(drive.patches, before + 1, 'the workout went to Drive');
assert.equal(JSON.parse(drive.content).data.sessions.length, first.data.sessions.length + 1, 'with the new session');

// ── restore from Drive ──
await openData(p);
await p.getByRole('button', { name: 'Restore', exact: true }).click(); await wait(p, 1200);
assert(await p.getByText('Ready to restore').isVisible(), 'restore asks before replacing');
await p.getByRole('button', { name: 'Replace my data' }).click(); await wait(p, 800);
assert(await p.getByText('Backup restored').isVisible());
await p.getByRole('button', { name: 'Disconnect' }).click(); await wait(p, 500);
assert(await p.getByRole('button', { name: 'Connect Google Drive' }).isVisible(), 'disconnected');
await b.close();

// ── phone 2: empty app connects — must NOT overwrite; restores instead ──
const two = await launch({});
await stub(two.p);
await two.p.goto('http://127.0.0.1:5173/'); await wait(two.p, 900); await skipOnboarding(two.p);
await openData(two.p);
await two.p.getByLabel('Google client ID').fill(ID);
const writes = drive.posts + drive.patches;
await two.p.getByRole('button', { name: 'Connect Google Drive' }).click(); await wait(two.p, 1500);
assert.equal(drive.posts + drive.patches, writes, 'an empty phone never overwrites the backup in Drive');
await two.p.getByRole('button', { name: 'Restore', exact: true }).click(); await wait(two.p, 1200);
await two.p.getByRole('button', { name: 'Replace my data' }).click(); await wait(two.p, 800);
const n = await two.p.evaluate(() => JSON.parse(localStorage.getItem('aven.v1')).sessions.length);
assert.equal(n, first.data.sessions.length + 1, 'the new phone got everything back');
await two.p.screenshot({ path: 'shots/drive-2-restored.png' });
const real = [...errors, ...two.errors].filter((e) => !/Failed to load resource/.test(e));
assert.deepEqual(real, [], 'no page errors');
// ── phone 3: the Drive API is off in the Google project — the card says exactly that, with Google's reason ──
const three = await launch({});
await three.p.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: GIS_STUB }));
await three.p.route('https://www.googleapis.com/**', (r) => r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
  : r.fulfill({ status: 403, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ error: { code: 403, message: 'Google Drive API has not been used in project 123 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] } }) }));
await three.p.goto('http://127.0.0.1:5173/'); await wait(three.p, 900); await skipOnboarding(three.p);
await openData(three.p);
await three.p.getByLabel('Google client ID').fill(ID);
await three.p.getByRole('button', { name: 'Connect Google Drive' }).click(); await wait(three.p, 1200);
await three.p.getByRole('button', { name: 'Restore', exact: true }).click(); await wait(three.p, 1200);
assert(await three.p.getByText(/Google Drive API is off/).isVisible(), 'a disabled Drive API is named');
assert(await three.p.getByText('(403 accessNotConfigured)').isVisible(), "with Google's own reason");
await three.p.screenshot({ path: 'shots/drive-3-api-off.png' });
await three.b.close();
console.log('DRIVE OK', { posts: drive.posts, patches: drive.patches });
await two.b.close();
