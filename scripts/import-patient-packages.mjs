import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv,isDeepStrictEqual} from 'node:util';
import {createHash,createHmac} from 'node:crypto';
import ts from 'typescript';
import {parseDelimited} from './import-costs-csv.mjs';
const source=ts.transpileModule(fs.readFileSync(new URL('../lib/packageSessions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {validImportedPatientPackages,patientPackageBalances}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const phone=value=>{const n=String(value??'').replace(/\D/g,'');return n.length>11&&n.startsWith('55')?n.slice(2):n;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);
const date=value=>{const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);if(!match)throw Error('Data inválida no arquivo de pacotes.');const iso=`${match[3]}-${match[2]}-${match[1]}`;if(new Date(iso+'T12:00:00Z').toISOString().slice(0,10)!==iso)throw Error('Data inexistente.');return iso;};
export function readPatientPackages(bytes){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
 const table=parseDelimited(text),header=table.findIndex(row=>normalize(row[0])==='data venda'&&normalize(row[1])==='pacote');
 if(header<0)throw Error('Cabeçalho de pacotes não encontrado.');
 return table.slice(header+1).filter(row=>row.some(value=>value.trim())).map(row=>{
  if(row.length!==11)throw Error('Colunas de pacotes inválidas.');
  const [sold,name,patientName,email,telephone,expiry,remaining,,price,,professionalName]=row.map(value=>value.trim());
  if(!name||!patientName||!/^\d+$/.test(remaining)||!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(price))throw Error('Dados de pacote incompletos.');
  const pack={id:'imported-package-'+hash([sold,name,normalize(patientName),phone(telephone)]),name,purchasedOn:date(sold),expiresOn:date(expiry),remainingSessions:Number(remaining),saleValue:Number(price.replaceAll('.','').replace(',','.')),professionalName,source:'legacy-csv'};
  if(!validImportedPatientPackages([pack]))throw Error('Pacote inválido no arquivo.');
  return {patientName,email,phone:telephone,pack};
 });
}
export function planPatientPackages({rows,patients,appointments=[]}){
 const current=structuredClone(patients),updated=new Map(),skipped=[];let newPatients=0,imported=0;
 for(const row of rows){
  const byName=current.filter(item=>normalize(item.name)===normalize(row.patientName));
  const byPhone=phone(row.phone)?current.filter(item=>phone(item.phone)===phone(row.phone)):[];
  let match=byName.length===1?byName[0]:byName.filter(item=>byPhone.includes(item)).length===1?byName.find(item=>byPhone.includes(item)):undefined;
  if(!match&&(byName.length||byPhone.length))throw Error('Paciente ambíguo; confira o vínculo antes de importar.');
  if(match&&byPhone.length&&!byPhone.some(item=>item.id===match.id))throw Error('Nome e telefone apontam para pacientes diferentes.');
  if(!match){match={id:'patient-import-'+hash([normalize(row.patientName),phone(row.phone)]),name:row.patientName,phone:row.phone,email:row.email,cpf:'',birthDate:'',notes:''};current.push(match);newPatients++;}
  const existing=(match.importedPackages??[]).find(item=>item.id===row.pack.id);
  if(existing){if(!isDeepStrictEqual(existing,row.pack))throw Error('Pacote já importado com dados diferentes.');skipped.push(row.pack.id);continue;}
  const native=patientPackageBalances(appointments,match.id).filter(item=>normalize(item.packageName)===normalize(row.pack.name)&&item.purchasedOn===row.pack.purchasedOn);
  if(native.length){if(native.length===1&&native[0].remaining===row.pack.remainingSessions) {skipped.push(row.pack.id);continue;}throw Error('Há uma venda semelhante no sistema. Confira o saldo antes de importar.');}
  match.importedPackages=[...(match.importedPackages??[]),row.pack];
  if(!validImportedPatientPackages(match.importedPackages))throw Error('Pacotes repetidos ou inválidos.');
  updated.set(match.id,match);imported++;
 }
 return {updates:[...updated.values()],skipped,summary:{sourcePackages:rows.length,sourcePatients:new Set(rows.map(row=>normalize(row.patientName))).size,remainingSessions:rows.reduce((sum,row)=>sum+row.pack.remainingSessions,0),packagesToImport:imported,patientsToUpdate:updated.size,newPatients,alreadyPresent:skipped.length}};
}
export async function applyPatientPackages({plan,read,write,backup}){
 const before=await read();await backup(before);
  const known=new Set(before.map(item=>item.id));
  if(plan.updates.length)await write(plan.updates.map(data=>({entity:'patients',record_id:data.id,data:known.has(data.id)?{id:data.id,importedPackages:data.importedPackages}:data})));
 const after=new Map((await read()).map(item=>[item.id,item]));
  for(const expected of plan.updates)if(!after.has(expected.id)||!isDeepStrictEqual(after.get(expected.id).importedPackages,expected.importedPackages)||!known.has(expected.id)&&!isDeepStrictEqual(after.get(expected.id),expected))throw Error('A confirmação dos cadastros divergiu. Confira o backup antes de repetir.');
 return {confirmed:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  const file=process.argv[process.argv.indexOf('--file')+1];if(!file||!process.argv.includes('--file'))throw Error('Informe --file.');
  const {AVVI_SESSION_SECRET:secret}=parseEnv(fs.readFileSync('.env.production.local','utf8'));if(!secret)throw Error('Sessão administrativa indisponível.');
  const origin='https://avvi-clinica.vercel.app',payload=Buffer.from(JSON.stringify({login:'admin',role:'admin',expires:Date.now()+300000})).toString('base64url'),cookie='avvi_access='+payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
  const call=async(entity,body)=>{const response=await fetch(origin+'/api/access/data'+(body?'':'?entity='+entity),{method:body?'POST':'GET',headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Acesso aos cadastros retornou HTTP '+response.status);const result=await response.json();if(!body&&!Array.isArray(result.records))throw Error('Resposta inválida.');return body?result:result.records;};
  const rows=readPatientPackages(fs.readFileSync(file)),patients=await call('patients'),appointments=await call('appointments'),plan=planPatientPackages({rows,patients,appointments});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');fs.mkdirSync('.avvi-local/backups',{recursive:true});
  fs.writeFileSync(`.avvi-local/backups/patient-packages-plan-${stamp}.json`,JSON.stringify({at:new Date().toISOString(),source:path.basename(file),...plan},null,2),{flag:'wx'});
  let applied=false;
  if(process.argv.includes('--apply')){
   const latest=await call('patients'),refreshed=planPatientPackages({rows,patients:latest,appointments});
   if(!isDeepStrictEqual(plan.updates,refreshed.updates))throw Error('Os cadastros mudaram durante a preparação. Execute novamente.');
   await applyPatientPackages({plan,read:()=>call('patients'),write:upserts=>call('patients',{upserts,removed:[]}),backup:records=>fs.writeFileSync(`.avvi-local/backups/patients-before-packages-${stamp}.json`,JSON.stringify({at:new Date().toISOString(),records}),{flag:'wx'})});applied=true;
  }
  console.log(JSON.stringify({...plan.summary,applied}));
 }catch(error){console.error(error.message);process.exitCode=1;}
}
