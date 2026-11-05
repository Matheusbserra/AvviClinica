import assert from 'node:assert/strict';
import {navigationButton} from './navigation-helper.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const origin=process.env.AVVI_TEST_URL??'http://127.0.0.1:3107';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{
 const context=await browser.newContext(),page=await context.newPage(),requests=[];
 if(!process.env.AVVI_TEST_ADMIN_SESSION)throw Error('Use a sessão fictícia da prévia isolada.');
 await context.addCookies([{name:'avvi_access',value:process.env.AVVI_TEST_ADMIN_SESSION,url:origin,httpOnly:true,sameSite:'Strict'}]);
 page.on('request',request=>requests.push(request.url()));
 await page.goto(origin);await navigationButton(page,'Sair').waitFor();
 assert.equal(await navigationButton(page,'Follow Up').count(),0);
 await navigationButton(page,'Pós-procedimento').click();await page.getByRole('tab',{name:'Hoje',exact:true}).waitFor();
 assert.equal(requests.some(url=>url.includes('/api/follow-up/')),false,'Browsing the system and post-procedure must never mount the disabled Follow Up or query its API');
 for(const route of ['/api/follow-up/status','/api/follow-up/leads','/api/follow-up/lab','/meta-review']){
  const response=await context.request.get(origin+route);assert.equal(response.status(),503);assert.equal((await response.json()).disabled,true);
 }
 console.log('PASS: Follow Up absent from the actual administrator menu, no Follow Up network requests, direct routes blocked and Pós-procedimento available.');
}finally{await browser.close();}
