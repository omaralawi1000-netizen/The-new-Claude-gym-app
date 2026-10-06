import { useState, useSyncExternalStore } from 'react';
import { useT, useLang } from '../lib/i18n';
import { Seg, Toggle } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useAi } from '../state/ai';
import { getKey, setKey, mask } from '../lib/keys';
import { testGroqKey } from '../lib/groq';
import { listModels, pickTextModels } from '../lib/gemini';
import { testOpenaiKey } from '../lib/openai';
import { spendSnapshot, subscribeSpend } from '../lib/spend';
import { fmtNum } from '../lib/units';
import { VOICES, FALLBACK_TTS } from '../lib/tts';

type Test = { state: 'idle' | 'busy' | 'ok' | 'bad'; text?: string };

function KeyField({ name, label, hint, onTest, test }: { name: 'groq' | 'gemini' | 'openai'; label: string; hint: string; onTest: (key: string) => void; test: Test }) {
  const t = useT();
  const has = useAi((a) => (name === 'groq' ? a.hasGroq : name === 'openai' ? a.hasOpenai : a.hasGemini));
  const [val, setVal] = useState('');
  const [show, setShow] = useState(false);
  const save = () => { const v = val.trim(); if (!v) return; setKey(name, v); setVal(''); onTest(v); };
  return (
    <div className="plinth" style={{ padding: 16 }}>
      <div className="row-flex between"><div className="li-title">{label}</div>{has && <span className="chip sm" style={{ color: 'var(--ok)', background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--ok)' }}><Icon name="check" size={13} sw={2.4} /> {t('Saved')} {mask(getKey(name))}</span>}</div>
      <div className="xs t3" style={{ margin: '4px 0 10px' }}>{hint}</div>
      <div className="row-flex" style={{ gap: 8 }}>
        <input className="input grow" type={show ? 'text' : 'password'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} aria-label={label} placeholder={has ? t('Paste a new key to replace it') : t('Paste your key')} value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <button className="icon-btn flat" aria-label={show ? t('Hide key') : t('Show key')} onClick={() => setShow((v) => !v)}><Icon name="eye" style={{ opacity: show ? 1 : 0.5 }} /></button>
      </div>
      <div className="row-flex" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button className="btn primary sm press" disabled={!val.trim()} onClick={save}>{t('Save and test')}</button>
        {has && <button className="btn sm press" disabled={test.state === 'busy'} onClick={() => onTest(getKey(name))}>{t('Test again')}</button>}
        {has && <button className="btn sm danger press" onClick={() => { setKey(name, ''); }}>{t('Remove key')}</button>}
      </div>
      {test.state !== 'idle' && <div className="small" role="status" style={{ marginTop: 10, color: test.state === 'ok' ? 'var(--ok)' : test.state === 'bad' ? 'var(--bad)' : 'var(--tx2)' }}>{test.state === 'busy' ? t('Testing…') : test.text}</div>}
    </div>
  );
}

export function VoiceAiSettings() {
  const t = useT();
  const ai = useAi();
  const [g, setG] = useState<Test>({ state: 'idle' });
  const [m, setM] = useState<Test>({ state: 'idle' });
  const [o, setO] = useState<Test>({ state: 'idle' });
  const testOpenai = async (key: string) => {
    setO({ state: 'busy' });
    const r = await testOpenaiKey(key);
    setO(r === 'ok' ? { state: 'ok', text: t('OpenAI key works. GPT-6.1 Sol now answers the orb and the Coach.') } : r === 'bad' ? { state: 'bad', text: t('OpenAI rejected this key.') } : r === 'nomodel' ? { state: 'bad', text: t('The key works, but GPT-6.1 Sol isn’t enabled on this OpenAI account.') } : r === 'offline' ? { state: 'bad', text: t('Couldn’t reach OpenAI. Check your connection — the key was saved anyway.') } : { state: 'bad', text: t('OpenAI answered with an unexpected error ({c}).', { c: r }) });
  };

  const testGroq = async (key: string) => {
    setG({ state: 'busy' });
    const r = await testGroqKey(key);
    setG(r === 'ok' ? { state: 'ok', text: t('Groq key works.') } : r === 'bad' ? { state: 'bad', text: t('Groq rejected this key.') } : r === 'offline' ? { state: 'bad', text: t('Couldn’t reach Groq. Check your connection — the key was saved anyway.') } : { state: 'bad', text: t('Groq answered with an unexpected error ({c}).', { c: r }) });
  };
  const testGemini = async (key: string) => {
    setM({ state: 'busy' });
    const r = await listModels(key);
    if (r.status === 'ok') {
      const p = pickTextModels((r as any).models);
      useAi.getState().patch({ models: { fast: p.fast, brain: p.brain, fastAlt: p.fastAlt, brainAlt: p.brainAlt, tts: p.tts || FALLBACK_TTS } });
      setM({ state: 'ok', text: t('Gemini key works. Using {a} for dictation and {b} for the Coach.', { a: p.fast || 'flash-lite', b: p.brain || 'flash' }) });
    } else setM({ state: 'bad', text: r.status === 'bad' ? t('Gemini rejected this key.') : r.status === 'offline' ? t('Couldn’t reach Gemini. Check your connection — the key was saved anyway.') : t('Gemini couldn’t be checked right now ({c}).', { c: r.status }) });
  };

  return (
    <div className="stack gap16">
      <div className="small t2">{t('Optional. Aven works without them; with them it hears you better (Danish too) and the Coach can talk and act. Groq and Gemini are free; OpenAI is paid.')}</div>
      <KeyField name="groq" label={t('Groq key — hears you (Whisper)')} hint={t('Free at console.groq.com. Used only to turn your recording into text.')} onTest={testGroq} test={g} />
      <KeyField name="gemini" label={t('Gemini key — understands you')} hint={t('Free at aistudio.google.com. Used to read your sentences, estimate foods, build routines and talk in the Coach.')} onTest={testGemini} test={m} />
      <KeyField name="openai" label={t('OpenAI key — GPT-6.1 Sol (paid)')} hint={t('From platform.openai.com. Billed per use (about 0.20 kr per orb command on Medium, 0.40–0.50 kr on High). Set a monthly spend limit there. Gemini stays the free fallback and reads answers aloud.')} onTest={testOpenai} test={o} />
      {ai.hasOpenai && (
        <div className="plinth" style={{ padding: 16 }}>
          <div className="stack gap16">
            <div className="field"><label>{t('Brain')}</label>
              <Seg value={ai.solFirst ? 'sol' : 'gemini'} onChange={(v) => ai.patch({ solFirst: v === 'sol' })} options={[{ value: 'sol', label: 'GPT-6.1 Sol' }, { value: 'gemini', label: 'Gemini' }]} /></div>
            {ai.solFirst && <>
              <div className="field"><label>{t('Thinking — orb')}</label>
                <Seg value={ai.effortOrb} onChange={(v) => ai.patch({ effortOrb: v })} options={[{ value: 'medium', label: t('Medium') }, { value: 'high', label: t('High') }]} /></div>
              <div className="field"><label>{t('Thinking — Coach')}</label>
                <Seg value={ai.effortCoach} onChange={(v) => ai.patch({ effortCoach: v })} options={[{ value: 'medium', label: t('Medium') }, { value: 'high', label: t('High') }]} />
                <div className="xs t2" style={{ marginTop: 6 }}>{t('The most it may think, for planning and analysis. Chat, logging and quick questions always answer fast.')}</div></div>
              <SolSpend />
            </>}
          </div>
        </div>
      )}

      <div className="plinth" style={{ padding: 16 }}>
        <div className="stack gap16">
          <div className="field"><label>{t('Transcription')}</label>
            <Seg value={ai.stt} onChange={(v) => ai.patch({ stt: v })} options={[{ value: 'accurate', label: t('Accurate') }, { value: 'fast', label: t('Fast') }]} /></div>
          <div className="field"><label>{t('Language you speak')}</label>
            <Seg value={ai.voiceLang} onChange={(v) => ai.patch({ voiceLang: v })} options={[{ value: 'auto', label: t('Auto') }, { value: 'da', label: 'Dansk' }, { value: 'en', label: 'English' }]} /></div>
          <div className="field"><label>{t('Microphone')}</label>
            <Seg value={ai.mic} onChange={(v) => ai.patch({ mic: v })} options={[{ value: 'phone', label: t('Phone') }, { value: 'any', label: t('Earbuds') }]} />
            <div className="xs t2" style={{ marginTop: 6 }}>{t('With earbuds in, the phone’s own mic hears you better and keeps your music playing.')}</div></div>
          <div className="row-flex between"><div><div>{t('Let Gemini understand dictation')}</div></div><Toggle on={ai.brain} onChange={(v) => ai.patch({ brain: v })} label={t('Let Gemini understand dictation')} /></div>
          <div className="field"><label>{t('Voice for read-aloud')}</label><div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{VOICES.map((v) => <button key={v} className={`chip sm press ${ai.voice === v ? 'on' : ''}`} onClick={() => ai.patch({ voice: v })}>{v}</button>)}</div>
            <div className="xs t2" style={{ marginTop: 6 }}>{t('Answers are only read aloud when you tap ▶ next to them.')}</div></div>
        </div>
      </div>

      <div className="xs t3">
        <b>{t('What leaves your phone')}</b>: {t('your recording goes to Groq; the text of what you said (and, in the Coach, a short summary of your targets and recent training) goes to Google Gemini. Free-tier terms apply to both — free Gemini traffic may be used by Google to improve its products, so don’t put anything in there you wouldn’t want that. Aven stores no audio. The keys live only in this browser on this device: they are not in backups or exports, and “Delete everything” removes them.')}
        {ai.hasOpenai && <> {t('With GPT-6.1 Sol on, that text (and plate photos) goes to OpenAI instead, sent with “don’t store”; OpenAI doesn’t train on API data.')}</>}
      </div>
    </div>
  );
}

/** What Sol has cost this month (an estimate from OpenAI's token counts) and the monthly limit after which Gemini answers. */
function SolSpend() {
  const t = useT();
  const lang = useLang();
  const ai = useAi();
  const [kr, calls] = useSyncExternalStore(subscribeSpend, spendSnapshot).split('|').map(Number);
  const over = ai.solLimitKr > 0 && kr >= ai.solLimitKr;
  return (
    <div className="field">
      <label>{t('Spending this month')}</label>
      <div className="row-flex between" style={{ alignItems: 'baseline' }}>
        <span className="num" style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em' }}>≈ {fmtNum(kr, lang, kr < 10 ? 2 : 0)} kr</span>
        <span className="xs t2">{t('{n} answers · estimate', { n: calls })}</span>
      </div>
      <div className="xs t2" style={{ margin: '10px 0 6px' }}>{t('Monthly limit — then Gemini answers until next month')}</div>
      <div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
        {[0, 50, 100, 200, 500].map((v) => <button key={v} className={`chip sm press ${ai.solLimitKr === v ? 'on' : ''}`} onClick={() => ai.patch({ solLimitKr: v })}>{v ? `${v} kr` : t('No limit')}</button>)}
      </div>
      {over && <div className="xs" style={{ marginTop: 8, color: 'var(--warn)' }}>{t('Limit reached: Gemini is answering until next month.')}</div>}
      <div className="xs t3" style={{ marginTop: 8 }}>{t('Counted on this phone from what OpenAI reports. Your real bill is on platform.openai.com — set a hard limit there too.')}</div>
    </div>
  );
}
