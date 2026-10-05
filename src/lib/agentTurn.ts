import { useAi } from '../state/ai';
import { useStore } from '../state/store';
import { getKey } from './keys';
import { AiError, FALLBACK_MODELS, aiAgent, aiAgentStream, type Turn } from './gemini';
import { AGENT_SYSTEM, APP_GUIDE, buildAgentContext, exerciseNames } from './coachContext';
import { localActions, validateAgent, type AgentAction } from './agent';
import { mealName } from './derive';
import { dayKey } from './dates';
import type { Exercise, Lang } from './types';

/** Gemini models to try, best first: the strong one for understanding, the fast one for small jobs (estimates). */
export function agentModels(brain: boolean): string[] {
  const m = useAi.getState().models;
  return [...new Set((brain ? [m.brain || FALLBACK_MODELS.brain, m.brainAlt, m.fast || FALLBACK_MODELS.fast] : [m.fast || FALLBACK_MODELS.fast, m.fastAlt, m.brain || FALLBACK_MODELS.brain]).filter(Boolean))];
}

export interface Decision { reply: string; note: string; actions: AgentAction[]; wantsUndo: boolean }

/**
 * What the assistant decides to say and do for one sentence. Gemini when there is a key (given the app guide and a
 * summary of the live data); otherwise — or if Gemini fails — the built-in reader for simple logging. It only DECIDES:
 * the caller runs the actions (runActions) and shows them with Undo. Shared by the Coach chat and the orb screen.
 */
export async function decide(text: string, o: { lang: Lang; t: (k: string, v?: Record<string, string | number>) => string; pool: Exercise[]; history: Turn[]; where: string; signal: AbortSignal; /** the reply so far, while the model is still writing it (the orb screen streams it in) */ onReply?: (partial: string) => void }): Promise<Decision> {
  const st = useStore.getState();
  const g = useAi.getState();
  const { t, lang } = o;
  let reply = '', note = '';
  let actions: AgentAction[] = [];
  if (g.hasGemini) {
    try {
      const today = dayKey(Date.now(), st.settings.dayStartHour);
      const names = new Map(o.pool.map((e) => [e.id, e.name]));
      const mealLabel = (id: string) => { const m = st.settings.meals.find((x) => x.id === id); return m ? mealName(m, lang) : id; };
      const system = `${AGENT_SYSTEM(lang)}\n\nGUIDE:\n${APP_GUIDE}\n\nWHERE THE USER IS: ${o.where}\n\nEXERCISE CATALOG (use these exact names): ${exerciseNames(o.pool).join(', ')}\n\nDATA (computed on this device just now):\n${buildAgentContext(st, today, (id) => names.get(id) ?? id, mealLabel)}`;
      const conv: Turn[] = [...o.history, { role: 'user', parts: [{ text }] }];
      const brain = { key: getKey('gemini'), models: agentModels(true), signal: o.signal };
      // streamed when someone is watching the words arrive; a request the API refuses to stream is asked again the plain way
      const raw = o.onReply
        ? await aiAgentStream(system, conv, brain, o.onReply).catch((e) => { if (e?.code === 'badrequest') return aiAgent(system, conv, brain); throw e; })
        : await aiAgent(system, conv, brain);
      const v = validateAgent(raw);
      if (!v) throw new AiError('invalid');
      reply = v.reply; actions = v.actions;
    } catch (e: any) {
      if (e?.code === 'aborted') throw e;
      const local = localActions(text);
      if (!local) throw e;
      actions = local; note = t('Gemini wasn’t available, so I used the built-in reader.');
    }
  } else {
    const local = localActions(text);
    if (local) actions = local;
    else reply = t('To chat or ask about the app I need a Gemini key (Settings → Voice & AI). I can still log what you tell me, like “200 g skyr” or “bench 80 for 8”.');
  }
  const wantsUndo = actions.some((a) => a.type === 'undo_last');
  return { reply, note, actions: actions.filter((a) => a.type !== 'undo_last'), wantsUndo };
}
