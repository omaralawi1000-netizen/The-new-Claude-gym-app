import { create } from 'zustand';
import { getKey, onKeysChange } from '../lib/keys';

/** AI preferences (not secrets). Stored beside, but separate from, the app data so exports stay clean of anything account-like. */
const KEY = 'aven.ai';
export interface AiPrefs {
  stt: 'accurate' | 'fast';          // Groq whisper-large-v3 vs whisper-large-v3-turbo
  voiceLang: 'auto' | 'da' | 'en';   // speech-to-text language
  mic: 'phone' | 'any';              // phone: record with the phone's own mic even when earbuds are connected (keeps them out of call mode)
  voice: string;                     // Gemini prebuilt voice for the ▶ read-aloud button (never automatic)
  brain: boolean;                    // use Gemini to understand dictation (falls back to the local parser on any failure)
  solFirst: boolean;                 // with an OpenAI key: GPT-6.1 Sol answers the orb and the Coach (Gemini is the fallback)
  effortOrb: 'medium' | 'high';      // how hard Sol thinks for the orb (speed matters: medium)
  effortCoach: 'medium' | 'high';    // …and in the Coach (depth matters: high)
  solLimitKr: number;                // Sol rests (Gemini answers) once this month's estimated spend reaches this; 0 = no limit
  models: { fast: string; brain: string; fastAlt: string; brainAlt: string; tts: string };
}
const DEFAULTS: AiPrefs = { stt: 'accurate', voiceLang: 'auto', mic: 'phone', voice: 'Achird', brain: true, solFirst: true, effortOrb: 'medium', effortCoach: 'high', solLimitKr: 100, models: { fast: '', brain: '', fastAlt: '', brainAlt: '', tts: '' } };

function load(): AiPrefs {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...v, models: { ...DEFAULTS.models, ...(v.models ?? {}) } }; } catch { return DEFAULTS; }
}
interface S extends AiPrefs { hasGroq: boolean; hasGemini: boolean; hasOpenai: boolean; patch: (p: Partial<AiPrefs>) => void }
export const useAi = create<S>((set, get) => ({
  ...load(),
  hasGroq: !!getKey('groq'),
  hasGemini: !!getKey('gemini'),
  hasOpenai: !!getKey('openai'),
  patch: (p) => {
    set(p as Partial<S>);
    const { stt, voiceLang, mic, voice, brain, solFirst, effortOrb, effortCoach, solLimitKr, models } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ stt, voiceLang, mic, voice, brain, solFirst, effortOrb, effortCoach, solLimitKr, models })); } catch { /* ignore */ }
  },
}));
onKeysChange(() => useAi.setState({ hasGroq: !!getKey('groq'), hasGemini: !!getKey('gemini'), hasOpenai: !!getKey('openai') }));
/** GPT-6.1 Sol is the brain right now: there is an OpenAI key and it hasn't been switched to Gemini. */
export const solOn = (a: Pick<S, 'hasOpenai' | 'solFirst'> = useAi.getState()) => a.hasOpenai && a.solFirst;
/** Any brain at all (Sol or Gemini) to talk to. */
export const anyBrain = (a: Pick<S, 'hasOpenai' | 'hasGemini' | 'solFirst'> = useAi.getState()) => solOn(a) || a.hasGemini;
