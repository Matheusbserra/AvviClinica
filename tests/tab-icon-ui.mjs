import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.AVVI_TEST_URL??'http://127.0.0.1:3107';
const response=await fetch(origin);assert.equal(response.status,200);
const html=await response.text();
assert.match(html,/<link[^>]*rel="icon"[^>]*href="\/icon-avvi\.svg\?v=3"[^>]*>/,'The browser must request the new favicon revision');
assert.match(html,/<link[^>]*rel="shortcut icon"[^>]*href="\/icon-avvi\.svg\?v=3"[^>]*>/);
const icon=await fetch(new URL('/icon-avvi.svg?v=3',origin));assert.equal(icon.status,200);assert.match(icon.headers.get('content-type'),/image\/svg\+xml/);
const svg=await icon.text();assert.equal(svg,fs.readFileSync('public/icon-avvi.svg','utf8'),'The published asset must match the approved icon');assert.doesNotMatch(svg,/cl[ií]nica/i);
const previous=svg.replace(' stroke="#B8862B" stroke-width="20" stroke-linejoin="round"','').replace('translate(30 219.2) scale(1 1.7)','translate(30 386.5)');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage();
 const render=async svg=>page.evaluate(async svg=>{
  const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,32,32);const data=ctx.getImageData(0,0,32,32).data;
  let left=32,top=32,right=-1,bottom=-1,opaqueGold=0,coverage=0;
  // Antialiased edge pixels still contribute to the visible weight of the letters.
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4;coverage+=data[i+3]/255;if(data[i+3]>100){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(data[i+3]===255&&data[i]===184&&data[i+1]===134&&data[i+2]===43)opaqueGold++;}
  return {width:right-left+1,height:bottom-top+1,opaqueGold,coverage,cornerAlpha:data[3]};
 },svg);
 const pixels=await render(svg),old=await render(previous);
 assert.ok(pixels.width>=29,'AVVI must occupy most of the tab icon width');
 assert.ok(pixels.height>=21,'The larger letters must remain legible at actual favicon dimensions');
 assert.ok(pixels.opaqueGold>0,'Opaque burnt-gold pixels must remain visible');
 assert.ok(pixels.coverage>old.coverage*1.5,'The approved larger, heavier icon must cover substantially more pixels than the previous thin version');
 assert.equal(pixels.cornerAlpha,0,'The background must remain transparent');
 console.log('PASS: favicon revision v3 serves the approved AVVI-only SVG; real 32px browser rendering confirms larger, heavier burnt-gold letters and transparency.');
}finally{await browser.close();}
