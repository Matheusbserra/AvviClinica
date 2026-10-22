import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.AVVI_TEST_URL??'http://127.0.0.1:3107';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use an isolated local preview only');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:950}}),key='avvi.data.snapshot.v1',errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.route('**/api/access',route=>route.fulfill({json:{user:{login:'admin',role:'admin'}}}));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedCpf=text;}}});});
 await page.goto(origin);await page.getByRole('status',{name:'Status do salvamento',exact:true}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(key=>{
  const snapshot=JSON.parse(localStorage.getItem(key)),data=snapshot.data;for(const entity of Object.keys(data))data[entity]=[];
  data.professionals=[{id:'professional',name:'Profissional QA',active:true}];
  data.patients=[{id:'saved',name:'Paciente com CPF QA',cpf:'012.345.678-90',phone:'',notes:''},{id:'empty',name:'Paciente sem CPF QA',cpf:'',phone:'',notes:''}];
  data.appointments=data.patients.map((patient,index)=>({id:patient.id,patientId:patient.id,professionalId:'professional',startsAt:`2026-10-12T${index?'11':'09'}:00:00`,endsAt:`2026-10-12T${index?12:10}:00:00`,eventType:'Novo Agendamento',status:'Finalizado',accountClosed:true,notes:'',closedAccount:{id:'account-'+patient.id,patientId:patient.id,professionalId:'professional',appointmentId:patient.id,date:'2026-10-12',procedureLines:[{id:'line',manualProcedure:'Serviço QA',quantity:1,servicePrice:300}],products:[],payments:[{method:'Pix',amount:300}]}}));
  localStorage.setItem(key,JSON.stringify(snapshot));
 },key);
 await page.reload();await navigationButton(page,'Nota Fiscal').click();
 const saved=page.getByTestId('invoice-saved'),empty=page.getByTestId('invoice-empty');await saved.waitFor();await empty.waitFor();
 const before=await page.evaluate(key=>JSON.stringify(JSON.parse(localStorage.getItem(key)).data),key);
 const copy=saved.getByRole('button',{name:'Copiar CPF de Paciente com CPF QA',exact:true});await copy.click();
 assert.equal(await page.evaluate(()=>window.__copiedCpf),'01234567890','Copy digits only, preserving leading zeros');
 await saved.getByRole('status').filter({hasText:'CPF copiado.'}).waitFor();
 assert.equal(await saved.getByRole('textbox',{name:'CPF de Paciente com CPF QA',exact:true}).count(),0,'Copy must not open CPF editing');
 assert.equal(await page.evaluate(key=>JSON.stringify(JSON.parse(localStorage.getItem(key)).data),key),before,'Copy must not change patients, closures or invoices');
 assert.equal(await empty.getByRole('button',{name:/Copiar CPF/}).count(),0,'No copy button without a saved CPF');
 await empty.getByRole('button',{name:'Editar CPF de Paciente sem CPF QA',exact:true}).click();await empty.getByLabel('CPF de Paciente sem CPF QA',{exact:true}).fill('00987654321');await empty.getByRole('button',{name:'Salvar CPF',exact:true}).click();
 await empty.getByRole('button',{name:'Copiar CPF de Paciente sem CPF QA',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copiedCpf),'00987654321');
 await page.reload();await navigationButton(page,'Nota Fiscal').click();await empty.getByRole('button',{name:'Copiar CPF de Paciente sem CPF QA',exact:true}).click();assert.equal(await page.evaluate(()=>window.__copiedCpf),'00987654321','Edited CPF remains copyable after reload');
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new DOMException('Clipboard blocked','NotAllowedError');};});await copy.click();await page.getByRole('alert').filter({hasText:'Não foi possível copiar o CPF'}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,null,{timeout:3000}).catch(async error=>{await page.screenshot({path:'.avvi-local/invoice-cpf-copy-mobile.png'});console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(element=>element.getBoundingClientRect().right>innerWidth+1).map(element=>({tag:element.tagName,classes:element.className,right:element.getBoundingClientRect().right})).slice(0,12)));throw error;});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The inline button must fit mobile layout');
 assert.deepEqual(errors,[]);
 console.log('PASS: invoice CPF copy uses saved digits with leading zeros, shows confirmation, does not edit records or open the CPF editor, stays hidden without CPF, works after CPF save/reload, handles clipboard refusal and fits mobile. Clipboard mocked; fictional local data only.');
}finally{await browser.close();}
