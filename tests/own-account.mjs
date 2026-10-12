import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import ts from 'typescript';
const require=createRequire(import.meta.url),dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-own-account-'));
try {
 const modules=['access','accessServer','accountsServer'];
 for(const name of [...modules,'accountsRoute','passwordRoute']) {
  let source=fs.readFileSync(name==='accountsRoute'?'app/api/accounts/route.ts':name==='passwordRoute'?'app/api/accounts/password/route.ts':`lib/${name}.ts`,'utf8');
  for(const dependency of modules)source=source.replaceAll(`"./${dependency}"`,`"./${dependency}.mjs"`).replaceAll(`"@/lib/${dependency}"`,`"./${dependency}.mjs"`);
  source=source.replaceAll('"@supabase/supabase-js"',JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href));
  fs.writeFileSync(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 }
 Object.assign(process.env,{AVVI_SESSION_SECRET:'isolated-own-account-session-secret-2026',NEXT_PUBLIC_SUPABASE_URL:'',AVVI_LOCAL_ACCOUNTS_DIRECTORY:path.join(dir,'private')});delete process.env.VERCEL;
 const load=name=>import(pathToFileURL(path.join(dir,name+'.mjs')));
 const accounts=await load('accountsServer'),auth=await load('accessServer'),access=await load('access'),route=await load('accountsRoute'),passwordRoute=await load('passwordRoute');
 const user=await accounts.saveAccount({name:'Ana QA',login:'ana-qa',password:'original-password-2026',role:'standard',tabs:['Contas',...access.professionalAccessTabs],professionalAccess:{professionalIds:['ana']}});
 const other=await accounts.saveAccount({name:'Outra conta',login:'other-qa',password:'other-private-password-2026',role:'standard',tabs:['Agenda']});
 const request=(user,payload,origin='https://test.local',url='/api/accounts')=>new Request('https://test.local'+url,{method:payload?'POST':'GET',headers:{...(user?{cookie:auth.accessCookie+'='+auth.signAccess(user)}:{}),origin,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
 const change=(user,patch={},origin='https://test.local')=>passwordRoute.POST(request(user,{currentPassword:'original-password-2026',newPassword:'changed-password-2026',confirmPassword:'changed-password-2026',...patch},origin,'/api/accounts/password'));
 assert.equal(access.canAccessTab(user,'Contas'),true);assert.equal(access.canAccessTab('standard','Contas'),false);
 assert.equal((await route.GET(request(null))).status,401);assert.equal((await route.GET(request(other))).status,403);
 let response=await route.GET(request(user,undefined,'https://test.local','/api/accounts?id='+other.id));assert.equal(response.status,200);const summary=await response.json();assert.deepEqual(summary,{account:user});
 for(const secret of ['other-qa','other-private-password-2026','original-password-2026','password_hash','password_ciphertext','salt','editable','accounts'])assert.equal(JSON.stringify(summary).includes(secret),false);
 assert.equal((await route.POST(request(user,{...user,role:'admin',password:'unauthorized-password-2026'}))).status,403);
 for(const patch of [{id:other.id},{login:other.login},{tabs:['Metas']},{role:'admin'}])assert.equal((await change(user,patch)).status,400);
 assert.equal((await change(user,{},'https://evil.local')).status,403);assert.equal((await change(null)).status,401);assert.equal((await change(other)).status,403);
 assert.equal((await change(user,{currentPassword:'wrong'})).status,401);assert.equal((await change(user,{newPassword:'short',confirmPassword:'short'})).status,400);assert.equal((await change(user,{confirmPassword:'different'})).status,400);
 const before=structuredClone(await accounts.findAccount(user.id));response=await change(user);assert.equal(response.status,200);const changed=(await response.json()).user;assert.equal(changed.revision,user.revision+1);assert.deepEqual(changed.tabs,user.tabs);assert.deepEqual(changed.professionalReport,user.professionalReport);assert.equal(changed.role,'standard');
 assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);assert.match(response.headers.get('set-cookie'),/Secure/);
 assert.equal(await auth.resolveAccess(request(user)),null);assert.equal((await auth.resolveAccess(new Request('https://test.local',{headers:{cookie:response.headers.get('set-cookie').split(';')[0]}}))).revision,changed.revision);
 assert.equal(await auth.authenticateUser(user.login,'original-password-2026'),null);assert.equal((await auth.authenticateUser(user.login,'changed-password-2026')).id,user.id);assert.equal((await auth.authenticateUser(other.login,'other-private-password-2026')).id,other.id);
 const after=await accounts.findAccount(user.id);for(const field of Object.keys(before).filter(key=>!['salt','password_hash','password_ciphertext','version'].includes(key)))assert.deepEqual(after[field],before[field],field);
 assert.equal(JSON.stringify(after).includes('changed-password-2026'),false);assert.equal((await accounts.listAccounts()).accounts.find(item=>item.id===user.id).password,'changed-password-2026');
 assert.equal((await change({login:'admin',role:'admin'})).status,403);
 const builtin=await accounts.saveAccount({id:'builtin-standard',revision:0,name:'Avvi',login:'avviclinica',password:'',role:'standard',tabs:['Contas']});
 response=await change(builtin,{currentPassword:'avviclinica2026'});assert.equal(response.status,200);assert.equal(await auth.authenticateUser('avviclinica','avviclinica2026'),null);assert.ok(await auth.authenticateUser('avviclinica','changed-password-2026'));
 const rateUser=await accounts.saveAccount({name:'Rate QA',login:'rate-qa',password:'original-password-2026',role:'standard',tabs:['Contas']});for(let i=0;i<10;i++)assert.equal((await change(rateUser,{currentPassword:'wrong'})).status,401);assert.equal((await change(rateUser)).status,429);
 // Exercise the real SDK and optimistic version comparison against a fake cloud.
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://qa.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_qa';const cloudRows=new Map();let rejectWrite=false,failWrite=false;
 globalThis.fetch=async(raw,init={})=>{const url=new URL(raw);assert.equal(url.pathname,'/rest/v1/avvi_user_accounts');const method=init.method??'GET';if(method==='GET')return Response.json([...cloudRows.values()]);if(failWrite)return Response.json({message:'PRIVATE-ERROR'},{status:400});const row=JSON.parse(init.body);if(method==='PATCH'){assert.equal(url.searchParams.get('id'),'eq.'+row.id);assert.equal(url.searchParams.get('version'),'eq.'+cloudRows.get(row.id).version);if(rejectWrite)return Response.json([]);}cloudRows.set(row.id,structuredClone(row));return Response.json([{id:row.id}]);};
 const cloudUser=await accounts.saveAccount({name:'Cloud QA',login:'cloud-qa',password:'original-password-2026',role:'standard',tabs:['Contas',...access.professionalAccessTabs],professionalAccess:{professionalIds:['ana']}});
 cloudRows.get(cloudUser.id).professional_registration={professionalIds:['ana']};const cloudBefore=structuredClone(cloudRows.get(cloudUser.id));
 rejectWrite=true;assert.equal((await change(cloudUser)).status,409);assert.deepEqual(cloudRows.get(cloudUser.id),cloudBefore);rejectWrite=false;failWrite=true;response=await change(cloudUser);assert.equal(response.status,503);assert.equal(JSON.stringify(await response.json()).includes('PRIVATE'),false);assert.deepEqual(cloudRows.get(cloudUser.id),cloudBefore);failWrite=false;
 response=await change(cloudUser);assert.equal(response.status,200);const cloudChanged=(await response.json()).user;assert.equal((await auth.authenticateUser('cloud-qa','changed-password-2026')).revision,cloudChanged.revision);assert.equal(await auth.authenticateUser('cloud-qa','original-password-2026'),null);
 for(const field of ['id','login','name','role','tabs','professional_report','professional_registration'])assert.deepEqual(cloudRows.get(cloudUser.id)[field],cloudBefore[field]);
 console.log('PASS: optional Contas permission; self-only secret-free summary; no account management/ID/role/tab injection; current password/confirmation/length/origin/auth/rate limits; encrypted local and cloud password rotation preserves exact metadata, renews own cookie and revokes old sessions; builtin supported, fixed primary unchanged; stale updates and write failures preserve credentials. Isolated files and mock network.');
} finally {assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('avvi-own-account-'));fs.rmSync(dir,{recursive:true,force:true});}
