import http from 'node:http';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const folder = path.join(root, '.avvi-local', 'meta-review');
export async function prepareReview(directory = folder) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, 'access.json');
  let existing;
  try { existing = JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = { enabled: existing?.enabled ?? true, createdAt: existing?.createdAt ?? new Date().toISOString() };
  await fs.writeFile(file, JSON.stringify(config), { mode: 0o600 });
  return config;
}
export function createReviewServer({ config, targetPort = 3108 }) {
 const actionTimes=[],templateTimes=[],staticAssets=new Set();
 const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
 const apiPaths=new Set(['/api/access','/api/access/data','/api/local-preview/data',...['status','leads','messages','history','lab','publish'].map(name=>'/api/follow-up/'+name)]);
 return http.createServer(async(request,response)=>{
  const reply=(status,body,extra={})=>{response.writeHead(status,{...common,...extra});response.end(body);};
  const url=new URL(request.url,'http://localhost'),isPage=['/','/meta-review'].includes(request.url),isAPI=apiPaths.has(url.pathname);
  const isImage=url.pathname==='/logo-avvi.png'||url.pathname==='/_next/image'&&url.searchParams.get('url')==='/logo-avvi.png'&&/^\d+$/.test(url.searchParams.get('w')||'')&&url.searchParams.get('q')==='75';
  const isStatic=staticAssets.has(url.pathname)&&!url.search;
  if(!config.enabled||(!isPage&&!isAPI&&!isImage&&!isStatic)||!['GET','POST','DELETE'].includes(request.method))return reply(404,'Not found');
  if(!isAPI&&request.method!=='GET')return reply(405,'Method not allowed');
  if(isAPI&&[...url.searchParams.keys()].some(key=>!['entity','sync','leadId','before','check'].includes(key)))return reply(404,'Not found');
  try{
   let body;
   if(request.method!=='GET'){
    const host=request.headers.host;
    if(!host||![ 'https://'+host,'http://'+host ].includes(request.headers.origin)||request.headers['sec-fetch-site']&&request.headers['sec-fetch-site']!=='same-origin')return reply(403,JSON.stringify({error:'Origem inválida.'}),{'Content-Type':'application/json'});
    if(request.method==='POST'&&!request.headers['content-type']?.startsWith('application/json'))return reply(415,'Use JSON');
    let bytes=0;const chunks=[];for await(const chunk of request){bytes+=chunk.length;if(bytes>1000000)return reply(413,'Solicitação muito grande');chunks.push(chunk);}body=Buffer.concat(chunks);
    const data=body.length?JSON.parse(body.toString()):{},now=Date.now();
    while(actionTimes[0]<now-60000)actionTimes.shift();if(actionTimes.length>=120)return reply(429,JSON.stringify({error:'Aguarde um minuto.'}),{'Content-Type':'application/json'});actionTimes.push(now);
    if(data.action==='create-template'){while(templateTimes[0]<now-3600000)templateTimes.shift();if(templateTimes.length>=3)return reply(429,JSON.stringify({error:'Limite de três modelos de demonstração por hora.'}),{'Content-Type':'application/json'});templateTimes.push(now);}
   }
   if(request.method==='DELETE'&&url.pathname!=='/api/access')return reply(405,'Method not allowed');
   const target=isPage?'/':url.pathname+url.search;
   const cookie=request.headers.cookie?.split(';').map(item=>item.trim()).find(item=>item.startsWith('avvi_access='));
   if(isAPI&&url.pathname!=='/api/access'){
    const permission=await fetch('http://127.0.0.1:'+targetPort+'/api/access',{headers:cookie?{cookie}:{},cache:'no-store',signal:AbortSignal.timeout(10000)}).then(result=>result.json());
    if(permission.user?.role!=='standard'||!permission.user.tabs?.includes('Follow Up: análise Meta'))return reply(401,JSON.stringify({error:'Entre com a conta de análise da Meta.'}),{'Content-Type':'application/json'});
   }
   const upstream=await fetch('http://127.0.0.1:'+targetPort+target,{method:request.method,headers:{...(isAPI?{'Content-Type':'application/json',origin:'http://127.0.0.1:'+targetPort}:{}),...(cookie&&cookie.length<12000?{cookie}:{})},...(body?.length?{body}:{}),signal:AbortSignal.timeout(150000),redirect:'error'});
   if(isPage){
    let html=await upstream.text();
    for(const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"?]+)"/g))staticAssets.add(match[1]);
    const nonce=Buffer.from(crypto.randomUUID()).toString('base64');html=html.replace(/<script\b/g,'<script nonce="'+nonce+'"');
    return reply(upstream.status,html,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'nonce-"+nonce+"'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
   }
   if(!isAPI){
    const buffer=Buffer.from(await upstream.arrayBuffer());
    if(url.pathname.endsWith('.css'))for(const match of buffer.toString().matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)){const asset=new URL(match[1],'http://localhost'+url.pathname);if(asset.pathname.startsWith('/_next/static/'))staticAssets.add(asset.pathname);}
    return reply(upstream.status,buffer,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream'});
   }
   const result=await upstream.json();
   if(target==='/api/access'&&result.user&&(result.user.role!=='standard'||!result.user.tabs?.includes('Follow Up: análise Meta')))return reply(403,JSON.stringify({error:'Use a conta exclusiva de análise da Meta.'}),{'Content-Type':'application/json','Set-Cookie':'avvi_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
   const session=target==='/api/access'?upstream.headers.get('set-cookie'):null;
   return reply(upstream.status,JSON.stringify(result),{'Content-Type':'application/json; charset=utf-8',...(session?{'Set-Cookie':session.replace(/; Secure/gi,'')+(request.headers.origin?.startsWith('https:')||request.headers['x-forwarded-proto']==='https'?'; Secure':'')}:{} )});
  }catch{return reply(503,JSON.stringify({error:'Ambiente local indisponível. Contate o responsável pelo app.'}),{'Content-Type':'application/json'});}
 });
}

async function main() {
  const config = await prepareReview();
  const server = createReviewServer({ config });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3112, '127.0.0.1', resolve); });
  const existingPid = Number(process.env.AVVI_META_REVIEW_REUSE_TUNNEL_PID);
  if (Number.isInteger(existingPid) && existingPid > 0) {
    // Used only during an in-place update, with the exact cloudflared process
    // verified by the local launcher. It preserves the already shared URL.
    process.kill(existingPid, 0);
    const existing = JSON.parse(await fs.readFile(path.join(folder, 'tunnel.json'), 'utf8'));
    if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(existing.url)) throw Error('URL inválida.');
    await fs.writeFile(path.join(folder, 'tunnel.json'), JSON.stringify({ ...existing, pid: process.pid, tunnelPid: existingPid }));
    const stop = () => { server.close(); try { process.kill(existingPid); } catch { /* Already stopped. */ } };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    console.log('Follow Up no sistema original: ' + existing.url);
    return;
  }
  const child = spawn(path.join(root, '.avvi-local', 'tools', 'cloudflared.exe'), ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:3112'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let found = false, buffer = '';
  child.stderr.on('data', async chunk => {
    buffer = (buffer + chunk.toString()).slice(-16000);
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match && !found) {
      found = true;
      await fs.writeFile(path.join(folder, 'tunnel.json'), JSON.stringify({ url: match[0], pid: process.pid, tunnelPid: child.pid, createdAt: new Date().toISOString() }));
      console.log('Follow Up para análise: ' + match[0]);
    }
  });
  const cleanup = () => { child.kill(); server.close(); };
  child.on('error', cleanup); child.on('exit', () => { server.close(); });
  process.on('SIGTERM', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(0); });
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main().catch(() => { console.error('Não foi possível iniciar o acesso de análise.'); process.exitCode = 1; });
