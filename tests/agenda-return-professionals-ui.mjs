import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
if(!process.env.AVVI_TEST_ADMIN_PASSWORD&&!process.env.AVVI_TEST_ADMIN_SESSION)throw Error('Configure AVVI_TEST_ADMIN_PASSWORD ou AVVI_TEST_ADMIN_SESSION.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],key='avvi.data.snapshot.v1';
page.on('pageerror',error=>errors.push(error.message));
const tab=name=>navigationButton(page,name);
const filter=()=>page.getByRole('combobox',{name:'Filtrar profissional da agenda',exact:true});
async function allProfessionals(){
 await page.getByTestId('professional-a').waitFor();await page.getByTestId('professional-b').waitFor();await page.getByTestId('professional-c').waitFor();
 assert.equal(await page.getByTestId('professional-hidden').count(),0,'Respect Mostrar na agenda');
 assert.equal(await filter().inputValue(),'todos');
 assert.match(await page.getByTestId('professional-page').innerText(),/de 3$/);
}
try{
 const origin=process.env.AVVI_TEST_URL??'http://127.0.0.1:3107';
 if(process.env.AVVI_TEST_ADMIN_SESSION)await page.context().addCookies([{name:'avvi_access',value:process.env.AVVI_TEST_ADMIN_SESSION,url:origin,httpOnly:true,sameSite:'Strict'}]);
 await page.goto(origin);
 if(!process.env.AVVI_TEST_ADMIN_SESSION){await page.getByLabel('Login',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill(process.env.AVVI_TEST_ADMIN_PASSWORD);await tab('Entrar').click();}
 await page.getByRole('status',{name:'Status do salvamento',exact:true}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(key=>{
  const snapshot=JSON.parse(localStorage.getItem(key)),d=snapshot.data;
  d.professionals=['a','b','c','hidden'].map(id=>({id,name:'Profissional QA '+id,active:true,showInAgenda:id!=='hidden',commissionPercent:70,color:'#335577',closedShifts:[]}));
  for(const entity of Object.keys(d))if(entity!=='professionals')d[entity]=[];
  localStorage.setItem(key,JSON.stringify(snapshot));
 },key);
 await page.reload();await tab('Agenda').click();await allProfessionals();
 // A dashboard filter must never filter the clinic's agenda.
 await tab('Dashboard').click();const dashboardFilter=page.locator('select').filter({has:page.locator('option[value="b"]')}).first();
 await dashboardFilter.selectOption('b');await tab('Agenda').click();await allProfessionals();
 // The agenda filter is temporary: leaving and returning restores Todos.
 await filter().selectOption('a');assert.equal(await page.getByTestId('professional-b').count(),0);
 await tab('Estoque').click();await tab('Agenda').click();await allProfessionals();
 // Resetting the agenda must not reset another screen's chosen professional.
 await filter().selectOption('c');await tab('Dashboard').click();assert.equal(await dashboardFilter.inputValue(),'b');
 await tab('Agenda').click();await allProfessionals();
 await tab('Lançamento de Procedimentos').click();
 await page.locator('select.input.w-44').filter({has:page.locator('option[value="a"]')}).first().selectOption('a');
 await tab('Agenda').click();await allProfessionals();
 console.log('PASS: dashboard/financial filters never narrow the agenda; returning from other menus restores all visible professionals while keeping each other screen’s filter.');
 // Same navigation on mobile, where professionals remain paginated for readability.
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Abrir calendário e filtros',exact:true}).click();
 await filter().selectOption('b');await page.getByRole('button',{name:/Fechar calendário/}).click();
 await page.getByRole('combobox',{name:'Navegar pelo sistema',exact:true}).selectOption('Estoque');
 await tab('Agenda').click();assert.match(await page.getByTestId('professional-page').innerText(),/de 3$/);
 await page.getByRole('button',{name:'Abrir calendário e filtros',exact:true}).click();assert.equal(await filter().inputValue(),'todos');
 await page.getByRole('button',{name:/Fechar calendário/}).click();
 // A standard user with an authorized agenda follows the same behavior.
 await page.setViewportSize({width:1440,height:1000});
 const user={id:'agenda-return-qa',login:'agenda-return-qa',role:'standard',tabs:['Agenda','Estoque'],revision:1};
 await page.evaluate(({key,user})=>localStorage.setItem(`avvi.data.snapshot.user.${user.id}.${user.revision}.v1`,localStorage.getItem(key)),{key,user});
 await page.route('**/api/access',route=>route.fulfill({json:{user}}));await page.reload();await allProfessionals();
 await filter().selectOption('c');await tab('Estoque').click();await tab('Agenda').click();await allProfessionals();
 assert.deepEqual(errors,[]);
 console.log('PASS: mobile return resets the filter without breaking pagination; standard user returns to the full shared agenda; hidden professionals stay hidden. Isolated browser fixtures only.');
}finally{await browser.close();}
