import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../../state/store';
import { useUI, buzz } from '../../state/ui';
import { useAi } from '../../state/ai';
import { useVoice } from '../../state/voice';
import { useT, useLang } from '../../lib/i18n';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { SphereSlot } from '../../ui/Sphere';
import { Icon } from '../../ui/Icon';
import { getKey } from '../../lib/keys';
import { downscale } from '../../lib/photos';
import { aiEstimatePhoto, aiErrorText, FALLBACK_MODELS } from '../../lib/gemini';
import type { FoodEstimate } from '../../lib/aiValidate';
import { quickEntry } from '../../lib/nutrition';
import { mealName } from '../../lib/derive';
import { fmtNum } from '../../lib/units';

interface Item extends FoodEstimate { on: boolean; k: number }
const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

async function toBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Snap your plate: a photo → Gemini's per-item estimate → you adjust portions → logged as clearly labelled AI estimates. */
export function PhotoFood({ props }: { props: { date: string; mealId: string } }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const hasGemini = useAi((a) => a.hasGemini);
  const meals = useStore((s) => s.settings.meals);
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [assume, setAssume] = useState('');
  const [hint, setHint] = useState('');
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null);
  const meal = meals.find((m) => m.id === props.mealId) ?? meals[0];

  useEffect(() => () => { ctl.current?.abort(); if (useVoice.getState().phase === 'processing') useVoice.getState().go('idle'); if (img) URL.revokeObjectURL(img.url); }, []); // eslint-disable-line

  const analyse = async (blob: Blob) => {
    setErr(null); setBusy(true); setItems([]);
    useVoice.getState().go('processing'); // the sphere thinks along
    ctl.current?.abort(); ctl.current = new AbortController();
    const m = useAi.getState().models;
    try {
      const r = await aiEstimatePhoto({ mime: 'image/jpeg', data: await toBase64(blob) }, { key: getKey('gemini'), models: [...new Set([m.fast || FALLBACK_MODELS.fast, m.brain || FALLBACK_MODELS.brain].filter(Boolean))], signal: ctl.current.signal }, lang, hint.trim());
      setItems(r.items.map((x) => ({ ...x, on: true, k: 1 }))); setAssume(r.assumptions);
      buzz(10); useVoice.getState().go('review');
    } catch (e: any) {
      setErr(e?.code === 'invalid' ? t('That doesn’t look like food. Try another photo.') : aiErrorText(e, t)); useVoice.getState().go('error');
    } finally { setBusy(false); setTimeout(() => { if (['review', 'error'].includes(useVoice.getState().phase)) useVoice.getState().go('idle'); }, 1400); }
  };
  const pick = async (f?: File) => {
    if (!f) return;
    try {
      const small = await downscale(f, 1024);
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(small), blob: small });
      analyse(small);
    } catch { setErr(t('Couldn’t read that image.')); }
  };

  const chosen = items.filter((x) => x.on);
  const total = chosen.reduce((n, x) => n + x.kcal * x.k, 0);
  const log = () => {
    if (!chosen.length) return;
    const entries = chosen.map((x) => {
      const q = quickEntry(`${x.name} (${t('AI estimate')})`, { kcal: x.kcal * x.k, protein: x.protein * x.k, carbs: x.carbs * x.k, fat: x.fat * x.k }, props.date, meal.id);
      return { ...q, estimated: true, note: [x.grams ? `~${Math.round(x.grams * x.k)} g` : '', assume].filter(Boolean).join(' · ') || undefined };
    });
    const added = useStore.getState().logEntries(entries);
    buzz(16);
    useUI.getState().closeAll();
    toast(t('Added {n} items to {meal}', { n: added.length, meal: mealName(meal, lang) }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => added.forEach((e) => useStore.getState().removeEntry(e.id)) });
  };

  return (
    <Sheet onClose={pop} tall label={t('Photo')} z={100}
      foot={items.length ? <button className="btn primary block press" disabled={!chosen.length} onClick={log}>{t('Log {n} items', { n: chosen.length })} · {fmtNum(Math.round(total), lang, 0)} kcal</button> : undefined}>
      <SheetHead title={t('Snap your plate')} sub={mealName(meal, lang)} onClose={pop} />
      <div className="sheet-body">
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {!hasGemini ? (
          <div className="empty">
            <div className="display display-sm" style={{ fontStyle: 'italic' }}>{t('Needs a Gemini key')}</div>
            <button className="btn primary press" style={{ marginTop: 14 }} onClick={() => push('settings', { section: 'ai' })}><Icon name="sparkle" size={18} /> {t('Add a key')}</button>
          </div>
        ) : (
          <>
            <motion.div layout transition={SOFT} style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', aspectRatio: img ? '4 / 3' : '4 / 3.2', background: 'var(--s1)', boxShadow: 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)' }}>
              {img ? <motion.img key={img.url} src={img.url} alt="" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: busy ? 0.55 : 1, scale: 1, filter: busy ? 'blur(2px) saturate(1.2)' : 'blur(0px)' }} transition={{ duration: 0.5 }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : (
                <button className="press" onClick={() => cam.current?.click()} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 12 }} aria-label={t('Take a photo')}>
                  <span className="icon-btn acc" style={{ width: 74, height: 74 }}><Icon name="camera" size={30} /></span>
                  <span className="small t2">{t('Take a photo')}</span>
                </button>
              )}
              {busy && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                  {/* a light sweep across the photo while Gemini looks at it */}
                  <motion.i aria-hidden initial={{ x: '-120%' }} animate={{ x: '120%' }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, transparent 30%, rgba(255,255,255,.22) 50%, transparent 70%)' }} />
                  <SphereSlot id="photo" priority={10} style={{ width: 96, height: 96 }} />
                </div>
              )}
            </motion.div>
            <div className="row-flex" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn sm press grow" onClick={() => cam.current?.click()}><Icon name="camera" size={16} /> {img ? t('Retake') : t('Camera')}</button>
              <button className="btn sm press grow" onClick={() => lib.current?.click()}><Icon name="upload" size={16} /> {t('From gallery')}</button>
            </div>
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              <input className="input grow" value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t('Optional hint, e.g. “with rice, no sauce”')} aria-label={t('Hint')} />
              {img && <button className="icon-btn press" aria-label={t('Analyse again')} disabled={busy} onClick={() => analyse(img.blob)}><Icon name="repeat" /></button>}
            </div>
            {err && <div className="plinth-2 small" role="alert" style={{ padding: '12px 14px', marginTop: 12, color: 'var(--bad)' }}>{err}</div>}
            <AnimatePresence>
              {items.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ marginTop: 16 }}>
                  <div className="stack gap8">
                    {items.map((x, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: x.on ? 1 : 0.45, y: 0 }} transition={{ ...SOFT, delay: i * 0.05 }} className="plinth" style={{ padding: '12px 14px' }}>
                        <div className="row-flex between">
                          <button className="row-flex press grow" style={{ gap: 10, textAlign: 'left', minWidth: 0 }} onClick={() => setItems((l) => l.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} aria-pressed={x.on}>
                            <span style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', flex: 'none', background: x.on ? 'var(--ac)' : 'transparent', color: 'var(--ac-ink)', boxShadow: x.on ? 'none' : 'inset 0 0 0 1.5px var(--line-2)' }}>{x.on && <Icon name="check" size={14} sw={3} />}</span>
                            <span className="li-title trunc">~ {x.name}</span>
                          </button>
                          <span className="num" style={{ fontWeight: 650 }}>~{fmtNum(Math.round(x.kcal * x.k), lang, 0)}<span className="t3 small"> kcal</span></span>
                        </div>
                        <div className="xs t2 num" style={{ margin: '6px 0 8px 32px' }}>{x.grams ? `~${Math.round(x.grams * x.k)} g · ` : ''}P {Math.round(x.protein * x.k)} · C {Math.round(x.carbs * x.k)} · F {Math.round(x.fat * x.k)} g</div>
                        <div className="chips" style={{ margin: '0 0 0 32px', padding: 0, gap: 6 }}>{PORTIONS.map((k) => <button key={k} className={`chip sm press ${x.k === k ? 'on' : ''}`} onClick={() => setItems((l) => l.map((y, j) => (j === i ? { ...y, k } : y)))}>×{fmtNum(k, lang, 2)}</button>)}</div>
                      </motion.div>
                    ))}
                  </div>
                  {assume && <div className="xs" style={{ color: 'var(--warn)', marginTop: 10 }}>~ {assume}</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </Sheet>
  );
}
