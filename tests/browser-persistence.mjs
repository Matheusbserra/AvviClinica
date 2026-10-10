import fs from "node:fs"; import ts from "typescript"; import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const transpile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const url = source => "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
const persistence = url(transpile(fs.readFileSync("lib/persistence.ts","utf8")));
const browserModule = url(transpile(fs.readFileSync("lib/browserPersistence.ts","utf8").replace('"./persistence"',JSON.stringify(persistence))));
const browser = await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
const page = await browser.newPage();
try {
 await page.goto("http://127.0.0.1:3107");
 const result = await page.evaluate(async ({browserModule,persistence}) => {
  const {writeBrowserSnapshot:write,readBrowserSnapshot:read}=await import(browserModule),{normalizeSnapshot}=await import(persistence);
  const small=normalizeSnapshot({gifts:[{id:"gift",name:"Brinde",quantity:2}]}),edit=normalizeSnapshot({gifts:[{id:"gift",name:"Brinde",quantity:9}]}),a="qa-admin",b="qa-standard";
  await write(small,small,a);await write(edit,small,b);
  const isolated=[(await read(a)).data.gifts[0].quantity,(await read(b)).data.gifts[0].quantity];
  const legacy="qa-legacy";localStorage.setItem(legacy,JSON.stringify({savedAt:"2026-10-01T00:00:00.000Z",data:{gifts:[{id:"legacy",quantity:3}]}}));
  const legacyCopy=await read(legacy);
  const large=normalizeSnapshot({professionals:[{id:"pro",name:"Nome completo",avatarDataUrl:"data:image/png;base64,"+"a".repeat(6*1024*1024)}],gifts:[{id:"gift",quantity:11}]}),key="qa-large";
  await write(large,small,key);const largeRead=await read(key);
  const removedDuplicate=localStorage.getItem(key)===null,otherPreserved=localStorage.getItem(a)!==null;
  const many=[12,13,14].map(quantity=>write({...large,gifts:[{id:"gift",quantity}]},small,key));await Promise.all(many);
  const latest=await read(key);
  const original=IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction=function(...args){if(this.name==="avvi-browser-copies-v1")throw new DOMException("blocked","SecurityError");return original.apply(this,args);};
  const readableWithoutIdb=await read(a);let bothFail=false;try{await write(large,small,"qa-blocked");}catch{bothFail=true;}
  IDBDatabase.prototype.transaction=original;
  return {isolated,legacyQuantity:legacyCopy.data.gifts[0].quantity,legacyBaseline:legacyCopy.syncedData,largeLength:largeRead.data.professionals[0].avatarDataUrl.length,baselineQuantity:largeRead.syncedData.gifts[0].quantity,removedDuplicate,otherPreserved,latest:latest.data.gifts[0].quantity,readableWithoutIdb:readableWithoutIdb.data.gifts[0].quantity,bothFail};
 },{browserModule,persistence});
 assert.deepEqual(result.isolated,[2,9]);assert.equal(result.legacyQuantity,3);assert.equal(result.legacyBaseline,undefined);assert.ok(result.largeLength>6*1024*1024);assert.equal(result.baselineQuantity,2);assert.equal(result.removedDuplicate,true);assert.equal(result.otherPreserved,true);assert.equal(result.latest,14);assert.equal(result.readableWithoutIdb,2);assert.equal(result.bothFail,true);
 await page.reload();const recovered=await page.evaluate(async browserModule=>{const {readBrowserSnapshot}=await import(browserModule);const copy=await readBrowserSnapshot("qa-large");return {quantity:copy.data.gifts[0].quantity,baseline:copy.syncedData.gifts[0].quantity};},browserModule);assert.deepEqual(recovered,{quantity:14,baseline:2});
 console.log("PASS: real browser quota fallback for >6MB photos, exact draft and baseline recovery across reload, per-account isolation, legacy copies, ordered rapid writes, unrelated keys preserved, blocked IndexedDB legacy reads and explicit rejection when both stores fail.");
}finally{await browser.close();}
