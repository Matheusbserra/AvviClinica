import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
delete process.env.NEXT_PUBLIC_AVVI_FOLLOW_UP_ENABLED;
const uri=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const accessUri=uri(fs.readFileSync('lib/access.ts','utf8'));
const access=await import(accessUri);
assert.equal(access.followUpEnabled,false);
for(const user of ['admin','standard',{login:'qa',role:'standard',tabs:['Follow Up']},{login:'reviewer',role:'standard',tabs:['Follow Up',access.metaReviewPermission]}]){
 assert.equal(access.canAccessTab(user,'Follow Up'),false);
 for(const entity of ['followup_rules','followup_contacts','followup_logs']){
  assert.equal(access.canReadEntity(user,entity),false);
  assert.equal(access.canWriteEntity(user,entity),false);
 }
}
assert.equal(access.canAccessTab('admin','Agenda'),true);
assert.equal(access.canAccessTab('admin','Pós-procedimento'),true);
assert.equal(access.canReadEntity({login:'post',role:'standard',tabs:['Pós-procedimento']},'post_procedure_contacts'),true);
const require=createRequire(import.meta.url);
const source=fs.readFileSync('proxy.ts','utf8').replace('"./lib/access"',JSON.stringify(accessUri)).replace('"next/server"',JSON.stringify(pathToFileURL(require.resolve('next/server')).href));
const {proxy}=await import(uri(source));
globalThis.fetch=()=>{throw Error('Disabled routes must never consult Supabase or any external service');};
for(const route of ['/api/follow-up','/api/follow-up/status','/api/follow-up/leads','/api/follow-up/messages','/api/follow-up/process','/api/follow-up/webhook','/api/follow-up/publish','/api/follow-up/lab','/api/follow-up/lab/webhook','/meta-review','/meta-review/anything']){
 const response=proxy({nextUrl:new URL('https://isolated.test'+route)});
 assert.equal(response.status,503,route);
 assert.equal((await response.json()).disabled,true);
 assert.equal(response.headers.get('cache-control'),'no-store');
}
for(const route of ['/','/api/access/data','/api/strategies/progress'])assert.equal(proxy({nextUrl:new URL('https://isolated.test'+route)}).headers.get('x-middleware-next'),'1');
console.log('PASS: Follow Up hidden for administrators, standard and review accounts; snapshot reads/writes and all API/review routes disabled before database work. Agenda and Pós-procedimento remain available.');
