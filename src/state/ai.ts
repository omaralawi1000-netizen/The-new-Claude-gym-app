import { create } from 'zustand';
import { getKey, onKeysChange } from '../lib/keys';

/** AI preferences (not secrets). Stored beside, but separate from, the app data so exports stay clean of anything account-like. */
const KEY = 'aven.ai';
export interface AiPrefs {
  stt: 'accurate' | 'fast';          // Groq whisper-large-v3 vs whisper-large-v3-turbo
  voiceLang: 'auto' | 'da' | 'en';   // speech-to-text language
  speak: boolean;                    // Coach replies spoken with Gemini TTS
  voice: string;                     // Gemini prebuilt voice
  brain: boolean;                    // use Gemini to understand dictation (falls back to the local parser on any failure)
  models: { fast: string; brain: string; fastAlt: string; brainAlt: string; tts: string };
}
const DEFAULTS: AiPrefs = { stt: 'accurate', voiceLang: 'auto', speak: false, voice: 'Achird', brain: true, models: { fast: '', brain: '', fastAlt: '', brainAlt: '', tts: '' } };

function load(): AiPrefs {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...v, models: { ...DEFAULTS.models, ...(v.models ?? {}) } }; } catch { return DEFAULTS; }
}
interface S extends AiPrefs { hasGroq: boolean; hasGemini: boolean; patch: (p: Partial<AiPrefs>) => void }
export const useAi = create<S>((set, get) => ({
  ...load(),
  hasGroq: !!getKey('groq'),
  hasGemini: !!getKey('gemini'),
  patch: (p) => {
    set(p as Partial<S>);
    const { stt, voiceLang, speak, voice, brain, models } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ stt, voiceLang, speak, voice, brain, models })); } catch { /* ignore */ }
  },
}));
onKeysChange(() => useAi.setState({ hasGroq: !!getKey('groq'), hasGemini: !!getKey('gemini') }));
