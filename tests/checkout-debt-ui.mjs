import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
if(!process.env.AVVI_TEST_ADMIN_PASSWORD&&!process.env.AVVI_TEST_ADMIN_SESSION)throw Error('Configure AVVI_TEST_ADMIN_PASSWORD ou AVVI_TEST_ADMIN_SESSION.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),key='avvi.data.snapshot.v1',errors=[];
page.on('pageerror',error=>errors.push(error.message));
const tab=name=>navigationButton(page,name),checkout=page.getByRole('dialog',{name:'Fechamento de conta',exact:true});
const debt=()=>checkout.getByRole('switch',{name:'Deixar o restante como dívida',exact:true});
const summary=()=>page.getByRole('dialog',{name:'Detalhes do fechamento',exact:true});
async function setDebt(value){if(await debt().isChecked()!==value)await checkout.getByText('Deixar o restante como dívida',{exact:true}).click();}
async function open(id,closed=false){
 await tab('Agenda').click();await page.getByTestId('appointment-'+id).click();await page.getByRole('menuitem',{name:closed?'Ver fechamento':'Fechar conta',exact:true}).click();
 if(closed){await summary().waitFor();return;}
 await checkout.waitFor();
}
async function addProduct(){
 await checkout.getByRole('button',{name:'Produtos',exact:true}).click();await checkout.getByRole('combobox',{name:'Adicionar produto ao consumo',exact:true}).fill('Produto QA');
 await checkout.getByRole('option',{name:'Produto QA',exact:true}).click();await checkout.getByRole('button',{name:'Adicionar produto',exact:true}).click();
}
async function finish(){await checkout.getByRole('button',{name:'Fechar Conta',exact:true}).click();await checkout.waitFor({state:'hidden'});}
async function data(){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)).data,key);}
try{
 const origin=process.env.AVVI_TEST_URL??'http://127.0.0.1:3107';
 if(process.env.AVVI_TEST_ADMIN_SESSION)await page.context().addCookies([{name:'avvi_access',value:process.env.AVVI_TEST_ADMIN_SESSION,url:origin,httpOnly:true,sameSite:'Strict'}]);
 await page.goto(origin);if(!process.env.AVVI_TEST_ADMIN_SESSION){await page.getByLabel('Login',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill(process.env.AVVI_TEST_ADMIN_PASSWORD);await tab('Entrar').click();}
 await page.getByRole('status',{name:'Status do salvamento',exact:true}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(key=>{
  const snapshot=JSON.parse(localStorage.getItem(key)),d=snapshot.data,date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  for(const entity of Object.keys(d))d[entity]=[];
  d.professionals=[{id:'qa',name:'Profissional QA',active:true,showInAgenda:true,closedShifts:[],commissionPercent:70}];
  d.patients=[{id:'patient',name:'Paciente dívida QA',phone:'',notes:'',futureCredit:75}];
  d.services=[{id:'service',name:'Serviço QA',price:1000,priceType:'fixed',durationMinutes:60,active:true}];
  d.procedures=[{id:'product',name:'Produto QA',price:1000,averageCost:50,active:true}];d.inventory=[{id:'stock',procedureId:'product',quantity:5}];
  d.appointments=['partial','unpaid'].map((id,i)=>({id,professionalId:'qa',patientId:'patient',serviceId:'service',startsAt:date+`T${i?12:10}:00:00`,endsAt:date+`T${i?13:11}:00:00`,status:'Confirmado',eventType:'Novo Agendamento',notes:''}));
  localStorage.setItem(key,JSON.stringify(snapshot));
 },key);
 await page.reload();await open('partial');
 await debt().waitFor({timeout:3000});assert.equal(await debt().isChecked(),false);
 await addProduct();await checkout.getByLabel('Desconto de Serviço QA na conta',{exact:true}).fill('100');
 await checkout.getByLabel('Receber por Pix',{exact:true}).check();await checkout.getByLabel('Valor pago por Pix',{exact:true}).fill('250');
 await checkout.getByLabel('Receber por Visa',{exact:true}).check();await checkout.getByLabel('Valor pago por Visa',{exact:true}).fill('200');
 await checkout.getByRole('button',{name:'Fechar Conta',exact:true}).click();await checkout.getByRole('alert').filter({hasText:'pagamento que falta'}).waitFor();
 assert.equal((await data()).appointments[0].accountClosed,undefined);
 await setDebt(true);await finish();
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).data.appointments.find(a=>a.id==='partial').closedAccount?.balanceDue===450,key);
 let d=await data(),account=d.appointments.find(a=>a.id==='partial').closedAccount;
 assert.equal(account.payments.reduce((sum,p)=>sum+p.amount,0),450);assert.equal(account.commercialDiscount,100);
 assert.equal(account.creditAdded,0);assert.equal(d.patients[0].futureCredit,75);assert.equal(d.inventory[0].quantity,4);
 assert.equal(d.revenues.find(r=>r.sourceFinancialEntryId===account.id).total,450,'Debt is never recorded as received money');
 await page.reload();await open('partial',true);await summary().getByText('Saldo em aberto:',{exact:true}).locator('..').filter({hasText:'450,00'}).waitFor();
 await summary().getByRole('button',{name:'Estorno',exact:true}).click();assert.equal(await debt().isChecked(),true);
 await setDebt(false);await checkout.getByRole('button',{name:'Fechar Conta',exact:true}).click();await checkout.getByRole('alert').filter({hasText:'pagamento que falta'}).waitFor();
 await checkout.getByLabel('Valor pago por Pix',{exact:true}).fill('700');await finish();
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).data.appointments.find(a=>a.id==='partial').closedAccount?.balanceDue===0,key);
 d=await data();assert.equal(d.inventory[0].quantity,4);assert.equal(d.revenues.find(r=>r.sourceFinancialEntryId===account.id).total,900);
 await open('unpaid');await addProduct();assert.equal(await debt().isChecked(),false);await setDebt(true);await finish();
 await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).data.appointments.find(a=>a.id==='unpaid').closedAccount?.balanceDue===1000,key);
 d=await data();assert.equal(d.appointments.find(a=>a.id==='unpaid').closedAccount.payments.length,0);assert.equal(d.patients[0].futureCredit,75);assert.equal(d.inventory[0].quantity,3);
 // Standard users can reopen and save the same debt without consuming stock twice.
 const user={id:'debt-qa',login:'debt-qa',role:'standard',tabs:['Agenda'],revision:1};
 await page.evaluate(({key,user})=>localStorage.setItem(`avvi.data.snapshot.user.${user.id}.${user.revision}.v1`,localStorage.getItem(key)),{key,user});
 await page.route('**/api/access',route=>route.fulfill({json:{user}}));await page.reload();await open('unpaid',true);
 await summary().getByRole('button',{name:'Estorno',exact:true}).click();assert.equal(await debt().isChecked(),true);
 await checkout.getByLabel('Receber por Pix',{exact:true}).check();await checkout.getByLabel('Valor pago por Pix',{exact:true}).fill('300');await finish();await page.reload();
 const stored=await page.evaluate(user=>JSON.parse(localStorage.getItem(`avvi.data.snapshot.user.${user.id}.${user.revision}.v1`)).data,user);
 assert.equal(stored.appointments.find(a=>a.id==='unpaid').closedAccount.balanceDue,700);assert.equal(stored.inventory[0].quantity,3);assert.equal(stored.patients[0].futureCredit,75);
 assert.deepEqual(errors,[]);
 console.log('PASS: opt-in partial/full debt, split payments and discount, balance saved and shown after reload, remaining blocked without consent, reopen with debt enabled, later full payment clears debt, stock charged once, no invented payment/credit, standard user partial repayment. Isolated fixtures.');
}finally{await browser.close();}
