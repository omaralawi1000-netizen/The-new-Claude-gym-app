/**
 * Talking with the orb live: Gemini 3.8 Live Extended Thinking (thinking "low") over one open connection, straight from
 * the phone with the Gemini key from Settings. It hears you while it speaks (interrupt it any time), answers out loud, and
 * logs food through Aven's own logging (the function `log_food`, run by the orb screen, with its usual card and Undo).
 * What both of you said comes back as text (transcripts) for the screen and the shared conversation.
 *
 * First test (Omar, 25 Oct): food only; sets, settings and web search come after his verdict on the Danish and the speed.
 * Audio: the microphone at 16 kHz, 16-bit PCM, sent every ~100 ms; the answer at 24 kHz, played as it arrives and cut
 * the moment the server says it was interrupted. Echo cancellation keeps its own voice out of the microphone.
 */
import { AGENT_FOOD } from './gemini';

export const LIVE_MODEL = 'gemini-3.8-live-extended-thinking';

/** Said to the model after the coach's usual instructions: speak, don't write JSON; what it can do in this test. */
export const LIVE_RULES = `LIVE VOICE (this overrides anything above about answering in JSON, a reply field, look-ups or an actions list):
You are talking out loud with them right now, in real time; they can interrupt you. Just speak — short and natural, like a coach standing next to them: one to three sentences unless they ask for more. Speak the language they speak (Danish or English).
To log food or drink they had, call log_food (one call per meal, every food with its amount exactly as said), then say in a few words that it is logged. Never say something is logged without calling it. Changing or removing food that is already logged isn't possible here yet: say so, and that the Coach chat can do it.
In this test you can only log food. For anything else they want changed (sets, settings, workouts), say you can't do that here yet and that the Coach chat can. A question that needs a long answer or a plan: give the short answer out loud and say the full answer is in the Coach.`;

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
  onError: (code: 'denied' | 'nodevice' | 'connect' | 'closed') => void;
}

export interface LiveSession { stop: () => void }

const b64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The microphone's samples, as they come (an AudioWorklet: off the main thread). */
const WORKLET = `class P extends AudioWorkletProcessor { process(i) { const c = i[0] && i[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } } registerProcessor('aven-pcm', P);`;

export async function startLive(o: { key: string; system: string; voice?: string; handlers: LiveHandlers }): Promise<LiveSession | null> {
  const h = o.handlers;
  let stopped = false;
  // ── the microphone first (asked before anything is paid for) ──
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch (e: any) {
    h.onError(e?.name === 'NotAllowedError' ? 'denied' : 'nodevice');
    return null;
  }
  const inCtx = new AudioContext({ sampleRate: 16000 });
  const outCtx = new AudioContext({ sampleRate: 24000 });
  const cleanupAudio = () => { stream.getTracks().forEach((tr) => tr.stop()); void inCtx.close().catch(() => {}); void outCtx.close().catch(() => {}); };

  // ── the answer's voice: chunks queued back to back, all cut at once on an interruption ──
  let playAt = 0;
  const playing = new Set<AudioBufferSourceNode>();
  const speaking = (on: boolean) => h.onSpeaking(on);
  const play = (pcm: Uint8Array) => {
    const n = pcm.length >> 1;
    if (!n) return;
    const buf = outCtx.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    const dv = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    for (let i = 0; i < n; i++) ch[i] = dv.getInt16(i * 2, true) / 32768;
    const src = outCtx.createBufferSource();
    src.buffer = buf; src.connect(outCtx.destination);
    const at = Math.max(outCtx.currentTime + 0.02, playAt);
    src.start(at); playAt = at + buf.duration;
    if (!playing.size) speaking(true);
    playing.add(src);
    src.onended = () => { playing.delete(src); if (!playing.size) speaking(false); };
  };
  const cut = () => { for (const s of playing) { try { s.stop(); } catch { /* done already */ } } playing.clear(); playAt = 0; speaking(false); };

  // ── the connection ──
  let session: any = null;
  let user = '', reply = '', answering = false;
  try {
    const { GoogleGenAI, Modality, Behavior } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: o.key });
    session = await ai.live.connect({
      model: LIVE_MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        thinkingConfig: { thinkingLevel: 'low' as any },
        systemInstruction: o.system,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        ...(o.voice ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } } } : {}),
        tools: [{ functionDeclarations: [{
          name: 'log_food', behavior: Behavior.NON_BLOCKING,
          description: 'Log food or drink they had: one call per meal, every food with the amount exactly as said.',
          parameters: { type: 'OBJECT', properties: { foods: { type: 'ARRAY', items: AGENT_FOOD }, meal: { type: 'STRING', nullable: true, description: 'breakfast, lunch, dinner or snacks, only if they said one' }, day: { type: 'STRING', nullable: true, description: 'yesterday / today / YYYY-MM-DD, only if they said one' } }, required: ['foods'] } as any,
        }] }],
      },
      callbacks: {
        onmessage: (m: any) => {
          if (stopped) return;
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
          if (sc?.interrupted) cut();
          if (sc?.turnComplete && (!sc.interactionStatus || sc.interactionStatus === 'IDLE')) {
            if (answering || reply) h.onIdle();
            answering = false; user = ''; reply = '';
          }
          for (const fc of m.toolCall?.functionCalls ?? []) {
            startAnswer();
            void h.onTool(fc.name, fc.args ?? {}).then((out) => {
              if (!stopped) session?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { output: out } }] });
            });
          }
        },
        onerror: () => { if (!stopped) h.onError('connect'); },
        onclose: () => { if (!stopped) { stopped = true; cut(); cleanupAudio(); h.onError('closed'); } },
      },
    });
  } catch {
    cleanupAudio();
    if (!stopped) h.onError('connect');
    return null;
  }

  // ── the microphone into the connection: ~100 ms at a time ──
  try {
    await inCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    const node = new AudioWorkletNode(inCtx, 'aven-pcm');
    inCtx.createMediaStreamSource(stream).connect(node);
    let pending: Float32Array[] = [], count = 0;
    node.port.onmessage = (e) => {
      if (stopped) return;
      pending.push(e.data as Float32Array); count += (e.data as Float32Array).length;
      if (count < 1600) return;
      const out = new Int16Array(count); let k = 0;
      for (const c of pending) for (let i = 0; i < c.length; i++) out[k++] = Math.max(-32768, Math.min(32767, Math.round(c[i] * 32767)));
      pending = []; count = 0;
      session.sendRealtimeInput({ audio: { data: b64(new Uint8Array(out.buffer)), mimeType: 'audio/pcm;rate=16000' } });
    };
  } catch {
    stopped = true; try { session.close(); } catch { /* gone */ } cleanupAudio(); h.onError('connect');
    return null;
  }

  return { stop: () => { if (stopped) return; stopped = true; cut(); try { session.close(); } catch { /* gone */ } cleanupAudio(); } };
}
