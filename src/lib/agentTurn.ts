import { useAi, solOn } from '../state/ai';
import { edFromMemory, frequentHeavy, justNoticed, markCoachTold } from './eating';
import { trueMaintenance } from './maintenance';
import { useStore } from '../state/store';
import { getKey } from './keys';
import { AiError, FALLBACK_MODELS, aiAgent, aiAgentStream, dedupeSources, geminiSearch, plainModels, type Brain, type Photo, type Turn, type WebSource } from './gemini';
import { quickFor, refreshSolModel, solAgent, solModel, solSearch, type Effort } from './openai';
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
 * Which model answers THIS message, and how hard it thinks (review round 1, 19 Oct). Everyday messages — logging, small
 * talk, quick facts ("how many calories in a banana") — go to the quick model at low effort, in a second or two; planning
 * and analysis ("build me a push day", "why is my bench stuck?") to the quick model at the effort set in Settings. The
 * main model, thinking hard, gets decisions (targets, maintenance, cut or bulk, a new plan, "not losing", "what now"),
 * "think about it properly", and anything where a wrong answer could hurt: overeating and purging, fast weight cuts,
 * making weight, dehydration, warning signs of the body, and supplements, sauna or pain asked about (not logged: "5 g
 * kreatin" is logging). Photos: the main model at the setting. Tested both ways, English and Danish (tests/route.test.ts).
 */
// (whole words with their endings only: "plank" is not "plan", "painting" not "pain"; pain said, not asked about, is
// thought about at the setting)
const DEEP = /\b(?:plan(?:s|ned|ning)?|program(?:me)?s?|routines?|splits?|periodi[sz]\w*|deloads?|plateau\w*|stall(?:s|ed|ing)?|stuck|why|should i|analy[sz]\w*|review|compare|improve\w*|advice|recommend\w*|build|design|weak ?points?|progress(?:ion)?|injur\w*|pain(?:s|ful)?|hurts?|hurting)\b|\b(?:hvorfor|skal jeg|analys\w*|forbedr\w*|anbefal\w*|byg|lav en|programm?(?:et|er)?|rutine\w*|plan(?:en|er|lægning)?|skade\w*|ondt)\b/i;
// decisions that change their plan or numbers
const DECIDE = /\b(?:maintenance|calorie target|(?:how many|what) calories (?:should|do) i|my (?:calories|macros|targets?) (?:should|need|be)|should i (?:cut|bulk|diet|lose|gain|eat less|eat more)|new (?:program|plan|split)|plan my (?:next |)(?:week|month|days?)|plateau\w*|(?:not|don'?t|doesn'?t|can'?t|won'?t) (?:los(?:e|ing)|gain(?:ing)?)|stopped losing|metabolism|what now|now what|catch-?ups?)\b|\b(?:vedligehold\w*|kaloriemål|hvor mange kalorier skal jeg|tab(?:er)?(?: jeg)? mig ikke|tager ikke af|taber ikke noget|forbrænding\w*|skal jeg (?:cutte|bulke|tabe|tage på|spise mindre|spise mere)|nyt program|ny plan|planlæg min|lav(?:e)? en (?:ny )?plan for (?:næste|den kommende) (?:uge|måned)|hvad nu(?! hvis)|indhentning\w*)\b/i;
const THINK_HARD = /\b(?:think (?:about it |it through |this through )?(?:properly|carefully|hard(?:er)?)|take your time|think deeply)\b|\b(?:tænk (?:dig )?(?:godt )?(?:om|grundigt|over det)|tænk grundigt)\b/i;
// where a wrong answer could hurt: always the main model, thinking hard (the second final review, 19 Oct, added the
// dictated forms: "jeg har spist alt for meget i aften hvad gør jeg", "drop to 74 for the tournament", "dizzy")
const SAFETY = /\b(?:binge(?![- ]?watch)\w*|binging|ate (?:way |far |so )?too much|overate|overeat\w*|purg\w*|throw(?:ing|s)? up|threw up|vomit\w*|make (?:my)?self sick|laxative\w*|starv(?:e|ing) (?:my|me|him|her)self|eating disorder|out of control|anorexi\w*|bulimi\w*|(?:fast(?:ing)?|skip(?:ping)? meals?) to (?:compensate|make up)|(?:fast|skip)\w* .{0,30}to (?:make up for|compensate)|cut(?:ting)? weight|skip(?:ping)? (?:breakfast|lunch|dinner|a meal|meals|eating) (?:because|since|to)|(?:drop|lose|cut) \d+(?:[.,]\d+)? ?(?:kg|kilos?|lbs?|pounds?)|(?:drop|get down|go down|come down) to \d{2,3}|before (?:the |my )?(?:tournament|match|weigh-?in|competition|meet)|make weight|making weight|weight class|dehydrat\w*|water cut|cutting water|sauna suit|chest pains?|faint\w*|dizz\w*|light-?headed|pass(?:ed)? out|missed (?:my )?period)\b|(?<![A-Za-zÆØÅæøå])(?:overspis\w*|trøstespis\w*|(?:spist|spiste|ædt|åd) (?:alt |så |helt |virkelig )?for meget|kast(?:e|er|ede|et) op|brækk(?:e|er|ede) mig|afføringsmid\w*|sult(?:e|er|ede) mig|spiseforstyrr\w*|spring\w* (?:\S+ )?over (?:fordi|for at)|ud af kontrol|ukontrolleret|(?:skal|vil|må) ned (?:på |til )?\d+(?:[.,]\d+)? ?(?:kg|kilo)|faste for at|(?:tabe|taber|tab|smide|tage af|komme ned på|ned på|ned til)(?: jeg)? \d+(?:[.,]\d+)? ?(?:kg|kilo)|(?:inden|før) (?:turnering\w*|kamp\w*|stævne\w*|indvejning\w*)|vægtklasse\w*|dehydr\w*|svimmel|brystsmert\w*|ondt i brystet|besvim\w*|udebl\w* menstruation|mistet (?:min )?menstruation)(?![A-Za-zÆØÅæøå])/i;
// …a weigh-in or a weight class talked about (not "log my weigh-in 84.5")
const WEIGH_TALK = /\b(?:weigh[- ]in|indvejning\w*)\b(?!\s*:?\s*\d)/i;
// …and these only when asked about (a question or advice), not when logged ("5 g kreatin", "kan du logge 5 g kreatin")
const SAFETY_ASK = /(?<![A-Za-zÆØÅæøå])(?:creatine|kreatin|supplements?|kosttilskud|sauna|pre-?workout(?! (?:meal|snack|food|måltid))|caffeine|koffein|pain(?:s|ful)?|hurts?|hurting|sore|øm(?:me)?|injur\w*|ondt|skade\w*|smert\w*)(?![A-Za-zÆØÅæøå])/i;
const ASKING = /\?|^\s*(?:should|can|could|is|are|do|does|what|how|why|when|which|any|skal|kan|bør|er|hvad|hvordan|hvorfor|hvornår|hvilke?n?)\b|\b(?:should i|can i|could i|is it (?:ok|okay|safe|bad|fine)|safe|ok to|okay to|good idea|skal jeg|bør jeg|kan jeg|er det (?:ok|okay|sikkert|farligt|skidt)|sikkert|i orden|en god idé)\b/i;
// "log …", "kan du logge …", "can you add …": a logging request, never a question
const LOG_REQ = /^\s*(?:(?:can|could|will) you |kan du |vil du )?(?:please |lige )?(?:log|logge?|add|tilføj\w*|put|registrer\w*)\b/i;
// a quick fact about a food: the quick model
const FACT = /\bhow (?:many|much) (?:calories|kcal|protein|carbs?|fat)(?: are| is| does)?(?: there)? in\b|\bhvor (?:mange|meget) (?:kalorier|kcal|protein|kulhydrat\w*|fedt)(?: er der)? i\b/i;

export type Route = { effort: Effort; main: boolean };
export function route(text: string, setting: Effort, photo = false): Route {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const cap = (e: Effort): Effort => (rank[e] <= rank[setting] ? e : setting);
  const logging = LOG_REQ.test(text);
  if (THINK_HARD.test(text) || SAFETY.test(text) || (!logging && WEIGH_TALK.test(text))) return { effort: 'high', main: true };
  if (photo) return { effort: setting, main: true }; // reading a label or a machine needs care
  if (FACT.test(text)) return { effort: 'low', main: false };
  if (!logging && SAFETY_ASK.test(text) && ASKING.test(text)) return { effort: 'high', main: true };
  if (DECIDE.test(text)) return { effort: 'high', main: true };
  if (DEEP.test(text)) return { effort: setting, main: false };
  return { effort: text.trim().split(/\s+/).length > 40 ? cap('medium') : 'low', main: false };
}
export const effortFor = (text: string, setting: Effort, photo = false): Effort => route(text, setting, photo).effort;

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

/** What the orb screen adds to where they are: it is spoken to, often mid-workout, and may be read aloud (the Coach chat
 *  keeps longer answers). */
export const ORB_BRIEF = ' They are speaking to the orb screen, often mid-workout, and the answer may be read aloud: keep it short and clear, plain text, no lists or headings. If the question really needs more (a plan, a breakdown), give the short answer: a “Continue in Coach” button sits under it, so never tell them to open the Coach.';

/** Whether a reply talked about a heavy day: its kcal over (2000, 2,000, 2.000, 2 000) or the words for it. */
export function mentionsHeavy(reply: string, over: number): boolean {
  const n = String(Math.round(over));
  const forms = [n, n.replace(/\B(?=(\d{3})+$)/g, ','), n.replace(/\B(?=(\d{3})+$)/g, '.'), n.replace(/\B(?=(\d{3})+$)/g, ' '), n.replace(/\B(?=(\d{3})+$)/g, '\u00a0')];
  return forms.some((f) => reply.includes(f)) || /catch-?up|indhent|heavy (day|evening)|big (day|evening)|tung(e)? (dag|aften)|stor(e)? (dag|aften)|ate a lot|spiste meget|spist meget|trim/i.test(reply);
}

/** Run `fn` with a signal that also ends after `ms` (0 = no limit) unless its first words arrive before (`seen`): that end
 *  is a timeout (Gemini then answers), never the user's Stop, which still stops everything. Once words flow, the stream's
 *  own rule applies (lib/openai.ts: 25 s without a word). */
export async function withTimeout<T>(ms: number, outer: AbortSignal, fn: (signal: AbortSignal, seen: () => void) => Promise<T>): Promise<T> {
  if (!ms) return fn(outer, () => {});
  const c = new AbortController();
  let late = false;
  const stop = () => c.abort();
  outer.addEventListener('abort', stop);
  const timer = setTimeout(() => { late = true; c.abort(); }, ms);
  try { return await fn(c.signal, () => clearTimeout(timer)); }
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
  /** the whole saved conversation, for the `conversations` look-up (what they said before) */ said?: SaidLine[];
  /** spoken into the app's microphone (may be misheard); `words` = only what they said (without an [about: …] detail) */ dictated?: boolean; words?: string }): Promise<Decision> {
  const st = useStore.getState();
  const g = useAi.getState();
  const { t, lang } = o;
  // (what EATING PATTERNS tells this turn it has just noticed; whether it may bring up the invisible calories)
  const day0 = dayKey(Date.now(), st.settings.dayStartHour);
  const noticedList = justNoticed(st, day0);
  const invisible = !st.marks?.invisibleSaid && !!trueMaintenance(st, day0)?.invisible;
  // (help for eating is recorded as suggested when it came up while there were frequent heavy days or a health signal:
  // DATA then says when, as a fact)
  const helpDue = !st.marks?.helpSaid && (frequentHeavy(st, day0) || edFromMemory(st.memory));
  let reply = '', note = '';
  let fromAi = false; // (a canned reply — no key, over the limit — never said what EATING PATTERNS holds)
  let actions: AgentAction[] = [];
  const sources: WebSource[] = [];
  let dropped = 0;
  const brain0 = brainFor({ big: true, surface: o.surface, signal: o.signal });
  // think only as hard as the message needs, with the right model (see route): everyday messages to the quick model,
  // decisions, risky questions and photos to the main one (the Coach exam, 19 Oct: the quick one is nearly as good day to
  // day at ~1/16 of the price; the main one thinks the big calls through)
  const way = brain0?.sol ? route(o.words ?? text, brain0.sol.effort, !!o.photo) : null;
  const brain = brain0?.sol && way ? { ...brain0, sol: { ...brain0.sol, effort: way.effort, model: way.main ? undefined : quickFor() } } : brain0;
  const capped = solOn(g) && overLimit(g.solLimitKr);
  if (capped && brain) note = t('This month’s GPT-6.1 Sol limit is reached, so Gemini answered.');
  if (capped && !brain) reply = t('This month’s GPT-6.1 Sol limit is reached. Raise it in Settings → Voice & AI, or add a free Gemini key.');
  if (brain) {
    try {
      const { system, today, mealLabel } = agentSystem(st, { lang, pool: o.pool, where: o.where });
      const conv: Turn[] = [...o.history, { role: 'user', parts: [{ text: o.dictated ? `[dictated] ${text}` : text }] }];
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
        // Sol gets 45 s in the Coach and 20 s on the orb to start answering (deep thinking on a slow line could run for
        // minutes), then Gemini answers; once its words flow they are never cut. Without a Gemini key there is nothing
        // to hand over to, so it waits
        const limit = !brain.key ? 0 : o.surface === 'coach' ? 45000 : 20000;
        const r = await solThenGemini(brain, (sol) => withTimeout(limit, o.signal, (signal, seen) => {
          const onReply = (x: string) => { if (x) seen(); o.onReply?.(x); };
          return solAgent(sys, conv, { ...sol, signal, onAny: seen }, onReply, o.photo)
            // (a key without the quick model: the main one answers, from now on)
            .catch((e) => { if (sol.model && e?.code === 'nomodel') { useAi.getState().patch({ noQuick: true }); return solAgent(sys, conv, { ...sol, model: undefined, signal, onAny: seen }, onReply, o.photo); } throw e; });
        }), () => { o.onReply?.(''); return gemini(sys); });
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
      reply = v.reply; actions = v.actions; dropped = v.dropped; fromAi = true;
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
  // (what EATING PATTERNS said it had just noticed has now been said; not by a reply that only logged something, which
  // is told to leave it for the next real conversation)
  // (logging-only: every action logs something and the reply is just a short confirmation)
  const logging = actions.length > 0 && actions.every((a) => /^log_/.test(a.type)) && reply.trim().length <= 80;
  // (a heavy day counts as talked about only when the reply really talked about it: its number, or the words for it)
  const talked = noticedList.filter((c) => mentionsHeavy(reply, c.over)).map((c) => c.id);
  if (fromAi && reply && talked.length && !logging) markCoachTold(useStore.getState(), useStore.getState().setCatchUps, talked);
  // (and what is said once: the invisible calories, help for eating, asking their age)
  if (fromAi && reply && !logging) {
    const said: Record<string, string> = {};
    if (invisible && /overestimat\w*|unlogged|not logged|isn'?t logged|aren'?t logged|ikke logget|ikke er logget|invisible|usynlig|overvurder\w*/i.test(reply)) said.invisibleSaid = day0;
    if (helpDue && /dietitian|dietician|diætist|doctor|læge/i.test(reply)) said.helpSaid = day0;
    if (!st.marks?.ageAsked && /how old are you|your age|hvor gammel er du|din alder/i.test(reply)) said.ageAsked = day0;
    if (Object.keys(said).length) useStore.getState().patch((s) => ({ marks: { ...s.marks, ...said } }));
  }
  return { reply, note, actions: actions.filter((a) => a.type !== 'undo_last'), wantsUndo, sources: dedupeSources(sources), dropped };
}
