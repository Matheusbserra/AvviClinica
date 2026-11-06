import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.AVVI_TEST_URL??'http://127.0.0.1:3107',key='avvi.data.snapshot.v1';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 if(!process.env.AVVI_TEST_ADMIN_SESSION)throw Error('Use the isolated signed preview runner.');
 await page.context().addCookies([{name:'avvi_access',value:process.env.AVVI_TEST_ADMIN_SESSION,url:origin,httpOnly:true,sameSite:'Strict'}]);
 await page.goto(origin);await page.getByRole('status',{name:'Status do salvamento'}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(key=>{
  const snapshot=JSON.parse(localStorage.getItem(key)),d=snapshot.data,date=new Date().toLocaleDateString('sv-SE');
  for(const entity of Object.keys(d))d[entity]=[];
  d.professionals=[{id:'pro',name:'Profissional QA',active:true,showInAgenda:true,closedShifts:[]}];
  d.patients=['four','single','evaluation','grouped'].map(id=>({id,name:'Paciente QA '+id,notes:''}));
  const names=['Avaliação HOF','Preenchimento de mandíbula','Preenchimento de queixo','Preenchimento malar','Preenchimento de olheiras'];
  d.services=names.map((name,i)=>({id:'s'+i,name,price:100,priceType:'fixed',durationMinutes:60,active:true}));
  const visit=(id,patientId,start,end,services)=>({id,patientId,professionalId:'pro',startsAt:date+'T'+start+':00',endsAt:date+'T'+end+':00',status:'Finalizado',eventType:'Novo Agendamento',notes:'',services:services.map(i=>({id:id+'-'+i,serviceId:'s'+i,name:names[i],price:100,priceType:'fixed',durationMinutes:30}))});
  const four=visit('four','four','08:00','09:00',[0]);four.accountClosed=true;four.closedAccount={id:'closed',appointmentId:'four',patientId:'four',professionalId:'pro',date,procedureLines:[1,2,3,4].map(i=>({id:'l'+i,serviceId:'s'+i,quantity:1,servicePrice:100,productCost:0})),products:[],payments:[{method:'Pix',amount:400}]};
  d.appointments=[four,visit('single','single','09:00','10:00',[1]),visit('evaluation','evaluation','10:00','11:00',[0]),visit('group-a','grouped','12:00','12:30',[1,2]),visit('group-b','grouped','12:30','13:00',[3,4])];
  localStorage.setItem(key,JSON.stringify(snapshot));
 },key);
 await page.reload();await navigationButton(page,'Agenda').click();
 const card=id=>page.getByTestId('appointment-'+id),label=id=>card(id).getByTestId('appointment-service');
 await card('four').waitFor();
 const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).data.appointments,key);
 const verify=async()=>{
  assert.equal(await label('four').innerText(),'Preenchimento de mandíbula + III');
  assert.equal(await label('single').innerText(),'Preenchimento de mandíbula');
  assert.equal(await label('evaluation').innerText(),'Avaliação HOF');
  assert.equal(await label('group-a').innerText(),'Preenchimento de mandíbula + III','Adjacent records count all distinct treatments in the unified card');
  assert.equal(await card('group-b').count(),0);
 };
 await verify();
 await card('four').hover();const hover=page.getByTestId('patient-hover-summary');await hover.waitFor();
 for(const name of ['Preenchimento de mandíbula','Preenchimento de queixo','Preenchimento malar','Preenchimento de olheiras'])assert.ok((await hover.innerText()).includes(name),'The full treatment list remains available on hover');
 await card('four').click();const menu=page.getByTestId('menu-appointment-service');await menu.waitFor();assert.ok((await menu.innerText()).includes('Preenchimento de olheiras'),'Opening the card still shows every treatment');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Ativar modo escuro',exact:true}).click();await verify();
 await page.reload();await navigationButton(page,'Agenda').click();await verify();
 assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).data.appointments,key),before,'Summarizing labels must never change appointments, service lists or accounts');
 assert.deepEqual(errors,[]);
 console.log('PASS: four treatments display first + III, single/evaluation unchanged, grouped adjacent records summarized, full hover/menu details retained, dark mode/reload and stored bookings preserved. Isolated fixtures only.');
}finally{await browser.close();}
