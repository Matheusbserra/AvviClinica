import {selectSearchOption} from './search-select-helper.mjs';
import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
if(!process.env.AVVI_TEST_ADMIN_PASSWORD)throw Error('Configure AVVI_TEST_ADMIN_PASSWORD.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],key='avvi.data.snapshot.v1';
page.on('pageerror',error=>errors.push(error.message));
const tab=name=>navigationButton(page,name),details=page.getByTestId('appointment-details-window');
async function selectDate(date){
 const label='Selecionar dia '+date.split('-').reverse().join('/');
 for(let i=0;!await page.getByRole('button',{name:label,exact:true}).count();i++){
  assert.ok(i<36,'Historical month is reachable');await page.getByRole('button',{name:'Mês anterior',exact:true}).click();
 }
 await page.getByRole('button',{name:label,exact:true}).click();
}
async function book(hour,name){
 await page.locator(`[data-agenda-slot][data-professional-id="a"][data-hour="${hour}"]`).getByRole('button').click();
 await page.getByRole('menuitem',{name:'Novo agendamento',exact:true}).click();
 await details.waitFor({timeout:3000});
 assert.equal(await details.getByLabel('Data',{exact:true}).inputValue(),'2025-10-10');
 await details.getByLabel('Nome do paciente',{exact:true}).fill(name);
 await selectSearchOption(details,'Serviço','Serviço QA');
 await details.getByRole('button',{name:'Salvar agendamento',exact:true}).click();
 await details.waitFor({state:'hidden'});
 await page.getByText(name,{exact:true}).first().waitFor();
}
try{
 await page.goto(process.env.AVVI_TEST_URL??'http://127.0.0.1:3107');
 await page.getByLabel('Login',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill(process.env.AVVI_TEST_ADMIN_PASSWORD);
 await tab('Entrar').click();await page.getByRole('status',{name:'Status do salvamento',exact:true}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(key=>{
  const snapshot=JSON.parse(localStorage.getItem(key)),d=snapshot.data;
  for(const entity of Object.keys(d))d[entity]=[];
  d.professionals=[{id:'a',name:'Profissional QA',active:true,showInAgenda:true,commissionPercent:70,closedShifts:[]}];
  d.services=[{id:'service',name:'Serviço QA',price:100,priceType:'fixed',durationMinutes:30,active:true}];
  d.patients=[{id:'cancelled-patient',name:'Paciente cancelada QA',phone:'',notes:''}];
  d.appointments=[{id:'cancelled',patientId:'cancelled-patient',professionalId:'a',startsAt:'2025-10-10T09:00:00',endsAt:'2025-10-10T10:00:00',eventType:'Novo Agendamento',status:'Cancelado',notes:'Histórico preservado'}];
  localStorage.setItem(key,JSON.stringify(snapshot));
 },key);
 await page.reload();await tab('Agenda').click();await selectDate('2025-10-10');
 assert.equal(await page.getByTestId('appointment-cancelled').count(),0);
 // The invisible cancelled visit used to silently swallow Novo agendamento.
 await book(9,'Paciente histórica administrador');
 await book(8,'Paciente em horário passado livre');
 await page.reload();await tab('Agenda').click();await selectDate('2025-10-10');
 for(const name of ['Paciente histórica administrador','Paciente em horário passado livre'])await page.getByText(name,{exact:true}).first().waitFor();
 await page.getByRole('button',{name:'Mostrar agendamentos cancelados',exact:true}).click();
 await page.getByTestId('appointment-cancelled').waitFor();
 await page.getByRole('button',{name:'Mostrar agendamentos cancelados',exact:true}).click();
 const user={id:'past-booking-qa',login:'past-booking-qa',role:'standard',tabs:['Agenda'],revision:1};
 await page.evaluate(({key,user})=>localStorage.setItem(`avvi.data.snapshot.user.${user.id}.${user.revision}.v1`,localStorage.getItem(key)),{key,user});
 await page.route('**/api/access',route=>route.fulfill({json:{user}}));await page.reload();await tab('Agenda').click();await selectDate('2025-10-10');
 await book(9.5,'Paciente histórica padrão');
 await page.reload();await tab('Agenda').click();await selectDate('2025-10-10');
 await page.getByText('Paciente histórica padrão',{exact:true}).first().waitFor();
 const snapshot=await page.evaluate(user=>JSON.parse(localStorage.getItem(`avvi.data.snapshot.user.${user.id}.${user.revision}.v1`)).data,user);
 assert.equal(snapshot.appointments.length,4);
 assert.equal(snapshot.appointments.find(a=>a.id==='cancelled').status,'Cancelado');
 assert.equal(snapshot.appointments.find(a=>a.id==='cancelled').notes,'Histórico preservado');
 assert.deepEqual(errors,[]);
 console.log('PASS: past-date Novo agendamento opens for admin/standard, including hidden cancelled slots; bookings save and survive reload, cancellation stays in history and can be shown. Isolated local fixtures.');
}finally{await browser.close();}
