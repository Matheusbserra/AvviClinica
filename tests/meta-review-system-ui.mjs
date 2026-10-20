import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createReviewServer} from '../scripts/meta-review-server.mjs';
import {navigationButton} from './navigation-helper.mjs';

// Isolated accounts, snapshot and laboratory. Never loads clinic data or Meta keys.
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'avvi-review-ui-'));
const require=createRequire(import.meta.url),originalEnv={...process.env};
const login='meta-ui-qa',password='isolated-review-ui-password';
let child,proxy,browser;
try {
 const fixture={patients:[{id:'qa-p',name:'Contato Fictício QA',phone:'5598999990000',cpf:'private-cpf',notes:'private-note'}],professionals:[{id:'qa-pro',name:'Profissional QA',active:true}],services:[{id:'qa-service',name:'Avaliação QA',price:100,durationMinutes:30,active:true}],appointments:[],financial_entries:[{id:'private-finance',amount:98765}]};
 const sourceFile=path.join(directory,'snapshot.json');await fs.writeFile(sourceFile,JSON.stringify(fixture));
 Object.assign(process.env,{AVVI_SESSION_SECRET:'isolated-review-ui-session-secret-0000000000',AVVI_WHATSAPP_LOCAL_TEST:'true',AVVI_LOCAL_HISTORICAL_PREVIEW:'true',AVVI_LOCAL_ACCOUNTS_DIRECTORY:path.join(directory,'accounts'),AVVI_WHATSAPP_LAB_DIRECTORY:path.join(directory,'lab'),AVVI_LOCAL_PREVIEW_SNAPSHOT_FILE:sourceFile,NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',NEXT_PUBLIC_AVVI_PROTECTED_DATABASE:'false'});delete process.env.VERCEL;
 const modules=['access','accessServer','accountsServer'];
 for(const name of modules){let source=await fs.readFile('lib/'+name+'.ts','utf8');for(const dependency of modules)source=source.replaceAll('"./'+dependency+'"','"./'+dependency+'.mjs"');source=source.replace('"@supabase/supabase-js"',JSON.stringify(pathToFileURL(require.resolve('@supabase/supabase-js')).href));await fs.writeFile(path.join(directory,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
 const accounts=await import(pathToFileURL(path.join(directory,'accountsServer.mjs'))),auth=await import(pathToFileURL(path.join(directory,'accessServer.mjs')));
 await accounts.saveAccount({name:'Meta UI QA',login,password,role:'standard',tabs:['Follow Up','Follow Up: análise Meta']});
 const origin='http://127.0.0.1:3107';
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3107'],{env:process.env,windowsHide:true,stdio:'ignore'});
 child.once('error',error=>{throw error;});
 for(let attempt=0;attempt<80;attempt++){if(child.exitCode!==null)throw Error('A porta 3107 deve estar livre para o teste isolado.');try{if((await fetch(origin)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 const setup=await fetch(origin+'/api/follow-up/lab',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie:'avvi_access='+auth.signAccess({login:'admin',role:'admin'})},body:JSON.stringify({action:'config',config:{assistant:true,consent:false,knowledge:'Clínica fictícia Aurora. Endereço: Rua Fictícia, 100, São Luís.'}})});assert.equal(setup.status,200);
 proxy=createReviewServer({config:{enabled:true},targetPort:3107});await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+proxy.address().port;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/mathe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 // Regression: a late anonymous session check must not undo a completed login.
 let release;const pending=new Promise(resolve=>{release=resolve;}),firstAccess={value:true};
 await page.route('**/api/access',async route=>{if(route.request().method()==='GET'&&firstAccess.value){firstAccess.value=false;await pending;return route.fulfill({status:200,contentType:'application/json',body:'{"user":null}'});}return route.continue();});
 await page.goto(url);await page.getByRole('heading',{name:'Acesse o sistema',exact:true}).waitFor();
 await page.getByLabel('Login',{exact:true}).fill(login);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByRole('tab',{name:'Conversas',exact:true}).waitFor();release();
 assert.equal(new URL(page.url()).pathname,'/','Must remain in the original application root');
 await navigationButton(page,'Follow Up').waitFor();
 for(const name of ['Agenda','Financeiro','Contas','Anamnese','Cadastro de Pacientes'])assert.equal(await page.getByRole('navigation',{name:'Menu principal'}).getByRole('button',{name,exact:true,includeHidden:true}).count(),0,name);
 for(const name of ['Conversas','Automações','Próximos contatos','Histórico','Contatos','Conexão','Testes WhatsApp']){await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true');}
 await page.getByRole('tab',{name:'Contatos',exact:true}).click();await page.getByLabel('Buscar contato do Follow Up').fill('Contato Fictício QA');await page.getByText('Contato Fictício QA',{exact:true}).waitFor();
 const local=await page.request.get(url+'/api/local-preview/data');assert.equal(local.status(),200);const snapshot=(await local.json()).data;assert.equal(snapshot.patients[0].cpf,undefined);assert.deepEqual(snapshot.financial_entries,[]);
 await page.getByRole('tab',{name:'Automações',exact:true}).click();await page.getByRole('button',{name:'Nova automação',exact:true}).click();await page.getByLabel('Nome da automação',{exact:true}).fill('Conversa Fictícia QA');await page.getByRole('button',{name:'Prévia',exact:true}).click();await page.getByRole('dialog',{name:'Prévia da conversa'}).waitFor();await page.getByRole('button',{name:'Fechar prévia da conversa'}).click();await page.getByRole('button',{name:'Voltar ao Follow Up'}).click();
 await page.getByRole('tab',{name:'Testes WhatsApp',exact:true}).click();const lab=page.getByRole('region',{name:'Laboratório WhatsApp'});await lab.waitFor();
 const section=async name=>lab.getByRole('button',{name,exact:true}).click();
 await section('Configuração');for(const name of ['Token temporário da Meta','Segredo do aplicativo Meta','Chave da API OpenAI'])assert.equal(await lab.getByLabel(name,{exact:true}).count(),0,name);assert.equal(await lab.getByRole('button',{name:'Salvar configuração local'}).count(),0);
 await section('Agendamento de teste');await lab.getByLabel('Serviço do agendamento de teste',{exact:true}).fill('Avaliação Fictícia QA');await lab.getByLabel('Data do agendamento de teste',{exact:true}).fill('2026-11-01');await lab.getByLabel('Hora do agendamento de teste',{exact:true}).fill('10:00');await lab.getByRole('button',{name:'Salvar agendamento de teste',exact:true}).click();await lab.getByRole('status').filter({hasText:'salvo'}).waitFor();
 await section('Conversa');await lab.getByLabel('Mensagem do paciente no ensaio',{exact:true}).fill('confirmo');await lab.getByRole('button',{name:'Testar resposta',exact:true}).click();await lab.getByText('O agendamento de demonstração de Avaliação Fictícia QA',{exact:false}).waitFor();
 await lab.getByRole('button',{name:'Assumir atendimento',exact:true}).click();await lab.getByLabel('Resposta manual da equipe',{exact:true}).fill('Resposta fictícia da equipe QA');await lab.getByRole('button',{name:'Enviar resposta manual',exact:true}).click();await lab.getByText('Resposta fictícia da equipe QA',{exact:true}).waitFor();
 await page.reload();await page.getByRole('tab',{name:'Testes WhatsApp',exact:true}).click();await section('Agendamento de teste');await lab.getByText('Paciente de demonstração · Confirmado',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'Original mobile layout must fit');
 assert.equal((await page.request.get(url+'/api/accounts')).status(),404);assert.equal((await page.request.get(origin+'/api/accounts')).status(),403);
 await page.setViewportSize({width:1440,height:1000});await navigationButton(page,'Follow Up').waitFor();await page.getByRole('button',{name:'Sair',exact:true}).filter({visible:true}).click();await page.getByRole('heading',{name:'Acesse o sistema',exact:true}).waitFor();assert.equal((await page.request.get(url+'/api/follow-up/lab')).status(),401);
 assert.deepEqual(JSON.parse(await fs.readFile(sourceFile,'utf8')),fixture,'No clinical source mutation');assert.deepEqual(errors,[]);
 console.log('PASS: original system root/layout through review proxy; late session response, Follow Up-only navigation, seven tabs, contacts, actual automation builder/preview, secret restrictions, rehearsal appointment/manual response/reload, mobile, API boundaries, logout. Isolated fictional data; no Meta/cloud calls.');
}finally{
 if(browser)await browser.close();if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}
 for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);
 await fs.rm(directory,{recursive:true,force:true});
}
