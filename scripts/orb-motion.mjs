// The orb stays on its slot while the page steps back, in both native and script animation modes.
// Idle drawing must not continually force geometry reads; keyboard and interrupted flights still have to land correctly.
import assert from 'node:assert/strict';
import { launch } from './lib.mjs';
for (const hrr of ['0','1']) {
 const {b,ctx,p,errors}=await launch({size:{width:384,height:832}});
 try {
  await ctx.addInitScript(hrr=>{
  const native=Element.prototype.getBoundingClientRect;
  window.__orbReads=0;window.__countOrbReads=false;window.__sampleOrb=false;
  Element.prototype.getBoundingClientRect=function(){if(window.__countOrbReads&&!window.__sampleOrb&&this.matches('.app,[data-orb-slot]'))window.__orbReads++;return native.call(this);};localStorage.setItem('aven.hrr',hrr);localStorage.setItem('aven.v1',JSON.stringify({v:1,settings:{onboarded:true,theme:'dark',language:'en',motion:'full'}}));},hrr);
  await p.goto('http://127.0.0.1:5173/');await p.waitForTimeout(1400);
  const settled=async id=>{
   await p.waitForTimeout(1400);
   const data=await p.evaluate(id=>{
    const a=document.querySelector('.sphere-stage').getBoundingClientRect(),s=document.querySelector(`[data-orb-slot="${id}"]`).getBoundingClientRect();
    return {x:Math.abs(a.left-s.left),y:Math.abs(a.top-s.top),size:Math.abs(a.width-Math.min(s.width,s.height)),square:Math.abs(a.width-a.height)};
   },id);
   assert(data.x<1.5&&data.y<1.5&&data.size<1.5&&data.square<.01,`${hrr} ${id}: ${JSON.stringify(data)}`);
  };
  await settled('tab');
  await p.evaluate(()=>{window.__orbReads=0;window.__countOrbReads=true;});await p.waitForTimeout(1500);
  const idleReads=await p.evaluate(()=>{window.__countOrbReads=false;return window.__orbReads;});
  assert(idleReads<=8,`${hrr} idle orb repeatedly reads layout: ${idleReads}`);
  for (const name of ['Food','Progress','Train','Today']) {await p.getByRole('button',{name,exact:true}).click();await settled('tab');}
  await p.evaluate(async()=>{
   window.__orbReads=0;window.__countOrbReads=true;
   const {frame,cancelFrame}=await import('/node_modules/.vite/deps/motion_react.js');
   window.__orbSamples=[];
   const sample=()=>{
    const s=document.querySelector('[data-orb-slot="tab"]'),o=document.querySelector('.sphere-stage');
    if(!s||!o)return;
    window.__sampleOrb=true;
    const a=o.getBoundingClientRect(),r=s.getBoundingClientRect();
    window.__sampleOrb=false;
    window.__orbSamples.push({gap:Math.max(Math.abs(a.left-r.left),Math.abs(a.top-r.top),Math.abs(a.width-Math.min(r.width,r.height))),y:r.top});
   };
   frame.postRender(sample,true);window.__stopOrbSample=()=>cancelFrame(sample);
  });
  await p.getByLabel('Settings',{exact:true}).click();await p.waitForTimeout(1100);
  await p.keyboard.press('Escape');await p.waitForTimeout(1100);
  const {samples,motionReads}=await p.evaluate(()=>{window.__stopOrbSample();window.__countOrbReads=false;return {samples:window.__orbSamples,motionReads:window.__orbReads};});
  assert(motionReads<=60,`${hrr} sheet motion repeatedly forces geometry reads: ${motionReads}`);
  assert(samples.length>30,'sampled moving frames');
  const worst=Math.max(...samples.map(s=>s.gap));
  assert(worst<1.5,`${hrr} dock orb drift during sheet motion: ${worst.toFixed(2)}px`);
  await p.getByRole('button',{name:'Coach',exact:true}).click();await settled('coach');
  await p.evaluate(async()=>{const {setKeyboard}=await import('/src/ui/keyboard.ts');setKeyboard(300);});await settled('coach');
  await p.evaluate(async()=>{const {setKeyboard}=await import('/src/ui/keyboard.ts');setKeyboard(0);});await settled('coach');
  await p.keyboard.press('Escape');await settled('tab');
  for(let i=0;i<3;i++){await p.getByRole('button',{name:'Coach',exact:true}).click();await p.waitForTimeout(90);await p.keyboard.press('Escape');await p.waitForTimeout(90);}
  await settled('tab');
  assert.equal(await p.locator('.sphere-stage canvas').count(),1,'one orb canvas');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(`ORB OK hrr=${hrr}: ${idleReads} idle and ${motionReads} transition geometry reads, ${samples.length} moving frames, worst dock drift ${worst.toFixed(3)}px`);
 } finally {await ctx.close();await b.close();}
}
