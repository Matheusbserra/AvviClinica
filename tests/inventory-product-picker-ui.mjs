import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
if(!process.env.AVVI_TEST_ADMIN_PASSWORD)throw Error('Configure AVVI_TEST_ADMIN_PASSWORD.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[],key='avvi.data.snapshot.v1';
page.on('pageerror',error=>errors.push(error.message));
const tab=name=>navigationButton(page,name);
const dialog=page.getByRole('dialog',{name:'Adicionar produto ao estoque',exact:true});
const search=dialog.getByRole('combobox',{name:'Produto do cadastro de produtos',exact:true});
const list=dialog.getByRole('listbox');
const target='Ampola estética de demonstração corporal com nome longo para identificar corretamente o produto cadastrado';
async function open(){await tab('Produto').click();await search.click();await list.waitFor();}
async function visibleList(){
 return list.evaluate(element=>{
  const rect=element.getBoundingClientRect();let top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
  for(let parent=element.parentElement;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(/auto|scroll|hidden|clip/.test(style.overflowY)){const box=parent.getBoundingClientRect();top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}}
  return {height:Math.max(0,bottom-top),width:rect.width};
 });
}
try{
 await page.goto(process.env.AVVI_TEST_URL??'http://127.0.0.1:3107');await page.getByLabel('Login',{exact:true}).fill('admin');await page.getByLabel('Senha',{exact:true}).fill(process.env.AVVI_TEST_ADMIN_PASSWORD);await tab('Entrar').click();await page.getByRole('status',{name:'Status do salvamento'}).filter({hasText:'Prévia local'}).waitFor();
 await page.evaluate(({key,target})=>{const copy=JSON.parse(localStorage.getItem(key)),data=copy.data;
  data.procedures=Array.from({length:18},(_,index)=>({id:'picker-'+index,name:index===17?target:`Material de demonstração ${String(index+1).padStart(2,'0')} para uso clínico`,price:200,averageCost:30,active:true}));
  data.inventory=[{id:'picker-stock',procedureId:'picker-17',quantity:7,visibleInStock:false}];
  data.appointments=[];data.financial_entries=[];data.patients=[];data.gifts=[];data.revenues=[];data.fixed_costs=[];
  localStorage.setItem(key,JSON.stringify(copy));
 },{key,target});
 await page.reload();await tab('Estoque').click();
 for(const size of [{width:1440,height:950},{width:1280,height:650},{width:390,height:844},{width:360,height:568},{width:844,height:390}]){
  await page.setViewportSize(size);await open();assert.equal(await dialog.getByRole('option').count(),18);
  const visible=await visibleList();assert.ok(visible.height>=Math.min(220,size.height*.3),`Results clipped at ${size.width}x${size.height}: only ${visible.height}px visible`);
  assert.ok(visible.width>size.width*.5||visible.width>300,'Search results should use the available dialog width');
  const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=size.width+1&&bounds.y+bounds.height<=size.height+1);
  assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);
  const last=dialog.getByRole('option').last();await last.scrollIntoViewIfNeeded();
  assert.equal(await last.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,'A scrolled result must actually be visible/clickable');
  await search.fill('ESTETICA');const option=dialog.getByRole('option',{name:target,exact:true});await option.waitFor();assert.equal(await dialog.getByRole('option').count(),1);
  if(process.env.AVVI_TEST_SCREENSHOT_DIR)await page.screenshot({path:process.env.AVVI_TEST_SCREENSHOT_DIR+`/estoque-busca-${size.width}x${size.height}.png`});
  await option.click();assert.equal(await search.inputValue(),target);assert.equal(await list.count(),0);
  const add=dialog.getByRole('button',{name:'Adicionar produto',exact:true});assert.equal(await add.isEnabled(),true);await add.scrollIntoViewIfNeeded();
  assert.equal(await add.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
  await dialog.getByRole('button',{name:'Fechar Adicionar produto ao estoque',exact:true}).click();
 }
 await page.setViewportSize({width:1440,height:950});await open();await search.fill('produto inexistente QA');await dialog.getByText('Nenhum resultado encontrado.',{exact:true}).waitFor();
 await search.fill('corporal');await search.press('ArrowDown');await search.press('Enter');await dialog.getByRole('button',{name:'Adicionar produto',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(await page.getByLabel('Quantidade de '+target,{exact:true}).inputValue(),'7');
 await page.reload();await tab('Estoque').click();assert.equal(await page.getByLabel('Quantidade de '+target,{exact:true}).inputValue(),'7');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).data,key);assert.equal(saved.inventory.filter(row=>row.procedureId==='picker-17').length,1);assert.equal(saved.inventory[0].visibleInStock,true);assert.deepEqual(errors,[]);
 console.log('PASS: stock product picker displays an unclipped, scrollable result list and readable long names at five desktop/mobile/landscape sizes; substring/accent-insensitive search, real pointer access, keyboard selection, empty results, add/reload and existing stock quantity preserved. Isolated browser fixtures.');
}finally{await browser.close();}
