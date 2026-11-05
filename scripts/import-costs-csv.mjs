import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv, isDeepStrictEqual} from 'node:util';
import {createHash, createHmac} from 'node:crypto';

const normalize=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const cents=value=>Math.round(Number(value)*100);
export function parseDelimited(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(char===';'||char==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(char==='\n'){rows.push(row);row=[];}}
    else cell+=char;
  }
  if(quoted)throw Error('CSV contém aspas não fechadas.');
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}
  return rows;
}
function isoDate(value,optional=false){
  if(optional&&(!value||value==='-'))return '';
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if(!match)throw Error('Data inválida no arquivo.');
  const iso=`${match[3]}-${match[2]}-${match[1]}`;
  if(new Date(iso+'T12:00:00Z').toISOString().slice(0,10)!==iso)throw Error('Data inexistente no arquivo.');
  return iso;
}
function amount(value){
  if(!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(value))throw Error('Valor monetário inválido no arquivo.');
  return cents(value.replaceAll('.','').replace(',','.'))/100;
}
export function readExpenses(bytes){
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('windows-1252').decode(bytes);}
  const table=parseDelimited(text),header=table.findIndex(row=>normalize(row[0])==='data de competencia'&&normalize(row[1])==='data de vencimento');
  if(header<0||table[header].length!==12)throw Error('Cabeçalho de despesas não encontrado.');
  return table.slice(header+1).filter(row=>row.some(value=>value.trim())).map((row,index)=>{
    if(row.length!==12)throw Error('Quantidade de colunas inválida.');
    const [competence,due,payment,category,type,description,professional,supplier,status,method,value,account]=row.map(value=>value.trim());
    if(!['Pago','Não Pago'].includes(status))throw Error('Status não reconhecido.');
    const methods={'PIX':'Pix','Cartão de Crédito':'Crédito','Cartão de Débito':'Débito','Dinheiro':'Dinheiro','Transferência':'Transferência Bancária','Depósito':'Depósito'};
    if(!methods[method])throw Error('Forma de pagamento não reconhecida.');
    return {sourceRow:header+2+index,raw:row,competence:isoDate(competence,true),dueDate:isoDate(due),paymentDate:isoDate(payment,true),category,type,description,professional,supplier,status:status==='Pago'?'Pago':'Pendente',paymentMethod:methods[method],value:amount(value),account};
  });
}
export function isClinicalPayment(row,professionals){
  if(normalize(row.type)!=='pagamento profissional')return false;
  // The owner explicitly included these support/maintenance expenses.
  if(/\b(paola|passagem|passagens|pedreiro|pedreito)\b/.test(normalize(row.description)))return false;
  const text=' '+normalize(row.description+' '+row.professional)+' ';
  return professionals.some(person=>{
    const name=normalize(person.name).replace(/^(dra|dr|doutora|doutor) /,'');
    const first=name.split(' ')[0];
    if(!first||first.length<3)return false;
    if(text.includes(' '+name+' ')||text.includes(' '+first+' '))return true;
    return first.startsWith('mika')&&/\bmika(?:elle|elly)?\b/.test(text);
  });
}
export function planCostImport({rows,professionals,existing,month,confirmedDuplicates=[]}){
  if(!/^\d{4}-\d{2}$/.test(month)||rows.some(row=>row.dueDate.slice(0,7)!==month))throw Error('Há vencimentos fora do mês solicitado.');
  const previous=new Map(existing.map(item=>[item.id,item])),seen=new Map(),consumed=new Set();
  const additions=[],excluded=[],duplicates=[];
  for(const row of rows){
    if(isClinicalPayment(row,professionals)){excluded.push(row);continue;}
    const fingerprint=createHash('sha256').update(JSON.stringify(row.raw)).digest('hex').slice(0,24),occurrence=(seen.get(fingerprint)??0)+1;seen.set(fingerprint,occurrence);
    const id=`cost-import-${month}-${fingerprint}-${occurrence}`;
    const explicit=confirmedDuplicates.find(item=>normalize(item.description)===normalize(row.description)&&item.dueDate===row.dueDate&&cents(item.value)===cents(row.value));
    if(explicit&&!previous.has(explicit.existingId))throw Error('Custo indicado como duplicado não existe mais.');
    const match=previous.get(id)??(explicit?previous.get(explicit.existingId):existing.find(item=>!consumed.has(item.id)&&item.dueDate===row.dueDate&&cents(item.value)===cents(row.value)&&normalize(item.name)===normalize(row.description||row.type)));
    if(match){consumed.add(match.id);duplicates.push({sourceRow:row.sourceRow,existingId:match.id,value:row.value,description:row.description});continue;}
    const name=row.description||row.type;
    if(!name)throw Error('Despesa sem descrição e sem tipo.');
    const notes=[`Importado das despesas do sistema anterior (${month}). Linha ${row.sourceRow}.`,row.description&&`Descrição original: ${row.description}.`,`Categoria original: ${row.category}.`,row.competence&&`Competência: ${row.competence}.`,row.paymentDate&&`Pagamento: ${row.paymentDate}.`,row.account&&`Conta financeira: ${row.account}.`].filter(Boolean).join(' ');
    additions.push({id,name,category:normalize(row.category)==='despesas fixas'?'Custos fixos':'Custos variáveis',costType:row.type,professionalName:row.professional,supplier:row.supplier,value:row.value,dueDate:row.dueDate,status:row.status,paymentMethod:row.paymentMethod,replicateMonths:0,creditInstallments:1,notes});
  }
  const sum=items=>items.reduce((total,item)=>total+cents(item.value),0)/100;
  const summary={sourceRows:rows.length,sourceTotal:sum(rows),excludedClinicalPayments:excluded.length,excludedTotal:sum(excluded),existingSkipped:duplicates.length,existingSkippedTotal:sum(duplicates),toImport:additions.length,totalToImport:sum(additions),paidTotal:sum(additions.filter(item=>item.status==='Pago')),pendingTotal:sum(additions.filter(item=>item.status==='Pendente'))};
  if(cents(summary.sourceTotal)!==cents(summary.excludedTotal)+cents(summary.existingSkippedTotal)+cents(summary.totalToImport))throw Error('A conciliação dos valores divergiu.');
  return {summary,additions,excluded,duplicates};
}

export async function applyCostImport({plan,read,write,backup}){
  const before=await read();
  if(plan.additions.some(item=>before.some(old=>old.id===item.id)))throw Error('A importação já foi iniciada; gere o plano novamente para evitar sobrescrita.');
  await backup(before);
  // No deletions or changes to existing expenses, payroll, receipts or appointments.
  if(plan.additions.length)await write(plan.additions.map(data=>({entity:'fixed_costs',record_id:data.id,data})));
  const after=await read(),byId=new Map(after.map(item=>[item.id,item]));
  for(const expected of plan.additions)if(!isDeepStrictEqual(byId.get(expected.id),expected))throw Error('Confirmação da importação divergente; consulte o relatório antes de repetir.');
  return {imported:plan.additions.length,confirmed:true};
}

export function planFutureInstallments({rows,professionals,existing,month,installments=[]}){
  const base=planCostImport({rows,professionals,existing:[],month}),additions=[],skipped=[];
  for(const instruction of installments){
    const {description,dueDate,value,totalInstallments,currentInstallment}=instruction;
    if(!Number.isInteger(totalInstallments)||!Number.isInteger(currentInstallment)||currentInstallment<1||totalInstallments<currentInstallment||totalInstallments>60)throw Error('Informe a parcela atual e o total confirmado pelo usuário.');
    const matches=base.additions.filter(item=>normalize(item.name)===normalize(description)&&item.dueDate===dueDate&&cents(item.value)===cents(value));
    if(matches.length!==1)throw Error('Parcelamento não corresponde a uma única despesa do arquivo.');
    const cost=matches[0],day=Number(dueDate.slice(8,10)),year=Number(dueDate.slice(0,4)),monthIndex=Number(dueDate.slice(5,7))-1;
    for(let number=currentInstallment+1;number<=totalInstallments;number++){
      const offset=number-currentInstallment,date=new Date(Date.UTC(year,monthIndex+offset,1)),lastDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,lastDay));
      const next={...cost,id:cost.id+'-installment-'+number,name:cost.name+` (parcela ${number}/${totalInstallments})`,dueDate:date.toISOString().slice(0,10),status:'Pendente',replicateMonths:0,creditInstallments:1,notes:`Parcela futura ${number}/${totalInstallments}. Parcela ${currentInstallment} vence em ${dueDate}. Valor individual: R$ ${cost.value.toFixed(2)}. Importado das despesas de ${month}. Descrição original: ${cost.name}.`};
      if(existing.some(item=>item.id===next.id||(item.dueDate===next.dueDate&&cents(item.value)===cents(next.value)&&normalize(item.name)===normalize(next.name))))skipped.push(next.id);else additions.push(next);
    }
  }
  if(new Set(additions.map(item=>item.id)).size!==additions.length)throw Error('Parcelamento repetido nas instruções.');
  return {additions,skipped,total:additions.reduce((sum,item)=>sum+cents(item.value),0)/100};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const flag=name=>{const index=process.argv.indexOf(name);if(index<0||!process.argv[index+1])throw Error('Informe '+name);return process.argv[index+1];};
    const input=flag('--file'),month=flag('--month'),decisionFile=flag('--decisions'),config=parseEnv(fs.readFileSync('.env.production.local','utf8')),secret=config.AVVI_SESSION_SECRET;
    if(!secret)throw Error('Sessão administrativa indisponível.');
    const origin='https://avvi-clinica.vercel.app',value=Buffer.from(JSON.stringify({login:'admin',role:'admin',expires:Date.now()+300000})).toString('base64url'),cookie='avvi_access='+value+'.'+createHmac('sha256',secret).update(value).digest('base64url');
    const call=async(entity,body)=>{const response=await fetch(origin+'/api/access/data'+(body?'':'?entity='+entity),{method:body?'POST':'GET',headers:{cookie,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Acesso aos custos retornou HTTP '+response.status);const result=await response.json();if(!body&&!Array.isArray(result.records))throw Error('Resposta inválida.');return body?result:result.records;};
    const professionals=await call('professionals'),existing=await call('fixed_costs'),rows=readExpenses(fs.readFileSync(input)),confirmedDuplicates=JSON.parse(fs.readFileSync(decisionFile,'utf8'));
    const futureIndex=process.argv.indexOf('--installments'),installments=futureIndex<0?[]:JSON.parse(fs.readFileSync(flag('--installments'),'utf8'));
    const october=planCostImport({rows,professionals,existing,month,confirmedDuplicates}),future=planFutureInstallments({rows,professionals,existing,month,installments}),plan={...october,additions:[...october.additions,...future.additions]},stamp=new Date().toISOString().replace(/[:.]/g,'-');
    fs.mkdirSync('.avvi-local/backups',{recursive:true});
    const report=`.avvi-local/backups/cost-import-${stamp}.json`;
    fs.writeFileSync(report,JSON.stringify({at:new Date().toISOString(),source:path.basename(input),...plan,future},null,2),{flag:'wx'});
    let applied=false;
    if(process.argv.includes('--apply')){
      // Recheck the full plan immediately before writing; use current database values.
      const current=await call('fixed_costs'),latestOctober=planCostImport({rows,professionals,existing:current,month,confirmedDuplicates}),latestFuture=planFutureInstallments({rows,professionals,existing:current,month,installments}),refreshed={...latestOctober,additions:[...latestOctober.additions,...latestFuture.additions]};
      if(!isDeepStrictEqual(refreshed.additions,plan.additions)||!isDeepStrictEqual(refreshed.duplicates,plan.duplicates))throw Error('Os custos mudaram durante a preparação; nenhuma alteração enviada.');
      await applyCostImport({plan,read:()=>call('fixed_costs'),write:upserts=>call('fixed_costs',{upserts,removed:[]}),backup:records=>fs.writeFileSync(`.avvi-local/backups/costs-before-import-${stamp}.json`,JSON.stringify({at:new Date().toISOString(),records}),{flag:'wx'})});
      applied=true;
    }
    console.log(JSON.stringify({...plan.summary,futureInstallments:future.additions.length,futureInstallmentsTotal:future.total,totalRecords:plan.additions.length,totalAllMonths:(cents(plan.summary.totalToImport)+cents(future.total))/100,applied,report}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
