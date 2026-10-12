import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import assert from 'node:assert/strict'; import { pathToFileURL } from 'node:url'; import { createRequire } from 'node:module'; import ts from 'typescript';
const require = createRequire(import.meta.url), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avvi-packages-movements-'));
try {
  const names = ['stockAccess','inventory','gifts','servicePackages','movements','checkout','appointmentServices','access','accessServer','accountsServer','accessSnapshot','database','supabase','persistence','ultraformer','agendaAvailability','invoices','strategyDefinitions','anamnese','calculations'];
  for (const name of [...names,'gateway']) {
    let source = fs.readFileSync(name === 'gateway' ? 'app/api/access/data/route.ts' : `lib/${name}.ts`, 'utf8');
    for (const dependency of names) source = source.replaceAll(`"./${dependency}"`, `"./${dependency}.mjs"`).replaceAll(`"@/lib/${dependency}"`, `"./${dependency}.mjs"`);
    source = source.replaceAll('"@supabase/supabase-js"', JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href));
    fs.writeFileSync(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
  }
  Object.assign(process.env,{AVVI_SESSION_SECRET:'isolated-packages-session-secret-2026',NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'});
  const load = name => import(pathToFileURL(path.join(dir,name+'.mjs')));
  const {validServicePackage, packageCheckoutLines, packageItemsTotal} = await load('servicePackages'), {checkoutTotals} = await load('checkout'), {accountMovements, sumMovements} = await load('movements'), access = await load('access'), persistence = await load('persistence');
  const pack = {id:'pack',name:'Pacote QA',description:'Teste',items:[{id:'i1',serviceId:'s1',name:'Serviço um',quantity:3,unitPrice:100},{id:'i2',serviceId:'s2',name:'Serviço dois',quantity:2,unitPrice:200}],salePrice:123.47,validityEnabled:true,validityMonths:6,commissionPercent:35,active:true};
  assert.equal(validServicePackage(pack),true); assert.equal(packageItemsTotal(pack.items),700);
  for(const price of [0,0.01,1,123.47,99999.99]) for(const quantity of [1,2,11]) {
    const lines = packageCheckoutLines({...pack,salePrice:price},quantity);
    assert.equal(checkoutTotals(lines,[]).total, Math.round(price * quantity * 100) / 100);
    assert.equal(lines.filter(line=>line.serviceId==='s1').reduce((a,b)=>a+b.quantity,0),3*quantity);
    assert.equal(lines.filter(line=>line.serviceId==='s2').reduce((a,b)=>a+b.quantity,0),2*quantity);
    assert.ok(lines.every(line=>line.servicePrice>=0 && line.packageId==='pack' && line.packageCommissionPercent===35 && line.packageValidityMonths===6));
  }
  assert.equal(checkoutTotals(packageCheckoutLines({...pack,items:pack.items.map(item=>({...item,unitPrice:0}))},1),[]).total,123.47);
  for(const invalid of [{...pack,items:[]},{...pack,salePrice:-1},{...pack,salePrice:NaN},{...pack,salePrice:1.001},{...pack,commissionPercent:101},{...pack,validityMonths:0},{...pack,items:[...pack.items,pack.items[0]]},{...pack,items:[{...pack.items[0],quantity:1.5}]}]) assert.equal(validServicePackage(invalid),false);
  assert.throws(()=>packageCheckoutLines(pack,0)); assert.throws(()=>packageCheckoutLines(pack,1.5));
  const person = {id:'p',name:'Paciente QA'}, professional = {id:'pro',name:'Profissional QA'};
  const account = {id:'closed',patientId:'p',professionalId:'pro',date:'2025-12-31',accountClosed:true,closedAt:'2026-01-01T02:30:00Z',quantity:1,servicePrice:0,commercialDiscount:0,procedureLines:packageCheckoutLines(pack,1),payments:[{method:'Pix',amount:100},{method:'Crédito Futuro',amount:23.47}],creditAdded:50,creditPayments:[{method:'Crédito',amount:50}],products:[],generatedEntryId:'generated'};
  const appointment = {id:'appt',patientId:'p',professionalId:'pro',startsAt:'2025-12-31T09:00:00',accountClosed:true,closedAccount:account};
  const revenue = {id:'copy',sourceFinancialEntryId:'closed',serviceDate:'2025-12-31',paymentDate:'2025-12-31',paymentTime:'09:00',clientName:'Paciente QA',serviceTotal:123.47,total:150,discount:0,clientCreditAddedTotal:50,clientCreditUsedTotal:-23.47,creditTotal:50,debitTotal:0,cashTotal:0,pixTotal:100};
  const input = {appointments:[appointment],patients:[person],professionals:[professional],services:[],entries:[{...account,id:'generated',sourceAccountId:'closed'}],revenues:[revenue]};
  const before = JSON.stringify(input), movements = accountMovements(input); assert.equal(JSON.stringify(input),before); assert.equal(movements.length,1);
  assert.equal(movements[0].appointmentId,'appt'); assert.equal(movements[0].paymentDate,'2025-12-31','Timezone must not move the payment into January'); assert.equal(movements[0].packages,123.47); assert.equal(movements[0].services,0); assert.equal(movements[0].received,150); assert.equal(movements[0].creditUsed,23.47); assert.equal(movements[0].creditAdded,50);
  const historical = {id:'hist',patientId:'p',professionalId:'pro',startsAt:'2025-07-01T09:00:00',accountClosed:true,serviceId:'s1',historicalImport:{paymentsUnknown:true}}, services=[{id:'s1',name:'Serviço um',price:200}];
  const old = accountMovements({...input,appointments:[historical],entries:[],revenues:[],services}); assert.equal(old[0].unknownPayments,true); assert.equal(old[0].received,0); assert.equal(old[0].services,200); assert.equal(old[0].appointmentId,'hist');
  const zeroAccount={...account,id:'zero',creditAdded:0,creditPayments:[],procedureLines:[{id:'zero-line',quantity:1,servicePrice:0}],payments:[]};
  assert.equal(accountMovements({...input,appointments:[{...appointment,id:'zero-appt',closedAccount:zeroAccount}],entries:[],revenues:[{...revenue,sourceFinancialEntryId:'zero'}]}).length,0);
  const imported={...revenue,id:'historical-revenue',sourceFinancialEntryId:undefined,serviceDate:'2025-07-01',paymentDate:'2025-07-02',total:200,pixTotal:200,creditTotal:0,clientCreditAddedTotal:0,clientCreditUsedTotal:0};
  const matched=accountMovements({...input,appointments:[historical],entries:[],revenues:[imported],services}); assert.equal(matched.length,1); assert.equal(matched[0].appointmentId,'hist'); assert.equal(matched[0].paymentDate,'2025-07-02'); assert.equal(sumMovements([...movements,...matched]).received,350);
  const cash = {...account,id:'cash',commercialDiscount:23.47,procedureLines:[{id:'line',quantity:1,servicePrice:123.47}],payments:[{method:'Dinheiro',amount:100}],creditAdded:0,creditPayments:[],change:20};
  const cashRow = accountMovements({...input,appointments:[{...appointment,closedAccount:cash}],entries:[],revenues:[]})[0]; assert.equal(cashRow.discount,23.47); assert.equal(cashRow.cash,100); assert.equal(cashRow.change,20);
  assert.equal(access.canReadEntity({login:'reader',role:'standard',tabs:['Agenda']},'service_packages'),true); assert.equal(access.canWriteEntity({login:'reader',role:'standard',tabs:['Agenda']},'service_packages'),false); assert.equal(access.canWriteEntity('standard','service_packages'),true); assert.equal(access.tabLabel('Receitas'),'Movimentações'); assert.equal(access.tabLabel('Relatórios'),'Rankings');
  for(const entity of ['appointments','patients','professionals','services','revenues'])assert.equal(access.canReadEntity({login:'reader',role:'standard',tabs:['Receitas']},entity),true);
  const oldSnapshot=persistence.normalizeSnapshot({patients:[person],services});assert.deepEqual(oldSnapshot.service_packages,[]); assert.deepEqual(oldSnapshot.patients,[person]);
  const draft={...oldSnapshot,service_packages:[pack]},storage=new Map();persistence.writeSnapshot({setItem:(key,value)=>storage.set(key,value)},draft,oldSnapshot);assert.deepEqual(persistence.readSnapshot({getItem:key=>storage.get(key)}).data.service_packages,[pack]);assert.equal(persistence.recoverPendingChanges(oldSnapshot,oldSnapshot,draft).service_packages[0].id,'pack');
  const auth=await load('accessServer'),gateway=await load('gateway'),records=new Map(pack.items.map(item=>['services:'+item.serviceId,{entity:'services',record_id:item.serviceId,data:{id:item.serviceId,name:item.name}}]));
  const operator={id:'catalog-user',login:'catalog-user',name:'Catálogo QA',role:'standard',tabs:['Cadastro de Serviços'],version:1},reader={id:'agenda-user',login:'agenda-user',role:'standard',tabs:['Agenda'],version:1};
  globalThis.fetch=async(raw,init)=>{const url=new URL(raw);if(url.pathname==='/rest/v1/avvi_user_accounts')return Response.json([reader,operator]);assert.equal(url.pathname,'/rest/v1/avvi_records');if(init?.method==='POST'){for(const row of JSON.parse(init.body))records.set(row.entity+':'+row.record_id,structuredClone(row));return new Response(null,{status:201});}const entity=url.searchParams.get('entity')?.slice(3);return Response.json([...records.values()].filter(row=>row.entity===entity));};
  const request=(body,user={login:'admin',role:'admin'},origin='http://test.local')=>new Request('http://test.local/api/access/data',{method:body?'POST':'GET',headers:{...(user?{cookie:auth.accessCookie+'='+auth.signAccess(user)}:{}),origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const payload=value=>({upserts:[{entity:'service_packages',record_id:value.id,data:value}]});
  assert.equal((await gateway.POST(request(payload(pack)))).status,200);assert.deepEqual(records.get('service_packages:pack').data,pack);
  for(const invalid of [{...pack,commissionPercent:101},{...pack,items:[{...pack.items[0],serviceId:'missing'}]}])assert.equal((await gateway.POST(request(payload(invalid)))).status,400);
  assert.equal((await gateway.POST(request(payload(pack),null))).status,401);assert.equal((await gateway.POST(request(payload(pack),undefined,'https://elsewhere.test'))).status,403);
  assert.equal((await gateway.POST(request(payload({...pack,name:'Editado por usuário padrão'}),{...operator,revision:1}))).status,200);
  assert.equal((await gateway.POST(request(payload(pack),{...reader,revision:1}))).status,403);
  const read=who=>new Request('http://test.local/api/access/data?entity=service_packages',{headers:{cookie:auth.accessCookie+'='+auth.signAccess(who)}});
  assert.equal((await gateway.GET(read({...reader,revision:1}))).status,200);
  assert.equal((await gateway.GET(new Request('http://test.local/api/access/data?entity=service_packages'))).status,401);
  console.log('PASS: package validation, exact cent allocation and service quantities, zero-price items, commission/validity snapshots, generic persistence with old snapshots, cloud validation/auth; closure/ledger/revenue deduplication, prepaid and excess credit, unknown imported payments, legacy linkage, zero accounts, discounts, change and Brazil timezone. Isolated fixtures only.');
} finally { if(path.dirname(dir)===os.tmpdir() && path.basename(dir).startsWith('avvi-packages-movements-'))fs.rmSync(dir,{recursive:true,force:true}); }
