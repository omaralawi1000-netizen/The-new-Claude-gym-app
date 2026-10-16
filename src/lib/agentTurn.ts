import { useAi, solOn } from '../state/ai';
import { useStore } from '../state/store';
import { getKey } from './keys';
import { AiError, FALLBACK_MODELS, aiAgent, aiAgentStream, type Brain, type Photo, type Turn } from './gemini';
import { refreshSolModel, solAgent, type Effort } from './openai';
import { solThenGemini } from './brain';
import { overLimit } from './spend';
import { AGENT_SYSTEM, APP_GUIDE, buildAgentContext, buildTodayContext, exerciseNames, memoryBlock } from './coachContext';
import { learnedBlock } from './ledger';
import { reviewsBlock } from './weekReview';
import { localActions, validateAgent, type AgentAction } from './agent';
import { lookupStatus, runLookups, validateLookups, type SaidLine } from './agentLookup';
import { mealName } from './derive';
import { dayKey } from './dates';
import type { Exercise, Lang } from './types';

/** Gemini models to try, best first: the strong one for understanding, the fast one for small jobs (estimates). */
export function agentModels(brain: boolean): string[] {
  const m = useAi.getState().models;
  return [...new Set((brain ? [m.brain || FALLBACK_MODELS.brain, m.brainAlt, m.fast || FALLBACK_MODELS.fast] : [m.fast || FALLBACK_MODELS.fast, m.fastAlt, m.brain || FALLBACK_MODELS.brain]).filter(Boolean))];
}

/**
 * The AI for a job, or null when there is none: GPT-6.1 Sol first when it is on (thinking as hard as the surface asks), with
 * Gemini as its fallback; Gemini alone otherwise. `big`: the strong Gemini model first (understanding), else the fast one.
 */
export function brainFor(o: { big: boolean; surface: 'orb' | 'coach'; signal?: AbortSignal }): Brain | null {
  const g = useAi.getState();
  // past this month's spending limit Sol rests and Gemini answers (decide() says so)
  const sol = solOn(g) && !overLimit(g.solLimitKr) ? { key: getKey('openai'), effort: o.surface === 'coach' ? g.effortCoach : g.effortOrb } : undefined;
  if (sol?.key) void refreshSolModel(sol.key); // a newer model on the account is picked up (at most one look a day)
  if (!sol && !g.hasGemini) return null;
  return { key: g.hasGemini ? getKey('gemini') : '', models: agentModels(o.big), signal: o.signal, sol };
}

/**
 * How hard Sol should think about THIS message. Small talk, logging and quick questions ("yo, how's my week?", "only 9
 * reps", "log a banana") answer at low effort, in a second or two; planning, analysis and advice ("build me a push day",
 * "why is my bench stuck?") get the effort set in Settings. It never thinks harder than that setting.
 */
const DEEP = /\b(plan|program|programme|routine|split|periodi[sz]|deload|plateau|stall|stuck|why|should i|analy[sz]|review|compare|improve|advice|recommend|build|design|diet|cut|bulk|injur|pain|hurt|weak ?point|progress(ion)?)\w*|\b(hvorfor|skal jeg|analys|forbedr|anbefal|kost|skade|ondt|byg|lav en|program|rutine|plan)\w*/i;
export function effortFor(text: string, setting: Effort, photo = false): Effort {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const cap = (e: Effort): Effort => (rank[e] <= rank[setting] ? e : setting);
  if (photo) return setting; // reading a label or a machine needs care
  const words = text.trim().split(/\s+/).length;
  if (DEEP.test(text)) return setting;
  return words > 40 ? cap('medium') : 'low';
}

/** Rounds per message: up to two rounds of look-ups, then the answer. */
const MAX_ROUNDS = 3;

export interface Decision { reply: string; note: string; actions: AgentAction[]; wantsUndo: boolean }

/**
 * What the assistant decides to say and do for one sentence. The AI when there is a key — GPT-6.1 Sol or Gemini, given the
 * app guide and a summary of the live data; otherwise — or if the AI fails — the built-in reader for simple logging. It only DECIDES:
 * the caller runs the actions (runActions) and shows them with Undo. Shared by the Coach chat and the orb screen.
 */
export async function decide(text: string, o: { lang: Lang; t: (k: string, v?: Record<string, string | number>) => string; pool: Exercise[]; history: Turn[]; where: string; signal: AbortSignal; /** the orb thinks fast (medium), the Coach deeper (high) */ surface: 'orb' | 'coach'; /** the reply so far, while the model is still writing it (the orb screen streams it in) */ onReply?: (partial: string) => void; /** a photo sent with this message (the Coach's camera) */ photo?: Photo;
  /** a few words while it looks something up in the data ("Looking at your bench press history…"); '' when done */ onStatus?: (s: string) => void;
  /** the whole saved conversation, for the `conversations` look-up (what they said before) */ said?: SaidLine[] }): Promise<Decision> {
  const st = useStore.getState();
  const g = useAi.getState();
  const { t, lang } = o;
  let reply = '', note = '';
  let actions: AgentAction[] = [];
  const brain0 = brainFor({ big: true, surface: o.surface, signal: o.signal });
  // think only as hard as the message needs (see effortFor)
  const brain = brain0?.sol ? { ...brain0, sol: { ...brain0.sol, effort: effortFor(text, brain0.sol.effort, !!o.photo) } } : brain0;
  const capped = solOn(g) && overLimit(g.solLimitKr);
  if (capped && brain) note = t('This month’s GPT-6.1 Sol limit is reached, so Gemini answered.');
  if (capped && !brain) reply = t('This month’s GPT-6.1 Sol limit is reached. Raise it in Settings → Voice & AI, or add a free Gemini key.');
  if (brain) {
    try {
      const today = dayKey(Date.now(), st.settings.dayStartHour);
      const names = new Map(o.pool.map((e) => [e.id, e.name]));
      const muscles = new Map(o.pool.map((e) => [e.id, e.muscles]));
      const byId = new Map(o.pool.map((e) => [e.id, e]));
      const mealLabel = (id: string) => { const m = st.settings.meals.find((x) => x.id === id); return m ? mealName(m, lang) : id; };
      const learned = [learnedBlock((id) => names.get(id) ?? id, mealLabel), reviewsBlock(st, (id) => muscles.get(id))].filter(Boolean).join('\n\n');
      // what never changes comes first and the live data last: repeated requests then share a cached beginning (cheaper with OpenAI)
      const system = `${AGENT_SYSTEM(lang)}\n\nGUIDE:\n${APP_GUIDE}\n\nEXERCISE CATALOG (use these exact names): ${exerciseNames(o.pool).join(', ')}\n\n${memoryBlock(st, (id) => names.get(id) ?? id)}${learned ? `\n\n${learned}` : ''}\n\nWHERE THE USER IS: ${o.where}\n\nDATA (computed on this device just now):\n${buildTodayContext(st, today, new Date(), (id) => byId.get(id), (id) => names.get(id) ?? id)}\n\n${buildAgentContext(st, today, (id) => names.get(id) ?? id, mealLabel, (id) => muscles.get(id))}`;
      const conv: Turn[] = [...o.history, { role: 'user', parts: [{ text }] }];
      // streamed when someone is watching the words arrive; a request the API refuses to stream is asked again the plain way
      const gemini = (sys: string) => (o.onReply
        ? aiAgentStream(sys, conv, brain, o.onReply, o.photo).catch((e) => { if (e?.code === 'badrequest') return aiAgent(sys, conv, brain, o.photo); throw e; })
        : aiAgent(sys, conv, brain, o.photo));
      // Up to three rounds: the model may first ask to look something up in the data (any day, any lift, the whole plan…),
      // the phone answers at once, and the model is asked again with the results. The last round must answer.
      let raw: any = null, found = '';
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const last = round === MAX_ROUNDS - 1;
        const sys = system + (found ? `\n\nLOOKUP RESULTS (you asked for these in this turn; answer from them, do not ask for them again):\n${found}` : '') + (last && round > 0 ? '\n\nNo more look-ups this turn: answer now with what you have, and say if something is still unknown.' : '');
        const r = await solThenGemini(brain, (sol) => solAgent(sys, conv, { ...sol, signal: o.signal }, o.onReply, o.photo), () => { o.onReply?.(''); return gemini(sys); });
        if (r.fellBack) note = r.fellBack.code === 'quota' ? t('Your OpenAI account is out of credit, so Gemini answered.') : t('GPT-6.1 Sol wasn’t available, so Gemini answered.');
        raw = r.value;
        const look = last ? [] : validateLookups((raw as any)?.lookups);
        if (!look.length) break;
        o.onReply?.(''); // anything it wrote beside the look-up is not the answer
        o.onStatus?.(lookupStatus(look, t));
        found += (found ? '\n\n' : '') + runLookups(st, look, { today, lang, pool: o.pool, mealLabel, said: o.said });
      }
      o.onStatus?.('');
      const v = validateAgent(raw);
      if (!v) throw new AiError('invalid');
      reply = v.reply; actions = v.actions;
    } catch (e: any) {
      if (e?.code === 'aborted') throw e;
      const local = localActions(text);
      if (!local) throw e;
      actions = local; note = t(solOn(g) ? 'The AI wasn’t available, so I used the built-in reader.' : 'Gemini wasn’t available, so I used the built-in reader.');
    }
  } else if (capped) {
    const local = o.photo ? null : localActions(text); // simple logging still works; the reply above says why there is no AI
    if (local) { actions = local; reply = ''; note = t('This month’s GPT-6.1 Sol limit is reached, so I used the built-in reader.'); }
  } else if (o.photo) {
    reply = t('To look at photos I need an AI key (Settings → Voice & AI).');
  } else {
    const local = localActions(text);
    if (local) actions = local;
    else reply = t('To chat or ask about the app I need an AI key (Settings → Voice & AI). I can still log what you tell me, like “200 g skyr” or “bench 80 for 8”.');
  }
  const wantsUndo = actions.some((a) => a.type === 'undo_last');
  return { reply, note, actions: actions.filter((a) => a.type !== 'undo_last'), wantsUndo };
}
