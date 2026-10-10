import fs from "node:fs";import os from "node:os";import path from "node:path";import {pathToFileURL} from "node:url";import {createRequire} from "node:module";import assert from "node:assert/strict";import ts from "typescript";
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),"avvi-accounts-"));
try {
 const names=["access","accessServer","accountsServer","accessSnapshot"];
 for(const name of names){let source=fs.readFileSync("lib/"+name+".ts","utf8");for(const dependency of names)source=source.replaceAll('"./'+dependency+'"','"./'+dependency+'.mjs"');source=source.replace('"@supabase/supabase-js"',JSON.stringify(pathToFileURL(require.resolve("@supabase/supabase-js")).href));fs.writeFileSync(path.join(dir,name+".mjs"),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
 Object.assign(process.env,{AVVI_SESSION_SECRET:"isolated-accounts-test-secret-000000000000",NEXT_PUBLIC_SUPABASE_URL:"",AVVI_LOCAL_ACCOUNTS_DIRECTORY:path.join(dir,"private")});delete process.env.VERCEL;
 const accounts=await import(pathToFileURL(path.join(dir,"accountsServer.mjs"))),auth=await import(pathToFileURL(path.join(dir,"accessServer.mjs"))),access=await import(pathToFileURL(path.join(dir,"access.mjs")));
 const {permittedSnapshot}=await import(pathToFileURL(path.join(dir,"accessSnapshot.mjs")));
 const snapshot=Object.fromEntries(["patients","professionals","procedures","services","inventory","gifts","followup_rules","followup_contacts","followup_logs","appointments","financial_entries","revenues","fixed_costs","receipts","professional_receipts","monthly_goals"].map(entity=>[entity,[]]));
 snapshot.appointments=[{id:"appointment",closedAccount:{id:"closed-account"}}];
 snapshot.financial_entries=[{id:"private-ledger",date:"2026-10-09",payments:[{amount:900}],servicePrice:900,notes:"restricted"},{id:"procedure-account-closed-account",sourceAccountId:"closed-account",payments:[{amount:200}],servicePrice:200}];
 snapshot.revenues=[{id:"receita-entry-closed-account",sourceFinancialEntryId:"closed-account",total:200},{id:"private-revenue",total:900}];
 snapshot.fixed_costs=[{id:"taxa-maquininha-closed-account",sourceFinancialEntryId:"closed-account",value:5},{id:"private-cost",value:900}];
 const recovered=permittedSnapshot(snapshot,{login:"receiver",role:"standard",tabs:["Agenda"]});assert.equal(recovered.financial_entries[0].servicePrice,0);assert.equal(recovered.financial_entries[0].notes,"");assert.equal(recovered.financial_entries[1].servicePrice,200);assert.equal(recovered.revenues.length,1);assert.equal(recovered.fixed_costs.length,1);assert.equal(recovered.revenues[0].total,200);assert.equal(permittedSnapshot(snapshot,{login:"none",role:"standard",tabs:[]}).financial_entries.length,0);assert.notEqual(access.userSnapshotKey({id:"new-admin",login:"manager",role:"admin",revision:1}),access.userSnapshotKey({login:"admin",role:"admin"}));
 let list=await accounts.listAccounts();assert.equal(list.accounts.length,2);assert.equal(list.accounts[0].locked,true);assert.equal(list.accounts[1].password,"avviclinica2026");
 await assert.rejects(accounts.saveAccount({id:"primary-admin",login:"changed"}),error=>error.status===403);await assert.rejects(accounts.saveAccount({name:3,login:42}),error=>error.status===400);
 const original=await auth.authenticateUser("avviclinica","avviclinica2026");assert.equal(original.role,"standard");const request=user=>new Request("http://test.local",{headers:{cookie:auth.accessCookie+"="+auth.signAccess(user)}});
 assert.equal((await auth.resolveAccess(request(original))).login,"avviclinica");
 const user=await accounts.saveAccount({name:"Usuário QA",login:"usuario-qa",password:"senha-qa-2026",role:"standard",tabs:["Relatórios","Estoque","Contas"]});assert.equal(access.canAccessTab(user,"Relatórios"),true);assert.equal(access.canAccessTab(user,"Contas"),false);assert.equal(access.canAccessTab(user,"Agenda"),false);assert.equal(access.canReadEntity(user,"financial_entries"),true);assert.equal(access.canWriteEntity(user,"financial_entries"),false);assert.equal(access.canWriteEntity(user,"inventory"),true);
 assert.equal(await auth.authenticateUser("usuario-qa","wrong"),null);assert.equal((await auth.authenticateUser("usuario-qa","senha-qa-2026")).id,user.id);assert.ok(await auth.resolveAccess(request(user)));
 const stored=JSON.parse(fs.readFileSync(path.join(dir,"private/accounts.json"),"utf8"));assert.equal(JSON.stringify(stored).includes("senha-qa-2026"),false);assert.ok(stored[0].password_ciphertext);assert.notEqual(stored[0].password_hash,"senha-qa-2026");
 list=await accounts.listAccounts();assert.equal(list.accounts.find(a=>a.id===user.id).password,"senha-qa-2026");
 await assert.rejects(accounts.saveAccount({name:"Duplicado",login:"usuario-qa",password:"senha-qa-2026",role:"standard",tabs:[]}),error=>error.status===409);
 const edited=await accounts.saveAccount({id:user.id,revision:user.revision,name:"Renomeado",login:"renomeado",password:"nova-senha-2026",role:"admin",tabs:[]});assert.equal(await auth.resolveAccess(request(user)),null);assert.equal(await auth.authenticateUser("usuario-qa","senha-qa-2026"),null);assert.equal((await auth.authenticateUser("renomeado","nova-senha-2026")).role,"admin");assert.equal(access.canAccessTab(edited,"Contas"),true);assert.equal(access.canAccessTab(edited,"Metas"),true);
 await assert.rejects(accounts.saveAccount({id:user.id,revision:user.revision,name:"Stale",login:"renomeado",password:"",role:"standard",tabs:[]}),error=>error.status===409);
 const defaultEdited=await accounts.saveAccount({id:original.id,revision:0,name:"Recepção",login:"recepcao",password:"",role:"standard",tabs:["Agenda"]});assert.equal(await auth.resolveAccess(request(original)),null);assert.equal(await auth.authenticateUser("avviclinica","avviclinica2026"),null);assert.equal((await auth.authenticateUser("recepcao","avviclinica2026")).id,defaultEdited.id);
 list=await accounts.listAccounts();assert.equal(list.accounts.find(a=>a.id===defaultEdited.id).password,"avviclinica2026");assert.equal(list.accounts[0].login,"admin");assert.equal(list.accounts[0].password,null);
 // Scoped report accounts persist their allowed professional IDs and revoke old sessions.
 const scoped=await accounts.saveAccount({name:"Ana restrita",login:"ana-restrita",password:"senha-qa-2026",role:"standard",tabs:["Relatório Profissional"],professionalReport:{professionalIds:["ana","ana"]}});
 assert.deepEqual(scoped.professionalReport,{professionalIds:["ana"]});
 assert.deepEqual((await auth.authenticateUser("ana-restrita","senha-qa-2026")).professionalReport,scoped.professionalReport);
 assert.deepEqual((await accounts.listAccounts()).accounts.find(a=>a.id===scoped.id).professionalReport,scoped.professionalReport);
 for(const entity of ["professionals","patients","services","appointments","financial_entries","monthly_goals"]){assert.equal(access.canReadEntity(scoped,entity),false);assert.equal(access.canWriteEntity(scoped,entity),false);}
 assert.equal(access.hasFinancialAccess(scoped),false);assert.equal(access.canAccessTab(scoped,"Relatório Profissional"),true);
 assert.equal(permittedSnapshot(snapshot,scoped).financial_entries.length,0);
 assert.deepEqual((await auth.resolveAccess(request({...scoped,professionalReport:{professionalIds:["samia"]}}))).professionalReport,{professionalIds:["ana"]});
 for(const invalid of [{professionalIds:[]},{professionalIds:[3]},[],"all"]){await assert.rejects(accounts.saveAccount({name:"Inválido",login:"bad-scope",password:"senha-qa-2026",role:"standard",tabs:["Relatório Profissional"],professionalReport:invalid}),error=>error.status===400);}
 const changed=await accounts.saveAccount({id:scoped.id,revision:scoped.revision,name:"Ana restrita",login:scoped.login,password:"",role:"standard",tabs:["Relatório Profissional"],professionalReport:{professionalIds:["samia"]}});
 assert.equal(await auth.resolveAccess(request(scoped)),null);assert.deepEqual(changed.professionalReport,{professionalIds:["samia"]});
 const complete=await accounts.saveAccount({id:changed.id,revision:changed.revision,name:"Ana restrita",login:changed.login,password:"",role:"standard",tabs:["Relatório Profissional"],professionalReport:null});
 assert.equal(complete.professionalReport,undefined);assert.equal(access.hasFinancialAccess(complete),true);
 const promoted=await accounts.saveAccount({id:complete.id,revision:complete.revision,name:"Ana restrita",login:complete.login,password:"",role:"admin",tabs:[],professionalReport:{professionalIds:["ana"]}});assert.equal(promoted.professionalReport,undefined);
 // A configured cloud never falls back to local file storage or old credentials after a network failure.
 process.env.NEXT_PUBLIC_SUPABASE_URL="http://database.test";process.env.SUPABASE_SERVICE_ROLE_KEY="qa-service";globalThis.fetch=async()=>new Response(JSON.stringify({message:"offline"}),{status:503,headers:{"Content-Type":"application/json"}});
 await assert.rejects(auth.authenticateUser("avviclinica","avviclinica2026"));assert.equal(await auth.resolveAccess(request(defaultEdited)),null);
 const leak="private-key-must-not-appear";
 for(const fixture of [{status:401,code:"",expected:/recusou a chave/},{status:403,code:"42501",expected:/negou acesso/},{status:400,code:"42703",expected:/estrutura diferente/},{status:503,code:"PGRST002",expected:/Código: PGRST002/}]){
  globalThis.fetch=async()=>new Response(JSON.stringify({code:fixture.code,message:leak,details:leak}),{status:fixture.status,headers:{"Content-Type":"application/json"}});
  await assert.rejects(accounts.listAccounts(),error=>fixture.expected.test(error.message)&&!error.message.includes(leak));
 }
 globalThis.fetch=async()=>new Response(JSON.stringify({code:"PGRST205",message:leak}),{status:404,headers:{"Content-Type":"application/json"}});
 const unprepared=await accounts.listAccounts();assert.equal(unprepared.editable,false);assert.match(unprepared.message,/mesmo projeto/);assert.equal(unprepared.accounts.length,2);
 const jwt=claims=>Buffer.from("{}").toString("base64url")+"."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".signature";
 process.env.SUPABASE_SERVICE_ROLE_KEY=jwt({role:"anon",ref:"project"});await assert.rejects(accounts.listAccounts(),error=>/chave pública ou de usuário/.test(error.message));
 process.env.SUPABASE_SERVICE_ROLE_KEY="sb_publishable_not-a-secret";await assert.rejects(accounts.listAccounts(),error=>/chave pública/.test(error.message));
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co";process.env.SUPABASE_SERVICE_ROLE_KEY=jwt({role:"service_role",ref:"another-project"});await assert.rejects(accounts.listAccounts(),error=>/outro projeto/.test(error.message));
 globalThis.fetch=async()=>new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});
 process.env.SUPABASE_SERVICE_ROLE_KEY=jwt({role:"service_role",ref:"project"});assert.equal((await accounts.listAccounts()).editable,true);
 process.env.SUPABASE_SERVICE_ROLE_KEY="sb_secret_server-test-key";assert.equal((await accounts.listAccounts()).editable,true);
 // Use the real SDK with a strict fake REST endpoint to reproduce PGRST125 for duplicated paths.
 for(const suffix of ["", "/", "/rest/v1", "/rest/v1/", "/auth/v1", "/auth/v1/", "/REST/v1///"]){
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co"+suffix;
  globalThis.fetch=async input=>{const url=new URL(input);assert.equal(url.pathname,"/rest/v1/avvi_user_accounts");assert.equal(url.searchParams.get("order"),"login.asc");return new Response("[]",{status:200,headers:{"Content-Type":"application/json"}});};
  assert.equal((await accounts.listAccounts()).editable,true);assert.equal((await accounts.authenticateManaged("avviclinica","avviclinica2026")).role,"standard");
 }
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co/rest/v1/";
 const cloudRows=new Map();
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input);assert.equal(url.pathname,"/rest/v1/avvi_user_accounts");const method=init?.method??"GET";
  if(method==="GET")return new Response(JSON.stringify([...cloudRows.values()]),{status:200,headers:{"Content-Type":"application/json"}});
  const body=JSON.parse(init.body),row=Array.isArray(body)?body[0]:body;
  if(method==="PATCH"){assert.equal(url.searchParams.get("id"),"eq."+row.id);assert.equal(url.searchParams.get("version"),"eq."+cloudRows.get(row.id).version);}
  cloudRows.set(row.id,row);return new Response(JSON.stringify([{id:row.id}]),{status:200,headers:{"Content-Type":"application/json"}});
 };
 const cloudUser=await accounts.saveAccount({name:"Conta de teste na nuvem",login:"cloud-user",password:"cloud-password-2026",role:"standard",tabs:["Agenda"]});
 assert.equal((await accounts.authenticateManaged("cloud-user","cloud-password-2026")).id,cloudUser.id);
 const cloudEdited=await accounts.saveAccount({id:cloudUser.id,revision:cloudUser.revision,name:"Conta editada",login:"cloud-user",password:"changed-cloud-password-2026",role:"standard",tabs:["Estoque"]});
 assert.equal(await accounts.authenticateManaged("cloud-user","cloud-password-2026"),null);assert.equal((await accounts.authenticateManaged("cloud-user","changed-cloud-password-2026")).revision,cloudEdited.revision);
 assert.equal((await accounts.listAccounts()).accounts.find(a=>a.id===cloudUser.id).password,"changed-cloud-password-2026");
 console.log("PASS: Immutable primary admin, existing user, private encrypted passwords, new users, exact custom tabs and API permissions, duplicate login, rename/password/role editing, promotion, stale edit rejection, session revocation and cloud failure closed; specific safe diagnostics for API keys, project mismatch, schema permissions and missing columns; legacy and modern private keys; root/REST/auth URLs yield the exact REST path for listing, creation, editing and login. Isolated files and mocked network only.");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
