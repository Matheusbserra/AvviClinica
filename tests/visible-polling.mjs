import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=ts.transpileModule(fs.readFileSync('lib/sharedUpdates.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {watchVisiblePolling}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const timers=new Map();let next=0;
globalThis.window=Object.assign(new EventTarget(),{setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout(id){timers.delete(id);}});
globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
const previous=globalThis.BroadcastChannel;globalThis.BroadcastChannel=undefined;
const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const fire=ms=>{for(const [id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}};
try{
 let calls=0,release;const slow=new Promise(resolve=>{release=resolve;});
 const stop=watchVisiblePolling(()=>{calls++;return calls===1?slow:Promise.resolve();},15000);
 await drain();assert.equal(calls,1);assert.equal(timers.size,0);
 window.dispatchEvent(new Event('focus'));fire(200);await drain();assert.equal(calls,1,'Slow requests cannot overlap');
 release();await drain();assert.equal(timers.size,1);fire(15000);await drain();assert.equal(calls,2,'Visible inbox keeps live refresh');
 document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));assert.equal(timers.size,0);
 for(let i=0;i<9600;i++)fire(15000);await drain();assert.equal(calls,2,'No background downloads during eight idle hours');
 document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));fire(200);await drain();assert.equal(calls,3,'Returning refreshes without waiting for the interval');
 stop();assert.equal(timers.size,0);window.dispatchEvent(new Event('online'));fire(200);await drain();assert.equal(calls,3);
 console.log('PASS: live inbox polling stays active while visible, pauses for eight background hours, resumes on return, deduplicates slow requests and cleans up completely.');
}finally{globalThis.BroadcastChannel=previous;delete globalThis.window;delete globalThis.document;}
