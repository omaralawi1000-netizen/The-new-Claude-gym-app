/**
 * Talking with the orb live: Gemini 3.8 Live Extended Thinking (thinking "low") over one open connection, straight from
 * the phone with the Gemini key from Settings. It hears you while it speaks (interrupt it any time), answers out loud, and
 * does what the Coach does through Aven's own actions (the function `aven`, run by the orb screen, with the usual cards and
 * Undo), looks things up in your history (`look_up`) and searches the web (Google Search). What both of you said comes
 * back as text (transcripts), Danish or English only.
 *
 * Audio: the microphone at 16 kHz, 16-bit PCM, sent every ~100 ms; the answer at 24 kHz, played as it arrives and cut
 * the moment the server says it was interrupted. A gate (micGate.ts) keeps its own voice and the room's music out of the microphone.
 * Camera (optional): one picture a second, 640 px JPEG. The connection is renewed quietly when the server asks (goAway)
 * or drops, carrying the conversation over (session resumption); the context slides, so a visit has no time limit.
 */
import { AGENT_SCHEMA } from './gemini';
import { createMicGate } from './micGate';

export const LIVE_MODEL = 'gemini-3.8-live-extended-thinking';

/** Said to the model after the coach's usual instructions: speak, don't write JSON; how it acts in Aven. */
export const LIVE_RULES = `LIVE VOICE (this overrides anything above about answering in JSON, a reply field, look-ups or an actions list):
You are their coach, talking with them out loud right now; they can interrupt you. Everything above about how to coach still holds — only the format changes.
BE THEIR COACH, NOT A CHATBOT (Omar, 25 Oct: generic lines like "Everything is going great today" or "That's a solid move" are wrong):
- Answer what they actually said, with their own numbers from DATA (today's kcal and protein left, the last session, the plan, tomorrow's training). Never a line that would fit anyone.
- When they mention food or drink they're having or had ("I'm eating skyr", "jeg har lige spist en banan"), that's a log: log it with aven (best estimate of the amount if they didn't say; a usual portion), then say what it does for today in a few words ("Logged 250 g skyr — 52 g protein left today"). If the amount really matters and can't be guessed, ask once.
- The same for sets, weight, water and activities they mention: do it, then say so.
- Small talk ("what's up?", "dude"): one short warm sentence, with one specific thing from DATA only if it fits naturally.
- Never narrate what you're doing ("Let me look that up", "I'm reviewing your data"): just do it and answer. Never filler. Never repeat their words back.
LENGTH, like the Gemini app (Omar, 26 Oct: answers were too long). The shortest answer that fully answers, and not shorter:
- The answer comes first, in the first sentence. Most answers are ONE sentence; a log is a few words.
- Two or three short sentences only when one can't hold it: a "why" or "how", a choice with its reason, a number plus what to do about it.
- Longer only when they ask for it ("explain", "in detail", "go deeper", "forklar", "uddyb", "hvorfor præcis") or the question really needs steps; then short points, and offer the full version in the Coach chat instead of reading out a list.
- Nothing they didn't ask for: no extra tips, no encouragement tacked on, no summary, no "let me know if…". If they want more, they'll ask.
LANGUAGE: only Danish or English, never any other. Answer in the language of their latest sentence; a sentence that mixes both ("log 200 g skyr", "bænkpres 80 kilo") is in the language most of its words are in; a food or exercise name in the other language doesn't change it. If a sentence sounded like another language (German, Norwegian, Swedish, Dutch…), it was Danish. Words that sound like a name may be a food ("Skyler" is skyr).
To change anything in Aven (log food, water, weight, sets or an activity, start or finish a workout, change a setting, a routine, the plan — everything listed under actions above), call the function aven with the actions, exactly as you would have put them in the actions list, then say in a few words what you did. Never say something is done without calling it. A change that needs their Apply shows a card: tell them to tap Apply.
To see data that isn't in DATA (older days, a lift's history, the whole plan, settings, what they said before), call look_up first and answer from what comes back.
For facts from outside Aven (a product's nutrition, opening hours, news, prices) use Google Search.
If the camera is on, you see what they point it at (a plate, a label, a machine): use it ("log this" means what you see, with your best estimate of the amounts).`;

export interface LiveHandlers {
  /** what they are saying, so far (the whole utterance) */
  onUserText: (text: string) => void;
  /** the model started answering this turn (first sound, words or action) */
  onTurnStart: () => void;
  /** what it is saying, so far, this turn */
  onReplyText: (text: string) => void;
  /** it wants to do something: run it and say what happened (a short text for the model) */
  onTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** its voice started or stopped playing */
  onSpeaking: (on: boolean) => void;
  /** the turn is finished and nothing more is coming */
  onIdle: () => void;
  /** you spoke over it: this answer was cut off (onIdle follows) */
  onInterrupted?: () => void;
  /** the token counts for a finished turn (for the monthly spend) */
  onUsage?: (usage: unknown) => void;
  /** you are being heard (true: you started talking, it's sending you) or not any more */
  onHearing?: (on: boolean) => void;
  /** renewing the connection (true) / back (false) */
  onReconnecting?: (on: boolean) => void;
  onError: (code: 'denied' | 'nodevice' | 'connect' | 'closed') => void;
}

export interface LiveSession {
  stop: () => void;
  /** stop sending the microphone (true) or start again */
  setMuted: (on: boolean) => void;
  /** the camera on (resolves to its stream, for the preview) or off; null when it can't be had */
  setCamera: (on: boolean) => Promise<MediaStream | null>;
  /** stop its voice now (it was tapped): the rest of this answer isn't played */
  hush: () => void;
  /** a typed message and its answer (from the Coach), so it knows about them when you speak again */
  note: (said: string, reply: string) => void;
  /** how loud you are (0..1) and your voice in 16 bands, and how loud its voice is (0..1) and its 16 bands, right now: for the orb */
  levels: () => { in: number; bands: Float32Array; out: number; obands: Float32Array };
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => new Promise<T>((ok, no) => { const t = setTimeout(() => no(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); no(e); }); });
const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The microphone's samples, as they come (an AudioWorklet: off the main thread). */
const WORKLET = `class P extends AudioWorkletProcessor { process(i) { const c = i[0] && i[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('aven-pcm', P);`;

/** The functions it may call: everything the Coach does (its own actions schema), and its look-ups. */
const TOOLS = (Behavior: any) => [
  { functionDeclarations: [
    {
      name: 'aven', behavior: Behavior.NON_BLOCKING,
      description: 'Do things in Aven: the same actions the Coach uses (log_food, log_sets, log_current_set, set_setting, start_workout, …). One call can carry several actions.',
      parameters: { type: 'OBJECT', properties: { actions: (AGENT_SCHEMA.properties as any).actions }, required: ['actions'] },
    },
    {
      name: 'look_up',
      description: 'Look up data that is not in DATA: older days, a lift\'s history, the plan, settings, what they said before.',
      parameters: { type: 'OBJECT', properties: { lookups: { ...(AGENT_SCHEMA.properties as any).lookups, nullable: false } }, required: ['lookups'] },
    },
  ] },
  { googleSearch: {} },
];

export async function startLive(o: { key: string; system: string; voice?: string; lang?: 'en' | 'da'; vocabulary?: string[]; handlers: LiveHandlers }): Promise<LiveSession | null> {
  const h = o.handlers;
  let stopped = false;
  // ── the microphone first (asked before anything is paid for) ──
  let stream: MediaStream;
  try {
    // (no echo cancelling: on Android, Chrome's echo cancelling puts the whole app in "phone call" mode, so the answer
    // played at the quiet call volume and the volume keys moved the call volume (Omar, 26 Oct; Chromium issue 443255997).
    // Without it the answer plays at the media volume, and the echo gate below keeps it from hearing its own voice.)
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
  } catch (e: any) {
    h.onError(e?.name === 'NotAllowedError' ? 'denied' : 'nodevice');
    return null;
  }
  const inCtx = new AudioContext({ sampleRate: 16000 });
  const outCtx = new AudioContext({ sampleRate: 24000 });
  // the orb reads both voices: yours (16 bands, from the microphone) and its own (what plays)
  const inAn = inCtx.createAnalyser(); inAn.fftSize = 256; inAn.smoothingTimeConstant = 0.6;
  const outAn = outCtx.createAnalyser(); outAn.fftSize = 256; outAn.smoothingTimeConstant = 0.7;
  outAn.connect(outCtx.destination);
  const inBuf = new Uint8Array(inAn.frequencyBinCount), outBuf = new Uint8Array(outAn.fftSize), outFreq = new Uint8Array(outAn.frequencyBinCount);
  const bands = new Float32Array(16), obands = new Float32Array(16);
  let lvAt = 0, lvLast: { in: number; bands: Float32Array; out: number; obands: Float32Array } | null = null;
  let cam: MediaStream | null = null, camTimer: ReturnType<typeof setInterval> | null = null;
  const camOff = () => { if (camTimer) clearInterval(camTimer); camTimer = null; cam?.getTracks().forEach((tr) => tr.stop()); cam = null; };
  const cleanupAudio = () => { camOff(); stream.getTracks().forEach((tr) => tr.stop()); void inCtx.close().catch(() => {}); void outCtx.close().catch(() => {}); };

  // ── the answer's voice: chunks queued back to back, all cut at once on an interruption ──
  let playAt = 0;
  const playing = new Set<AudioBufferSourceNode>();
  let hushed = false; // tapped quiet: the rest of this answer isn't played
  const play = (pcm: Uint8Array) => {
    const n = pcm.length >> 1;
    if (!n || hushed) return;
    const buf = outCtx.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    const dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    const src = outCtx.createBufferSource();
    src.buffer = buf; src.connect(outAn);
    const at = Math.max(outCtx.currentTime + 0.02, playAt);
    src.start(at); playAt = at + buf.duration;
    if (!playing.size) h.onSpeaking(true);
    playing.add(src);
    src.onended = () => { playing.delete(src); if (!playing.size) h.onSpeaking(false); };
  };
  const cut = () => { for (const s of playing) { try { s.stop(); } catch { /* done already */ } } playing.clear(); playAt = 0; h.onSpeaking(false); };

  // ── the connection (renewed quietly, carrying the conversation over) ──
  const { GoogleGenAI, Modality, Behavior } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: o.key });
  let session: any = null;
  let ready = false; // a connection is open to send to
  let handle: string | undefined; // for carrying the conversation over to a new connection
  let user = '', reply = '', answering = false, usage: unknown = null;
  let tries = 0;
  let heard = false; // anything ever came back on a connection
  let gen = 0; // which connection is the current one (an old one's late close must not start another)
  const connect = async (): Promise<boolean> => {
    const mine = ++gen;
    try {
      // (a connection that never answers counts as none after 8 s: the normal orb takes over instead of a silent wait)
      session = await withTimeout(ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          thinkingConfig: { thinkingLevel: 'low' as any },
          systemInstruction: o.system,
          // only Danish or English: left to guess, it once wrote Danish down as German ("Hi, wer denn gerade?", 25 Oct)
          // (the app's language first: the one it leans to when a word could be either)
          // (and the words it will hear from you: your foods and lifts — it wrote "skyr" as "Skyler", 25 Oct)
          inputAudioTranscription: { languageCodes: o.lang === 'en' ? ['en-US', 'da-DK'] : ['da-DK', 'en-US'], ...(o.vocabulary?.length ? { customVocabulary: o.vocabulary.slice(0, 100) } : {}) },
          outputAudioTranscription: {},
          // (only a clear voice starts your turn, not the room: music once kept it listening, 26 Oct; what goes up is already
          // only you, see the gate below)
          realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: 'START_SENSITIVITY_LOW' as any, prefixPaddingMs: 120 }, turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY' as any },
          sessionResumption: handle ? { handle } : {},
          contextWindowCompression: { slidingWindow: {} },
          ...(o.voice ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } } } : {}),
          tools: TOOLS(Behavior) as any,
        },
        callbacks: {
          onmessage: (m: any) => {
            if (stopped || mine !== gen) return;
            heard = true;
            if (m.sessionResumptionUpdate?.resumable && m.sessionResumptionUpdate.newHandle) handle = m.sessionResumptionUpdate.newHandle;
            if (m.goAway) void renew();
            if (m.usageMetadata) usage = m.usageMetadata;
            const sc = m.serverContent;
            if (sc?.inputTranscription?.text) {
              // a new utterance after a finished answer starts fresh
              if (!answering && !user) reply = '';
              user += sc.inputTranscription.text; h.onUserText(user.trim());
            }
            const startAnswer = () => { if (!answering) { answering = true; h.onTurnStart(); } };
            for (const p of sc?.modelTurn?.parts ?? []) {
              if (p.inlineData?.data && /audio/.test(p.inlineData.mimeType ?? 'audio')) { startAnswer(); play(unb64(p.inlineData.data)); }
            }
            if (sc?.outputTranscription?.text) { startAnswer(); reply += sc.outputTranscription.text; h.onReplyText(reply.trim()); }
            // interrupted: that answer ends here (what you say now is a new sentence, in its own bubble)
            if (sc?.interrupted) { cut(); hushed = false; if (answering || reply) { h.onInterrupted?.(); h.onIdle(); } answering = false; user = ''; reply = ''; }
            if (sc?.turnComplete && (!sc.interactionStatus || sc.interactionStatus === 'IDLE')) {
              if (answering || reply) h.onIdle();
              if (usage) { h.onUsage?.(usage); usage = null; }
              answering = false; user = ''; reply = ''; hushed = false;
            }
            for (const fc of m.toolCall?.functionCalls ?? []) {
              startAnswer();
              void h.onTool(fc.name, fc.args ?? {}).then((out) => {
                if (!stopped && ready) session?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { output: out } }] });
              });
            }
          },
          onerror: () => { /* onclose follows */ },
          onclose: () => { if (mine !== gen) return; ready = false; if (!stopped) void renew(); },
        },
      }), 8000);
      ready = true; tries = 0;
      return true;
    } catch {
      ready = false;
      return false;
    }
  };
  let renewing = false;
  /** a new connection, quietly (the conversation carries over); three tries, then it says so */
  const renew = async () => {
    if (renewing || stopped) return;
    renewing = true; ready = false; h.onReconnecting?.(true);
    const old = session; gen++; // (its close is now an old one's)
    try { old?.close(); } catch { /* gone */ }
    while (!stopped && tries < 3) {
      tries++;
      await new Promise((r) => setTimeout(r, 400 * tries));
      if (stopped) break;
      if (await connect()) { renewing = false; h.onReconnecting?.(false); return; }
    }
    renewing = false;
    // (never heard a word from it: as good as never connected, so the normal orb takes over)
    if (!stopped) { stopped = true; cut(); cleanupAudio(); h.onError(heard ? 'closed' : 'connect'); }
  };
  if (!(await connect())) { cleanupAudio(); if (!stopped) h.onError('connect'); return null; }

  // Only you go up (lib/micGate.ts): not its own voice coming back through the speaker, not the room's music. What played
  // is measured over ~85 ms each time (the loudest of the last three: the speaker and the microphone run a little late).
  const gate = createMicGate();
  const outGate = outCtx.createAnalyser(); outGate.fftSize = 2048; outAn.connect(outGate);
  const outF = new Float32Array(outGate.fftSize), outLast = [0, 0, 0];
  const TAIL = 0.3 + Math.min(0.3, (outCtx as any).outputLatency || 0.05); // (the room still rings, the speaker runs late)
  let tailUntil = 0, wasHearing = false, heardK = 0.3;
  const echoNow = () => {
    outGate.getFloatTimeDomainData(outF); let q = 0; for (let i = 0; i < outF.length; i++) q += outF[i] * outF[i];
    outLast.shift(); outLast.push(Math.sqrt(q / outF.length)); return Math.max(...outLast);
  };

  // ── the microphone into the connection: ~100 ms at a time ──
  let muted = false;
  try {
    await inCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    const node = new AudioWorkletNode(inCtx, 'aven-pcm');
    const micSrc = inCtx.createMediaStreamSource(stream); micSrc.connect(node); micSrc.connect(inAn);
    let pending: Float32Array[] = [], count = 0;
    const held: Int16Array[] = []; // the last 0.2 s, kept back: sent when you turn out to have started talking
    const send = (pcm: Int16Array) => { try { session.sendRealtimeInput({ audio: { data: b64(new Uint8Array(pcm.buffer)), mimeType: 'audio/pcm;rate=16000' } }); } catch { /* renewing */ } };
    node.port.onmessage = (e) => {
      if (stopped) return;
      if (muted || !ready) { pending = []; count = 0; held.length = 0; return; }
      pending.push(e.data as Float32Array); count += (e.data as Float32Array).length;
      if (count < 1600) return;
      const out = new Int16Array(count), frames: number[] = []; let k = 0, sq = 0;
      for (const c of pending) {
        let fq = 0;
        for (let i = 0; i < c.length; i++) { fq += c[i] * c[i]; out[k++] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767))); }
        sq += fq; frames.push(Math.sqrt(fq / Math.max(1, c.length)));
      }
      pending = []; count = 0;
      if (playing.size) tailUntil = outCtx.currentTime + TAIL;
      const talking = playing.size > 0 || outCtx.currentTime < tailUntil;
      const say = gate.step({ frames, rms: Math.sqrt(sq / Math.max(1, k)), echo: talking ? echoNow() : 0, talking });
      // (silence goes up when it isn't you: the stream never stops, so it hears that you stopped)
      if (say === 'open') { for (const c of held) send(c); held.length = 0; send(out); }
      else if (say === 'send') send(out);
      else { send(new Int16Array(out.length)); held.push(out); if (held.length > 2) held.shift(); }
      if (gate.hearing !== wasHearing) { wasHearing = gate.hearing; h.onHearing?.(wasHearing); }
    };
  } catch {
    stopped = true; try { session.close(); } catch { /* gone */ } cleanupAudio(); h.onError('connect');
    return null;
  }

  // ── the camera: one picture a second while it's on ──
  const canvas = document.createElement('canvas');
  const setCamera = async (on: boolean): Promise<MediaStream | null> => {
    if (!on || stopped) { camOff(); return null; }
    if (cam) return cam;
    try { cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } }); } catch { return null; }
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.srcObject = cam; void v.play().catch(() => {});
    camTimer = setInterval(() => {
      if (stopped || !ready || !v.videoWidth) return;
      const w = 640, hgt = Math.round((v.videoHeight / v.videoWidth) * w);
      canvas.width = w; canvas.height = hgt;
      canvas.getContext('2d')?.drawImage(v, 0, 0, w, hgt);
      const data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
      try { session.sendRealtimeInput({ video: { data, mimeType: 'image/jpeg' } }); } catch { /* renewing */ }
    }, 1000);
    return cam;
  };

  return {
    stop: () => { if (stopped) return; stopped = true; cut(); try { session.close(); } catch { /* gone */ } cleanupAudio(); },
    setMuted: (on) => {
      muted = on;
      if (on && ready) { try { session.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* renewing */ } }
    },
    setCamera,
    hush: () => { hushed = true; cut(); },
    levels: () => {
      // (the orb and the bottom light both ask each frame: measured once per frame)
      const t = performance.now();
      if (t - lvAt < 6 && lvLast) return lvLast;
      lvAt = t;
      // (the orb answers only you: a little of the room, almost none of its own voice coming back)
      const talking = playing.size > 0 || outCtx.currentTime < tailUntil;
      const want = gate.hearing ? 1 : talking ? 0.08 : 0.3;
      heardK += (want - heardK) * (want > heardK ? 0.5 : 0.08);
      // yours: the speech range (≈80 Hz–4 kHz of 8 kHz) in 16 bands, a soft gate under room noise
      inAn.getByteFrequencyData(inBuf);
      let sum = 0;
      for (let i = 0; i < 16; i++) {
        const a = 1 + i * 3, b = a + 3; let x = 0;
        for (let k = a; k < b; k++) x += inBuf[k];
        const v = Math.max(0, x / (3 * 255) - 0.12) / 0.88;
        bands[i] = muted || stopped ? 0 : v * heardK; sum += bands[i];
      }
      // its own: loudness of what plays
      outAn.getByteTimeDomainData(outBuf);
      let e = 0; for (let k = 0; k < outBuf.length; k++) { const d = (outBuf[k] - 128) / 128; e += d * d; }
      // and its voice's own pitches (≈90 Hz–4.5 kHz in 16 bands), so its low voice and its bright sounds move it differently
      outAn.getByteFrequencyData(outFreq);
      for (let i = 0; i < 16; i++) { const a = 1 + i * 3; let x = 0; for (let k = a; k < a + 3; k++) x += outFreq[k]; obands[i] = stopped ? 0 : Math.max(0, x / (3 * 255) - 0.1) / 0.9; }
      lvLast = { obands, in: Math.min(1, (sum / 16) * 1.8), bands, out: Math.min(1, Math.sqrt(e / outBuf.length) * 4) };
      return lvLast;
    },
    note: (said, reply) => {
      if (!ready || !said.trim()) return;
      try { session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: `(typed) ${said}` }] }, ...(reply.trim() ? [{ role: 'model', parts: [{ text: reply }] }] : [])], turnComplete: false }); } catch { /* renewing */ }
    },
  };
}

/** Gemini 3.8 Live Extended Thinking, USD per million tokens (third-party price lists, Oct 2026; Google's own page
 *  wasn't reachable to check): text in 0.75 / out 4.50 (thinking included), audio in 3 / out 12, pictures in 1. */
export const LIVE_PRICE = { textIn: 0.75, textOut: 4.5, audioIn: 3, audioOut: 12, imageIn: 1 };

/** The cost of one live turn from its usageMetadata, in USD (by kind where it says, else all priced as audio: never under). */
export function liveCost(u: any): number {
  if (!u || typeof u !== 'object') return 0;
  const by = (list: any[] | undefined, prices: Record<string, number>, fallback: number, total: number) => {
    if (!Array.isArray(list) || !list.length) return total * fallback;
    let usd = 0, seen = 0;
    for (const d of list) {
      const n = Number(d?.tokenCount) || 0; seen += n;
      usd += n * (prices[String(d?.modality ?? '').toUpperCase()] ?? fallback);
    }
    return usd + Math.max(0, total - seen) * fallback;
  };
  const inTotal = Number(u.promptTokenCount) || 0;
  const outTotal = (Number(u.responseTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0);
  const inUsd = by(u.promptTokensDetails, { TEXT: LIVE_PRICE.textIn, AUDIO: LIVE_PRICE.audioIn, IMAGE: LIVE_PRICE.imageIn, VIDEO: LIVE_PRICE.imageIn }, LIVE_PRICE.audioIn, inTotal);
  const outUsd = by(u.responseTokensDetails, { TEXT: LIVE_PRICE.textOut, AUDIO: LIVE_PRICE.audioOut }, LIVE_PRICE.audioOut, outTotal);
  return (inUsd + outUsd) / 1e6;
}
