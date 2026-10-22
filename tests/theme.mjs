import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync('lib/theme.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {getTheme,setTheme,subscribeTheme,themeStorageKey,themeBootScript}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const saved=new Map([['clinical-records','unchanged']]);let blocked=false;
globalThis.document={documentElement:{dataset:{}}};
globalThis.window=Object.assign(new EventTarget(),{localStorage:{setItem(key,value){if(blocked)throw Error('Storage blocked');saved.set(key,value);}}});
try{
 assert.equal(getTheme(),'light');let notifications=0;const stop=subscribeTheme(()=>notifications++);
 setTheme('dark');assert.equal(getTheme(),'dark');assert.equal(saved.get(themeStorageKey),'dark');assert.equal(notifications,1);assert.equal(saved.get('clinical-records'),'unchanged');
 const storage=(key,newValue)=>window.dispatchEvent(Object.assign(new Event('storage'),{key,newValue}));
 storage('clinical-records','dark');assert.equal(notifications,1);
 storage(themeStorageKey,'light');assert.equal(getTheme(),'light');storage(themeStorageKey,'invalid');assert.equal(getTheme(),'light');
 blocked=true;assert.doesNotThrow(()=>setTheme('dark'));assert.equal(getTheme(),'dark','Blocked storage must not prevent changing this page');
 storage(null,null);assert.equal(getTheme(),'light');stop();const stopped=notifications;setTheme('dark');assert.equal(notifications,stopped);
 for(const preference of ['dark','light','invalid',null]){const document={documentElement:{dataset:{}}};vm.runInNewContext(themeBootScript,{document,localStorage:{getItem:()=>preference}});assert.equal(document.documentElement.dataset.theme,preference==='dark'?'dark':'light');}
 const document={documentElement:{dataset:{}}};vm.runInNewContext(themeBootScript,{document,localStorage:{getItem(){throw Error('Blocked');}}});assert.equal(document.documentElement.dataset.theme,'light');
 console.log('PASS: theme preference boots before rendering, accepts only light/dark, persists independently from clinical records, updates subscribed tabs, works with blocked storage and removes listeners.');
}finally{delete globalThis.window;delete globalThis.document;}
