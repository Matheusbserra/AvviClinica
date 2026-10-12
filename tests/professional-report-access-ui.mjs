import {chromium} from 'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const password=process.env.AVVI_TEST_ADMIN_PASSWORD;if(!password)throw Error('Senha de teste ausente');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const tab=name=>page.getByRole('button',{name,exact:true}).filter({visible:true}).first();
const root='C:/Users/mathe/.codex/visualizations/2026/10/08/01a11cce-4e90-7ed3-9fab-934e7f183230/';
async function login(name,secret){await page.getByLabel('Login',{exact:true}).fill(name);await page.getByLabel('Senha',{exact:true}).fill(secret);await tab('Entrar').click();await tab('Sair').waitFor();}
try {
 await page.goto('http://127.0.0.1:3108/?previa=contas-relatorio-limitado');await login('admin',password);await tab('Contas').click();await tab('Novo usuário').click();
 await page.getByLabel('Nome do usuário',{exact:true}).fill('Profissional de teste');await page.getByLabel('Login do usuário',{exact:true}).fill('relatorio-teste');await page.getByLabel('Senha do usuário',{exact:true}).fill('test-password-2026');
 for(const checkbox of await page.getByRole('group',{name:'Abas autorizadas',exact:true}).getByRole('checkbox').all())if(await checkbox.isChecked()&&await checkbox.isEnabled())await checkbox.uncheck();
 await page.getByLabel('Permitir Relatório Profissional',{exact:true}).check();assert.equal(await page.getByLabel('Limitar relatório a profissionais selecionados',{exact:true}).isChecked(),true);
 await tab('Salvar usuário').click();await page.getByRole('alert').filter({hasText:'Selecione pelo menos um profissional'}).waitFor();
 await page.getByLabel('Permitir relatório de Ana',{exact:true}).check();await page.screenshot({path:root+'contas-relatorio-limitado.png',fullPage:false});await tab('Salvar usuário').click();await page.getByRole('status').filter({hasText:'Usuário salvo'}).waitFor();
 const account=page.getByRole('region',{name:'Conta relatorio-teste',exact:true});assert.ok((await account.innerText()).includes('Ana'));
 await page.getByLabel('Editar usuário relatorio-teste',{exact:true}).click();assert.equal(await page.getByLabel('Permitir relatório de Ana',{exact:true}).isChecked(),true);assert.equal(await page.getByLabel('Permitir relatório de Samia',{exact:true}).isChecked(),false);await page.getByLabel('Cancelar edição do usuário').click();
 await tab('Sair').click();await login('relatorio-teste','test-password-2026');await tab('Relatório Profissional').click();
 await page.getByRole('region',{name:'Relatório de Ana',exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:/^Relatório de /}).count(),1);
 assert.equal(await tab('Mostrar valores de todos').count(),0);assert.equal(await page.getByRole('button',{name:'Ver valores financeiros',exact:true}).count(),0);
 await page.getByLabel('Mês do relatório profissional').fill('2026-05');const ana=page.getByRole('region',{name:'Relatório de Ana',exact:true});await ana.waitFor();await ana.getByText('R$ 3.700,00',{exact:true}).waitFor();
 await ana.getByRole('button',{name:'Rankings de Ana',exact:true}).click();assert.equal(await ana.getByText('Top 5',{exact:true}).count(),4);
 const revenueRank=ana.getByRole('region',{name:'Pacientes por faturamento',exact:true});assert.equal(await revenueRank.getByRole('columnheader').count(),3);assert.equal((await revenueRank.innerText()).includes('R$'),true);assert.equal(await ana.getByRole('region',{name:'Pacientes por lucro',exact:true}).count(),0);await ana.getByRole('region',{name:'Produtos mais utilizados',exact:true}).waitFor();
 assert.equal(await ana.getByText('Ticket médio',{exact:true}).count(),1);
 for(const hidden of ['Lucro total','Receita da empresa','Valor recebido pelo profissional'])assert.equal(await page.getByText(hidden,{exact:true}).count(),0);
 assert.equal(await page.getByText('Total pago pelos clientes',{exact:true}).count(),1);assert.ok((await ana.innerText()).includes('Meta:'));
 await page.screenshot({path:root+'relatorio-acesso-limitado.png',fullPage:false});
 await page.reload();await tab('Relatório Profissional').click();await page.getByRole('region',{name:'Relatório de Ana',exact:true}).waitFor();
 await tab('Sair').click();await login('admin',password);await tab('Contas').click();await page.getByLabel('Editar usuário relatorio-teste').click();await page.getByLabel('Permitir relatório de Ana',{exact:true}).uncheck();await page.getByLabel('Permitir relatório de Samia',{exact:true}).check();await tab('Salvar usuário').click();await page.getByRole('status').filter({hasText:'Usuário salvo'}).waitFor();await tab('Sair').click();await login('relatorio-teste','test-password-2026');await tab('Relatório Profissional').click();await page.getByRole('region',{name:'Relatório de Samia',exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Relatório de Ana',exact:true}).count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: account scope checkboxes create/edit/validation, selected professional only after login/reload/change, four rankings with patient revenue and product quantities, goals/total paid/ticket visible and other financial values unavailable. Isolated local test users only.');
}finally{await browser.close();}
