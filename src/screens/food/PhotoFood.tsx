import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from '../../state/store';
import { useUI, haptic } from '../../state/ui';
import { useT, useLang } from '../../lib/i18n';
import { Sheet, SheetHead, SOFT } from '../../ui/Sheet';
import { Icon } from '../../ui/Icon';
import { useAi, anyBrain } from '../../state/ai';
import { cameraUsable, downscale } from '../../lib/photos';
import { aiErrorText } from '../../lib/gemini';
import { Scan, ScanStage } from './PhotoScan';
import { readPhoto, logReadItems, PORTIONS, type ReadItem } from './photoRead';
import { mealName } from '../../lib/derive';
import { fmtNum } from '../../lib/units';

type Item = ReadItem;


/** Snap your plate: a photo → Gemini's per-item estimate → you adjust portions → logged as clearly labelled AI estimates. */
export function PhotoFood({ props }: { props: { date: string; mealId: string; file?: File } }) {
  const t = useT();
  const lang = useLang();
  const pop = useUI((u) => u.pop);
  const push = useUI((u) => u.push);
  const hasAi = useAi((a) => anyBrain(a));
  const meals = useStore((s) => s.settings.meals);
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const look = 'C' as const; // the Depth look: the whole picture leans back with the wave (the A/B looks were a Beta test)
  const depth = look === 'C';
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
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    try {
      const r = await readPhoto(blob, lang, hint, c.signal);
      if (c.signal.aborted) return;
      setItems(r.items); setAssume(r.assume);
      haptic('light');
    } catch (e: any) {
      if (c.signal.aborted) return; // a newer photo replaced this one: its read is the one that answers
      setErr(e?.code === 'invalid' ? t('That doesn’t look like food. Try another photo.') : aiErrorText(e, t));
    } finally { if (ctl.current === c) setBusy(false); }
  };
  const picks = useRef(0);
  const pick = async (f?: File) => {
    if (!f) return;
    const n = ++picks.current;
    try {
      const small = await downscale(f, 1024);
      if (n !== picks.current) return; // a newer photo was picked while this one was being read
      if (img) URL.revokeObjectURL(img.url);
      setImg({ url: URL.createObjectURL(small), blob: small });
      analyse(small);
    } catch { if (n === picks.current) setErr(t('Couldn’t read that image.')); }
  };

  useEffect(() => { if (props.file) pick(props.file); }, []); // eslint-disable-line -- the camera hands its shot over (CameraSheet)

  const fromCam = useRef(!!props.file); // the camera's photo is the one constant of the hand-over: it is there from the first frame, not faded in
  useEffect(() => { if (img) fromCam.current = false; }, [img]);
  const chosen = items.filter((x) => x.on);
  const total = chosen.reduce((n, x) => n + x.kcal * x.k, 0);
  const log = () => logReadItems(items, assume, props.date, meal, lang, t);

  return (
    <Sheet onClose={pop} tall label={t('Photo')} z={100}
      foot={items.length ? <motion.button className="btn primary block press" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, delay: 0.3 }} disabled={!chosen.length} onClick={log}>{t(chosen.length === 1 ? 'Log 1 item' : 'Log {n} items', { n: chosen.length })} · {fmtNum(Math.round(total), lang, 0)} kcal</motion.button> : undefined}>
      <SheetHead title={t('Snap your plate')} sub={mealName(meal, lang)} onClose={pop} />
      <div className="sheet-body melt-foot">
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {!hasAi ? (
          <div className="empty">
            <div className="display display-sm" style={{ fontStyle: 'italic' }}>{t('Needs an AI key')}</div>
            <button className="btn primary press" style={{ marginTop: 14 }} onClick={() => push('settings', { section: 'ai' })}><Icon name="sparkle" size={18} /> {t('Add a key')}</button>
          </div>
        ) : (
          <>
            <ScanStage depth={depth} busy={busy}>
            <motion.div layout transition={SOFT} style={{ position: 'relative', borderRadius: 'var(--r-lg)', overflow: 'hidden', aspectRatio: img ? '4 / 3' : '4 / 3.2', background: 'var(--s1)', boxShadow: 'inset 0 1px 0 var(--hl), inset 0 0 0 1px var(--line)' }}>
              {img ? <motion.div key={img.url} initial={fromCam.current ? false : { opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} style={{ position: 'absolute', inset: 0 }}>
                <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </motion.div> : (
                <button className="press" onClick={openCam} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 12 }} aria-label={t('Take a photo')}>
                  <span className="icon-btn acc" style={{ width: 74, height: 74 }}><Icon name="camera" size={30} /></span>
                  <span className="small t2">{t('Take a photo')}</span>
                </button>
              )}
              <AnimatePresence>{busy && img && <Scan key="scan" src={img.url} v={look} />}</AnimatePresence>
            </motion.div>
            </ScanStage>
            <div className="row-flex" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn sm press grow" onClick={openCam}><Icon name="camera" size={16} /> {img ? t('Retake') : t('Camera')}</button>
              <button className="btn sm press grow" onClick={() => lib.current?.click()}><Icon name="upload" size={16} /> {t('From gallery')}</button>
            </div>
            <div className="row-flex" style={{ gap: 8, marginTop: 10 }}>
              <input className="input grow" value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t('Optional hint, e.g. “with rice, no sauce”')} aria-label={t('Hint')} />
              {img && <button className="icon-btn press" aria-label={t('Analyse again')} disabled={busy} onClick={() => analyse(img.blob)}><Icon name="repeat" /></button>}
            </div>
            {err && <div className="plinth-2 small" role="alert" style={{ padding: '12px 14px', marginTop: 12, color: 'var(--bad)' }}>{err}</div>}
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
