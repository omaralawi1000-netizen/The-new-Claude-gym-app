import { useAi, solOn } from '../state/ai';
import { markCoachTold } from './eating';
import { useStore } from '../state/store';
import { getKey } from './keys';
import { AiError, FALLBACK_MODELS, aiAgent, aiAgentStream, dedupeSources, geminiSearch, plainModels, type Brain, type Photo, type Turn, type WebSource } from './gemini';
import { quickModel, refreshSolModel, solAgent, solModel, solSearch, type Effort } from './openai';
import { solThenGemini } from './brain';
import { overLimit } from './spend';
import { AGENT_SYSTEM, APP_GUIDE, buildAgentContext, buildTodayContext, exerciseNames, memoryBlock } from './coachContext';
import { learnedBlock } from './ledger';
import { reviewsBlock } from './weekReview';
import { localActions, validateAgent, type AgentAction } from './agent';
import { lookupStatus, runLookups, validateLookups, type SaidLine } from './agentLookup';
import { mealName } from './derive';
import { dayKey } from './dates';
import { noteTrouble } from './trouble';
import type { AppData, Exercise, Lang } from './types';

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
 * "why is my bench stuck?") get the effort set in Settings; decisions (targets, maintenance, cut or bulk, a new program)
 * and "think about it properly" get high.
 */
// (whole words with their endings only: "plank" is not "plan", "painting" not "pain", "cutlery" not "cut")
const DEEP = /\b(?:plan(?:s|ned|ning)?|program(?:me)?s?|routines?|splits?|periodi[sz]\w*|deloads?|plateau\w*|stall(?:s|ed|ing)?|stuck|why|should i|analy[sz]\w*|review|compare|improve\w*|advice|recommend\w*|build|design|diet|cut(?:ting)?|bulk(?:ing)?|injur\w*|pain(?:s|ful)?|hurts?|hurting|weak ?points?|progress(?:ion)?)\b|\b(?:hvorfor|skal jeg|analys\w*|forbedr\w*|anbefal\w*|kost(?:en|plan)?|skade\w*|ondt|byg|lav en|programm?(?:et|er)?|rutine\w*|plan(?:en|er|lægning)?)\b/i;
// Decisions that change their plan or numbers (a calorie target, maintenance, cut or bulk, a program) and "think about it
// properly" get the deepest thinking whatever the setting (Omar, 19 Oct: think hard where it matters, cheap elsewhere)
const DECIDE = /\b(?:maintenance|calorie target|how many calories|my (?:calories|macros|targets?)|should i (?:cut|bulk|diet)|new (?:program|plan|split)|plateau\w*|not losing|not gaining)\b|\b(?:vedligehold\w*|kaloriemål|hvor mange kalorier|tab(?:er)? mig ikke)\b/i;
const THINK_HARD = /\b(?:think (?:about it |it through |this through )?(?:properly|carefully|hard(?:er)?)|take your time|think deeply)\b|\b(?:tænk (?:dig )?(?:godt )?(?:om|grundigt|over det)|tænk grundigt)\b/i;
export function effortFor(text: string, setting: Effort, photo = false): Effort {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const cap = (e: Effort): Effort => (rank[e] <= rank[setting] ? e : setting);
  if (THINK_HARD.test(text) || DECIDE.test(text)) return 'high';
  if (photo) return setting; // reading a label or a machine needs care
  const words = text.trim().split(/\s+/).length;
  if (DEEP.test(text)) return setting;
  return words > 40 ? cap('medium') : 'low';
}

/**
 * One web search for the Coach: Gemini's Google Search grounding when there is a Gemini key (free within its daily
 * allowance), else OpenAI's search tool (a small fee per search, counted in the monthly Sol limit).
 */
async function webSearch(query: string, brain: Brain, lang: string): Promise<{ text: string; sources: WebSource[] }> {
  if (brain.key) {
    try { return await geminiSearch(query, brain, lang); }
    catch (e: any) { if (e?.code === 'aborted' || !brain.sol?.key) throw e; }
  }
  if (brain.sol?.key) return solSearch(query, { ...brain.sol, signal: brain.signal }, lang);
  throw new AiError('failed');
}

/** Run `fn` with a signal that also ends after `ms` (0 = no limit): that end is a timeout (Gemini then answers), never the
 *  user's Stop, which still stops everything. */
export async function withTimeout<T>(ms: number, outer: AbortSignal, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (!ms) return fn(outer);
  const c = new AbortController();
  let late = false;
  const stop = () => c.abort();
  outer.addEventListener('abort', stop);
  const timer = setTimeout(() => { late = true; c.abort(); }, ms);
  try { return await fn(c.signal); }
  catch (e) { if (late && !outer.aborted) throw new AiError('timeout', 0, { provider: 'openai' }); throw e; }
  finally { clearTimeout(timer); outer.removeEventListener('abort', stop); }
}

/**
 * The Coach's whole instruction text for one message: the rules, the guide, the catalog, memory, and the live DATA. What
 * never changes comes first and the live data last, so repeated requests share a cached beginning (cheaper). Shared by
 * decide() and the Coach exam (scripts/exam), which runs it on fake people.
 */
export function agentSystem(st: AppData, o: { lang: Lang; pool: Exercise[]; where: string; now?: Date }) {
  const now = o.now ?? new Date();
  const today = dayKey(now.getTime(), st.settings.dayStartHour);
  const names = new Map(o.pool.map((e) => [e.id, e.name]));
  const muscles = new Map(o.pool.map((e) => [e.id, e.muscles]));
  const byId = new Map(o.pool.map((e) => [e.id, e]));
  const mealLabel = (id: string) => { const m = st.settings.meals.find((x) => x.id === id); return m ? mealName(m, o.lang) : id; };
  const learned = [learnedBlock((id) => names.get(id) ?? id, mealLabel), reviewsBlock(st, (id) => muscles.get(id))].filter(Boolean).join('\n\n');
  const system = `${AGENT_SYSTEM(o.lang)}\n\nGUIDE:\n${APP_GUIDE}\n\nEXERCISE CATALOG (use these exact names): ${exerciseNames(o.pool).join(', ')}\n\n${memoryBlock(st, (id) => names.get(id) ?? id)}${learned ? `\n\n${learned}` : ''}\n\nWHERE THE USER IS: ${o.where}\n\nDATA (computed on this device just now):\n${buildTodayContext(st, today, now, (id) => byId.get(id), (id) => names.get(id) ?? id)}\n\n${buildAgentContext(st, today, (id) => names.get(id) ?? id, mealLabel, (id) => muscles.get(id))}`;
  return { system, today, mealLabel };
}

/** Rounds per message: up to two rounds of look-ups, then the answer. */
const MAX_ROUNDS = 3;

export interface Decision { reply: string; note: string; actions: AgentAction[]; wantsUndo: boolean; /** the web pages a search used (shown under the answer) */ sources: WebSource[]; /** actions in the answer that couldn't be read (said in a card) */ dropped: number }

/** The last raw answer, kept in memory only (never saved): Settings → About copies it to diagnose an odd answer. */
let lastRaw: { at: number; by: string; plain: string[]; text: string } | null = null;
export const lastRawAnswer = () => lastRaw;

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
  const sources: WebSource[] = [];
  let dropped = 0;
  const brain0 = brainFor({ big: true, surface: o.surface, signal: o.signal });
  // think only as hard as the message needs (see effortFor)
  // …and with the right model: everyday messages to the quick model, decisions and photos to the main one (the Coach exam,
  // 19 Oct: the quick one is nearly as good day to day at ~1/16 of the price; the main one thinks the big calls through)
  const effort = brain0?.sol ? effortFor(text, brain0.sol.effort, !!o.photo) : 'medium';
  const brain = brain0?.sol ? { ...brain0, sol: { ...brain0.sol, effort, model: effort === 'high' || o.photo ? undefined : quickModel() } } : brain0;
  const capped = solOn(g) && overLimit(g.solLimitKr);
  if (capped && brain) note = t('This month’s GPT-6.1 Sol limit is reached, so Gemini answered.');
  if (capped && !brain) reply = t('This month’s GPT-6.1 Sol limit is reached. Raise it in Settings → Voice & AI, or add a free Gemini key.');
  if (brain) {
    try {
      const { system, today, mealLabel } = agentSystem(st, { lang, pool: o.pool, where: o.where });
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
        // Sol gets 45 s in the Coach (deep thinking on a slow line could run for minutes); then Gemini answers
        const r = await solThenGemini(brain, (sol) => withTimeout(o.surface === 'coach' ? 45000 : 0, o.signal, (signal) => solAgent(sys, conv, { ...sol, signal }, o.onReply, o.photo)
          // (a key without the quick model: the main one answers)
          .catch((e) => { if (sol.model && e?.code === 'nomodel') return solAgent(sys, conv, { ...sol, model: undefined, signal }, o.onReply, o.photo); throw e; })), () => { o.onReply?.(''); return gemini(sys); });
        if (r.fellBack) note = r.fellBack.code === 'quota' ? t('Your OpenAI account is out of credit, so Gemini answered.') : t('GPT-6.1 Sol wasn’t available, so Gemini answered.');
        if (r.fellBack) noteTrouble('fellBack', r.fellBack.code);
        raw = r.value;
        const look = last ? [] : validateLookups((raw as any)?.lookups);
        if (!look.length) break;
        o.onReply?.(''); // anything it wrote beside the look-up is not the answer
        o.onStatus?.(lookupStatus(look, t));
        // the web (phase 4): searched by the AI's own search, the rest answered on the phone
        const webs = look.filter((l) => l.kind === 'web' && l.query).slice(0, 2);
        const local = look.filter((l) => l.kind !== 'web');
        if (local.length) found += (found ? '\n\n' : '') + runLookups(st, local, { today, lang, pool: o.pool, mealLabel, said: o.said });
        for (const w of await Promise.all(webs.map((l) => webSearch(l.query!, brain, lang).catch(() => null)))) {
          if (!w) { noteTrouble('webFailed'); found += `${found ? '\n\n' : ''}### web\nThe web search failed: answer from what you know and say you could not check it.`; continue; }
          sources.push(...w.sources);
          found += `${found ? '\n\n' : ''}### web (searched)\n${w.text}\nSources: ${w.sources.map((s, i) => `[${i + 1}] ${s.title}`).join('; ') || 'none listed'}`;
        }
      }
      o.onStatus?.('');
      lastRaw = { at: Date.now(), by: brain.sol?.key && !note ? `OpenAI ${brain.sol.model ?? solModel()}` : `Gemini (${brain.models.join(', ')})`, plain: plainModels(), text: (() => { try { return JSON.stringify(raw, null, 1).slice(0, 20000); } catch { return String(raw).slice(0, 20000); } })() };
      const v = validateAgent(raw);
      if (!v) { noteTrouble('invalid', lastRaw.by); throw new AiError('invalid'); }
      reply = v.reply; actions = v.actions; dropped = v.dropped;
      if (dropped) noteTrouble('dropped', `${dropped} action${dropped > 1 ? 's' : ''} · ${lastRaw.by}`);
    } catch (e: any) {
      if (e?.code === 'aborted') throw e;
      if (e?.code !== 'invalid') noteTrouble('failed', String(e?.code ?? e?.message ?? 'error'));
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
  // (what EATING PATTERNS said it had just noticed has now been said)
  if (reply) markCoachTold(useStore.getState(), useStore.getState().setCatchUps);
  return { reply, note, actions: actions.filter((a) => a.type !== 'undo_last'), wantsUndo, sources: dedupeSources(sources), dropped };
}
