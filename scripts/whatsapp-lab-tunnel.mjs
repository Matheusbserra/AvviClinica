import http from 'node:http';
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const webhook='/api/follow-up/lab/webhook';
export function createWebhookProxy(targetPort=3108){
 if(!Number.isInteger(targetPort)||targetPort<1||targetPort>65535)throw Error('Porta de prévia inválida.');
 return http.createServer(async(request,response)=>{
  const url=new URL(request.url,'http://localhost');
  if(url.pathname!==webhook||!['GET','POST'].includes(request.method)){response.writeHead(404);response.end('Not found');return;}
  let bytes=0;const chunks=[];
  try{
   for await(const chunk of request){bytes+=chunk.length;if(bytes>1000000){response.writeHead(413);response.end('Payload too large');return;}chunks.push(chunk);}
   const headers={'content-type':'application/json'};if(request.headers['x-hub-signature-256'])headers['x-hub-signature-256']=request.headers['x-hub-signature-256'];
   const upstream=await fetch(`http://127.0.0.1:${targetPort}${webhook}${url.search}`,{method:request.method,headers,...(request.method==='POST'?{body:Buffer.concat(chunks)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
   response.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')??'text/plain','cache-control':'no-store'});response.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{if(!response.headersSent)response.writeHead(502);response.end('Local webhook unavailable');}
 });
}
async function main(){
 const root=fileURLToPath(new URL('..',import.meta.url)),targetPort=Number(process.argv[2]??3108),listenPort=Number(process.argv[3]??3110);
 if(!Number.isInteger(listenPort)||listenPort<1||listenPort>65535)throw Error('Porta do proxy inválida.');
 const executable=process.env.AVVI_CLOUDFLARED_PATH??path.join(root,'.avvi-local','tools',process.platform==='win32'?'cloudflared.exe':'cloudflared');
 try{await fs.access(executable);}catch{throw Error('Cloudflared não encontrado. Prepare a ferramenta em .avvi-local/tools ou configure AVVI_CLOUDFLARED_PATH. Documentação: https://developers.cloudflare.com/tunnel/downloads/');}
 const server=createWebhookProxy(targetPort);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(listenPort,'127.0.0.1',resolve);});
 const statusPath=path.join(root,'.avvi-local','whatsapp-lab','tunnel.json');
 const child=spawn(executable,['tunnel','--no-autoupdate','--url',`http://127.0.0.1:${listenPort}`],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let found=false,buffer='';child.stderr.on('data',async chunk=>{buffer=(buffer+chunk.toString()).slice(-16000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(match&&!found){found=true;const url=match[0]+webhook;await fs.mkdir(path.dirname(statusPath),{recursive:true});await fs.writeFile(statusPath,JSON.stringify({url,pid:process.pid,createdAt:new Date().toISOString()}));console.log('Webhook HTTPS de teste: '+url);console.log('Somente o webhook está acessível pelo túnel. Mantenha este processo aberto durante o teste.');}});
 const cleanup=async()=>{child.kill();server.close();await fs.unlink(statusPath).catch(()=>{});};
 child.on('error',async()=>{console.error('Não foi possível iniciar o túnel.');await cleanup();process.exitCode=1;});
 child.on('exit',async code=>{await cleanup();if(code)console.error('O túnel encerrou. Confira a conexão de rede e inicie novamente.');});
 process.on('SIGINT',async()=>{await cleanup();process.exit(0);});process.on('SIGTERM',async()=>{await cleanup();process.exit(0);});
 console.log('Iniciando HTTPS temporário para a prévia na porta '+targetPort+'…');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
