import { create } from 'zustand';

export type VoicePhase = 'idle' | 'requesting' | 'listening' | 'processing' | 'review' | 'confirmed' | 'error' | 'unavailable';
export type VoiceMode = 'food' | 'workout';

interface Voice {
  phase: VoicePhase;
  /** timestamp the phase was entered (drives one-shot animations like the confirm ripple) */
  since: number;
  /** true only while the real microphone stream is live */
  micLive: boolean;
  set: (p: Partial<Voice>) => void;
  go: (phase: VoicePhase) => void;
}

export const useVoice = create<Voice>((set) => ({
  phase: 'idle',
  since: 0,
  micLive: false,
  set: (p) => set(p),
  go: (phase) => set({ phase, since: performance.now() }),
}));
