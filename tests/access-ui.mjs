import http from "node:http";import assert from "node:assert/strict";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??"playwright");
if (!process.env.AVVI_TEST_ADMIN_PASSWORD) throw new Error("Configure AVVI_TEST_ADMIN_PASSWORD para testar o administrador.");
const records=new Map(),reads=[];
const date="2026-10-08";
function store(entity,data){records.set(entity+":"+(data.id??data.month),{entity,record_id:data.id??data.month,data,updated_at:"2026-10-08T18:00:00Z"});}
store("patients",{id:"patient",name:"Paciente QA",phone:"(98) 99999-0000",email:"qa@example.test",notes:"",futureCredit:0});
store("professionals",{id:"doctor",name:"Profissional QA",commissionPercent:30,monthlyGoal:77777,color:"#b8862b",active:true,specialty:"Dentista",notes:""});
store("procedures",{id:"product",name:"Produto QA",price:300,averageCost:50,active:true});
store("services",{id:"service",name:"Serviço QA",price:200,durationMinutes:60,active:true,priceType:"Fixo",category:"Consulta",description:""});
store("inventory",{id:"product",procedureId:"product",quantity:4});
store("appointments",{id:"appointment",patientId:"patient",professionalId:"doctor",serviceId:"service",servicePrice:200,startsAt:date+"T10:00:00",endsAt:date+"T11:00:00",status:"Agendado",eventType:"Novo Agendamento",notes:""});
store("financial_entries",{id:"restricted-ledger",patientId:"patient",professionalId:"doctor",date:date,servicePrice:98765,productCost:900,professionalPercent:30,quantity:1,payments:[{id:"private-pay",method:"Pix",amount:98765,fee:0,discount:0}],notes:"Informação financeira restrita"});
store("revenues",{id:"restricted-revenue",total:98765,paymentDate:date});store("monthly_goals",{month:"2026-10",companyGoal:987654,professionalGoals:{doctor:77777}});
store("fixed_costs",{id:"cost",name:"Custo QA",value:30,category:"Outros",dueDate:date,status:"Pendente",paymentMethod:"Pix"});
const mock=http.createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1:3999"),method=req.method;
 res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Headers","*");res.setHeader("Access-Control-Allow-Methods","*");res.setHeader("Content-Type","application/json");if(method==="OPTIONS"){res.end();return;}
 if(url.pathname!=="/rest/v1/avvi_records"){res.end("{}");return;}
 let body="";for await(const chunk of req)body+=chunk;
 const entity=url.searchParams.get("entity")?.replace(/^eq\./,"");
 const matches=row=>{if(entity&&row.entity!==entity)return false;for(const [key,value]of url.searchParams){if(key==="record_id"){if(value.startsWith("eq.")&&row.record_id!==value.slice(3))return false;if(value.startsWith("in.")&&!value.slice(4,-1).split(",").map(value=>value.replaceAll('"',"")).includes(row.record_id))return false;}if(key.startsWith("data->>")&&value.startsWith("eq.")&&row.data[key.slice(7)]!==value.slice(3))return false;}return true;};
 if(method==="GET"){reads.push(entity);let rows=[...records.values()].filter(matches);rows=rows.slice(Number(url.searchParams.get("offset")??0),Number(url.searchParams.get("offset")??0)+Number(url.searchParams.get("limit")??500));if(req.headers.accept?.includes("vnd.pgrst.object"))res.end(JSON.stringify(rows[0]??null));else res.end(JSON.stringify(rows));return;}
 if(method==="POST"){const payload=JSON.parse(body),batch=Array.isArray(payload)?payload:[payload];for(const row of batch)records.set(row.entity+":"+row.record_id,structuredClone(row));res.statusCode=201;res.end("[]");return;}
 if(method==="DELETE"){for(const [key,row]of records)if(matches(row))records.delete(key);res.statusCode=204;res.end();return;}
 res.statusCode=400;res.end("{}");
});
await new Promise(resolve=>mock.listen(3999,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.message));const origin=process.env.AVVI_TEST_URL??"http://127.0.0.1:3108";
async function login(login,password){await page.getByLabel("Login",{exact:true}).fill(login);await page.getByLabel("Senha",{exact:true}).fill(password);await page.getByRole("button",{name:"Entrar",exact:true}).click();try{await page.getByRole("button",{name:"Agenda",exact:true}).filter({visible:true}).first().waitFor();}catch(error){console.log("APP STATE",await page.locator("body").innerText());throw error;}}
const tab=name=>page.getByRole("button",{name,exact:true}).filter({visible:true}).first();
async function saved(){try{await page.getByRole("status",{name:"Status do salvamento",exact:true}).filter({hasText:"Dados salvos na nuvem"}).waitFor();}catch(error){console.log("SAVE STATE",await page.locator("body").innerText());throw error;}}
try{
 await page.goto(origin);assert.equal((await context.request.get(origin+"/api/access/data?entity=revenues")).status(),401);
 await login("avviclinica","avviclinica2026");await saved();await page.getByText("Usuário padrão · avviclinica",{exact:true}).waitFor();
 const allowed=["Agenda","Estoque","Follow Up","Custos","Cadastro de Procedimentos","Cadastro de Serviços","Cadastro de Profissionais","Cadastro de Pacientes"];
 const denied=["Dashboard","Receitas","Lançamento de Procedimentos","Pagamento Profissional","Relatório Profissional","Recibos de Pagamento","Metas"];
 for(const name of denied)assert.equal(await page.getByRole("button",{name,exact:true}).count(),0);
 for(const name of allowed){await tab(name).click();await page.getByRole("heading",{name,exact:true}).first().waitFor();}
 assert.equal(reads.includes("revenues"),false);assert.equal(reads.includes("monthly_goals"),false);assert.equal(reads.includes("receipts"),false);
 const finance=await context.request.get(origin+"/api/access/data?entity=financial_entries");const financeText=await finance.text();assert.equal(financeText.includes("98765"),false);assert.equal(financeText.includes("Informação financeira restrita"),false);
 for(const entity of ["revenues","monthly_goals","receipts","professional_receipts"]){assert.equal((await context.request.get(origin+"/api/access/data?entity="+entity)).status(),403);}
 const forbidden=await context.request.post(origin+"/api/access/data",{data:{upserts:[{entity:"monthly_goals",record_id:"2026-10",data:{month:"2026-10",companyGoal:1}}]}});assert.equal(forbidden.status(),403);assert.equal(records.get("monthly_goals:2026-10").data.companyGoal,987654);
 await page.reload();await tab("Agenda").waitFor();await saved();await page.getByText("Usuário padrão · avviclinica",{exact:true}).waitFor();
 await tab("Cadastro de Profissionais").click();await page.getByTitle("Editar",{exact:true}).click();
 const photo=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=","base64");
 await page.getByLabel("Foto de Profissional QA",{exact:true}).setInputFiles({name:"foto-qa.png",mimeType:"image/png",buffer:photo});await page.getByRole("img",{name:"Profissional QA",exact:true}).waitFor();await saved();
 const photoUrl="data:image/png;base64,"+photo.toString("base64");for(let attempt=0;attempt<200&&records.get("professionals:doctor").data.avatarDataUrl!==photoUrl;attempt++)await new Promise(resolve=>setTimeout(resolve,50));assert.equal(records.get("professionals:doctor").data.avatarDataUrl,photoUrl);
 await page.getByRole("button",{name:"Salvar profissional",exact:true}).click();await saved();assert.equal(records.get("professionals:doctor").data.avatarDataUrl,photoUrl);assert.equal(records.get("professionals:doctor").data.monthlyGoal,77777);
 await tab("Agenda").click();const avatar=page.getByTestId("professional-doctor").getByRole("img",{name:"Foto de Profissional QA",exact:true});await avatar.waitFor();assert.equal(await avatar.getAttribute("src"),photoUrl);await page.waitForFunction(()=>document.querySelector('[data-testid="professional-doctor"] img')?.naturalWidth>0);
 await page.reload();await tab("Agenda").waitFor();await saved();assert.equal(await page.getByTestId("professional-doctor").getByRole("img").getAttribute("src"),photoUrl);
 await tab("Estoque").click();await page.getByLabel("Quantidade de Produto QA",{exact:true}).fill("6");await page.getByLabel("Quantidade de Produto QA",{exact:true}).blur();await saved();assert.equal(records.get("inventory:product").data.quantity,6);
 await tab("Agenda").click();await page.getByTestId("appointment-appointment").click();await page.getByRole("menuitem",{name:"Fechar conta",exact:true}).click();const checkout=page.getByRole("dialog",{name:/Fechamento de conta/i});await checkout.getByRole("button",{name:"Produtos",exact:true}).click();await page.getByLabel("Adicionar produto ao consumo",{exact:true}).selectOption("product");await checkout.getByRole("button",{name:"Adicionar produto",exact:true}).click();await page.getByLabel("Receber por Pix",{exact:true}).check();await checkout.getByRole("button",{name:"Fechar Conta",exact:true}).click();await checkout.waitFor({state:"hidden"});await saved();assert.equal(records.get("inventory:product").data.quantity,5);const closed=records.get("appointments:appointment").data;assert.equal(closed.accountClosed,true);assert.deepEqual(closed.closedAccount.gifts,[]);assert.equal(records.has("financial_entries:"+closed.closedAccount.generatedEntryId),true);assert.equal([...records.values()].some(row=>row.entity==="revenues"&&row.data.sourceFinancialEntryId===closed.closedAccount.id),true);
 await page.getByTestId("appointment-appointment").click();await page.getByRole("menuitem",{name:"Ver agendamento",exact:true}).click();await page.getByRole("button",{name:"Excluir conta fechada",exact:true}).click();await page.getByRole("button",{name:"Fechar",exact:true}).click();await saved();assert.equal(records.get("inventory:product").data.quantity,6);assert.equal(records.has("financial_entries:"+closed.closedAccount.generatedEntryId),false);assert.equal([...records.values()].some(row=>row.entity==="revenues"&&row.data.sourceFinancialEntryId===closed.closedAccount.id),false);
 await page.setViewportSize({width:390,height:844});const select=page.getByLabel("Navegar pelo sistema",{exact:true});const options=await select.locator("option").allTextContents();assert.deepEqual(new Set(options),new Set(allowed));await select.selectOption("Custos");for(const name of denied)assert.equal(await page.getByRole("button",{name,exact:true}).count(),0);
 await page.setViewportSize({width:1440,height:1000});await tab("Sair").click();await page.getByRole("button",{name:"Entrar",exact:true}).waitFor();await login("admin",process.env.AVVI_TEST_ADMIN_PASSWORD);await saved();await page.getByText("Administrador",{exact:true}).waitFor();await tab("Dashboard").click();await tab("Metas").click();assert.equal((await context.request.get(origin+"/api/access/data?entity=revenues")).status(),200);
 await tab("Sair").click();await page.evaluate(()=>{sessionStorage.setItem("avvi.session","active");sessionStorage.setItem("role","admin");});await page.reload();await page.getByRole("button",{name:"Entrar",exact:true}).waitFor();assert.equal((await context.request.get(origin+"/api/access/data?entity=revenues")).status(),401);assert.deepEqual(errors,[]);
 console.log("PASS: Standard credentials and exact eight tabs, reload and mobile permissions, no restricted financial/goals reads, redacted stock history, API read/write denial, professional photo upload, edit preservation and agenda after reload, stock saving, checkout without gifts and derived financial records, reversal, administrator unchanged, and fake browser-role flags rejected. All clinical data and network mocked.");
}finally{await browser.close();await new Promise(resolve=>mock.close(resolve));}
