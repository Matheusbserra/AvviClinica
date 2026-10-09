const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import assert from "node:assert/strict";
const password=process.env.AVVI_TEST_ADMIN_PASSWORD;
if (!password) throw new Error("Configure AVVI_TEST_ADMIN_PASSWORD para o teste.");
const browser=await chromium.launch({...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {}),headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
const records=new Map();
function store(entity,data){records.set(entity+":"+data.id,{entity,record_id:data.id,data:structuredClone(data),updated_at:"2026-10-08T18:00:00Z"});}
store("patients",{id:"patient",name:"Paciente QA",phone:"",email:"",birthDate:"",notes:""});
store("professionals",{id:"professional",name:"Profissional QA",commissionPercent:30,color:"#b8862b",active:true});
store("procedures",{id:"procedure",name:"Consulta",averageCost:987.65,salePrice:1500,active:true});
store("gifts",{id:"gift",name:"Brinde QA",quantity:2});store("gifts",{id:"other",name:"Outro brinde",quantity:8});
let failWrites=false,failReads=false,delayFirst=false;let delayedStarted=false,releaseDelayed;
const errors=[];page.on("pageerror",error=>errors.push(error.message));
await context.route("http://127.0.0.1:3999/**",async route=>{
 const request=route.request(),url=new URL(request.url());if(!url.pathname.startsWith("/rest/v1/avvi_records"))return route.fulfill({status:200,json:{}});
 const entity=url.searchParams.get("entity")?.replace(/^eq\./,"");
 if(request.method()==="GET"){
  if(failReads)return route.fulfill({status:503,json:{message:"QA falha de leitura"}});
  const rows=[...records.values()].filter(row=>!entity||row.entity===entity);const offset=Number(url.searchParams.get("offset")??0),limit=Number(url.searchParams.get("limit")??500);
  return route.fulfill({status:200,json:rows.slice(offset,offset+limit)});
 }
 if(failWrites)return route.fulfill({status:503,json:{message:"QA falha de gravação"}});
 if(request.method()==="POST"){
  const payload=request.postDataJSON(),batch=Array.isArray(payload)?payload:[payload];
  if(delayFirst&&batch.some(row=>row.entity==="gifts")){delayFirst=false;delayedStarted=true;await new Promise(resolve=>{releaseDelayed=resolve;});}
  for(const row of batch)records.set(row.entity+":"+row.record_id,structuredClone(row));
  return route.fulfill({status:201,body:""});
 }
 if(request.method()==="DELETE"){
  const ids=url.searchParams.get("record_id")?.replace(/^in\.\(/,"").replace(/\)$/ ,"").split(",").map(id=>id.replaceAll('"',""))??[];
  for(const id of ids)records.delete(entity+":"+id);return route.fulfill({status:204,body:""});
 }
 return route.fulfill({status:200,json:{}});
});
const status=()=>page.getByRole("status",{name:"Status do salvamento",exact:true});
async function login(){if(await page.getByRole("button",{name:"Entrar",exact:true}).isVisible()){await page.getByLabel("Login",{exact:true}).fill("admin");await page.getByLabel("Senha",{exact:true}).fill(password);await page.getByRole("button",{name:"Entrar",exact:true}).click();}}
async function inventory(){await page.getByRole("button",{name:"Estoque",exact:true}).filter({visible:true}).first().click();await page.getByRole("tab",{name:"Brindes",exact:true}).click();}
async function waitFor(check){for(let i=0;i<100;i++){if(await check())return;await page.waitForTimeout(100);}throw new Error("Timeout awaiting persistence assertion");}
async function saved(){await waitFor(async()=>/Dados salvos na nuvem/.test(await status().textContent()));}
const quantity=()=>page.getByLabel("Quantidade de Brinde QA",{exact:true});
const cache=()=>page.evaluate(()=>JSON.parse(localStorage.getItem("avvi.data.snapshot.v1")));
try{
 await page.goto(process.env.AVVI_TEST_URL??"http://127.0.0.1:3108");await page.waitForTimeout(600);await login();await inventory();await saved();
 failWrites=true;await quantity().fill("6");await quantity().blur();await waitFor(async()=>/pendente/.test(await status().textContent()));
 let copy=await cache();assert.equal(copy.data.gifts.find(item=>item.id==="gift").quantity,6);assert.equal(copy.syncedData.gifts.find(item=>item.id==="gift").quantity,2);
 // Another browser's unrelated change is kept while replaying our failed write.
 store("gifts",{id:"other",name:"Outro brinde",quantity:55});await page.reload();await page.waitForTimeout(600);await login();await inventory();assert.equal(await quantity().inputValue(),"6");assert.equal(await page.getByLabel("Quantidade de Outro brinde",{exact:true}).inputValue(),"55");
 failWrites=false;await page.getByRole("button",{name:"Tentar novamente",exact:true}).click();await saved();assert.equal(records.get("gifts:gift").data.quantity,6);assert.equal(records.get("gifts:other").data.quantity,55);
 // Old in-flight completion must not overwrite the newer durable local draft.
 delayFirst=true;await quantity().fill("7");await quantity().blur();await waitFor(()=>delayedStarted);await quantity().fill("9");await quantity().blur();await waitFor(async()=>(await cache()).data.gifts.find(item=>item.id==="gift").quantity===9);releaseDelayed();await saved();assert.equal(records.get("gifts:gift").data.quantity,9);assert.equal((await cache()).data.gifts.find(item=>item.id==="gift").quantity,9);
 // A failed initial connection remains usable and reconnects without losing edits.
 failReads=true;await page.reload();await page.waitForTimeout(600);await login();await inventory();await quantity().fill("11");await quantity().blur();await waitFor(async()=>(await cache()).data.gifts.find(item=>item.id==="gift").quantity===11);failReads=false;await page.getByRole("button",{name:"Tentar novamente",exact:true}).click();await saved();assert.equal(records.get("gifts:gift").data.quantity,11);
 // Exhausted local storage must show an alert and still try the cloud.
 await page.evaluate(()=>{const original=Storage.prototype.setItem;window.__restoreStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==="avvi.data.snapshot.v1")throw new DOMException("full","QuotaExceededError");return original.call(this,key,value);};});
 await quantity().fill("12");await quantity().blur();await saved();assert.equal(records.get("gifts:gift").data.quantity,12);await page.getByRole("alert").filter({hasText:"Não foi possível guardar a cópia"}).waitFor();await page.evaluate(()=>window.__restoreStorage());
 await page.reload();await page.waitForTimeout(600);await login();await inventory();await saved();assert.equal(await quantity().inputValue(),"12");
 const copy2=await cache();assert.equal(copy2.data.gifts.find(item=>item.id==="gift").quantity,12);assert.equal(copy2.data.procedures.find(item=>item.id==="procedure").averageCost,987.65);
 failWrites=true;await quantity().fill("13");await quantity().blur();await waitFor(async()=>/pendente/.test(await status().textContent()));failWrites=false;await page.evaluate(()=>window.dispatchEvent(new Event("online")));await saved();assert.equal(records.get("gifts:gift").data.quantity,13);
 // No cache and an unavailable first connection: edits to the initial catalog survive reconnection.
 await page.evaluate(()=>localStorage.removeItem("avvi.data.snapshot.v1"));failReads=true;await page.reload();await page.waitForTimeout(600);await login();await inventory();await page.getByRole("button",{name:"Adicionar brinde",exact:true}).click();await page.getByLabel("Nome do brinde",{exact:true}).fill("Brinde durante primeira falha");await page.getByLabel("Quantidade inicial do brinde",{exact:true}).fill("4");await page.getByRole("button",{name:"Salvar brinde",exact:true}).click();await waitFor(async()=>(await cache())?.data?.gifts?.some(item=>item.name==="Brinde durante primeira falha"));failReads=false;await page.getByRole("button",{name:"Tentar novamente",exact:true}).click();await saved();assert.equal([...records.values()].some(row=>row.entity==="gifts"&&row.data.name==="Brinde durante primeira falha"),true);assert.equal(records.get("gifts:gift").data.quantity,13);
 assert.deepEqual(errors,[]);
 console.log("PASS: Failed cloud writes survive reload, unrelated cloud changes are preserved, manual retry confirms saving, newer drafts survive old request completion, failed reads reconnect, local quota failures are visible and do not prevent cloud saving.");
}finally{await browser.close();}
