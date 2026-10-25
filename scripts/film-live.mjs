// A film of the live orb (25 Oct): the orb shrinking as your words arrive word by word, the answer writing in under them,
// a card, then a second exchange below the first. For judging the motion (calm, no jumps, no doubles).
import { launch, wait, skipOnboarding, loadDemo } from './lib.mjs';
const { b, p, ctx } = await launch({ record: true });
const voice = Buffer.alloc(4800).toString('base64');
let mine = 0, idx = -1, setups = 0;
await p.routeWebSocket(/BidiGenerateContent/, (ws) => {
  const say = (o) => ws.send(JSON.stringify(o));
  ws.onMessage((raw) => {
    const m = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
    if (m.setup) { idx = setups++; say({ setupComplete: {} }); return; }
    if (m.toolResponse) { say({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: voice } }] }, outputTranscription: { text: 'Logget: 2 æg og en banan, ' } } }); setTimeout(() => say({ serverContent: { outputTranscription: { text: 'godt valg før træning.' } } }), 500); setTimeout(() => say({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } }), 900); return; }
    if (!m.realtimeInput?.audio || idx !== setups - 1) return;
    mine++;
    const words = ['log', 'to', 'æg', 'og', 'en', 'banan'];
    if (mine >= 20 && mine < 20 + words.length * 3 && (mine - 20) % 3 === 0) say({ serverContent: { inputTranscription: { text: (mine === 20 ? '' : ' ') + words[(mine - 20) / 3] } } });
    if (mine === 20 + words.length * 3) say({ toolCall: { functionCalls: [{ id: 'c1', name: 'aven', args: { actions: [{ type: 'log_food', foods: [{ name: 'æg', amount: 2, unit: 'piece' }, { name: 'banan', amount: 1, unit: 'piece' }] }] } }] } });
    if (mine === 80) { say({ serverContent: { inputTranscription: { text: 'hvor meget protein' } } }); say({ serverContent: { inputTranscription: { text: ' mangler jeg' } } }); }
    if (mine === 84) { say({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: voice } }] }, outputTranscription: { text: 'Omkring 60 gram endnu i dag.' } } }); setTimeout(() => say({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } }), 400); }
  });
});
await p.goto('http://127.0.0.1:5173/'); await wait(p, 900); await skipOnboarding(p); await loadDemo(p);
await p.evaluate(() => { localStorage.setItem('aven.keys', JSON.stringify({ gemini: 'AIzaTESTKEY' })); localStorage.setItem('aven.ai', JSON.stringify({ liveOrb: true })); });
await p.reload(); await wait(p, 1500);
const t0 = Date.now();
await p.getByRole('button', { name: 'Dictate' }).first().click();
await wait(p, 13000);
console.log('started at', (Date.now() - t0) / 1000);
const v = p.video(); await ctx.close(); await b.close();
console.log('FILM', await v.path());
