import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import ts from 'typescript';
import {createPackageTestDatabase} from './package-session-db-helper.mjs';
const db=await createPackageTestDatabase(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-package-sessions-')),require=createRequire(import.meta.url);
try{
 const names=['packageSessions','stockAccess','inventory','gifts','servicePackages','checkout','appointmentServices','access','accessServer','accountsServer','accessSnapshot','database','supabase','persistence','ultraformer','agendaAvailability','invoices','strategyDefinitions','anamnese','bodyAnamnese','calculations'];
 for(const name of [...names,'route']){
  let source=fs.readFileSync(name==='route'?'app/api/access/data/route.ts':`lib/${name}.ts`,'utf8');
  for(const dependency of names)source=source.replaceAll(`"./${dependency}"`,`"./${dependency}.mjs"`).replaceAll(`"@/lib/${dependency}"`,`"./${dependency}.mjs"`);
  source=source.replaceAll('"@supabase/supabase-js"',JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href));
  fs.writeFileSync(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 }
 Object.assign(process.env,{AVVI_SESSION_SECRET:'isolated-package-sessions-secret-2026',NEXT_PUBLIC_SUPABASE_URL:'https://package-sessions-test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_isolated_test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_isolated_test',AVVI_LOCAL_ACCOUNTS_DIRECTORY:path.join(dir,'private')});delete process.env.VERCEL;
 const load=name=>import(pathToFileURL(path.join(dir,name+'.mjs'))),auth=await load('accessServer'),route=await load('route'),packages=await load('servicePackages');
 const operator={id:'operator',login:'operator',role:'standard',tabs:['Agenda'],version:1},admin={login:'admin',role:'admin'};
 let missingRpc=false,rpcCalls=0;
 globalThis.fetch=async(raw,init={})=>{
  const url=new URL(raw),method=init.method??'GET';assert.equal(url.hostname,'package-sessions-test.supabase.co');
  if(url.pathname==='/rest/v1/avvi_user_accounts')return Response.json([operator]);
  if(url.pathname==='/rest/v1/rpc/avvi_save_package_checkout'){
   rpcCalls++;if(missingRpc)return Response.json({code:'PGRST202',message:'Function unavailable'},{status:404});
   const payload=JSON.parse(init.body);
   try{await db.query('select avvi_save_package_checkout($1::jsonb,$2::jsonb)',[JSON.stringify(payload.p_upserts),JSON.stringify(payload.p_removed)]);return Response.json({saved:true});}
   catch(error){return Response.json({code:error.code,message:error.message},{status:400});}
  }
  assert.equal(url.pathname,'/rest/v1/avvi_records');
  if(method==='POST'){
   const body=JSON.parse(init.body);for(const row of Array.isArray(body)?body:[body])await db.query('insert into avvi_records(entity,record_id,data) values($1,$2,$3) on conflict(entity,record_id) do update set data=excluded.data,updated_at=clock_timestamp()',[row.entity,row.record_id,JSON.stringify(row.data)]);
   return new Response('[]',{status:201});
  }
  const result=await db.query('select entity,record_id,data,updated_at from avvi_records order by entity,record_id');
  const matches=row=>[...url.searchParams].every(([field,value])=>{
   const actual=field==='entity'?row.entity:field==='record_id'?row.record_id:field.startsWith('data->>')?row.data[field.slice(7)]:undefined;
   return actual===undefined||!value.startsWith('eq.')||String(actual)===value.slice(3);
  });
  const rows=result.rows.filter(matches);
  if(method==='DELETE'){for(const row of rows)await db.query('delete from avvi_records where entity=$1 and record_id=$2',[row.entity,row.record_id]);return new Response(null,{status:204});}
  const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500);
  return Response.json(new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object')?(rows[0]??null):rows.slice(offset,offset+limit));
 };
 const request=(body,user=admin)=>new Request('http://test/api/access/data',{method:'POST',headers:{origin:'http://test','Content-Type':'application/json',...(user?{cookie:auth.accessCookie+'='+auth.signAccess(user)}:{})},body:JSON.stringify(body)});
 const row=(entity,data)=>({entity,record_id:data.id,data});
 const save=async(upserts,user=admin,removed=[])=>route.POST(request({upserts,removed},user));
 const read=async(entity,id)=>(await db.query('select data from avvi_records where entity=$1 and record_id=$2',[entity,id])).rows[0]?.data;
 const pro={id:'pro',name:'Profissional QA',active:true,closedShifts:[]},patient={id:'p',name:'Paciente QA',futureCredit:0};
 await save([row('professionals',pro),row('patients',patient),row('inventory',{id:'stock',procedureId:'product',quantity:10}),row('procedures',{id:'product',name:'Produto QA',active:true,price:100,averageCost:20})]);
 const pack={id:'pack',name:'Pacote QA',description:'',active:true,salePrice:300,validityEnabled:false,validityMonths:0,commissionPercent:70,items:[{id:'item',serviceId:'s',name:'Serviço QA',quantity:3,unitPrice:100}]};
 const sale={id:'sale',professionalId:'pro',patientId:'p',startsAt:'2026-10-10T08:00:00',endsAt:'2026-10-10T09:00:00',status:'Finalizado',eventType:'Novo Agendamento',accountClosed:true,closedAccount:{id:'sale-account',appointmentId:'sale',patientId:'p',professionalId:'pro',accountClosed:true,date:'2026-10-10',procedureLines:packages.packageCheckoutLines(pack,1),products:[],payments:[{method:'Pix',amount:300}],commercialDiscount:0}};
 delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 let response=await save([row('appointments',sale)]);assert.equal(response.status,503);assert.match((await response.json()).error,/SUPABASE_SERVICE_ROLE_KEY/);assert.equal(await read('appointments','sale'),undefined);
 process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_isolated_test';
 missingRpc=true;response=await save([row('appointments',sale)]);assert.equal(response.status,503);assert.match((await response.json()).error,/package-sessions.sql/);assert.equal(await read('appointments','sale'),undefined);missingRpc=false;
 assert.equal((await save([row('appointments',sale)])).status,200);
 const use={id:'u',sourceAppointmentId:'sale',sourceAccountId:'sale-account',purchaseKey:sale.closedAccount.procedureLines[0].packagePurchaseKey,packageId:'pack',packageName:'Pacote QA',serviceId:'s',serviceName:'Serviço QA',quantity:2};
 function treatment(id,hour,uses=[use]){return {id,patientId:'p',professionalId:'pro',startsAt:`2026-10-11T${hour}:00:00`,endsAt:`2026-10-11T${Number(hour)+1}:00:00`,status:'Finalizado',eventType:'Novo Agendamento',accountClosed:true,closedAccount:{id:'account-'+id,appointmentId:id,patientId:'p',professionalId:'pro',accountClosed:true,date:'2026-10-11',procedureLines:[],products:[],payments:[],commercialDiscount:0,packageSessionUses:uses}};}
 const one=treatment('one','10'),two=treatment('two','12'),user={...operator,revision:1};
 assert.equal((await save([row('appointments',one)],null)).status,401);
 // Both requests read the same balance; the real PostgreSQL function rechecks it
 // under its transaction lock. Only one of two 2-session consumptions may commit.
 const responses=await Promise.all([save([row('appointments',one)],user),save([row('appointments',two)],admin)]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const committed=await read('appointments','one')?'one':'two',other=committed==='one'?'two':'one',saved=await read('appointments',committed);
 assert.equal(await read('appointments',other),undefined);
 assert.equal((await save([row('appointments',saved)],user)).status,200,'Idempotent retries do not consume more sessions');
 assert.equal((await save([],admin,[{entity:'appointments',ids:['sale']}])).status,409,'Used sale cannot be removed');
 for(const patch of [{patientId:'other'},{closedAccount:{...two.closedAccount,packageSessionUses:[{...use,sourceAccountId:'wrong'}]}},{closedAccount:{...two.closedAccount,packageSessionUses:[{...use,quantity:1.5}]}}])assert.equal((await save([row('appointments',{...two,id:other,closedAccount:{...two.closedAccount,appointmentId:other},...patch})])).status,409);
 // Reversing consumption returns the sessions and keeps the paid sale intact.
 assert.equal((await save([row('appointments',{...saved,accountClosed:false,closedAccount:undefined})],user)).status,200);
 const prepaid=treatment(other,'14',[{...use,quantity:3}]);prepaid.closedAccount.products=[{id:'product-use',procedureId:'product',quantity:1,unitCost:20}];prepaid.stockConsumption=[{procedureId:'product',quantity:1}];prepaid.giftConsumption=[];
 response=await save([row('appointments',prepaid),row('inventory',{id:'stock',procedureId:'product',quantity:9})],user);assert.equal(response.status,200,await response.text());
 assert.equal((await read('inventory','stock')).quantity,9);assert.equal((await read('appointments',other)).closedAccount.payments.length,0);
 assert.equal((await save([row('appointments',prepaid),row('inventory',{id:'stock',procedureId:'product',quantity:9})],user)).status,200);assert.equal((await read('inventory','stock')).quantity,9);
 // Entire batch rolls back on a database error, including unrelated records.
 await assert.rejects(db.query('select avvi_save_package_checkout($1::jsonb,$2::jsonb)',[JSON.stringify([row('patients',{id:'rollback',name:'Not saved'}),{record_id:'invalid',data:{id:'invalid'}}]),'[]']));assert.equal(await read('patients','rollback'),undefined);
 const acl=await db.query("select has_function_privilege('anon','avvi_save_package_checkout(jsonb,jsonb)','execute') as anon,has_function_privilege('authenticated','avvi_save_package_checkout(jsonb,jsonb)','execute') as authenticated,has_function_privilege('service_role','avvi_save_package_checkout(jsonb,jsonb)','execute') as service");assert.deepEqual(acl.rows[0],{anon:false,authenticated:false,service:true});
 const legacy={...sale,id:'legacy',startsAt:'2026-01-31T08:00:00',endsAt:'2026-01-31T09:00:00',closedAccount:{...sale.closedAccount,id:'legacy-account',appointmentId:'legacy',date:'2026-01-31',procedureLines:sale.closedAccount.procedureLines.map(({packagePurchaseKey,...line})=>({...line,packageValidityMonths:1}))}};
 assert.equal((await save([row('appointments',legacy)])).status,200);
 const legacyUse={...use,sourceAppointmentId:'legacy',sourceAccountId:'legacy-account',purchaseKey:'legacy:pack',quantity:1};
 const validLegacy={...treatment('legacy-use','10',[legacyUse]),startsAt:'2026-02-28T10:00:00',endsAt:'2026-02-28T11:00:00'};validLegacy.closedAccount.date='2026-02-28';
 assert.equal((await save([row('appointments',validLegacy)])).status,200,'Legacy purchase expires on February 28 rather than overflowing into March');
 const expired={...validLegacy,id:'expired',closedAccount:{...validLegacy.closedAccount,id:'expired-account',appointmentId:'expired',date:'2026-03-01'}};
 await assert.rejects(db.query('select avvi_save_package_checkout($1::jsonb,$2::jsonb)',[JSON.stringify([row('appointments',expired)]),'[]']),/validade/);
 await assert.rejects(db.query('select avvi_save_package_checkout($1::jsonb,$2::jsonb)',[JSON.stringify([row('appointments',{...legacy,closedAccount:{...legacy.closedAccount,payments:[{amount:100}]}})]),'[]']),/pago/);
 assert.equal((await read('appointments','legacy')).closedAccount.payments[0].amount,300,'Invalidating a used purchase rolls back');
 assert.ok(rpcCalls>=5);
 console.log('PASS: migration executes/reexecutes in isolated PostgreSQL, service-only RPC, missing-migration fails without writes, real authenticated gateway/admin/standard, stale concurrent consumptions serialize with one rejected, idempotent retry, patient/source/quantity guards, used-sale deletion blocked, consumption reversal, zero-charge stock consumption once, transactional rollback. No real cloud.');
}finally{await db.close();fs.rmSync(dir,{recursive:true,force:true});}
