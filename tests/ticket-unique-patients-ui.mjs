import { chromium } from 'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }), key = 'avvi.data.snapshot.v1', errors = [];
const tab = name => page.getByRole('button', { name, exact: true }).filter({ visible: true }).first();
page.on('pageerror', e => errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:3107');
 await page.getByLabel('Login', { exact: true }).fill('admin');
 await page.getByLabel('Senha', { exact: true }).fill(process.env.AVVI_TEST_ADMIN_PASSWORD);
 await tab('Entrar').click(); await tab('Sair').waitFor();
 await page.getByRole('status', { name: 'Status do salvamento' }).filter({ hasText: 'Prévia local' }).waitFor();
 const month = await page.evaluate(k => {
  const snapshot = JSON.parse(localStorage.getItem(k)), d = snapshot.data, month = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  d.professionals = [{ ...d.professionals[0], id: 'bia', name: 'Bia QA', monthlyGoal: 0 }, { ...d.professionals[0], id: 'ana', name: 'Ana QA', monthlyGoal: 0 }];
  d.patients = ['same', 'other', 'return-only', 'evaluation-only'].map(id => ({ id, name: id + ' QA', phone: '', cpf: '', notes: '' }));
  d.services = [{ id: 'paid', name: 'Serviço QA', price: 100, durationMinutes: 60, active: true }, { id: 'return', name: 'Retorno QA', price: 0, durationMinutes: 30, active: true }, { id: 'evaluation', name: 'Avaliação QA', price: 0, durationMinutes: 30, active: true }];
  d.appointments = []; d.financial_entries = []; d.revenues = []; d.fixed_costs = []; d.monthly_goals = []; d.procedures = [{id:"product",name:"Produto QA",price:0,averageCost:0,active:true}];
  for (const [id, patientId, amount, day, professionalId, serviceId] of [['a1', 'same', 100, '01', 'bia', 'paid'], ['a2', 'same', 200, '02', 'bia', 'paid'], ['a3', 'same', 300, '03', 'bia', 'paid'], ['a4', 'other', 400, '04', 'bia', 'paid'], ['a5', 'return-only', 0, '05', 'bia', 'return'], ['a6', 'evaluation-only', 0, '06', 'bia', 'evaluation'], ['a7', 'same', 500, '01', 'ana', 'paid']]) {
   const quantity = ({a1:2,a2:1,a3:3,a4:1,a7:9})[id] ?? 1;
   const date = month + '-' + day, account = { id: 'account-' + id, patientId, professionalId, date, accountClosed: true, quantity: 1, servicePrice: amount, productCost: 0, machineFee: 0, commercialDiscount: 0, professionalPercent: 70, discountSplit: 'Empresa assume', payments: amount ? [{ amount, fee: 0, discount: 0, method: 'Pix' }] : [], procedureLines: [{ serviceId, manualProcedure: serviceId, quantity, servicePrice: amount / quantity, productCost: 0, professionalPercent: 70 }, {procedureId:'product',quantity:50,servicePrice:0,productCost:0,professionalPercent:70}], products: [{id:'use',procedureId:'product',quantity:50,unitCost:0}], generatedEntryId: 'entry-' + id };
   d.appointments.push({ id, patientId, professionalId, serviceId, startsAt: date + 'T08:00:00', endsAt: date + 'T09:00:00', status: 'Finalizado', accountClosed: true, closedAccount: account, financialEntryId: account.generatedEntryId, notes: '' });
   if (amount) d.financial_entries.push({ ...account, id: account.generatedEntryId, accountClosed: undefined, sourceAccountId: account.id, appointmentId: id });
  }
  localStorage.setItem(k, JSON.stringify(snapshot)); return month;
 }, key);
 await page.reload(); await tab('Dashboard').click();
 const total=page.getByText('Total receitas',{exact:true}).locator('..');await total.getByRole('heading',{name:/1\.500,00/}).waitFor();
 for(const [name,value] of [['Bia QA','1.000,00'],['Ana QA','500,00']])assert.ok((await page.getByText('Faturamento - '+name,{exact:true}).locator('..').locator('..').innerText()).includes(value));
 await page.screenshot({path:'C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/dashboard-receitas-coerentes.png'});
 await tab('Relatórios').click();
 const bia = page.getByTestId('ranking-averageTicket-bia'); await bia.waitFor();
 assert.ok((await bia.innerText()).includes('2 pacientes com conta fechada')); assert.ok((await bia.innerText()).includes('R$ 500,00'));
 assert.ok((await page.getByTestId('ranking-averageTicket-ana').innerText()).includes('1 paciente com conta fechada'));
 assert.ok((await page.getByTestId('ranking-revenue-bia').innerText()).includes('2 atendimentos'));assert.ok((await page.getByTestId('ranking-revenue-ana').innerText()).includes('1 atendimento'));
 const services = page.getByRole('region',{name:'Serviços por profissional',exact:true});assert.equal(await page.getByRole('region',{name:'Atendimentos por profissional',exact:true}).count(),0);
 assert.deepEqual(await services.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[row.querySelector('p').textContent,row.querySelector('strong').textContent])),[['Ana QA','9'],['Bia QA','7']]);
 assert.ok((await page.getByTestId('ranking-productivity-bia').innerText()).includes('2 atendimentos'));
 await page.screenshot({ path: 'C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/ticket-pacientes-unicos.png' });
 await page.getByLabel('Tipo de período dos relatórios').selectOption('range');
 await page.getByLabel('Data inicial dos relatórios').fill(month + '-01'); await page.getByLabel('Data final dos relatórios').fill(month + '-02');
 assert.ok((await page.getByTestId('ranking-serviceCount-bia').innerText()).includes('3'));assert.ok((await page.getByTestId('ranking-revenue-bia').innerText()).includes('1 atendimento'));
 assert.ok((await bia.innerText()).includes('1 paciente com conta fechada')); assert.ok((await bia.innerText()).includes('R$ 300,00'));
 await tab('Relatório Profissional').click(); await tab('Mostrar valores de todos').click();
 const financial = page.getByRole('region', { name: 'Valores financeiros de Bia QA' });
 assert.ok((await financial.getByText('Ticket médio', { exact: true }).locator('..').innerText()).includes('R$ 500,00'));
 assert.ok((await financial.innerText()).includes('Total pago ÷ 2 pacientes com conta fechada'));
 await page.getByRole('button',{name:'Rankings de Bia QA',exact:true}).click();
 const rankings=page.getByRole('region',{name:'Rankings individuais de Bia QA',exact:true});
 assert.equal(await rankings.getByRole('region',{name:'Pacientes por lucro',exact:true}).count(),0);
 const products=rankings.getByRole('region',{name:'Produtos mais utilizados',exact:true});assert.ok((await products.innerText()).includes('Produto QA'));assert.ok((await products.innerText()).includes('200'));
 await page.screenshot({path:'C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/relatorio-produtos-individuais.png'});
 // Isolated standard session: only the authorized report projection, no account/cloud changes.
 const operator={id:'qa-scoped',login:'qa-scoped',name:'Usuária QA',role:'standard',tabs:['Relatório Profissional'],revision:1,professionalReport:{professionalIds:['bia']}};
 const report={professional:{id:'bia',name:'Bia QA'},goal:2000,totalPaid:1000,count:4,serviceCount:7,averageTicket:500,closedPatientCount:2,services:[{id:'paid',name:'Serviço QA',value:7}],products:[{id:'product',name:'Produto QA',value:200}],patientRevenue:[{id:'same',name:'same QA',value:600},{id:'other',name:'other QA',value:400}],patientServices:[{id:'same',name:'same QA',value:6},{id:'other',name:'other QA',value:1}]};
 await page.route('**/api/access',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({user:operator})}));
 await page.route('**/api/reports/professionals?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({valid:true,reports:[report]})}));
 await page.reload();await tab('Relatório Profissional').click();const scoped=page.getByRole('region',{name:'Relatório de Bia QA',exact:true});await scoped.waitFor();
 assert.equal(await page.getByRole('region',{name:/^Relatório de /}).count(),1);await scoped.getByRole('button',{name:'Rankings de Bia QA',exact:true}).click();
 const revenueRank=scoped.getByRole('region',{name:'Pacientes por faturamento',exact:true});assert.equal(await revenueRank.getByRole('columnheader').count(),3);assert.ok((await revenueRank.innerText()).includes('600,00'));assert.ok((await revenueRank.innerText()).includes('400,00'));
 assert.ok((await scoped.getByRole('region',{name:'Produtos mais utilizados',exact:true}).innerText()).includes('200'));
 for(const hidden of ['Pacientes por lucro','Lucro total','Receita da empresa','Valor recebido pelo profissional'])assert.equal(await page.getByText(hidden,{exact:true}).count(),0);
 assert.equal(await tab('Mostrar valores de todos').count(),0);assert.equal(await page.getByRole('button',{name:'Ver valores financeiros',exact:true}).count(),0);assert.equal(await scoped.getByText('Ticket médio',{exact:true}).count(),1);
 await page.screenshot({path:'C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/relatorio-padrao-faturamento-produtos.png'});
 assert.deepEqual(errors, []);
 console.log('PASS: three closed accounts for the same patient count once, free return/evaluation-only patients excluded; separate professional and date-range denominators; attendance/productivity use unique patients; services rank by quantities including multi-service accounts, excluding products and free returns; clinic ticket agrees with professional report. Local QA fixtures only.');
} finally { await browser.close(); }
