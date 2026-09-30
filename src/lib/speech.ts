/** Thin wrapper over the (prefixed) Web Speech API. Availability and behaviour differ by browser; errors are surfaced, never hidden. */
export type SpeechError = 'unsupported' | 'denied' | 'network' | 'no-speech' | 'audio' | 'aborted' | 'other';

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface SpeechHandle { stop: () => void; abort: () => void }

export function startSpeech(opts: {
  lang: string;
  onText: (finalText: string, interim: string) => void;
  onError: (e: SpeechError) => void;
  onEnd: () => void;
  onStart?: () => void;
}): SpeechHandle | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = opts.lang;
  r.interimResults = true;
  r.continuous = true;
  r.maxAlternatives = 1;
  let finalText = '';
  let ended = false;
  r.onresult = (ev: any) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const res = ev.results[i];
      if (res.isFinal) finalText += (finalText ? ' ' : '') + res[0].transcript.trim();
      else interim += res[0].transcript;
    }
    opts.onText(finalText, interim.trim());
  };
  r.onstart = () => opts.onStart?.();
  r.onerror = (ev: any) => {
    const e = ev?.error as string;
    opts.onError(e === 'not-allowed' || e === 'service-not-allowed' ? 'denied' : e === 'network' ? 'network' : e === 'no-speech' ? 'no-speech' : e === 'audio-capture' ? 'audio' : e === 'aborted' ? 'aborted' : 'other');
  };
  r.onend = () => { if (!ended) { ended = true; opts.onEnd(); } };
  try { r.start(); } catch { opts.onError('other'); return null; }
  return {
    stop: () => { try { r.stop(); } catch { /* ignore */ } },
    abort: () => { ended = true; try { r.abort(); } catch { /* ignore */ } },
  };
}
