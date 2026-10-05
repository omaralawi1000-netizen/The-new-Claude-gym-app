import { useState } from 'react';
import { useT } from '../lib/i18n';
import { Seg, Toggle } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { useAi } from '../state/ai';
import { getKey, setKey, mask } from '../lib/keys';
import { testGroqKey } from '../lib/groq';
import { listModels, pickTextModels } from '../lib/gemini';
import { VOICES, FALLBACK_TTS } from '../lib/tts';

type Test = { state: 'idle' | 'busy' | 'ok' | 'bad'; text?: string };

function KeyField({ name, label, hint, onTest, test }: { name: 'groq' | 'gemini'; label: string; hint: string; onTest: (key: string) => void; test: Test }) {
  const t = useT();
  const has = useAi((a) => (name === 'groq' ? a.hasGroq : a.hasGemini));
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
      <div className="small t2">{t('Optional, and free. Aven works without them; with them it hears you better (Danish too) and the Coach can talk and act.')}</div>
      <KeyField name="groq" label={t('Groq key — hears you (Whisper)')} hint={t('Free at console.groq.com. Used only to turn your recording into text.')} onTest={testGroq} test={g} />
      <KeyField name="gemini" label={t('Gemini key — understands you')} hint={t('Free at aistudio.google.com. Used to read your sentences, estimate foods, build routines and talk in the Coach.')} onTest={testGemini} test={m} />

      <div className="plinth" style={{ padding: 16 }}>
        <div className="stack gap16">
          <div className="field"><label>{t('Transcription')}</label>
            <Seg value={ai.stt} onChange={(v) => ai.patch({ stt: v })} options={[{ value: 'accurate', label: t('Accurate') }, { value: 'fast', label: t('Fast') }]} /></div>
          <div className="field"><label>{t('Language you speak')}</label>
            <Seg value={ai.voiceLang} onChange={(v) => ai.patch({ voiceLang: v })} options={[{ value: 'auto', label: t('Auto') }, { value: 'da', label: 'Dansk' }, { value: 'en', label: 'English' }]} /></div>
          <div className="row-flex between"><div><div>{t('Let Gemini understand dictation')}</div></div><Toggle on={ai.brain} onChange={(v) => ai.patch({ brain: v })} label={t('Let Gemini understand dictation')} /></div>
          <div className="row-flex between"><div><div>{t('Read answers aloud automatically')}</div></div><Toggle on={ai.speak} onChange={(v) => ai.patch({ speak: v })} label={t('Read answers aloud automatically')} /></div>
          {ai.speak && <div className="field"><label>{t('Voice')}</label><div className="chips" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>{VOICES.map((v) => <button key={v} className={`chip sm press ${ai.voice === v ? 'on' : ''}`} onClick={() => ai.patch({ voice: v })}>{v}</button>)}</div></div>}
        </div>
      </div>

      <div className="xs t3">
        <b>{t('What leaves your phone')}</b>: {t('your recording goes to Groq; the text of what you said (and, in the Coach, a short summary of your targets and recent training) goes to Google Gemini. Free-tier terms apply to both — free Gemini traffic may be used by Google to improve its products, so don’t put anything in there you wouldn’t want that. Aven stores no audio. The keys live only in this browser on this device: they are not in backups or exports, and “Delete everything” removes them.')}
      </div>
    </div>
  );
}
