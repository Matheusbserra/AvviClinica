import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { pathToFileURL } from "node:url"; import { createRequire } from "node:module"; import assert from "node:assert/strict"; import ts from "typescript";
const require = createRequire(import.meta.url), dir = fs.mkdtempSync(path.join(os.tmpdir(), "avvi-report-access-"));
try {
 const names = ["calculations", "appointmentServices", "reports", "professionalReports", "professionalReportAccess", "access", "accessServer", "accountsServer"];
 function compile(source) {
   for (const name of names) source = source.replaceAll('"./'+name+'"', '"./'+name+'.mjs"').replaceAll('"@/lib/'+name+'"', '"./'+name+'.mjs"');
   source = source.replace('"@supabase/supabase-js"', JSON.stringify(pathToFileURL(require.resolve("@supabase/supabase-js")).href));
   return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
 }
 for (const name of names) fs.writeFileSync(path.join(dir,name+'.mjs'), compile(fs.readFileSync('lib/'+name+'.ts','utf8')));
 fs.writeFileSync(path.join(dir,'route.mjs'),compile(fs.readFileSync('app/api/reports/professionals/route.ts','utf8')));
 Object.assign(process.env,{AVVI_SESSION_SECRET:"isolated-report-access-test-secret-2026",NEXT_PUBLIC_SUPABASE_URL:"",AVVI_LOCAL_ACCOUNTS_DIRECTORY:path.join(dir,"private")});delete process.env.VERCEL;
 const accounts = await import(pathToFileURL(path.join(dir,'accountsServer.mjs'))), auth = await import(pathToFileURL(path.join(dir,'accessServer.mjs')));
 const {limitedProfessionalReports} = await import(pathToFileURL(path.join(dir,'professionalReportAccess.mjs'))), {GET}=await import(pathToFileURL(path.join(dir,'route.mjs')));
 const user=await accounts.saveAccount({login:"scoped-test",name:"Teste",password:"test-password-2026",role:"standard",tabs:["Relatório Profissional"],professionalReport:{professionalIds:["a"]}});
 const ledger=(id,prof,patient,amount)=>({id,professionalId:prof,patientId:patient,date:"2026-10-09",quantity:1,servicePrice:amount,productCost:100,machineFee:0,commercialDiscount:0,accountClosed:true,professionalPercent:30,discountSplit:"Empresa assume",payments:[{amount,fee:0,discount:0}],procedureLines:[{serviceId:"s",quantity:2,servicePrice:amount/2,productCost:50,professionalPercent:30}]});
 const input={start:"2026-10-01",end:"2026-10-31",professionals:[{id:"a",name:"Ana",monthlyGoal:5000,commissionPercent:30,notes:"PRIVATE",avatarDataUrl:"data:image/png;base64,dGVzdA=="},{id:"b",name:"Bia secreta",monthlyGoal:999999}],patients:[{id:"p1",name:"Camila"},{id:"p2",name:"Daniela"},{id:"private",name:"Paciente secreto"}],services:[{id:"s",name:"Avaliação"}],appointments:[],monthlyGoals:[],entries:[ledger("e1","a","p1",900),ledger("e2","a","p2",300),ledger("private-entry","b","private",99999)]};
 const result=limitedProfessionalReports(user,input);assert.equal(result.reports.length,1);const ana=result.reports[0];
 assert.equal(ana.averageTicket,600);assert.equal(ana.closedPatientCount,2);assert.equal(ana.totalPaid,1200);assert.equal(ana.goal,5000);assert.equal(ana.services[0].value,4);assert.equal(ana.patientServices[0].value,2);
 assert.deepEqual(ana.patientRevenue,[{id:"p1",name:"Camila"},{id:"p2",name:"Daniela"}]);assert.deepEqual(Object.keys(ana.professional).sort(),["avatarDataUrl","id","name"]);
 for(const forbidden of ["totalProfit","companyRevenue","professionalValue","commissionPercent","productCost","PRIVATE","Bia secreta","Paciente secreto","99999"]) assert.equal(JSON.stringify(result).includes(forbidden),false,forbidden);
 assert.equal(result.reports[0].patientProfit.every(row=>!Object.hasOwn(row,"value")),true);
 assert.equal(limitedProfessionalReports({...user,professionalReport:{professionalIds:[]}},input).reports.length,0);
 const stored=JSON.parse(fs.readFileSync(path.join(dir,'private/accounts.json'),'utf8'));
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://report-test.supabase.co/rest/v1/";process.env.SUPABASE_SERVICE_ROLE_KEY="sb_secret_report-test";
 const data={professionals:input.professionals,patients:input.patients,services:input.services,appointments:input.appointments,financial_entries:input.entries,monthly_goals:input.monthlyGoals};
 let failRecords=false;const pages=[];
 globalThis.fetch=async (raw,init)=>{
   const url=new URL(raw), headers={"Content-Type":"application/json"};
   if(url.pathname==="/rest/v1/avvi_user_accounts") return new Response(JSON.stringify(stored),{status:200,headers});
   assert.equal(url.pathname,"/rest/v1/avvi_records");if(failRecords)return new Response(JSON.stringify({message:"private-sql-data"}),{status:503,headers});
   const entity=url.searchParams.get("entity").slice(3),offset=Number(url.searchParams.get("offset")??0),all=entity==="financial_entries"?[...Array.from({length:500},(_,i)=>ledger("outside-"+i,"b","private",99)),...data[entity]]:data[entity];
   pages.push([entity,offset]);return new Response(JSON.stringify(all.slice(offset,offset+500).map(value=>({data:value}))),{status:200,headers});
 };
 const request=(who=user,query="start=2026-10-01&end=2026-10-31&professionalId=b")=>new Request("http://test/api/reports/professionals?"+query,{headers:who?{cookie:auth.accessCookie+"="+auth.signAccess(who)}:{}});
 let response=await GET(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),result);assert.ok(pages.some(([entity,offset])=>entity==="financial_entries"&&offset===500));assert.match(response.headers.get("cache-control"),/no-store/);
 response=await GET(request({...user,professionalReport:{professionalIds:["b"]}}));assert.deepEqual(await response.json(),result);
 assert.equal((await GET(request(null))).status,401);assert.equal((await GET(request({login:"admin",role:"admin"}))).status,403);
 assert.equal((await GET(request(user,"start=2026-10-31&end=2026-10-01"))).status,400);
 assert.equal((await GET(request(user,"start=2026-02-30&end=2026-10-01"))).status,400);
 failRecords=true;response=await GET(request());assert.equal(response.status,503);assert.equal(JSON.stringify(await response.json()).includes("private-sql-data"),false);
 stored[0].version++;assert.equal((await GET(request())).status,401);
 console.log("PASS: scoped report projection, monetary rank redaction, selected professionals only, goals/totals, no raw financial/profile leakage, authenticated endpoint, stored permissions defeat forged scope/query, pagination, dates, revoked sessions and safe cloud errors.");
} finally {fs.rmSync(dir,{recursive:true,force:true});}
