// Pop probe: finds things that appear, vanish or jump instead of moving. Injected into the page by audit-polish.mjs.
// - pop-in:  an element added to the page that is fully visible on its first frame and doesn't move or fade afterwards
// - pop-out: a visible, fully opaque element removed from the page (nothing faded or moved it out first)
// - jump:    a layout shift (something moved by layout, not by a transform) of a visible element
// - number:  visible digits rewritten in place without the rolling `Roll`
// Each finding carries the label of the action running at the time (window.__act).
export const PROBE = () => {
  const log = (window.__pops = []);
  window.__act = 'load';
  const H = innerHeight, W = innerWidth;
  const eff = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= +cs.opacity; } return o; };
  const desc = (el) => {
    const c = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const t = (el.getAttribute?.('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    let path = ''; for (let e = el.parentElement, i = 0; e && i < 3; e = e.parentElement, i++) { const cc = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : ''; path = e.tagName.toLowerCase() + cc + (path ? ' > ' + path : ''); }
    return `${path} > ${el.tagName.toLowerCase()}${c} "${t}"`;
  };
  const seen = (el) => { const r = el.getBoundingClientRect(); const vw = Math.min(r.right, W) - Math.max(r.left, 0), vh = Math.min(r.bottom, H) - Math.max(r.top, 0); return { r, area: vw > 0 && vh > 0 ? vw * vh : 0 }; };
  const ignore = (el) => el.closest?.('.roll, .fps, canvas, svg, .roll-ghost, [data-probe-skip]') || ['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName);
  const snap = (el) => { const { r, area } = seen(el); return { x: r.x, y: r.y, w: r.width, h: r.height, area, o: eff(el) }; };
  const same = (a, b) => Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.o - b.o) < 0.02;
  new MutationObserver((muts) => {
    const act = window.__act;
    for (const m of muts) {
      if (m.type === 'characterData') {
        const el = m.target.parentElement; if (!el || ignore(el)) continue;
        const was = m.oldValue || '', now = m.target.data || '';
        if (/\d/.test(now) && was !== now && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(now.trim())) { const s = snap(el); if (s.area > 0 && s.o > 0.5) log.push({ kind: 'number', act, what: desc(el), was, now }); }
        continue;
      }
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1 || ignore(n)) continue;
        requestAnimationFrame(() => {
          if (!n.isConnected) return;
          const a = snap(n); if (a.area < 600 || a.o < 0.95) return;
          setTimeout(() => { if (!n.isConnected) return; const b = snap(n);
            setTimeout(() => { if (!n.isConnected) return; const c = snap(n); if (same(a, b) && same(b, c)) log.push({ kind: 'pop-in', act, what: desc(n), size: `${Math.round(a.w)}x${Math.round(a.h)}` }); }, 380);
          }, 70);
        });
      }
    }
  }).observe(document, { childList: true, subtree: true, characterData: true, characterDataOldValue: true });
  const rm = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    try { if (child.nodeType === 1 && !ignore(child) && child.isConnected) { const s = snap(child); if (s.area >= 600 && s.o >= 0.95) log.push({ kind: 'pop-out', act: window.__act, what: desc(child), size: `${Math.round(s.w)}x${Math.round(s.h)}` }); } } catch { /* ignore */ }
    return rm.call(this, child);
  };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) for (const s of e.sources || []) {
    const n = s.node; if (!n || n.nodeType !== 1 || ignore(n)) continue;
    const d = Math.hypot(s.currentRect.x - s.previousRect.x, s.currentRect.y - s.previousRect.y) + Math.abs(s.currentRect.height - s.previousRect.height);
    if (d >= 4 && s.currentRect.height > 0 && s.previousRect.height > 0) log.push({ kind: 'jump', act: window.__act, what: desc(n), by: Math.round(d) });
  } }).observe({ type: 'layout-shift', buffered: true });
};
