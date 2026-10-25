import { useAi, solOn } from '../state/ai';
import { edFromMemory, frequentHeavy, justNoticed, markCoachTold } from './eating';
import { trueMaintenance } from './maintenance';
import { useStore } from '../state/store';
import { getKey } from './keys';
import { AiError, FALLBACK_MODELS, aiAgent, aiAgentStream, dedupeSources, geminiSearch, plainModels, type Brain, type Photo, type Turn, type WebSource } from './gemini';
import { quickFor, refreshSolModel, solAgent, solJson, solModel, solSearch, type Effort } from './openai';
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

/**
 * Which model answers (Coach 2.1, 20 Oct). Omar: not the strong model for everything (too expensive), the right one for each
 * message. Obvious cases are decided here at once: a photo → the main model; risky or decision phrases (route's lists) →
 * the main model thinking hard; plain logging and quick facts → the quick model at low. Everything else is read by the quick
 * model in one tiny call (with the conversation just before, and whether it was dictated, so a misheard word or a "why?"
 * after a big answer is placed right), and goes where it says. A chooser that fails or is slow falls back to the lists.
 */
export type Tier = 'quick' | 'quick_think' | 'main' | 'main_high';
export const TIER_ROUTE: Record<Tier, Route> = { quick: { effort: 'low', main: false }, quick_think: { effort: 'medium', main: false }, main: { effort: 'medium', main: true }, main_high: { effort: 'high', main: true } };
export const ROUTER_SCHEMA = { type: 'OBJECT', properties: { tier: { type: 'STRING', enum: ['quick', 'quick_think', 'main', 'main_high'] } }, required: ['tier'] };
export const ROUTER_SYSTEM = `You pick which AI answers a message in a training and food coach app. Reply with JSON only: {"tier": "…"}.
- quick: logging food, sets, weight or activities; app commands and settings; a short fact; thanks, ok, small talk.
- quick_think: an everyday question that needs a little reasoning but no real decision (a meal idea, what an exercise does, a simple how-to, a question about one logged item).
- main: anything that needs judgement on their own data or where a weak answer costs them: why something isn't working (weight, strength, hunger), targets and calories, maintenance, plans and programs, progress and trends, overeating, sleep and recovery, what to change, comparing options.
- main_high: health or safety (pain, injury, illness, eating problems, purging, fainting), cutting weight fast or making weight, anyone under 18 with a body question, supplements, or a hard decision with many parts. Statements count too, not only questions: not eating or fasting, only water, sauna or sweating to drop weight, pills, pain, pregnancy, saying they are under 18, hating their body.
A follow-up ("why?", "and tomorrow?", "ok but what if…") continues the conversation before it: give it at least the tier that conversation needed. Messages may be dictated and misheard: judge by what they most likely meant; a garbled message that looks like a question about their weight, body, food or training is main. Unsure between two tiers: the higher one.`;

const BODY_RISK = /(?<![A-Za-zÆØÅæøå])(?:not eat\w*|won'?t eat|didn'?t eat|haven'?t eaten|no food|skip\w* (?:meals?|food|breakfast|lunch|dinner)|fast(?:ing|ed)?\b|only water|just water|water cut|sauna|sweat\w*|burn (?:it|that) off|make up|spit|throw\w* up|vomit\w*|purg\w*|laxative\w*|dulcolax|diuretic\w*|pills?|hate my body|disgust\w*|couldn'?t stop|can'?t stop|out of control|pain\w*|hurt\w*|headache|dizz\w*|faint\w*|chest|period|pregnan\w*|caffeine|energy drinks?|tore|torn|injur\w*|i'?m (?:1[0-7]|[5-9])\b|(?:1[0-7]|[5-9]) years? old|to drop weight|need to be \d+|spiser ikke|ikke spist|faste\w*|kun vand|svede|piller|afføring\w*|vanddrivende|kast\w* op|ondt|hovedpine|svimmel|besvim\w*|gravid|menstruation|hader min krop|jeg er (?:1[0-7]|[5-9])\b|skal veje|skal ned|tabe mig hurtigt)/i;
const COMMAND = /^\s*(?:please |pls |kan du |can you )?(?:log|add|move|delete|remove|clear|start|finish|end|stop|pause|resume|undo|switch|change|set|put|show|open|go to|turn|make|skip|copy|replace|rename|swap|dark|light|thanks|thank you|thx|ok|okay|yes|yeah|yep|no|nope|cool|nice|great|perfect|yo|hi|hey|hello|tak|ja|nej|fedt|super|fortryd|flyt|slet|tilføj|start|stop|skift|sæt|vis|åbn|lav|byt|log)\b/i;

/** The decisions that need no chooser: a photo, the risky and decision phrases, plain logging and quick facts. */
export function fastRoute(text: string, setting: Effort, photo = false): (Route & { tier: Tier }) | null {
  if (photo) return { effort: setting, main: true, tier: 'main' };
  const r = route(text, setting);
  if (r.main && r.effort === 'high') return { ...r, tier: 'main_high' };
  const words = text.trim().split(/\s+/).length;
  // (anything about the body, not eating, weight, pills or pain is read by the chooser even when it looks like a log or a
  // short statement: "fasting tomorrow to make up", "only water until friday", "Im 16 btw" — the review, 20 Oct)
  if (BODY_RISK.test(text)) return null;
  const logging = LOG_REQ.test(text) || (/\d/.test(text) && !/\?/.test(text) && !ASKING.test(text) && words <= 12);
  // (a short app command or a reply that asks nothing — "dark mode please", "move it to lunch", "thanks", "ok" — needs no
  // chooser; a statement about how they feel or are doing does)
  const command = !ASKING.test(text) && !DEEP.test(text) && words <= 8 && (COMMAND.test(text) || words <= 2);
  if (logging || command || FACT.test(text)) return { effort: 'low', main: false, tier: 'quick' };
  return null;
}

export async function chooseModel(text: string, o: { setting: Effort; photo?: boolean; prev?: { role: string; text: string }[]; dictated?: boolean; timeoutMs?: number;
  /** one call to the quick model: (system, message, its own stop signal) → its answer (JSON, or the text of it); none =
   *  no quick model on the key, so the phrase lists decide (never the main model just to choose) */ ask?: (system: string, user: string, signal: AbortSignal) => Promise<unknown>;
  /** the user's Stop: ends the choosing at once (it is never swallowed as a fallback) */ signal?: AbortSignal }): Promise<Route & { tier: Tier | 'fallback' }> {
  const fast = fastRoute(text, o.setting, o.photo);
  if (fast) return fast;
  if (!o.ask) return { ...route(text, o.setting), tier: 'fallback' };
  const before = (o.prev ?? []).slice(-2).map((h) => `${h.role === 'model' ? 'Coach' : 'Them'}: ${h.text.replace(/\s+/g, ' ').slice(0, 300)}`).join('\n');
  const user = `${before ? `Just before:\n${before}\n\n` : ''}Message${o.dictated ? ' (dictated)' : ''}: ${text.slice(0, 600)}`;
  // (its own stop: the user's Stop, or too slow — then the request itself is ended, not left running)
  const c = new AbortController();
  const stop = () => c.abort();
  o.signal?.addEventListener('abort', stop);
  if (o.signal?.aborted) c.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([o.ask(ROUTER_SYSTEM, user, c.signal), new Promise((_, no) => { timer = setTimeout(() => { c.abort(); no(new Error('slow')); }, o.timeoutMs ?? 4000); })]);
    const v: any = typeof raw === 'string' ? JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) : raw;
    const tier = v?.tier as Tier;
    if (Object.prototype.hasOwnProperty.call(TIER_ROUTE, tier)) return { ...TIER_ROUTE[tier], tier };
  } catch (e: any) {
    if (o.signal?.aborted) throw new AiError('aborted', 0, { provider: 'openai' });
    // (the key has no quick model: remembered, so later messages don't try it again)
    if (e?.code === 'nomodel') useAi.getState().patch({ noQuick: true });
  } finally { clearTimeout(timer); o.signal?.removeEventListener('abort', stop); }
  return { ...route(text, o.setting), tier: 'fallback' };
}

/** What the orb screen adds to where they are: it is spoken to, often mid-workout, and may be read aloud (the Coach chat
 *  keeps longer answers). */
export const ORB_BRIEF = ' They are speaking to the orb screen, often mid-workout, and the answer may be read aloud: keep it short and clear, plain text, no lists or headings. If the question really needs more (a plan, a breakdown), give the short answer: a “Continue in Coach” button sits under it, so never tell them to open the Coach.';

/** Whether a reply talked about a heavy day: its kcal over (2000, 2,000, 2.000, 2 000) or the words for it. */
export function mentionsHeavy(reply: string, over: number): boolean {
  // every number in the reply, read as a whole ("2,300" is 2300, never "300"); within 10 % of the day's kcal over counts
  // (it may be rounded: "about 1,200 over" for 1,187)
  const nums = [...reply.matchAll(/(?<![\d.,])\d{1,3}(?:[ ,.\u00a0]\d{3})+(?![\d])|(?<![\d.,])\d+(?![\d])/g)].map((m) => Number(m[0].replace(/[ ,.\u00a0]/g, '')));
  if (over >= 300 && nums.some((x) => Math.abs(x - over) <= over * 0.1)) return true;
  return /catch-?up|indhent\w*|heavy (?:day|evening)|big (?:day|evening)|tung(?:e)? (?:dag|aften)|stor(?:e)? (?:dag|aften)|ate a lot|over ?ate|overeat\w*|overspis\w*|went over|over (?:your|the) target|over målet|spiste meget|spist meget|spiste en del|\btrim(?:med|s)?\b(?=[^.]*(?:kcal|calor|kalori|day|dag))/i.test(reply);
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
  if (outer.aborted) c.abort();
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
  const quick = quickFor();
  const way = brain0?.sol ? await chooseModel(o.words ?? text, {
    setting: brain0.sol.effort, photo: !!o.photo, dictated: o.dictated, signal: o.signal, timeoutMs: o.surface === 'orb' ? 2500 : 4000,
    prev: o.history.map((h) => ({ role: h.role, text: h.parts.map((p) => p.text).join('') })),
    ask: quick ? (system, prompt, signal) => solJson({ key: brain0.sol!.key, effort: 'low', model: quick, signal }, { system, prompt, schema: ROUTER_SCHEMA, name: 'route' }) : undefined,
  }) : null;
  if (o.signal.aborted) throw new AiError('aborted', 0, { provider: 'openai' });
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
      if (dropped) noteTrouble('dropped', `${dropped} action${dropped > 1 ? 's' : ''} · ${lastRaw.by}${v.droppedRaw ? ` · ${v.droppedRaw}` : ''}`);
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
