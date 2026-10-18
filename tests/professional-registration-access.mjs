import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import {pathToFileURL} from "node:url"; import {createRequire} from "node:module"; import assert from "node:assert/strict"; import ts from "typescript";
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),"avvi-registration-test-"));
try{
 const names=['packageSessions','stockAccess','inventory','gifts','servicePackages',"anamnese", "bodyAnamnese", "strategyDefinitions","access","accessServer","accountsServer","accessSnapshot","agendaAvailability","ultraformer","database","invoices","checkout","calculations","appointmentServices"];
 function compile(source){for(const name of names)source=source.replaceAll('"./'+name+'"','"./'+name+'.mjs"').replaceAll('"@/lib/'+name+'"','"./'+name+'.mjs"');source=source.replace('"@supabase/supabase-js"',JSON.stringify(pathToFileURL(require.resolve("@supabase/supabase-js")).href));return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;}
 for(const name of names)fs.writeFileSync(path.join(dir,name+'.mjs'),compile(name==='database'?'export const entityNames=["professionals","appointments","patients","financial_entries","revenues","fixed_costs","ultraformer_tips"];':fs.readFileSync('lib/'+name+'.ts','utf8')));
 fs.writeFileSync(path.join(dir,'route.mjs'),compile(fs.readFileSync('app/api/access/data/route.ts','utf8')));
 Object.assign(process.env,{AVVI_SESSION_SECRET:'isolated-registration-permission-test-secret-2026',NEXT_PUBLIC_SUPABASE_URL:'',AVVI_LOCAL_ACCOUNTS_DIRECTORY:path.join(dir,'private')});delete process.env.VERCEL;
 const accounts=await import(pathToFileURL(path.join(dir,'accountsServer.mjs'))),auth=await import(pathToFileURL(path.join(dir,'accessServer.mjs'))),access=await import(pathToFileURL(path.join(dir,'access.mjs'))),snapshot=await import(pathToFileURL(path.join(dir,'accessSnapshot.mjs'))),route=await import(pathToFileURL(path.join(dir,'route.mjs')));
 const user=await accounts.saveAccount({login:'registration-qa',name:'QA',password:'password-qa-2026',role:'standard',tabs:['Cadastro de Profissionais','Relatório Profissional'],professionalAccess:{professionalIds:['ana','ana']}});
 assert.deepEqual(user.professionalRegistration.professionalIds,['ana']);assert.deepEqual(user.professionalReport.professionalIds,['ana']);assert.equal(access.canManageProfessional(user,'ana'),true);assert.equal(access.canManageProfessional(user,'bia'),false);assert.equal(access.canManageProfessional(user,''),false);assert.equal(access.registrationOnly(user),true);
 await assert.rejects(accounts.saveAccount({login:'bad-qa',name:'QA',password:'password-qa-2026',role:'standard',tabs:['Cadastro de Profissionais'],professionalRegistration:{professionalIds:[]}}),/Selecione/);
 const kept=await accounts.saveAccount({...user,id:user.id,revision:user.revision,name:'QA atualizado'});assert.deepEqual(kept.professionalRegistration,user.professionalRegistration);
 const stored=JSON.parse(fs.readFileSync(path.join(dir,'private/accounts.json'),'utf8'));
 const record=(id,name,percent)=>({entity:'professionals',record_id:id,data:{id,name,active:true,commissionPercent:percent,monthlyGoal:1000,closedShifts:[]}});
 const records=new Map([['ana',record('ana','Ana',30)],['bia',record('bia','Bia',40)]]);let writes=0;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://registration-test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_qa';
 globalThis.fetch=async(raw,init={})=>{const url=new URL(raw),headers={'Content-Type':'application/json'},method=init.method??'GET';
 if(url.pathname==='/rest/v1/avvi_user_accounts')return new Response(JSON.stringify(stored),{status:200,headers});
 assert.equal(url.pathname,'/rest/v1/avvi_records');const filter=url.searchParams.get('entity');const matches=row=>filter?.startsWith('eq.')?row.entity===filter.slice(3):filter?.startsWith('in.')?filter.slice(4,-1).split(',').map(value=>value.replaceAll('"','')).includes(row.entity):true;
 if(method==='GET'){const id=url.searchParams.get('record_id')?.slice(3);const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500);const data=[...records.values()].filter(row=>matches(row)&&(!id||row.record_id===id));return new Response(JSON.stringify(new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object')?(data[0]??null):data.slice(offset,offset+limit)),{status:200,headers});}
 if(method==='POST'){writes++;for(const row of JSON.parse(init.body))records.set(row.record_id,structuredClone(row));return new Response('[]',{status:201,headers});}
 if(method==='DELETE'){writes++;return new Response(null,{status:204,headers});}throw Error('Unexpected request');};
 const req=(who=kept,payload)=>new Request('http://test/api/access/data?entity=professionals',{method:payload?'POST':'GET',headers:{origin:'http://test',cookie:auth.accessCookie+'='+auth.signAccess(who),'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
 let response=await route.GET(req());assert.equal(response.status,200);const data=(await response.json()).records;assert.deepEqual(data.map(item=>item.id),['ana']);assert.equal(data[0].commissionPercent,0);assert.equal(data[0].monthlyGoal,undefined); // Limited reports expose goals only through their scoped projection.
 response=await route.GET(req({...kept,professionalRegistration:{professionalIds:['bia']}}));assert.deepEqual((await response.json()).records.map(item=>item.id),['ana']);
 const refresh=(who=kept,etag='')=>new Request('http://test/api/access/data?sync=1',{headers:{cookie:auth.accessCookie+'='+auth.signAccess(who),...(etag?{'If-None-Match':etag}:{})}});
 assert.equal((await route.GET(new Request('http://test/api/access/data?sync=1'))).status,401);
 response=await route.GET(refresh());assert.equal(response.status,200);
 const cloud=await response.json(),etag=response.headers.get('etag');
 assert.deepEqual(Object.keys(cloud.data),['professionals']);assert.deepEqual(cloud.data.professionals.map(item=>item.id),['ana']);
 assert.equal(cloud.data.professionals[0].commissionPercent,0);assert.equal(cloud.data.professionals[0].monthlyGoal,undefined);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('vary'),'Cookie');
 response=await route.GET(refresh(kept,etag));assert.equal(response.status,304);assert.equal(await response.text(),'');
 const oldAna=structuredClone(records.get('ana'));records.delete('ana');
 response=await route.GET(refresh(kept,etag));assert.equal(response.status,200);assert.deepEqual((await response.json()).data.professionals,[]);
 records.set('ana',oldAna);
 // Changes on later metadata pages must invalidate the revision as well.
 for(let i=0;i<1001;i++)records.set('page-'+i,record('page-'+i,'Fixture '+i,40));
 response=await route.GET(refresh());const pagesEtag=response.headers.get('etag');
 records.get('page-1000').updated_at='2026-10-17T12:00:00Z';
 assert.equal((await route.GET(refresh(kept,pagesEtag))).status,200);
 for(let i=0;i<1001;i++)records.delete('page-'+i);
 console.log('PASS: shared refresh authenticates, preserves professional/financial scopes, uses private conditional responses, detects deletion and changes past 1000 metadata rows.');
 const change=(id,patch)=>({upserts:[{entity:'professionals',record_id:id,data:{...records.get(id).data,...patch}}]});
 response=await route.POST(req(kept,change('ana',{name:'Ana atualizada',commissionPercent:99,closedShifts:[{weekday:1,shift:'morning'}]})));assert.equal(response.status,200);assert.equal(records.get('ana').data.commissionPercent,30);assert.equal(records.get('ana').data.monthlyGoal,1000);assert.equal(records.get('ana').data.closedShifts.length,1);
 let before=writes;assert.equal((await route.POST(req(kept,change('bia',{name:'Unauthorized'})))).status,403);assert.equal((await route.POST(req(kept,{removed:[{entity:'professionals',ids:['bia']}]}))).status,403);assert.equal(writes,before);
 assert.equal((await route.POST(req(kept,change('ana',{closedShifts:[{weekday:8,shift:'morning'}]})))).status,400);assert.equal(writes,before);
 const cached={appointments:[],professionals:[records.get('ana').data,records.get('bia').data]};assert.deepEqual(snapshot.permittedSnapshot(cached,kept).professionals.map(item=>item.id),['ana']);assert.equal(snapshot.permittedSnapshot(cached,kept).professionals[0].commissionPercent,0);
 const admin={login:'admin',role:'admin'};assert.equal((await route.POST(req(admin,change('ana',{commissionPercent:60})))).status,200);assert.equal(records.get('ana').data.commissionPercent,60);
 const appointment=(id,start,end,professionalId='ana')=>({entity:'appointments',record_id:id,data:{id,professionalId,startsAt:'2026-10-10T'+start+':00',endsAt:'2026-10-10T'+end+':00',eventType:'Novo Agendamento',status:'Agendado',notes:''}});
 assert.equal((await route.POST(req(admin,{upserts:[appointment('first','08:00','09:20')]}))).status,200);
 before=writes;
 response=await route.POST(req(admin,{upserts:[appointment('conflict','09:15','09:45')]}));assert.equal(response.status,409);assert.match((await response.json()).error,/reservado/);assert.equal(writes,before);
 assert.equal((await route.POST(req(admin,{upserts:[appointment('half-next','09:30','10:00')]}))).status,200);
 assert.equal((await route.POST(req(admin,{upserts:[appointment('next','10:00','11:00')]}))).status,200);
 assert.equal((await route.POST(req(admin,change('ana',{closedShifts:[{weekday:6,shift:'morning'}]})))).status,200);
 assert.equal((await route.POST(req(admin,{upserts:[{...records.get('first'),data:{...records.get('first').data,notes:'existing preserved'}}]}))).status,200);
 assert.equal(records.get('first').data.notes,'existing preserved');
 assert.equal((await route.POST(req(admin,{upserts:[appointment('closed','11:00','12:00')]}))).status,409);
 assert.equal((await route.POST(req(admin,{upserts:[appointment('batch-one','16:00','18:00'),appointment('batch-two','17:30','19:00')]}))).status,409);
 assert.equal(records.has('batch-one'),false);
 for(let index=1;index<=5;index++)records.set('parallel-pro-'+index,record('parallel-pro-'+index,'Paralelo '+index,50));
 const parallel=Array.from({length:4},(_,index)=>appointment('parallel-'+index,'14:00','15:00','parallel-pro-'+(index+1)));
 assert.equal((await route.POST(req(admin,{upserts:parallel.slice(0,2)}))).status,200);
 assert.equal((await route.POST(req(admin,{upserts:parallel.slice(2,3)}))).status,200);
 before=writes;response=await route.POST(req(admin,{upserts:parallel.slice(3)}));assert.equal(response.status,409);assert.match((await response.json()).error,/3.*simult/);assert.equal(writes,before);assert.equal(records.has('parallel-3'),false);
 const batch=parallel.map(row=>({...row,record_id:row.record_id+'-batch',data:{...row.data,id:row.data.id+'-batch',startsAt:'2026-10-10T16:00:00',endsAt:'2026-10-10T17:00:00'}}));
 assert.equal((await route.POST(req(admin,{upserts:batch}))).status,409);assert.equal(writes,before);assert.equal(records.has('parallel-0-batch'),false);
 // Restoring a cancellation is a new reservation even if its times never change.
 records.set(parallel[3].record_id,{...parallel[3],data:{...parallel[3].data,status:'Cancelado'}});
 assert.equal((await route.POST(req(admin,{upserts:[{...parallel[3],data:{...parallel[3].data,status:'Confirmado'}}]}))).status,409);assert.equal(writes,before);
 const absence=appointment('parallel-absence','14:00','15:00','parallel-pro-5');absence.data.eventType='Registrar Ausência';
 assert.equal((await route.POST(req(admin,{upserts:[absence]}))).status,200);
 console.log('PASS: API allows three simultaneous professionals, rejects a fourth and a four-booking batch before any writes, rechecks restored cancellations, and does not count absences as occupied rooms.');
 console.log('PASS: API rejects half-hour conflicts and closed shifts, allows adjacent half-hour appointments, rejects overlapping appointments in one batch before writing and preserves existing appointments after weekly closures.');
 stored[0].version++;assert.equal((await route.GET(req())).status,401);
 console.log('PASS: shared report/registration/strategy scope, deduplication, empty scope rejection, persisted scope, signed sessions revalidate stored permissions, selected-only API/cache, hidden commission, forged commission preserved, unauthorized writes/deletes blocked, weekly rule validation, admin unchanged and session revocation. Isolated files and mock network.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
