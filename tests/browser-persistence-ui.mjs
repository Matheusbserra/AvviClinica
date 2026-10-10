import {chromium} from "file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"}),page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
page.on("pageerror",error=>errors.push(error.message));
const user={id:"qa-cache",login:"qa-cache",name:"Usuário QA",role:"standard",revision:1,tabs:["Estoque"]};
try {
 await page.route("**/api/access",route=>route.fulfill({json:{user}}));
 await page.addInitScript(()=>{
  const original=Storage.prototype.setItem;
  if(!localStorage.getItem("qa-init")){
   original.call(localStorage,"avvi.data.snapshot.v1",JSON.stringify({data:{gifts:[{id:"admin-only",name:"Do administrador",quantity:123}]}}));
   original.call(localStorage,"avvi.data.snapshot.user.qa-cache.1.v1",JSON.stringify({savedAt:"2026-10-01T00:00:00.000Z",data:{gifts:[{id:"gift",name:"Brinde QA",quantity:2}]}}));
   original.call(localStorage,"qa-init","done");
  }
  Storage.prototype.setItem=function(key,value){if(key.startsWith("avvi.data.snapshot"))throw new DOMException("full","QuotaExceededError");return original.call(this,key,value);};
 });
 await page.goto("http://127.0.0.1:3107/?previa=copia-navegador");await page.getByRole("tab",{name:"Brindes",exact:true}).click();
 const status=page.getByRole("status",{name:"Status do salvamento",exact:true}),quantity=page.getByLabel("Quantidade de Brinde QA",{exact:true});
 assert.equal(await quantity.inputValue(),"2");await quantity.fill("7");await quantity.blur();
 await status.filter({hasText:"Prévia local: alterações salvas"}).waitFor();assert.equal(await page.getByRole("alert").filter({hasText:"Não foi possível guardar a cópia"}).count(),0);
 await page.reload();await page.getByRole("tab",{name:"Brindes",exact:true}).click();await status.filter({hasText:"Prévia local: alterações salvas"}).waitFor();assert.equal(await quantity.inputValue(),"7");assert.equal(await page.getByText("Do administrador",{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("avvi.data.snapshot.v1")).data.gifts[0].quantity),123);
 await page.screenshot({path:"C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/copia-navegador-corrigida.png",fullPage:false});assert.deepEqual(errors,[]);
 console.log("PASS: standard account under forced localStorage quota restores its own old copy, edits and reloads via IndexedDB, no storage alert, no administrator data import or deletion. Browser-only fixture.");
}finally{await browser.close();}
