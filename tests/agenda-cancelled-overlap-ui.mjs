import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
import {selectSearchOption} from './search-select-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
if(!process.env.AVVI_TEST_ADMIN_PASSWORD)throw Error('Configure AVVI_TEST_ADMIN_PASSWORD.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),key='avvi.data.snapshot.v1',errors=[];
page.on('pageerror',error=>errors.push(error.message));
const tab=name=>navigationButton(page,name),card=id=>page.getByTestId('appointment-'+id),toggle=()=>page.getByRole('button',{name:'Mostrar agendamentos cancelados',exact:true});
const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).data,key);
async function beside(ids){
 const boxes=[];
 for(const id of ids){await card(id).waitFor({timeout:3000});boxes.push(await card(id).boundingBox());}
 // Both cancelled visits overlap the replacement during 09:30–10:00.
 assert.ok(boxes.every(box=>box.width>0));
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(boxes[i].x+boxes[i].width<=boxes[j].x+1||boxes[j].x+boxes[j].width<=boxes[i].x+1,'Overlapping cards must occupy separate horizontal lanes');
}
try{
 await page.goto(process.env.AVVI_TEST_URL??'http://127.0.0.1:3107');await page.getByLabel('Login',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill(process.env.AVVI_TEST_ADMIN_PASSWORD);await tab('Entrar').click();
 await page.getByRole('status',{name:'Status do salvamento',exact:true}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(key=>{
  const snapshot=JSON.parse(localStorage.getItem(key)),d=snapshot.data,date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  for(const entity of Object.keys(d))d[entity]=[];
  d.professionals=[{id:'qa',name:'Profissional QA',active:true,showInAgenda:true,closedShifts:[],commissionPercent:70}];
  d.patients=[{id:'cancel1-p',name:'Cancelada QA 1',phone:'',notes:''},{id:'cancel2-p',name:'Cancelada QA 2',phone:'',notes:''}];
  d.services=[{id:'service',name:'Serviço QA',price:100,priceType:'fixed',durationMinutes:60,active:true}];
  d.appointments=[{id:'cancel1',patientId:'cancel1-p',startsAt:date+'T09:00:00',endsAt:date+'T10:00:00'},{id:'cancel2',patientId:'cancel2-p',startsAt:date+'T09:30:00',endsAt:date+'T10:30:00'}].map(a=>({...a,professionalId:'qa',serviceId:'service',status:'Cancelado',eventType:'Novo Agendamento',notes:'Preservar histórico'}));
  localStorage.setItem(key,JSON.stringify(snapshot));
 },key);
 await page.reload();await tab('Agenda').click();
 for(const id of ['cancel1','cancel2'])assert.equal(await card(id).count(),0);
 await page.locator('[data-agenda-slot][data-professional-id="qa"][data-hour="9"]').getByRole('button').click();await page.getByRole('menuitem',{name:'Novo agendamento',exact:true}).click();
 const details=page.getByTestId('appointment-details-window');await details.getByLabel('Nome do paciente',{exact:true}).fill('Paciente normal QA');await selectSearchOption(details,'Serviço','Serviço QA');
 await details.getByRole('button',{name:'Salvar agendamento',exact:true}).click();await details.waitFor({state:'hidden'});
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).data.appointments.length===3,key);
 const before=await state(),active=before.appointments.find(a=>a.status!=='Cancelado'),ids=[active.id,'cancel1','cancel2'];
 await card(active.id).waitFor();const full=await card(active.id).boundingBox();
 await toggle().click();await beside(ids);
 assert.ok((await card(active.id).boundingBox()).width<full.width/2);
 for(const id of ids){
  await card(id).click();const menu=page.getByRole('menu',{name:'Ações do agendamento',exact:true});
  assert.ok((await menu.innerText()).includes(id===active.id?'Paciente normal QA':id==='cancel1'?'Cancelada QA 1':'Cancelada QA 2'));
  await page.keyboard.press('Escape');
 }
 await card('cancel1').click();await page.getByRole('menuitem',{name:'Confirmado',exact:true}).click();await page.getByRole('alert').filter({hasText:'reservado'}).waitFor();
 assert.equal((await state()).appointments.find(a=>a.id==='cancel1').status,'Cancelado');
 await toggle().click();for(const id of ['cancel1','cancel2'])assert.equal(await card(id).count(),0);
 assert.ok(Math.abs((await card(active.id).boundingBox()).width-full.width)<2);
 assert.deepEqual(await state(),before,'Visibility and rejected restoration must not change stored records');
 await page.reload();await tab('Agenda').click();await card(active.id).waitFor();assert.equal(await toggle().getAttribute('aria-pressed'),'false');assert.equal(await card('cancel1').count(),0);
 await toggle().click();await beside(ids);
 await page.screenshot({path:'C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/agenda-cancelados-lado-a-lado.png'});
 // Same filter and booking history in an authorized standard session on mobile.
 const user={id:'cancel-lanes-qa',login:'cancel-lanes-qa',role:'standard',tabs:['Agenda'],revision:1};
 await page.evaluate(({key,user})=>localStorage.setItem(`avvi.data.snapshot.user.${user.id}.${user.revision}.v1`,localStorage.getItem(key)),{key,user});
 await page.route('**/api/access',route=>route.fulfill({json:{user}}));await page.setViewportSize({width:390,height:844});await page.reload();await card(active.id).waitFor();assert.equal(await card('cancel1').count(),0);
 await page.getByRole('button',{name:'Abrir calendário e filtros',exact:true}).click();await toggle().click();await page.getByRole('button',{name:'Fechar calendário e filtros',exact:true}).click();await beside(ids);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);
 console.log('PASS: replacement booking reuses cancelled time; active card alone/full-width by default; filter displays all overlapping cancellations and active card side by side, each independently clickable; rejected restoration, stored history unchanged, hide/reset on reload, standard user and mobile. Isolated fixtures.');
}finally{await browser.close();}
