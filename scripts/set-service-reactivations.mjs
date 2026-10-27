import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv, isDeepStrictEqual } from 'node:util';
import { createHmac } from 'node:crypto';
import ts from 'typescript';

const source=ts.transpileModule(fs.readFileSync(new URL('../lib/postProcedure.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {standardServiceReactivations,validPostProcedurePlan}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const same=isDeepStrictEqual;
const ordered=rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));

// Run once on explicit request. Does not touch appointments, patients or contact history.
export async function setServiceReactivations({read,write,backup,apply=false}) {
  const original=ordered(await read());
  if(original.length>5000||original.some(row=>typeof row.id!=='string'||!row.id)||new Set(original.map(row=>row.id)).size!==original.length)throw Error('Catálogo inválido; nenhuma alteração enviada.');
  const next=original.map(standardServiceReactivations);
  if(next.some(row=>!validPostProcedurePlan(row.postProcedure)))throw Error('Há configuração de pós-procedimento inválida; nenhuma alteração enviada.');
  const changes=next.filter((row,index)=>!same(row,original[index]));
  const summary={services:original.length,changes:changes.length,reactivationDays:[180,365],applied:false};
  if(!apply||!changes.length)return summary;
  await backup(original);
  if(!same(original,ordered(await read())))throw Error('O catálogo mudou durante a preparação; execute novamente. Nenhuma alteração enviada.');
  await write(changes.map(data=>({entity:'services',record_id:data.id,data})));
  const actual=ordered(await read());
  if(!same(actual,next))throw Error('A confirmação do catálogo divergiu. Consulte o backup antes de repetir.');
  return {...summary,applied:true};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const config=parseEnv(fs.readFileSync('.env.production.local','utf8')),secret=config.AVVI_SESSION_SECRET;
    if(!secret)throw Error('Sessão administrativa indisponível.');
    const origin='https://avvi-clinica.vercel.app',value=Buffer.from(JSON.stringify({login:'admin',role:'admin',expires:Date.now()+300000})).toString('base64url'),cookie='avvi_access='+value+'.'+createHmac('sha256',secret).update(value).digest('base64url');
    const call=async(method,body)=>{const response=await fetch(origin+'/api/access/data'+(method==='GET'?'?entity=services':''),{method,headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Acesso ao catálogo retornou HTTP '+response.status);return response.json();};
    const result=await setServiceReactivations({apply:process.argv.includes('--apply'),read:async()=>{const data=await call('GET');if(!Array.isArray(data.records))throw Error('Resposta de catálogo inválida.');return data.records;},write:async upserts=>{await call('POST',{upserts,removed:[]});},backup:async records=>{fs.mkdirSync('.avvi-local/backups',{recursive:true});fs.writeFileSync('.avvi-local/backups/service-reactivations-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',JSON.stringify({at:new Date().toISOString(),records}),{flag:'wx'});}});
    console.log(JSON.stringify(result));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
