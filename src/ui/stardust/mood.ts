/**
 * The mood of what it is saying, from its words (Danish or English), so Stardust's colour can lean with it while it speaks
 * (Omar, 26 Oct): warmer for good news and praise, cooler and deeper for something serious. -1 (serious) … 1 (glad); 0 when
 * nothing says either. Words only, no AI call: it runs as the answer streams in. A "not" right before a word turns it.
 */
const GLAD = /^(great|nice|awesome|amazing|perfect|excellent|well|congrats|congratulations|proud|strong|record|best|love|happy|good|yes|fantastic|brilliant|crushed|smashed|solid|flot|godt|super|fedt|perfekt|fantastisk|stærk|stærkt|rekord|bedste|tillykke|stolt|dejligt|ja|sejt|skønt)$/;
const GRAVE = /^(sorry|careful|pain|injury|injured|hurt|risk|warning|missed|miss|behind|over|too|stop|rest|sick|ill|tired|unfortunately|problem|wrong|beklager|forsigtig|smerte|skade|skadet|ondt|risiko|advarsel|desværre|problem|forkert|syg|træt|pause)$/;
const NOT = /^(not|no|never|don't|didn't|ikke|aldrig|ingen)$/;

export function moodOf(text: string): number {
  const words = text.toLowerCase().replace(/[^a-zæøå'\s]/g, ' ').split(/\s+/).filter(Boolean).slice(-60); // (the latest words weigh in)
  let glad = 0, grave = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i], flip = i > 0 && NOT.test(words[i - 1]);
    const g = GLAD.test(w), s = GRAVE.test(w);
    if (g) (flip ? grave++ : glad++);
    else if (s) (flip ? glad++ : grave++);
  }
  const n = glad + grave;
  return n ? Math.max(-1, Math.min(1, ((glad - grave) / n) * Math.min(1, n / 3))) : 0;
}
