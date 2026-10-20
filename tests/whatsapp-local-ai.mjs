import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const source=ts.transpileModule(fs.readFileSync('lib/whatsappLabAssistant.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-local-ai-test-'));fs.writeFileSync(path.join(dir,'assistant.mjs'),source);process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
const ai=await import(pathToFileURL(path.join(dir,'assistant.mjs')));
let chatCalls=0,offline=false,malformed=false,truncated=false,unsupported=false;
const knowledge='Clínica: AVVI Clínica.\nEndereço: Rua Exemplo, 100.\n\nProtocolo Aurora: atendimento demonstrativo com duração de 30 minutos, realizado pela equipe.';
globalThis.fetch=async(raw,init={})=>{
 const url=new URL(raw);assert.equal(url.origin,'http://127.0.0.1:11434','No paid API, cloud, or arbitrary destination is used');assert.equal(init.redirect,'error');assert.equal(init.headers?.Authorization,undefined);
 if(offline)throw new TypeError('fetch failed',{cause:{code:'ECONNREFUSED'}});
 if(url.pathname==='/api/tags')return Response.json({models:[{name:'qwen3.5:4b',size:3400000000},{name:'remote:cloud',size:1},{name:'hidden:4b',remote_host:'https://remote.example.test',size:1}]});
 assert.equal(url.pathname,'/api/chat');chatCalls++;const body=JSON.parse(init.body);assert.equal(body.model,'qwen3.5:4b');assert.equal(body.stream,false);assert.equal(body.think,false);assert.equal(body.format.properties.handoff.type,'boolean');assert.equal(body.options.num_ctx,4096);assert.ok(body.messages[0].content.includes(knowledge.split('\n\n')[1]));assert.equal(JSON.stringify(body).includes('private@example.test'),false);
 return Response.json({done:true,done_reason:truncated?'length':'stop',message:{content:malformed?'invalid':JSON.stringify({reply:'Sou o assistente virtual da AVVI Clínica. O Protocolo Aurora tem duração de 30 minutos.',handoff:false,evidence:unsupported?'': 'Protocolo Aurora: atendimento demonstrativo com duração de 30 minutos, realizado pela equipe.'})}});
};
assert.deepEqual((await ai.labLocalModels()).map(m=>m.name),['qwen3.5:4b']);
for(const text of ['Como é o Protocolo Aurora?','Pode me explicar esse atendimento Aurora?','Quanto tempo dura o Aurora? Meu email é private@example.test']){
 const reply=await ai.labAssistantReply(knowledge,[{direction:'incoming',text}],'never-use-paid-key','gpt-model',false,'qwen3.5:4b');assert.equal(reply.source,'ollama');assert.equal(reply.handoff,false);assert.match(reply.reply,/30 minutos/);
}
let before=chatCalls;const triage=await ai.labAssistantReply(knowledge,[{direction:'incoming',text:'Estou grávida, posso fazer?'}],'','unused',false,'qwen3.5:4b');assert.equal(triage.handoff,true);assert.equal(chatCalls,before);
unsupported=true;assert.equal((await ai.labAssistantReply(knowledge,[{direction:'incoming',text:'Qual preço?'}],'','unused',false,'qwen3.5:4b')).handoff,true);unsupported=false;
malformed=true;await assert.rejects(ai.labAssistantReply(knowledge,[{direction:'incoming',text:'Aurora'}],'','unused',false,'qwen3.5:4b'),/resposta válida/);malformed=false;
truncated=true;await assert.rejects(ai.labAssistantReply(knowledge,[{direction:'incoming',text:'Aurora'}],'','unused',false,'qwen3.5:4b'),/completa/);truncated=false;
await assert.rejects(ai.labAssistantReply(knowledge,[{direction:'incoming',text:'Aurora'}],'','unused',false,'qwen3.5:missing'),/não instalado/);
for(const name of ['remote:cloud','https://elsewhere/model','../secret','host/model'])assert.equal(ai.validLocalModel(name),false);
offline=true;await assert.rejects(ai.labAssistantReply(knowledge,[{direction:'incoming',text:'Aurora'}],'never-use-paid-key','gpt-model',false,'qwen3.5:4b'),/IA local.*iniciada/);
console.log('PASS: local-only fixed endpoint, no paid/cloud fallback or credentials, installed-model validation, structured output, varied questions and approved evidence, personal-data scrubbing, clinical handoff, offline/malformed/truncated guards. Fictional data; no real network.');
