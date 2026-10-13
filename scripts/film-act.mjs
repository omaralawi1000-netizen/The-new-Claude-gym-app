// Films one action as a strip of frames (Chrome's screencast, every frame it draws), tiled into one image, so a pop, a
// jump or a flash can be seen frame by frame. Used by the polish pass: import { filmer } and wrap an action.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
export async function filmer(ctx, p) {
  const cdp = await ctx.newCDPSession(p);
  return async function film(name, fn, ms = 1200, { every = 2, cols = 8, crop } = {}) {
    const dir = `shots/film/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const frames = [];
    const on = (f) => { frames.push(f); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); };
    cdp.on('Page.screencastFrame', on);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
    await p.waitForTimeout(150);
    const t0 = Date.now() / 1000;
    await fn();
    await p.waitForTimeout(ms);
    await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame', on);
    const keep = frames.filter((_, i) => i % every === 0);
    keep.forEach((f, i) => fs.writeFileSync(`${dir}/${String(i).padStart(3, '0')}.jpg`, Buffer.from(f.data, 'base64')));
    const rows = Math.ceil(keep.length / cols);
    const vf = [crop ? `crop=${crop}` : null, 'scale=240:-1', `drawtext=text='%{n}':x=4:y=4:fontsize=14:fontcolor=yellow:box=1:boxcolor=black`, `tile=${cols}x${rows}`].filter(Boolean).join(',');
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', `${dir}/%03d.jpg`, '-vf', vf, '-frames:v', '1', `shots/film/${name}.jpg`]); } catch (e) { console.log('tile failed', String(e.message).slice(0, 200)); }
    console.log(`film ${name}: ${frames.length} frames (${(frames.length / ((Date.now() / 1000) - t0)).toFixed(0)} fps), every ${every} → shots/film/${name}.jpg`);
  };
}
