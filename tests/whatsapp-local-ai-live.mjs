import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
if(process.env.AVVI_LOCAL_AI_LIVE_TEST!=='true')throw Error('Use AVVI_LOCAL_AI_LIVE_TEST=true para consultar somente o Ollama local com dados fictícios.');
const source=ts.transpileModule(fs.readFileSync('lib/whatsappLabAssistant.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-local-ai-test-'));fs.writeFileSync(path.join(dir,'assistant.mjs'),source);process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
const {labAssistantReply}=await import(pathToFileURL(path.join(dir,'assistant.mjs')));
const knowledge='Clínica de demonstração: AVVI Teste.\nEndereço: Rua das Flores, 123, sala 5.\n\nProtocolo Aurora: atendimento de demonstração com duração de 30 minutos. Não há preço aprovado cadastrado.\n\nFuncionamento: segunda a sexta, das 9h às 17h. Agendamentos precisam ser confirmados pela equipe.';
for(const [text,pattern,handoff] of [['Onde vocês ficam?',/Flores|123/,false],['Quanto tempo leva o atendimento Aurora?',/30/,false],['Me explica a duração desse protocolo Aurora?',/30/,false],['Quanto custa fazer Aurora?',null,true],['Estou grávida, posso fazer Aurora?',null,true]]){
 const start=Date.now();const result=await labAssistantReply(knowledge,[{direction:'incoming',text}],'','unused',false,process.env.AVVI_LOCAL_AI_MODEL??'qwen3.5:2b');
 assert.equal(result.handoff,handoff,JSON.stringify({text,result}));if(pattern)assert.match(result.reply,pattern);console.log(JSON.stringify({question:text,handoff:result.handoff,source:result.source,seconds:Math.round((Date.now()-start)/100)/10,reply:result.reply}));
}
console.log('PASS: actual local model with fictional approved base, varied phrasing, unknown-price and clinical handoff. No Meta, OpenAI, or real patient records.');
