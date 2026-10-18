import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../../state/store';
import { useUI, haptic } from '../../state/ui';
import { useAi, anyBrain, solOn } from '../../state/ai';
import { useT, useLang } from '../../lib/i18n';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { getKey } from '../../lib/keys';
import { blobToBase64, cameraUsable, downscale } from '../../lib/photos';
import { aiErrorText, FALLBACK_MODELS } from '../../lib/gemini';
import { estimatePhoto } from '../../lib/brain';
import { overLimit } from '../../lib/spend';
import type { FoodEstimate } from '../../lib/aiValidate';
import { quickEntry } from '../../lib/nutrition';
import { mealName } from '../../lib/derive';
import { fmtNum } from '../../lib/units';

interface Item extends FoodEstimate { on: boolean; k: number }
const PORTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];


const SCAN_WORDS = ['Looking at your plate', 'Spotting the ingredients', 'Estimating portions', 'Adding it up'];
// PREVIEW ONLY: six looks for the wait, chosen with localStorage 'aven.scan' (A-F); Omar picks one, the rest are deleted
export const scanVariant = () => { try { return localStorage.getItem('aven.scan') || 'A'; } catch { return 'A'; } };
/** Which of the four steps the wait is at (rAF + performance.now, so it follows the real clock): it moves on every 1.9 s, and
 *  "Adding it up" only comes after 7 s so a long wait never sits on the last words. */
const STEP_AT = [0, 1900, 3800, 7000];
function useStep() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t0 = performance.now(); let raf = 0;
    const tick = () => {
      const e = performance.now() - t0;
      setI((n) => { const k = STEP_AT.reduce((m, at, j) => (e >= at ? j : m), 0); return k === n ? n : k; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return i;
}
/** While the photo is read: no orb. Only transform and opacity move. The root never fades (a fading ancestor would drop the
 *  frost of the words capsule); the film, band and corners fade as one layer and the capsule fades by itself. */
function Scan({ v }: { v: string }) {
  const t = useT();
  const i = useStep();
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.45 } };
  const words = (
    <motion.div className="scan-words" {...fade}>
      <AnimatePresence initial={false}>
        <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>{t(SCAN_WORDS[i])}</motion.span>
      </AnimatePresence>
    </motion.div>
  );
  return (
    <div className={`scan scan-${v}`} aria-hidden>
      <motion.div className="scan-fx" {...fade}>
        <i className="scan-film" />
        {v === 'A' && <><i className="scan-band" /><i className="scan-c tl" /><i className="scan-c tr" /><i className="scan-c bl" /><i className="scan-c br" /></>}
        {v === 'B' && <div className="aur-ring"><i /></div>}
        {v === 'C' && <><i className="son r0" /><i className="son r1" /><i className="son r2" /><i className="son-dot" /></>}
        {v === 'D' && <div className="lock"><i className="scan-c tl" /><i className="scan-c tr" /><i className="scan-c bl" /><i className="scan-c br" /></div>}
      </motion.div>
      {(v === 'A' || v === 'B' || v === 'C' || v === 'D' || v === 'F') && words}
    </div>
  );
}
/** Option F: grey stand-ins where the items will land, the size of the real cards; they melt into them. */
function Ghosts() {
  return (
    <motion.div className="ghosts stack gap8" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.35 } }} transition={{ duration: 0.45 }} style={{ marginTop: 16 }}>
      {[0, 1, 2].map((k) => <div key={k} className="ghost plinth"><i className="ghost-sh" style={{ animationDelay: `${k * 180}ms` }} /></div>)}
    </motion.div>
  );
}

/** Snap your plate: a photo → Gemini's per-item estimate → you adjust portions → logged as clearly labelled AI estimates. */
export function PhotoFood({ props }: { props: { date: string; mealId: string; file?: File } }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const toast = useUI((u) => u.toast);
  const hasAi = useAi((a) => anyBrain(a));
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
  const openCam = () => { if (cameraUsable()) push('camera', { onShot: pick }); else cam.current?.click(); };
  const meal = meals.find((m) => m.id === props.mealId) ?? meals[0];

  useEffect(() => () => { ctl.current?.abort(); if (img) URL.revokeObjectURL(img.url); }, []); // eslint-disable-line

  const analyse = async (blob: Blob) => {
    setErr(null); setBusy(true); setItems([]);
    ctl.current?.abort(); ctl.current = new AbortController();
    const a = useAi.getState(), m = a.models;
    try {
      // GPT-6.1 Sol (medium) when it is on, Gemini otherwise or if Sol can't answer
      const brain = { key: a.hasGemini ? getKey('gemini') : '', models: [...new Set([m.fast || FALLBACK_MODELS.fast, m.brain || FALLBACK_MODELS.brain].filter(Boolean))], signal: ctl.current.signal, sol: solOn(a) && !overLimit(a.solLimitKr) ? { key: getKey('openai'), effort: a.effortOrb } : undefined };
      const r = await estimatePhoto({ mime: 'image/jpeg', data: await blobToBase64(blob) }, brain, lang, hint.trim());
      setItems(r.items.map((x) => ({ ...x, on: true, k: 1 }))); setAssume(r.assumptions);
      haptic('light');
    } catch (e: any) {
      setErr(e?.code === 'invalid' ? t('That doesn’t look like food. Try another photo.') : aiErrorText(e, t));
    } finally { setBusy(false); }
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

  useEffect(() => { if (props.file) pick(props.file); }, []); // eslint-disable-line -- the camera hands its shot over (CameraSheet)

  const sv = useMemo(scanVariant, []);
  const chosen = items.filter((x) => x.on);
  const total = chosen.reduce((n, x) => n + x.kcal * x.k, 0);
  const log = () => {
    if (!chosen.length) return;
    const entries = chosen.map((x) => {
      const q = quickEntry(`${x.name} (${t('AI estimate')})`, { kcal: x.kcal * x.k, protein: x.protein * x.k, carbs: x.carbs * x.k, fat: x.fat * x.k }, props.date, meal.id);
      return { ...q, estimated: true, note: [x.grams ? `~${Math.round(x.grams * x.k)} g` : '', assume].filter(Boolean).join(' · ') || undefined };
    });
    const added = useStore.getState().logEntries(entries);
    haptic('saved');
    useUI.getState().closeAll();
    toast(t(added.length === 1 ? 'Added 1 item to {meal}' : 'Added {n} items to {meal}', { n: added.length, meal: mealName(meal, lang) }), { tone: 'ok', actionLabel: t('Undo'), onAction: () => added.forEach((e) => useStore.getState().removeEntry(e.id)) });
  };

  return (
    <Sheet onClose={pop} tall label={t('Photo')} z={100}
      foot={items.length ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, delay: 0.3 }}><button className="btn primary block press" disabled={!chosen.length} onClick={log}>{t(chosen.length === 1 ? 'Log 1 item' : 'Log {n} items', { n: chosen.length })} · {fmtNum(Math.round(total), lang, 0)} kcal</button></motion.div> : undefined}>
      <SheetHead title={t('Snap your plate')} sub={mealName(meal, lang)} onClose={pop} />
      <div className="sheet-body">
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {!hasAi ? (
          <div className="empty">
            <div className="display display-sm" style={{ fontStyle: 'italic' }}>{t('Needs an AI key')}</div>
            <button className="btn primary press" style={{ marginTop: 14 }} onClick={() => push('settings', { section: 'ai' })}><Icon name="sparkle" size={18} /> {t('Add a key')}</button>
          </div>
        ) : (
          <>
            <motion.div layout transition={SOFT} style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', aspectRatio: img ? '4 / 3' : '4 / 3.2', background: 'var(--s1)', boxShadow: 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)' }}>
              {img ? <motion.div key={img.url} initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ position: 'absolute', inset: 0 }}>
                <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </motion.div> : (
                <button className="press" onClick={openCam} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 12 }} aria-label={t('Take a photo')}>
                  <span className="icon-btn acc" style={{ width: 74, height: 74 }}><Icon name="camera" size={30} /></span>
                  <span className="small t2">{t('Take a photo')}</span>
                </button>
              )}
              <AnimatePresence>{busy && <Scan key="scan" v={sv} />}</AnimatePresence>
            </motion.div>
            <div className="row-flex" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn sm press grow" onClick={openCam}><Icon name="camera" size={16} /> {img ? t('Retake') : t('Camera')}</button>
              <button className="btn sm press grow" onClick={() => lib.current?.click()}><Icon name="upload" size={16} /> {t('From gallery')}</button>
            </div>
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              <input className="input grow" value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t('Optional hint, e.g. “with rice, no sauce”')} aria-label={t('Hint')} />
              {img && <button className="icon-btn press" aria-label={t('Analyse again')} disabled={busy} onClick={() => analyse(img.blob)}><Icon name="repeat" /></button>}
            </div>
            {err && <div className="plinth-2 small" role="alert" style={{ padding: '12px 14px', marginTop: 12, color: 'var(--bad)' }}>{err}</div>}
            <AnimatePresence>{busy && sv === 'F' && <Ghosts key="ghosts" />}</AnimatePresence>
            <AnimatePresence>
              {items.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} style={{ marginTop: 16 }}>
                  <div className="stack gap8">
                    {items.map((x, i) => (
                      <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: x.on ? 1 : 0.45 }} transition={{ duration: 0.5, delay: i * 0.08 }} className="plinth" style={{ padding: '12px 14px' }}>
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
