import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import ts from 'typescript';
import {matchesPostgrestFilters,projectPostgrestRow} from './postgrest-filters-helper.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-write-egress-')),require=createRequire(import.meta.url),originalFetch=globalThis.fetch;
try{
 const modules=['patientCredit','paymentFees','postProcedure','packageSessions','stockAccess','inventory','gifts','servicePackages','anamnese','bodyAnamnese','strategyDefinitions','access','accessServer','accountsServer','accessSnapshot','database','supabase','persistence','ultraformer','agendaAvailability','invoices','appointmentServices','checkout','calculations'];
 for(const name of [...modules,'route']){
  let source=fs.readFileSync(name==='route'?'app/api/access/data/route.ts':`lib/${name}.ts`,'utf8');
  for(const dep of modules)source=source.replaceAll(`"./${dep}"`,`"./${dep}.mjs"`).replaceAll(`"@/lib/${dep}"`,`"./${dep}.mjs"`);
  source=source.replaceAll('"@supabase/supabase-js"',JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href));
  fs.writeFileSync(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 Object.assign(process.env,{AVVI_SESSION_SECRET:'isolated-write-egress-secret-2026',NEXT_PUBLIC_SUPABASE_URL:'https://isolated.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_isolated'});
 const auth=await import(pathToFileURL(path.join(dir,'accessServer.mjs'))),route=await import(pathToFileURL(path.join(dir,'route.mjs')));
 let user={id:'operator',login:'operator',role:'standard',tabs:['Agenda','Anamnese','Estratégias'],revision:1},bytes=0,reads=[],failReads=false;const records=new Map();
 const put=(entity,data)=>records.set(entity+':'+data.id,{entity,record_id:data.id,data:structuredClone(data),updated_at:'2026-11-01T00:00:00Z'});
 const visit=(id,date='2026-10-01',professionalId='pro',start='08:00',end='09:00')=>({id,patientId:'patient',professionalId,startsAt:date+'T'+start+':00',endsAt:date+'T'+end+':00',status:'Confirmado',eventType:'Novo Agendamento',notes:'x'.repeat(1000)});
 put('patients',{id:'patient',name:'Paciente QA'});put('professionals',{id:'pro',name:'Profissional QA',active:true});put('professionals',{id:'other',name:'Outra QA',active:true});put('professionals',{id:'third',name:'Terceira QA',active:true});put('professionals',{id:'fourth',name:'Quarta QA',active:true});
 for(let i=0;i<3500;i++)put('appointments',visit('old-'+i));
 for(let i=0;i<300;i++){
  put('anamneses',{id:'old-form-'+i,answers:{planningImage:'x'.repeat(5000)}});
  put('patients',{id:'old-patient-'+i,name:'Histórico QA',notes:'x'.repeat(1000)});
  put('professionals',{id:'old-pro-'+i,name:'Profissional histórica QA',avatarDataUrl:'x'.repeat(1000)});
 }
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input),method=init.method??'GET';
  if(url.pathname==='/rest/v1/avvi_user_accounts')return Response.json([{...user,version:1}]);
  assert.equal(url.pathname,'/rest/v1/avvi_records','This test never contacts a real service or sends messages');
  if(method==='POST'){
   const payload=JSON.parse(init.body),rows=Array.isArray(payload)?payload:[payload];
   for(const row of rows)records.set(row.entity+':'+row.record_id,structuredClone(row));
   return new Response(null,{status:201});
  }
  if(method==='DELETE'){for(const [key,row]of records)if(matchesPostgrestFilters(row,url))records.delete(key);return new Response(null,{status:204});}
  assert.equal(method,'GET');if(failReads)return Response.json({message:'isolated unavailable'},{status:503});
  const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500),selection=url.searchParams.get('select');
  let rows=[...records.values()].filter(row=>matchesPostgrestFilters(row,url)).sort((a,b)=>a.record_id.localeCompare(b.record_id)).slice(offset,offset+limit);
  rows=rows.map(row=>projectPostgrestRow(row,selection));
  const body=JSON.stringify(new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object')?(rows[0]??null):rows);bytes+=Buffer.byteLength(body);reads.push({entity:url.searchParams.get('entity'),count:rows.length,selection});
  return new Response(body,{headers:{'Content-Type':'application/json'}});
 };
 const save=async(upserts=[],removed=[])=>{bytes=0;reads=[];return route.POST(new Request('http://isolated.test/api/access/data',{method:'POST',headers:{origin:'http://isolated.test',cookie:auth.accessCookie+'='+auth.signAccess(user),'Content-Type':'application/json'},body:JSON.stringify({upserts,removed})}));};
 const update=data=>({entity:'appointments',record_id:data.id,data});
 const fresh=visit('fresh','2026-11-10');let result=await save([update(fresh)]);assert.equal(result.status,200);const bookingBytes=bytes;
 assert.ok(bytes<15000,`Ordinary booking must not download 3500 historical appointments (${bytes} bytes)`);
 const closed={...fresh,status:'Finalizado',accountClosed:true,closedAccount:{id:'account',appointmentId:'fresh',patientId:'patient',professionalId:'pro',date:'2026-11-10',procedureLines:[],products:[],payments:[]}};
 result=await save([update(closed)]);assert.equal(result.status,200);const closureBytes=bytes;assert.ok(bytes<20000,'An unmoved closure needs its old record and account-link check, not the entire agenda');
 result=await save([update(visit('conflict','2026-11-10'))]);assert.equal(result.status,409,'Same-professional conflict remains protected');
 put('appointments',visit('second-room','2026-11-10','other'));put('appointments',visit('third-room','2026-11-10','third'));
 result=await save([update(visit('fourth-room','2026-11-10','fourth'))]);assert.equal(result.status,409,'The room limit must consider every professional');
 const cancelled={...visit('cancelled','2026-11-11'),status:'Cancelado'};put('appointments',cancelled);result=await save([update(visit('replacement','2026-11-11'))]);assert.equal(result.status,200);
 result=await save([update({...cancelled,status:'Confirmado'})]);assert.equal(result.status,409,'Reactivating a cancellation cannot bypass conflicts');
 const fractional=visit('fractional','2026-11-12','pro','08:29','08:31');put('appointments',fractional);result=await save([update(visit('rounded-conflict','2026-11-12','pro','08:00','08:30'))]);assert.equal(result.status,409,'Half-hour rounding remains protected');
 put('appointments',visit('overnight','2026-11-12','pro','23:30','23:59'));const overnight=records.get('appointments:overnight').data;overnight.endsAt='2026-11-13T08:15:00';put('appointments',overnight);
 result=await save([update(visit('next-day-conflict','2026-11-13'))]);assert.equal(result.status,409,'An interval beginning on the previous day still blocks the next morning');
 const forged={...closed,id:'forged',startsAt:'2026-11-14T08:00:00',endsAt:'2026-11-14T09:00:00',closedAccount:{...closed.closedAccount,appointmentId:'forged'}};
 result=await save([update(forged)]);assert.equal(result.status,403,'An account ID from another appointment remains forbidden even outside the new date');
 for(let i=0;i<550;i++)put('appointments',{...visit('cancelled-page-'+i,'2026-11-15'),status:'Cancelado'});
 put('appointments',visit('zz-active-last-page','2026-11-15'));
 result=await save([update(visit('pagination-conflict','2026-11-15'))]);assert.equal(result.status,409,'An active conflict beyond 500 cancelled records must still be fetched and rejected');
 const form={id:'new-form',patientId:'patient',professionalId:'pro',date:'2026-11-10',templateVersion:1,answers:{name:'Paciente QA',bruxism:'Sim',bruxismOptions:['Dormindo']}};
 result=await save([{entity:'anamneses',record_id:form.id,data:form}]);assert.equal(result.status,200);const clinicalBytes=bytes;assert.ok(bytes<10000,'Creating a clinical form must not download every form or patient');
 const revision={...records.get('anamneses:new-form').data,answers:{...form.answers,bruxism:'Não'}};result=await save([{entity:'anamneses',record_id:form.id,data:revision}]);assert.equal(result.status,200);assert.equal(records.get('anamneses:new-form').data.answers.bruxism,'Não');assert.ok(bytes<10000);
 const importedPackages=[{id:'legacy-package',name:'Pacote QA',purchasedOn:'2026-10-01',expiresOn:'2027-01-01',remainingSessions:2,saleValue:100,professionalName:'Profissional QA',source:'legacy-csv'}];
 put('patients',{id:'patient',name:'Paciente QA',notes:'x'.repeat(100000),importedPackages});
 result=await save([{entity:'patients',record_id:'patient',data:{id:'patient',name:'Paciente QA editado',notes:'x'.repeat(100000)}}]);
 assert.equal(result.status,200);const patientBytes=bytes;
 assert.ok(bytes<1000,'Editing a patient only reads the stored imported balances');
 assert.deepEqual(records.get('patients:patient').data.importedPackages,importedPackages);
 const creditRow=(balance,deposits)=>({entity:'patients',record_id:'patient',data:{id:'patient',name:'Paciente QA',futureCredit:balance,futureCreditDeposits:deposits}});
 const cardDeposit={id:'patient-credit-7871ed11-3fc4-4f96-9da5-b9089bdb362f',date:'2026-11-13',amount:100,method:'Crédito',cardBrand:'Elo',installments:2};
 result=await save([creditRow(100,[cardDeposit])]);assert.equal(result.status,403,'Agenda alone cannot record a registration deposit');
 user.tabs.push('Cadastro de Pacientes');
 result=await save([creditRow(100,[cardDeposit])]);assert.equal(result.status,200,await result.text());
 assert.equal(records.get('patients:patient').data.futureCredit,100);
 const feeId=`fixed_costs:taxa-maquininha-patient-${cardDeposit.id}`;
 assert.equal(records.get(feeId).data.value,4.64);assert.equal(records.get(feeId).data.dueDate,cardDeposit.date);
 const savedFee=structuredClone(records.get(feeId));
 result=await save([creditRow(100,[cardDeposit])]);assert.equal(result.status,200);assert.deepEqual(records.get(feeId),savedFee,'An acknowledged retry keeps a single fee');
 assert.equal((await save([creditRow(200,[{...cardDeposit,amount:200}])])).status,409);
 const pix={id:'patient-credit-eebcbd45-5dd5-4031-9fb2-b84a4cfc1ffa',date:'2026-11-13',amount:50,method:'Pix'};
 assert.equal((await save([creditRow(50,[pix])])).status,409,'A stale balance cannot erase a prior deposit');
 result=await save([creditRow(150,[cardDeposit,pix])]);assert.equal(result.status,200);
 assert.equal(records.get('patients:patient').data.futureCredit,150);
 assert.ok(!records.has(`fixed_costs:taxa-maquininha-patient-${pix.id}`));
 const stock={id:'stock-row',procedureId:'used-product',quantity:8};
 const gift={id:'used-gift',name:'Brinde QA',quantity:5};
 put('inventory',stock);put('gifts',gift);
 for(let i=0;i<350;i++){
  put('inventory',{id:'unused-stock-'+i,procedureId:'unused-product-'+i,quantity:10});
  put('gifts',{id:'unused-gift-'+i,name:'Brinde não utilizado',quantity:10});
 }
 const productUse={id:'product-use',procedureId:'used-product',quantity:1,unitCost:20};
 const giftUse={id:'gift-use',giftId:gift.id,name:gift.name,quantity:1};
 const stockedVisit={...closed,stockConsumption:[{procedureId:'used-product',quantity:1}],giftConsumption:[giftUse],closedAccount:{...closed.closedAccount,procedureLines:[{servicePrice:100,quantity:1}],products:[productUse],gifts:[giftUse],payments:[{amount:100}]}};
 const stockRows=[{entity:'inventory',record_id:stock.id,data:{...stock,quantity:7}},{entity:'gifts',record_id:gift.id,data:{...gift,quantity:4}}];
 result=await save([update(stockedVisit),...stockRows]);assert.equal(result.status,200);const stockBytes=bytes;
 assert.ok(bytes<10000,'Checkout only reads the relevant inventory and gifts');
 assert.equal(records.get('inventory:'+stock.id).data.quantity,7);
 assert.equal(records.get('gifts:'+gift.id).data.quantity,4);
 result=await save([{entity:'inventory',record_id:stock.id,data:{...stock,quantity:99}}]);assert.equal(result.status,403,'The stock limit still blocks arbitrary quantity changes');
 failReads=true;result=await save([update({...fresh,notes:'pending'})]);assert.equal(result.status,503,'A failed targeted read must never be treated as an empty agenda');assert.equal(records.get('appointments:fresh').data.accountClosed,true);failReads=false;
 console.log(`PASS: booking ${bookingBytes} B, closure ${closureBytes} B, clinical create ${clinicalBytes} B, patient edit ${patientBytes} B and stock/gift checkout ${stockBytes} B in isolated fixtures. Conflict, permission, stock and read-failure checks preserved.`);
}finally{globalThis.fetch=originalFetch;assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
