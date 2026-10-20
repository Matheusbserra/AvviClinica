import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';import {createHmac} from 'node:crypto';import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-whatsapp-lab-'));
const write=(name,source)=>fs.writeFileSync(path.join(dir,name),source);
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
try {
 write('assistant.mjs',compile(fs.readFileSync('lib/whatsappLabAssistant.ts','utf8')));
 write('lab.mjs',compile(fs.readFileSync('lib/whatsappLab.ts','utf8').replace('"./whatsappLabAssistant"','"./assistant.mjs"')));
 write('access.mjs',`export async function resolveAccess(request){const role=request.headers.get('x-test-role');return ['admin','standard'].includes(role)?{role}:null;}export function sameOrigin(request){return request.headers.get('origin')===new URL(request.url).origin;}`);
 write('route.mjs',compile(fs.readFileSync('app/api/follow-up/lab/route.ts','utf8').replace('"@/lib/accessServer"','"./access.mjs"').replace('"@/lib/whatsappLab"','"./lab.mjs"').replace('"@/lib/whatsappLabAssistant"','"./assistant.mjs"')));
 write('after.mjs','export const pending=[]; export function after(callback){pending.push(callback);}');
 write('webhook.mjs',compile(fs.readFileSync('app/api/follow-up/lab/webhook/route.ts','utf8').replace('"next/server"','"./after.mjs"').replace('"@/lib/whatsappLab"','"./lab.mjs"').replace('"@/lib/whatsappLabAssistant"','"./assistant.mjs"')));
 Object.assign(process.env,{AVVI_WHATSAPP_LOCAL_TEST:'true',AVVI_WHATSAPP_LAB_DIRECTORY:path.join(dir,'private')});delete process.env.VERCEL;
 const lab=await import(pathToFileURL(path.join(dir,'lab.mjs'))),assistant=await import(pathToFileURL(path.join(dir,'assistant.mjs'))),route=await import(pathToFileURL(path.join(dir,'route.mjs')));
 let graphCalls=0,aiCalls=0,aiFailure=false,aiMalformed=false,holdAI=false,startAI,releaseAI;const requests=[];let templates=[{id:'t',name:'hello_world',language:'en_US',status:'APPROVED',category:'UTILITY'}];
 globalThis.fetch=async(raw,init={})=>{
  const url=new URL(raw);assert.ok(['graph.facebook.com','api.openai.com'].includes(url.hostname),'Unexpected network call');const body=init.body?JSON.parse(init.body):undefined;requests.push({host:url.hostname,path:url.pathname,body});
  if(url.hostname==='api.openai.com'){
   aiCalls++;assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(init.headers.Authorization,'Bearer isolated-ai');assert.equal(JSON.stringify(body).includes('paciente@example.test'),false);assert.equal(JSON.stringify(body).includes('123.456.789-00'),false);
   if(holdAI){startAI();await new Promise(resolve=>releaseAI=resolve);holdAI=false;}
   if(aiFailure)return Response.json({error:'isolated'},{status:500});
   return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:aiMalformed?'invalid':JSON.stringify({reply:'Sou o assistente virtual da AVVI Clínica. Estamos no Shopping da Ilha, Torre 2, sala 1415.',handoff:false})}]}]});
  }
  if((init.method??'GET')==='GET'&&url.pathname.endsWith('/123456'))return Response.json({id:'123456',display_phone_number:'+1 555 000 0000',verified_name:'Teste isolado'});
  if(url.pathname.endsWith('/message_templates')){if(init.method==='POST'){templates.push({id:'new',name:body.name,language:body.language,status:'PENDING',category:'UTILITY'});return Response.json({id:'new',status:'PENDING'});}return Response.json({data:templates});}
  assert.ok(url.pathname.endsWith('/messages'));graphCalls++;assert.equal(body.to,'5598999990000');assert.equal(init.headers.Authorization,'Bearer isolated-meta');return Response.json({contacts:[{input:body.to,wa_id:'559899990000'}],messages:[{id:'provider-'+graphCalls}]});
 };
 let snapshot=await lab.labSnapshot();assert.equal(snapshot.messages.length,0);assert.equal(snapshot.config.tokenConfigured,false);
 snapshot=await lab.saveLabConfig({token:'isolated-meta',phoneId:'123456',businessId:'1234567',appSecret:'isolated-secret',verifyToken:'isolated-verification-token',testPhone:'55 (98) 99999-0000',consent:false,assistant:true});
 for(const secret of ['isolated-meta','isolated-secret'])assert.equal(JSON.stringify(snapshot).includes(secret),false);
 await assert.rejects(lab.sendLabMessage({transport:'whatsapp',id:'blocked',text:'Olá'}),/autorização/);
 await lab.saveLabConfig({consent:true});await assert.rejects(lab.sendLabMessage({transport:'whatsapp',id:'outside',text:'Olá'}),/24 horas/);
 await lab.changeLabMode('whatsapp','assistant');
 snapshot=await lab.sendLabMessage({transport:'whatsapp',id:'template',text:'Modelo de teste',template:{name:'hello_world',language:'en_US',parameters:[]}});assert.equal(graphCalls,1);assert.equal(snapshot.channels.whatsapp.mode,'assistant','Opening template must leave automation ready for the reply');
 await lab.sendLabMessage({transport:'whatsapp',id:'template',text:'Modelo de teste',template:{name:'hello_world',language:'en_US',parameters:[]}});assert.equal(graphCalls,1);
 await lab.rehearseLabInbound('Onde fica a clínica?','simulated-1');snapshot=await lab.labSnapshot();assert.ok(snapshot.messages.some(item=>item.source==='base'&&item.status==='simulated'));assert.equal(graphCalls,1);assert.equal(aiCalls,0);assert.equal(snapshot.channels.whatsapp.lastInboundAt,undefined);
 await assert.rejects(lab.sendLabMessage({transport:'whatsapp',id:'still-outside',text:'Olá'}),/24 horas/);
 const payload=(id,text,patch={})=>({entry:[{changes:[{value:{metadata:{phone_number_id:'123456'},messages:[{id,from:'5598999990000',timestamp:String(Math.floor(Date.now()/1000)),text:{body:text},...patch}]}}]}]});
 async function deliver(body){const raw=JSON.stringify(body);return lab.acceptLabWebhook(raw,'sha256='+createHmac('sha256','isolated-secret').update(raw).digest('hex'));}
 await assert.rejects(lab.acceptLabWebhook(JSON.stringify(payload('bad','oi')),'invalid'),/Assinatura/);assert.equal(await deliver(payload('unknown','oi',{from:'5598988880000'})),false);assert.equal(await deliver(payload('no-sender','oi',{from:undefined})),false);assert.equal(await deliver(payload('future','oi',{timestamp:String(Math.floor(Date.now()/1000)+300)})),false);
 assert.equal(await deliver(payload('recipient-waid','Olá do número de teste',{from:'559899990000'})),true,'Accept only the recipient alias confirmed by the authenticated Meta response');
 await lab.changeLabMode('whatsapp','assistant');await deliver(payload('no-ai','Onde fica?'));await lab.processLabReplies();snapshot=await lab.labSnapshot();assert.equal(snapshot.channels.whatsapp.mode,'human');assert.match(snapshot.channels.whatsapp.error,/chave da IA/);assert.equal(graphCalls,1,'No fake AI reply is sent on WhatsApp');
 await lab.saveLabConfig({aiKey:'isolated-ai'});await lab.changeLabMode('whatsapp','assistant');assert.equal(await deliver(payload('real-1','Onde fica? Meu e-mail é paciente@example.test e CPF 123.456.789-00')),true);assert.equal(await deliver(payload('real-1','duplicate')),false);
 await Promise.all([lab.processLabReplies(),lab.processLabReplies()]);assert.equal(aiCalls,1);assert.equal(graphCalls,2);snapshot=await lab.labSnapshot();assert.equal(snapshot.messages.find(item=>item.id==='reply-real-1').source,'openai');assert.equal(snapshot.config.aiConfigured,true);assert.equal(JSON.stringify(snapshot).includes('isolated-ai'),false);
 await deliver({entry:[{changes:[{value:{metadata:{phone_number_id:'123456'},statuses:[{id:'provider-2',status:'read'},{id:'provider-2',status:'sent'}]}}]}]});assert.equal((await lab.labSnapshot()).messages.find(item=>item.providerId==='provider-2').status,'read');
 await deliver(payload('human','Quero atendimento humano'));await lab.processLabReplies();assert.equal(aiCalls,1);assert.equal((await lab.labSnapshot()).channels.whatsapp.mode,'human');const afterHandoff=graphCalls;
 await deliver(payload('paused','Outra pergunta'));await lab.processLabReplies();assert.equal(graphCalls,afterHandoff);
 await lab.sendLabMessage({transport:'whatsapp',id:'manual',text:'Olá, aqui é a equipe.'});await lab.sendLabMessage({transport:'whatsapp',id:'manual',text:'Olá, aqui é a equipe.'});assert.equal(graphCalls,afterHandoff+1);await assert.rejects(lab.sendLabMessage({transport:'whatsapp',id:'manual',text:'different'}),/identificação/);
 await lab.changeLabMode('whatsapp','assistant');await deliver(payload('medical','Estou grávida, posso fazer botox?'));await lab.processLabReplies();assert.equal(aiCalls,1);assert.equal((await lab.labSnapshot()).channels.whatsapp.mode,'human');
 await deliver(payload('stop','SAIR'));await lab.processLabReplies();assert.equal((await lab.labSnapshot()).channels.whatsapp.optedOut,true);await assert.rejects(lab.sendLabMessage({transport:'whatsapp',id:'stopped',text:'Olá'}),/parar/);await assert.rejects(lab.changeLabMode('whatsapp','assistant'),/autorização/);
 await lab.changeLabMode('whatsapp','assistant',true);await lab.saveLabAppointment({service:'Avaliação QA',date:'2026-10-21',time:'09:30'});await deliver(payload('confirm','confirmo'));await lab.processLabReplies();assert.equal((await lab.labSnapshot()).appointment.status,'Confirmado');assert.equal(aiCalls,1);
 await deliver(payload('during-ai','Qual o endereço?'));holdAI=true;const began=new Promise(resolve=>startAI=resolve),processing=lab.processLabReplies();await began;const takeover=lab.changeLabMode('whatsapp','human');releaseAI();await Promise.all([processing,takeover]);assert.equal((await lab.labSnapshot()).messages.some(item=>item.id==='reply-during-ai'),false,'Human takeover cancels a still-generating AI reply');
 await lab.changeLabMode('whatsapp','assistant');aiFailure=true;await deliver(payload('ai-fails','Olá'));await lab.processLabReplies();snapshot=await lab.labSnapshot();assert.equal(snapshot.channels.whatsapp.mode,'human');assert.match(snapshot.channels.whatsapp.error,/consultar a IA/);aiFailure=false;
 await lab.changeLabMode('whatsapp','assistant');aiMalformed=true;await deliver(payload('bad-json','Olá'));await lab.processLabReplies();assert.equal((await lab.labSnapshot()).channels.whatsapp.mode,'human');aiMalformed=false;
 await lab.checkLabConnection();assert.equal((await lab.labSnapshot()).connection.name,'Teste isolado');await lab.labTemplates({name:'avvi_teste',language:'pt_BR',body:'Agendamento de teste.'});assert.equal((await lab.labSnapshot()).templates.find(item=>item.name==='avvi_teste').status,'PENDING');
 const providerFetch=globalThis.fetch;
 try {
  for(const [code,expected] of [['EACCES',/acesso à rede.*bloqueado/],['ENOTFOUND',/DNS/],['UND_ERR_CONNECT_TIMEOUT',/tempo/],['CERT_HAS_EXPIRED',/certificado/],['ECONNRESET',/conexão/]]) {
   globalThis.fetch=async()=>{throw new TypeError('fetch failed isolated-meta isolated-ai',{cause:Object.assign(new Error('private detail'),{code})});};
   for(const [operation,provider] of [[()=>lab.checkLabConnection(),'Meta'],[()=>assistant.labAssistantReply('Base', [{direction:'incoming',text:'Olá'}], 'isolated-ai','gpt-5.4-mini',false),'OpenAI']]) {
    await assert.rejects(operation(),error=>{assert.match(error.message,expected);assert.ok(error.message.includes(provider));assert.equal(/isolated-meta|isolated-ai|private detail|fetch failed/.test(error.message),false);return true;});
   }
  }
 } finally {globalThis.fetch=providerFetch;}
 const api=(body,role='admin',origin='http://localhost:3108',host='localhost:3108')=>new Request(`http://${host}/api/follow-up/lab`,{method:body?'POST':'GET',headers:{...(role?{'x-test-role':role}:{}),origin},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await route.GET(api(null,null))).status,401);assert.equal((await route.GET(api(null,'standard'))).status,403);assert.equal((await route.GET(api(null,'admin',undefined,'external.test'))).status,404);assert.equal((await route.POST(api({action:'clear'},'admin','https://attacker.test'))).status,403);
 assert.equal((await route.GET(api(null))).status,200);assert.equal((await route.POST(api({action:'inbound',transport:'whatsapp',text:'forged',id:'forged'}))).status,400);assert.equal((await route.POST(api({action:'send',transport:'rehearsal',text:'x',id:'x',template:{name:'bad/endpoint',language:'pt_BR',parameters:[]}}))).status,400);
 assert.equal((await lab.labWebhookVerification('wrong')),false);assert.equal((await lab.labWebhookVerification('isolated-verification-token')),true);
 const webhook=await import(pathToFileURL(path.join(dir,'webhook.mjs'))),deferred=await import(pathToFileURL(path.join(dir,'after.mjs')));
 const callback='http://localhost:3108/api/follow-up/lab/webhook';
 const handshake=await webhook.GET(new Request(callback+'?hub.mode=subscribe&hub.verify_token=isolated-verification-token&hub.challenge=meta-check'));
 assert.equal(handshake.status,200);assert.equal(await handshake.text(),'meta-check','Meta can verify the exact callback URL');
 assert.equal((await webhook.GET(new Request(callback+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=meta-check'))).status,403);
 const rawHello=JSON.stringify(payload('hello-through-route','Olá'));
 const inbound=()=>new Request(callback,{method:'POST',headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','isolated-secret').update(rawHello).digest('hex')},body:rawHello});
 assert.equal((await webhook.POST(new Request(callback,{method:'POST',body:rawHello}))).status,401);assert.equal(deferred.pending.length,0);
 assert.equal((await webhook.POST(inbound())).status,200);
 assert.equal((await webhook.POST(inbound())).status,200);
 snapshot=await lab.labSnapshot();const received=snapshot.messages.filter(item=>item.id==='hello-through-route');assert.equal(received.length,1);assert.equal(received[0].text,'Olá');assert.equal(received[0].transport,'whatsapp');assert.equal(received[0].status,'received');assert.ok(snapshot.lastWebhookAt);assert.equal(deferred.pending.length,1,'Only genuine new inbound queues automation');
 assert.ok(snapshot.webhookEvents.some(event=>event.result==='received'));assert.equal(snapshot.webhookEvents.at(-1).result,'duplicate');
 await deliver(payload('diagnostic-stranger','Private message',{from:'5598988880000'}));assert.equal((await lab.labSnapshot()).webhookEvents.at(-1).result,'sender-mismatch');
 await deliver(payload('diagnostic-future','Private message',{timestamp:String(Math.floor(Date.now()/1000)+300)}));assert.equal((await lab.labSnapshot()).webhookEvents.at(-1).result,'invalid-message');
 const beforeInvalid=(await lab.labSnapshot()).webhookEvents.length;await assert.rejects(lab.acceptLabWebhook(rawHello,'invalid'),/Assinatura/);assert.equal((await lab.labSnapshot()).webhookEvents.length,beforeInvalid,'Unsigned events cannot alter reception diagnostics');
 for(let n=0;n<25;n++)await deliver(payload('diagnostic-limit-'+n,'Private message',{from:'5598988880000'}));
 const diagnostics=(await lab.labSnapshot()).webhookEvents;assert.equal(diagnostics.length,20);assert.ok(diagnostics.every(event=>Object.keys(event).sort().join(',')==='at,result'),'Diagnostics contain no message, phone, signature, or credentials');
 for(const work of deferred.pending.splice(0))await work();
 const skewedHello=payload('clock-skew-hello','Olá com relógio local atrasado',{timestamp:String(Math.floor(Date.now()/1000)+110)});
 assert.equal(await deliver(skewedHello),true,'A signed message must survive the observed 110-second delay in the Windows clock');
 snapshot=await lab.labSnapshot();assert.ok(Date.parse(snapshot.messages.find(item=>item.id==='clock-skew-hello').at)<=Date.now(),'Clock tolerance must not extend the 24-hour window into the future');
 assert.equal(await deliver(skewedHello),false,'Clock tolerance preserves duplicate protection');
 await lab.processLabReplies();
 await assert.rejects(lab.saveLabConfig({aiProvider:'invalid'}),/Escolha/);await assert.rejects(lab.saveLabConfig({aiProvider:'local',localModel:'remote:cloud'}),/local válido/);
 const originalFetch=globalThis.fetch;const paidCallsBefore=aiCalls;let localCalls=0;
 globalThis.fetch=async(url,init={})=>{if(new URL(url).hostname!=='127.0.0.1')return originalFetch(url,init);assert.equal(new URL(url).origin,'http://127.0.0.1:11434');if(new URL(url).pathname==='/api/tags')return Response.json({models:[{name:'qwen3.5:4b',size:3400000000}]});localCalls++;return Response.json({done:true,message:{content:JSON.stringify({reply:'Sou o assistente virtual. Serviços: estética facial e corporal.',handoff:false,evidence:'Serviços: estética facial e corporal.'})}});};
 try {
  await lab.saveLabConfig({aiProvider:'local',localModel:'qwen3.5:4b'});await lab.changeLabMode('whatsapp','assistant');await deliver(payload('local-real-inbound','Quais serviços vocês fazem?'));await lab.processLabReplies();
  snapshot=await lab.labSnapshot();assert.equal(snapshot.messages.find(m=>m.id==='reply-local-real-inbound').source,'ollama');assert.equal(snapshot.config.aiProvider,'local');assert.equal(localCalls,1);assert.equal(aiCalls,paidCallsBefore,'Choosing local must never call the paid API even if a saved key exists');
  const modelsResponse=await route.POST(api({action:'local-models'}));assert.equal(modelsResponse.status,200);assert.equal((await modelsResponse.json()).localModels[0].name,'qwen3.5:4b');
 } finally {globalThis.fetch=originalFetch;await lab.saveLabConfig({aiProvider:'openai'});}
 const authorizedFetch=globalThis.fetch;
 try {
  globalThis.fetch=async(url,init)=>new URL(url).pathname.endsWith('/messages')?Response.json({error:{code:131005,message:'Access denied'}},{status:403}):authorizedFetch(url,init);
  await lab.changeLabMode('whatsapp','assistant');await deliver(payload('meta-access-denied','Qual o endereço?'));await lab.processLabReplies();snapshot=await lab.labSnapshot();
  assert.equal(snapshot.messages.find(m=>m.id==='reply-meta-access-denied').status,'failed');assert.equal(snapshot.channels.whatsapp.mode,'human','Denied Meta sending permission must pause the automatic assistant');assert.match(snapshot.channels.whatsapp.error,/131005.*token temporário/);
  const calls=aiCalls;await deliver(payload('while-permission-denied','Outra pergunta'));await lab.processLabReplies();assert.equal(aiCalls,calls,'Do not keep generating replies while Meta refuses the sending permission');
 } finally {globalThis.fetch=authorizedFetch;}
 assert.match(assistant.cleanLabText('paciente@example.test 123.456.789-00'),/removido/);assert.equal(assistant.labTriage('Quero falar com atendente').handoff,true);
 process.env.VERCEL='1';assert.equal(lab.labEnabled(),false);assert.equal((await route.GET(api(null))).status,404);await assert.rejects(lab.labSnapshot(),/prévia local/);delete process.env.VERCEL;
 await deliver(payload('stop-before-clear','SAIR'));await lab.processLabReplies();await lab.clearLabHistory();snapshot=await lab.labSnapshot();assert.equal(snapshot.channels.whatsapp.optedOut,true,'Clearing history must preserve opt-out');assert.equal(snapshot.channels.whatsapp.lastInboundAt,undefined);assert.equal(snapshot.messages.length,0);assert.equal(snapshot.config.tokenConfigured,true);
 console.log('PASS: isolated local persistence, secrets redacted, local/admin/origin boundaries and Vercel disabled; real Meta transport mocked, consent and genuine 24h inbound gate, templates and pending review, webhook HMAC/phone/timestamp guards, deduplication and delivery order, no simulated inbound unlock, Responses API store=false/schema/redaction, honest no-key rehearsal vs real AI, opt-out, human takeover (including mid-generation), clinical triage, provider failure, appointment confirmation and reload. No real network, patients or sends.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
