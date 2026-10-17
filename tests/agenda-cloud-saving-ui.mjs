// Isolated Next server + real data gateway/Supabase SDK; no production credentials or records.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {scryptSync} from 'node:crypto';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
if(!process.env.AVVI_TEST_ADMIN_PASSWORD)throw new Error('Configure AVVI_TEST_ADMIN_PASSWORD.');
const origin='http://localhost:3119',cloud='http://127.0.0.1:3997',records=new Map(),writes=[];
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const password='isolated-operator-password',salt='isolated-operator-salt';
const operator={id:'agenda-operator',login:'agenda-operator',name:'Operadora QA',role:'standard',tabs:['Agenda'],salt,password_hash:scryptSync(password,salt,64).toString('hex'),password_ciphertext:null,version:1};
function put(entity,data){records.set(entity+':'+(data.id??data.month),{entity,record_id:data.id??data.month,data:structuredClone(data),updated_at:new Date().toISOString()});}
for(const id of ['ana','bia','third','fourth'])put('professionals',{id,name:'Profissional '+id,commissionPercent:70,active:true,showInAgenda:true,closedShifts:[]});
put('patients',{id:'patient',name:'Paciente QA',phone:'',email:'qa@example.test',notes:'',futureCredit:0});
put('procedures',{id:'product',name:'Produto QA',price:300,averageCost:50,active:true});
put('services',{id:'service',name:'Serviço QA',price:300,durationMinutes:60,priceType:'fixed',active:true});
put('services',{id:'evaluation',name:'Avaliação QA',price:0,durationMinutes:30,priceType:'fixed',active:true});
put('inventory',{id:'stock',procedureId:'product',quantity:10});
put('gifts',{id:'gift',name:'Brinde QA',quantity:4});
let failReads=false,failWrites=false,dropAcknowledgement=false;
const mock=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,cloud),method=req.method??'GET';let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','*');res.setHeader('Content-Type','application/json');
  if(method==='OPTIONS'){res.end();return;}
  if(url.pathname==='/rest/v1/avvi_user_accounts'){res.end(JSON.stringify([operator]));return;}
  if(url.pathname!=='/rest/v1/avvi_records'){res.end('{}');return;}
  if(method==='GET'&&failReads||method!=='GET'&&failWrites){res.statusCode=503;res.end(JSON.stringify({code:'QA503',message:'Isolated network failure'}));return;}
  const matches=row=>{
   for(const [field,value]of url.searchParams){
    const actual=field==='entity'?row.entity:field==='record_id'?row.record_id:field.startsWith('data->>')?row.data[field.slice(7)]:undefined;
    if(actual===undefined)continue;
    if(value.startsWith('eq.')&&String(actual)!==value.slice(3))return false;
    if(value.startsWith('in.')&&!value.slice(4,-1).split(',').map(s=>s.replaceAll('"','')).includes(String(actual)))return false;
   }return true;
  };
  if(method==='GET'){
   const result=[...records.values()].filter(matches),offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??500);
   res.end(JSON.stringify(req.headers.accept?.includes('vnd.pgrst.object')?(result[0]??null):result.slice(offset,offset+limit)));return;
  }
  if(method==='POST'){
   const rows=JSON.parse(body),batch=Array.isArray(rows)?rows:[rows];writes.push(structuredClone(batch));
   for(const row of batch)records.set(row.entity+':'+row.record_id,structuredClone(row));
   if(dropAcknowledgement){dropAcknowledgement=false;res.statusCode=503;res.end(JSON.stringify({code:'QA503',message:'Saved but acknowledgement lost'}));return;}
   res.statusCode=201;res.end('[]');return;
  }
  if(method==='DELETE'){for(const [id,row]of records)if(matches(row))records.delete(id);res.statusCode=204;res.end();return;}
  throw new Error('Unexpected mock method');
 }catch(error){res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
});
await new Promise(resolve=>mock.listen(3997,'127.0.0.1',resolve));
let logs='';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3119','--hostname','localhost'],{windowsHide:true,env:{...process.env,NODE_ENV:'development',NEXT_PUBLIC_SUPABASE_URL:cloud,NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_publishable_isolated_qa',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_isolated_qa',NEXT_PUBLIC_AVVI_PROTECTED_DATABASE:'true',AVVI_SESSION_SECRET:'isolated-agenda-saving-session-secret-2026',AVVI_LOCAL_HISTORICAL_PREVIEW:'false'},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',data=>{logs=(logs+data).slice(-8000);});server.stderr.on('data',data=>{logs=(logs+data).slice(-8000);});
let browser;
const wait=async(check,message)=>{for(let i=0;i<240;i++){if(await check())return;await new Promise(r=>setTimeout(r,250));}throw Error(message);};
try{
 await wait(async()=>{if(server.exitCode!==null)throw Error('Isolated preview exited: '+logs);try{return(await fetch(origin,{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}},'Isolated preview did not start: '+logs);
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const errors=[];
 async function session(login,secret){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
  await Promise.all([page.waitForResponse(response=>response.url()===origin+'/api/access'&&response.request().method()==='GET',{timeout:60000}),page.goto(origin)]);
  await page.getByLabel('Login',{exact:true}).fill(login);await page.getByLabel('Senha',{exact:true}).fill(secret);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  try{await navigationButton(page,'Agenda').waitFor();}catch(error){console.error('LOGIN ALERT:',await page.getByRole('alert').allTextContents());console.error(logs);throw error;}
  return {page,context,status:()=>page.getByRole('status',{name:'Status do salvamento',exact:true})};
 }
 const saved=async s=>{try{await s.status().filter({hasText:'Dados salvos na nuvem'}).waitFor({timeout:30000});}catch(error){console.error('Saving alerts:',await s.page.getByRole('alert').allTextContents());throw error;}};
 async function book(s,professional,hour,name,service='service'){
  const {page}=s,slot=page.locator(`[data-agenda-slot][data-professional-id="${professional}"][data-hour="${hour}"]`);
  await slot.getByRole('button').click();await page.getByRole('menuitem',{name:'Novo agendamento',exact:true}).click();
  const details=page.getByTestId('appointment-details-window');await details.getByLabel('Nome do paciente',{exact:true}).fill(name);
  if(service)await details.getByLabel('Serviço',{exact:true}).selectOption(service);
  await details.getByRole('button',{name:'Salvar agendamento',exact:true}).click();await details.waitFor({state:'hidden'});
 }
 const appointmentFor=name=>[...records.values()].find(row=>row.entity==='appointments'&&records.get('patients:'+row.data.patientId)?.data.name===name)?.data;
 // First connection failure, no cached copy: a restricted user's new booking must survive reconnect.
 failReads=true;const standard=await session(operator.login,password);await standard.status().filter({hasText:'pendente'}).waitFor();
 await book(standard,'ana',8,'Paciente durante primeira falha',null);
 failReads=false;await standard.page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
 await saved(standard);assert.ok(appointmentFor('Paciente durante primeira falha'),'First-connection booking reached cloud');
 assert.equal(writes.flat().some(row=>['fixed_costs','monthly_goals'].includes(row.entity)),false,'No seeded restricted data should block the booking');
 console.log('PASS: Agenda-only operator recovers a booking after initial cloud failure with no browser cache.');
 // Separate browser contexts represent two users already looking at the same agenda.
 const observer=await session('admin',process.env.AVVI_TEST_ADMIN_PASSWORD);await saved(observer);
 // Normal restricted create + patient + paid closure, failed writes/reload/retry, then cloud readback.
 await standard.page.reload();await saved(standard);
 await book(standard,'ana',10,'Paciente pago QA');await saved(standard);
 const visit=appointmentFor('Paciente pago QA');assert.ok(visit);
 await observer.page.getByTestId('appointment-'+visit.id).waitFor({timeout:20000});
 assert.equal(await observer.page.getByTestId('appointment-'+visit.id).count(),1,'One shared booking, without reloading the other user');
 const card=standard.page.getByTestId('appointment-'+visit.id);await card.click();await standard.page.getByRole('menuitem',{name:'Fechar conta',exact:true}).click();
 const checkout=standard.page.getByRole('dialog',{name:/Fechamento de conta/i});
 await checkout.getByRole('button',{name:'Produtos',exact:true}).click();await checkout.getByRole('combobox',{name:'Adicionar produto ao consumo'}).fill('Produto QA');await checkout.getByRole('option').first().click();await checkout.getByRole('button',{name:'Adicionar produto',exact:true}).click();await checkout.getByLabel('Receber por Pix',{exact:true}).check();
 failWrites=true;await checkout.getByRole('button',{name:'Fechar Conta',exact:true}).click();await checkout.waitFor({state:'hidden'});await standard.status().filter({hasText:'pendente'}).waitFor();
 assert.equal(records.get('appointments:'+visit.id).data.accountClosed,undefined);
 await standard.page.reload();await standard.status().filter({hasText:'pendente'}).waitFor();failWrites=false;
 await standard.page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await saved(standard);
 const closed=records.get('appointments:'+visit.id).data;assert.equal(closed.accountClosed,true);assert.equal(closed.closedAccount.payments[0].amount,300);assert.equal(records.get('inventory:stock').data.quantity,9);
 await observer.page.getByTestId('appointment-'+visit.id).filter({hasText:'Finalizado'}).waitFor({timeout:20000});
 assert.ok(records.has('financial_entries:'+closed.closedAccount.generatedEntryId));assert.ok(records.has('revenues:receita-entry-'+closed.closedAccount.id));
 await standard.page.reload();await saved(standard);assert.equal(records.get('inventory:stock').data.quantity,9);
 await standard.page.getByTestId('appointment-'+visit.id).click();await standard.page.getByRole('menuitem',{name:'Ver fechamento',exact:true}).click();await standard.page.getByTestId('closed-account-received').filter({hasText:'300,00'}).waitFor();await standard.page.getByRole('button',{name:'Fechar detalhes do fechamento',exact:true}).click();
 assert.equal((await standard.context.request.post(origin+'/api/access/data',{data:{upserts:[{entity:'revenues',record_id:'forged',data:{id:'forged',total:999}}]}})).status(),403);
 console.log('PASS: Agenda-only standard creates patient/booking, closes paid account with automatic stock/ledger/revenue, keeps failed closure across reload and retries without duplicate stock use; unrelated finance writes stay denied.');
 // A standard operator can edit a saved closure, split payment, store excess credit,
 // consume a gift and generate a card fee without broad access to financial tabs.
 await standard.page.getByTestId('appointment-'+visit.id).click();await standard.page.getByRole('menuitem',{name:'Ver fechamento',exact:true}).click();
 await standard.page.getByRole('dialog').getByRole('button',{name:'Estorno',exact:true}).click();await checkout.waitFor();
 await checkout.getByRole('button',{name:'Brindes',exact:true}).click();await checkout.getByLabel('Adicionar brinde ao fechamento',{exact:true}).selectOption('gift');await checkout.getByRole('button',{name:'Adicionar brinde',exact:true}).click();
 await checkout.getByLabel('Valor pago por Pix',{exact:true}).fill('200');await checkout.getByLabel('Receber por Visa',{exact:true}).check();await checkout.getByLabel('Valor pago por Visa',{exact:true}).fill('150');
 await checkout.getByText('Guardar valor pago a mais como crédito',{exact:true}).click();await checkout.getByRole('button',{name:'Fechar Conta',exact:true}).click();await checkout.waitFor({state:'hidden'});await saved(standard);
 const edited=records.get('appointments:'+visit.id).data;assert.equal(edited.closedAccount.id,closed.closedAccount.id);assert.equal(edited.closedAccount.creditAdded,50);assert.equal(records.get('patients:'+edited.patientId).data.futureCredit,50);assert.equal(records.get('inventory:stock').data.quantity,9);assert.equal(records.get('gifts:gift').data.quantity,3);assert.ok(records.get('fixed_costs:taxa-maquininha-'+edited.closedAccount.id).data.value>0);
 await standard.page.reload();await saved(standard);await standard.page.getByTestId('appointment-'+visit.id).click();await standard.page.getByRole('menuitem',{name:'Ver fechamento',exact:true}).click();await standard.page.getByRole('dialog').getByRole('button',{name:'Excluir fechamento',exact:true}).click();await saved(standard);
 assert.equal(records.get('appointments:'+visit.id).data.accountClosed,false);assert.equal(records.get('inventory:stock').data.quantity,10);assert.equal(records.get('gifts:gift').data.quantity,4);assert.equal(records.get('patients:'+edited.patientId).data.futureCredit,0);
 await observer.page.getByTestId('appointment-'+visit.id).filter({hasText:'Agendado'}).waitFor({timeout:20000});
 for(const [entity,id]of [['revenues','receita-entry-'],['fixed_costs','taxa-maquininha-'],['financial_entries','procedure-account-']])assert.equal(records.has(entity+':'+id+edited.closedAccount.id),false);
 console.log('PASS: standard edits saved closure, saves split Pix/card payment, card fee, gift and future credit; reversal restores stock/gift/credit and removes linked financial records.');
 // Editing the booking must preserve saved invoice metadata/attachments.
 const invoice={issued:true,visibility:'visible',filename:'nota-qa.pdf',pdfPath:'abcdef/12345678-1234-1234-1234-123456789abc.pdf'};
 put('appointments',{...records.get('appointments:'+visit.id).data,invoice});await standard.page.reload();await saved(standard);
 await standard.page.getByTestId('appointment-'+visit.id).click();await standard.page.getByRole('menuitem',{name:'Ver agendamento',exact:true}).click();
 const editDetails=standard.page.getByTestId('appointment-details-window');await editDetails.getByLabel('Observações',{exact:true}).fill('Observação editada QA');await editDetails.getByRole('button',{name:'Salvar agendamento',exact:true}).click();await editDetails.waitFor({state:'hidden'});await saved(standard);
 assert.deepEqual(records.get('appointments:'+visit.id).data.invoice,invoice);assert.equal(records.get('appointments:'+visit.id).data.notes,'Observação editada QA');
 // Different professionals share a time; capacity is checked in browser and API for either role.
 const admin=await session('admin',process.env.AVVI_TEST_ADMIN_PASSWORD);await saved(admin);
 for(const pro of ['ana','bia','third']){await book(admin,pro,14,'Paciente paralelo '+pro);await saved(admin);}
 const sharedVisit=appointmentFor('Paciente paralelo bia');
 await standard.page.getByTestId('appointment-'+sharedVisit.id).waitFor({timeout:20000});
 // Creating another booking in the old browser must retain the other user's rows.
 await book(standard,'fourth',18,'Paciente compartilhado padrão');await saved(standard);
 const standardVisit=appointmentFor('Paciente compartilhado padrão');
 await admin.page.getByTestId('appointment-'+standardVisit.id).waitFor({timeout:20000});
 assert.ok(records.has('appointments:'+sharedVisit.id));
 assert.ok(records.has('appointments:'+standardVisit.id));
 console.log('PASS: two open users share new bookings and closures/reversals in both directions without reload; later saves preserve the other user’s bookings.');
 await admin.page.reload();await saved(admin);
 const fourthSlot=admin.page.locator('[data-agenda-slot][data-professional-id="fourth"][data-hour="14"]');await fourthSlot.getByRole('button').click();await admin.page.getByRole('menuitem',{name:'Novo agendamento',exact:true}).click();
 const details=admin.page.getByTestId('appointment-details-window');await details.getByLabel('Nome do paciente',{exact:true}).fill('Paciente excedente');await details.getByLabel('Serviço',{exact:true}).selectOption('service');await details.getByRole('button',{name:'Salvar agendamento',exact:true}).click();await details.getByRole('alert').filter({hasText:/3.*simult/}).waitFor();assert.equal(appointmentFor('Paciente excedente'),undefined);await details.getByRole('button',{name:'Fechar',exact:true}).click();
 const fourth={id:'fourth-overflow',professionalId:'fourth',patientId:'patient',startsAt:date+'T14:00:00',endsAt:date+'T15:00:00',eventType:'Novo Agendamento',status:'Agendado',notes:''};
 for(const s of [standard,admin])assert.equal((await s.context.request.post(origin+'/api/access/data',{data:{upserts:[{entity:'appointments',record_id:fourth.id,data:fourth}]}})).status(),409);
 const adminVisit=appointmentFor('Paciente paralelo ana');await admin.page.getByTestId('appointment-'+adminVisit.id).click();await admin.page.getByRole('menuitem',{name:'Fechar conta',exact:true}).click();const adminCheckout=admin.page.getByRole('dialog',{name:/Fechamento de conta/i});
 await adminCheckout.getByRole('button',{name:'Produtos',exact:true}).click();await adminCheckout.getByRole('combobox',{name:'Adicionar produto ao consumo'}).fill('Produto QA');await adminCheckout.getByRole('option').first().click();await adminCheckout.getByRole('button',{name:'Adicionar produto',exact:true}).click();await adminCheckout.getByLabel('Receber por Pix',{exact:true}).check();await adminCheckout.getByRole('button',{name:'Fechar Conta',exact:true}).click();await adminCheckout.waitFor({state:'hidden'});await saved(admin);
 assert.equal(records.get('appointments:'+adminVisit.id).data.accountClosed,true);assert.equal(records.get('inventory:stock').data.quantity,9);
 // An acknowledgement can be lost after the cloud wrote the booking: retry is idempotent.
 dropAcknowledgement=true;await book(admin,'fourth',16,'Paciente resposta perdida');await admin.status().filter({hasText:'pendente'}).waitFor();await admin.page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await saved(admin);
 assert.equal([...records.values()].filter(row=>row.entity==='patients'&&row.data.name==='Paciente resposta perdida').length,1);assert.ok(appointmentFor('Paciente resposta perdida'));
 await admin.page.reload();await saved(admin);assert.deepEqual(errors,[]);
 // A remote refresh must preserve an offline local draft and remove cloud deletions.
 failWrites=true;await book(standard,'fourth',19,'Paciente pendente compartilhado');await standard.status().filter({hasText:'pendente'}).waitFor();
 put('patients',{id:'remote-patient',name:'Paciente remoto QA',phone:'',notes:''});
 put('appointments',{id:'remote-visit',patientId:'remote-patient',professionalId:'bia',startsAt:date+'T12:00:00',endsAt:date+'T12:30:00',eventType:'Novo Agendamento',status:'Agendado',notes:''});
 await standard.page.getByTestId('appointment-remote-visit').filter({hasText:'Paciente remoto QA'}).waitFor({timeout:20000});
 await standard.page.getByText('Paciente pendente compartilhado',{exact:true}).first().waitFor();
 assert.equal(appointmentFor('Paciente pendente compartilhado'),undefined,'Pending draft was not falsely acknowledged');
 failWrites=false;await standard.page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await saved(standard);
 assert.ok(appointmentFor('Paciente pendente compartilhado'));assert.ok(records.has('appointments:remote-visit'));
 records.delete('appointments:remote-visit');
 await standard.page.getByTestId('appointment-remote-visit').waitFor({state:'hidden',timeout:20000});
 await observer.page.getByTestId('appointment-remote-visit').waitFor({state:'hidden',timeout:20000});
 await book(standard,'bia',12,'Paciente após exclusão remota');await saved(standard);
 assert.equal(records.has('appointments:remote-visit'),false,'A later save must not resurrect a remote deletion');
 console.log('PASS: remote inserts/patient names update while a local save is pending; retry retains both records; remote deletions disappear and are not resurrected.');
 console.log('PASS: administrator saving and reload, three professionals at one time, fourth rejected in browser and server for both roles, lost acknowledgement retries without duplicate patients/bookings. Isolated mock cloud only.');
}catch(error){console.error(error.message);throw error;}finally{
 mock.closeAllConnections();
 if(browser)await browser.close();
 if(process.platform==='win32')spawnSync('taskkill',['/pid',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else server.kill();
 server.kill();server.stdout.destroy();server.stderr.destroy();server.unref();
 await new Promise(resolve=>mock.close(resolve));
}
