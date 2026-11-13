import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin = process.env.AVVI_TEST_URL ?? 'http://127.0.0.1:3107';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
assert.ok(process.env.AVVI_TEST_ADMIN_SESSION);
const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const key = 'avvi.data.snapshot.v1';
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  await page.context().addCookies([{name: 'avvi_access', value: process.env.AVVI_TEST_ADMIN_SESSION, url: origin}]);
  await page.goto(origin);
  await page.getByRole('status', {name: 'Status do salvamento'}).filter({hasText: 'Prévia local'}).waitFor();
  await page.evaluate(key => {
    const snapshot = JSON.parse(localStorage.getItem(key));
    for (const entity of Object.keys(snapshot.data)) snapshot.data[entity] = [];
    snapshot.data.professionals = [{id: 'pro', name: 'Profissional QA', active: true, closedShifts: []}];
    snapshot.data.patients = [
      {id: 'credit', name: 'Márcia Costa QA', phone: '98900000000', cpf: '', birthDate: '1989-12-28', notes: '', professionalId: 'pro', futureCredit: 125.50},
      {id: 'zero', name: 'Outra pessoa QA', phone: '', cpf: '', birthDate: '1997-01-03', notes: '', futureCredit: 0},
      {id: 'leap', name: 'Pessoa Bissexta QA', phone: '', cpf: '', birthDate: '2000-02-29', notes: '', futureCredit: 0},
      {id: 'unlinked', name: 'Paciente sem vínculo QA', phone: '', cpf: '', birthDate: '', notes: '', futureCredit: 30}
    ];
    snapshot.data.procedures = [{id: 'product', name: 'Produto QA', category: 'QA', price: 100, averageCost: 45, professionalPercent: 70, notes: '', active: true}];
    localStorage.setItem(key, JSON.stringify(snapshot));
  }, key);
  await page.reload();
  await navigationButton(page, 'Cadastro de Pacientes').click();
  const search = page.getByRole('searchbox', {name: 'Pesquisar paciente pelo nome'});
  const row = name => page.getByRole('row').filter({hasText: name});
  const birthdayStart = page.getByLabel('Aniversariantes de', {exact: true});
  const birthdayEnd = page.getByLabel('Aniversariantes até', {exact: true});
  await birthdayStart.fill('2026-12-28');
  await birthdayEnd.fill('2027-01-03');
  assert.equal(await row('Márcia Costa QA').getByRole('cell', {name: '28/12', exact: true}).count(), 1);
  assert.equal(await row('Outra pessoa QA').getByRole('cell', {name: '03/01', exact: true}).count(), 1);
  assert.equal(await row('Paciente sem vínculo QA').count(), 0);
  assert.equal(await row('Pessoa Bissexta QA').count(), 0);
  await search.fill('costa');
  assert.equal(await row('Outra pessoa QA').count(), 0);
  await search.clear();
  await birthdayEnd.fill('2026-12-27');
  await page.getByRole('alert').filter({hasText: 'A data final deve ser'}).waitFor();
  await birthdayStart.fill('2027-02-28');
  await birthdayEnd.fill('2027-03-01');
  await page.getByText('Nenhum aniversariante encontrado no período.').waitFor();
  await birthdayStart.fill('2028-02-29');
  await birthdayEnd.fill('2028-02-29');
  assert.equal(await row('Pessoa Bissexta QA').getByRole('cell', {name: '29/02', exact: true}).count(), 1);
  await page.getByRole('button', {name: 'Limpar datas'}).click();
  await row('Paciente sem vínculo QA').waitFor();
  assert.equal(await page.getByRole('columnheader', {name: 'Aniversário'}).count(), 0);
  await search.fill('COSTA marcia');
  await row('Márcia Costa QA').waitFor();
  assert.equal(await row('Outra pessoa QA').count(), 0);
  await row('Márcia Costa QA').getByTitle('Editar', {exact: true}).click();
  let dialog = page.getByRole('dialog', {name: 'Editar paciente', exact: true});
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Nome', {exact: true}).inputValue(), 'Márcia Costa QA');
  await dialog.getByLabel('Nome', {exact: true}).fill('Alteração descartada');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state: 'hidden'});
  await row('Márcia Costa QA').getByTitle('Editar', {exact: true}).click();
  await dialog.getByLabel('Observações', {exact: true}).fill('Observação QA');
  await dialog.getByRole('button', {name: 'Salvar paciente', exact: true}).click();
  await dialog.waitFor({state: 'hidden'});
  await search.clear();
  const creditTab = page.getByRole('tab', {name: 'Pacientes com crédito', exact: true});
  await creditTab.click();
  assert.match(await row('Márcia Costa QA').innerText(), /125,50/);
  assert.match(await row('Márcia Costa QA').innerText(), /Profissional QA/);
  assert.match(await row('Paciente sem vínculo QA').innerText(), /Sem profissional vinculada/);
  assert.equal(await row('Outra pessoa QA').count(), 0);
  await search.fill('inexistente');
  await page.getByText('Nenhum paciente com crédito encontrado.', {exact: true}).waitFor();
  await search.clear();
  await page.getByRole('button', {name: 'Adicionar Paciente', exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Adicionar Paciente', exact: true});
  assert.equal(await dialog.getByLabel('Nome', {exact: true}).inputValue(), '');
  await dialog.getByLabel('Nome', {exact: true}).fill('Paciente nova QA');
  await dialog.getByRole('combobox', {name: /Profissional vinculada/}).selectOption('pro');
  await dialog.getByLabel(/Crédito futuro/).fill('55');
  await dialog.getByRole('button', {name: 'Salvar paciente', exact: true}).click();
  assert.match(await row('Paciente nova QA').innerText(), /55,00/);
  await navigationButton(page, 'Cadastro de Produtos').click();
  await row('Produto QA').getByTitle('Editar', {exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Editar produto', exact: true});
  assert.equal(await dialog.getByLabel(/Custo do produto/).inputValue(), '45');
  await dialog.getByLabel('Nome', {exact: true}).fill('Produto editado QA');
  await dialog.getByRole('button', {name: 'Salvar produto', exact: true}).click();
  await dialog.waitFor({state: 'hidden'});
  await row('Produto editado QA').waitFor();
  await page.getByRole('button', {name: 'Adicionar produto', exact: true}).click();
  dialog = page.getByRole('dialog', {name: 'Adicionar produto', exact: true});
  assert.equal(await dialog.getByLabel('Nome', {exact: true}).inputValue(), '');
  await dialog.getByRole('button', {name: 'Cancelar', exact: true}).click();
  await page.reload();
  await navigationButton(page, 'Cadastro de Produtos').click();
  await row('Produto editado QA').waitFor();
  await navigationButton(page, 'Cadastro de Pacientes').click();
  await creditTab.click();
  assert.match(await row('Paciente nova QA').innerText(), /55,00/);
  console.log('PASS: patient and product dialogs, cancel/save/reload, accent-insensitive search, birthdays across years and leap days, positive credit and linked professional. Isolated fixtures.');
} finally {
  await browser.close();
}
