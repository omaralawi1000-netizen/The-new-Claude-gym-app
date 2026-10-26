import type { AgentAction } from './agent';
import { dayKey, fmtDate } from './dates';
import type { Lang } from './types';

/**
 * One look at an answer before it is done (living coach, 26 Oct): the reply must not say it did something the actions
 * don't do, an action must have something in it, and a GOALS line marked MUST SAY must reach the reply. Gemini Pro said
 * "I've updated your Push routine" with an empty edit, "I've created a Full Body routine" with none sent, and skipped the
 * reached goal's weekend cap. Each problem is one plain line the model is shown when it is asked once more (decide()).
 */
const DID = String.raw`(?:i['’]?ve|i have|i)\s+(?:also\s+|now\s+|just\s+)?`;
const DID_DA = String.raw`(?:jeg har|har jeg)\s+(?:også\s+|nu\s+|lige\s+)?`;
const ROUTINE_CLAIM = new RegExp(String.raw`\b${DID}(?:created|made|built|set up|put together|updated|changed|added|adjusted|edited)\b[^.!?\n]{0,60}\b(?:routine|program(?:me)?)\b|\b(?:routine|program(?:me)?)\b[^.!?\n]{0,30}\b(?:is|are|has been)\s+(?:now\s+)?(?:updated|changed|set up|created)\b|\b${DID_DA}(?:lavet|oprettet|bygget|opdateret|ændret|tilføjet|sat)\b[^.!?\n]{0,60}\b(?:rutine\w*|program\w*)`, 'i');
const PLAN_CLAIM = new RegExp(String.raw`\b${DID}(?:updated|saved|changed|adjusted|rewritten)\b[^.!?\n]{0,30}\bplan\b|\b${DID_DA}(?:opdateret|gemt|ændret)\b[^.!?\n]{0,30}\bplan\w*`, 'i');
// (Danish "mål" is a goal as well as a target: only a calorie or protein mål counts)
const TARGET_CLAIM = new RegExp(String.raw`\b${DID}(?:updated|set|changed|bumped|raised|lowered|moved)\b[^.!?\n]{0,30}\btargets?\b|\btargets?\b[^.!?\n]{0,20}\b(?:is|are)\s+now\s+(?:updated|set|changed)\b|\btargets?\b[^.!?\n]{0,20}\b(?:have|has) been\s+(?:updated|set|changed)\b|\b${DID_DA}(?:opdateret|sat|ændret|hævet|sænket)\b[^.!?\n]{0,30}\b(?:kalorie|protein|kcal)\w*\s*mål\b`, 'i');
export const ROUTINE_ACTS = new Set(['create_routine', 'edit_routine', 'duplicate_routine', 'plan_day', 'set_split', 'replace_exercise', 'add_exercise', 'remove_exercise']);

/** kcal-like numbers ("3,540", "2.460", "980") and decimals ("80.5"), as plain digits. */
const numbers = (s: string) => new Set([...s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ').matchAll(/\d{1,2}[,.]\d{3}(?!\d)|\d+[.,]\d(?!\d)|\b\d{3,4}\b/g)].map((m) => (/^\d{1,2}[,.]\d{3}$/.test(m[0]) ? m[0].replace(/[,.]/, '') : m[0].replace(',', '.'))));

/** The MUST SAY parts of the GOALS block in the instructions (not GOAL WATCH: those repeat on every turn). */
export function mustSays(system: string): string[] {
  const at = system.search(/\nGOALS[ (:]/);
  if (at < 0) return [];
  const end = system.indexOf('\nGOAL WATCH', at);
  const block = system.slice(at, end < 0 ? undefined : end);
  return [...block.matchAll(/MUST SAY THIS TURN[^:]*:([^]*?)(?=MUST SAY THIS TURN|\n|$)/g)].map((m) => m[1].trim()).filter(Boolean);
}

/** The parts of sentences that say something was done: not a question, and each sentence only up to an offer or an if
 * ("If I set your target to …" says nothing; "I've updated Push to 4 × 4–6, adding 2.5 kg once you hit 4 × 6" still does). */
export const doneSentences = (reply: string) => reply.split(/(?<=[.!?])\s+|\n+/).filter((x) => !/\?\s*$/.test(x)).map((x) => x.split(/\b(?:if|would|could|can|shall|should|want me|when you|once you|after you|hvis|vil du|skal jeg|kan jeg|når du)\b/i)[0]).filter((x) => x.trim()).join('\n');

/** The reply says (as done, not offered) that a routine was made or changed. */
export const claimsRoutine = (reply: string) => ROUTINE_CLAIM.test(doneSentences(reply));

export function answerProblems(reply: string, actions: AgentAction[], system: string): string[] {
  const out: string[] = [];
  const done = doneSentences(reply);
  const has = (type: string) => actions.some((a) => a.type === type);
  for (const a of actions) {
    if (a.type === 'edit_routine' && !a.rename && !a.add?.length && !a.remove?.length && !a.change?.length)
      out.push(`edit_routine for "${a.routine}" has nothing in it: put the change in it (change: [{exercise, sets, repMin, repMax}]), or leave it out and don't say the routine was changed.`);
  }
  const routineDone = actions.some((a) => ROUTINE_ACTS.has(a.type) && !(a.type === 'edit_routine' && !a.rename && !a.add?.length && !a.remove?.length && !a.change?.length));
  if (ROUTINE_CLAIM.test(done) && !routineDone)
    out.push('The reply says a routine was made or changed, but no routine action does it: send it (create_routine with add, or edit_routine with change), or say you can make it if they want.');
  const goalNote = actions.some((a) => a.type === 'remember' && (a.kind === 'goal' || !!a.goal || !!a.replaces));
  const planSaved = actions.some((a) => a.type === 'remember' && (!!a.plan || !!a.goal?.plan)) || actions.some((a) => a.type === 'set_setting');
  if (PLAN_CLAIM.test(done) && !planSaved)
    out.push(goalNote ? 'The reply says the plan was updated, but the goal note carries no plan: put the new plan in goalPlan, in a few words with its numbers.'
      : 'The reply says the plan was saved, but nothing saves it: send remember (kind goal, memory = its line) with the new plan in goalPlan.');
  // a goal lift's new plan sent to the routine but not saved on the goal: the next follow-up would judge the old plan
  if (/When you change its plan/.test(system) && actions.some((a) => a.type === 'edit_routine' && a.change?.length) && !actions.some((a) => a.type === 'remember' && (!!a.plan || !!a.goal?.plan)))
    out.push('The routine change is the goal\'s new plan, but the goal note doesn\'t carry it: also send the remember for that goal (memory = its number, as GOALS shows) with goalPlan = the new plan in a few words with its kilos and reps.');
  // asks whether to save a goal that this answer already saves (a "Goal set" card under "Shall I save this goal?")
  const asksSave = reply.split(/(?<=[.!?])\s+|\n+/).some((x) => /\?\s*$/.test(x) && /\b(?:save|set up|set)\b[^?]{0,60}\bgoal\b|\b(?:set|save)\b[^?]{0,10}\b(?:this|it)\s+up\b/i.test(x));
  if (asksSave && actions.some((a) => a.type === 'remember' && (a.kind === 'goal' || !!a.goal) && !a.replaces))
    out.push('The reply asks whether to save the goal, but this answer already saves it: either save nothing yet and ask, or save it and say it is saved.');
  // ("All set: … Daily target: 2,460 kcal" with nothing that sets it; Flash, 26 Oct)
  const targetStated = /\b(?:all set|set up|done|saved|locked in)\b/i.test(done) && /\b(?:daily |calorie |kcal )?targets?\b[^.!?\n]{0,20}?(?:\d{1,2}[,.]\d{3}|\d{4})\s*kcal/i.test(done);
  if ((TARGET_CLAIM.test(done) || targetStated) && !has('set_setting'))
    out.push('The reply says a target was set, but no set_setting sets it: send it (kcalGoal / proteinGoal), or offer it as a question instead.');
  // one question, not two ("What date is the weigh-in, or should I set it up for the 1st?")
  const asks = reply.split(/(?<=[.!?])\s+|\n+/).filter((x) => /\?\s*$/.test(x));
  if (asks.length > 1 || asks.some((x) => /,?\s+(?:or|and)\s+(?:should|shall|do you want|want|would you like)\s+(?:I|me|you|us|to)\b/i.test(x)))
    out.push('The reply asks more than one thing: keep only the one question that matters most now; say the rest as what you will do (or leave it out).');
  // (a real answer only: a short confirmation of a log is left alone)
  if (reply.length >= 250) {
    const said = numbers(reply);
    for (const m of mustSays(system)) {
      const want = numbers(m);
      if (want.size && ![...want].some((n) => said.has(n))) out.push(`GOALS said MUST SAY THIS TURN, and the reply leaves it out: ${m.slice(0, 400)}`);
    }
  }
  return out;
}

/** Added to the instructions when the answer is asked for again. */
export function checkNote(problems: string[], raw: unknown): string {
  let last = '';
  try { last = JSON.stringify(raw).slice(0, 6000); } catch { /* (nothing to show) */ }
  return `\n\nCHECK OF YOUR ANSWER (the app read it before showing it, and found these; answer again in full, as the same JSON, keeping everything that was right and fixing only these):\n${problems.map((p) => `- ${p}`).join('\n')}${last ? `\nYour answer was: ${last}` : ''}`;
}

/** "2026-12-24" in a reply, as people say it: "24 December" ("24. december"), with the year only when it isn't this one. */
export function readableDates(reply: string, lang: Lang, today = dayKey()): string {
  return reply.replace(/\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, (key, y) =>
    fmtDate(key, lang, { day: 'numeric', month: 'long', ...(y !== today.slice(0, 4) ? { year: 'numeric' } : {}) }));
}
