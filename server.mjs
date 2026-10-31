import {sourceStatus} from './integrations.mjs';
import {createMonitor} from './monitor.mjs';
import {recentImportantNews} from './news-policy.mjs';
import {allowTestRequest,sendTelegramTest} from './telegram-test.mjs';
import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ist,iso,hourSlot} from './core.mjs';
const env=process.env, dir=resolve(env.DATA_DIR||'data'), started=Date.now();
const poll=Math.max(30,Number(env.POLL_SECONDS)||30)*1000;
await mkdir(dir,{recursive:true});
const file=resolve(dir,'state.json');
let s={quotes:{},news:[],history:[],sent:{},outbox:[],events:[],anchors:{},lastPoll:null,errors:{}};
try{s={...s,...JSON.parse(await readFile(file,'utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
const {config,refresh,hourly,deliver,event}=createMonitor(s,env,save);
async function save(){await writeFile(file+'.tmp',JSON.stringify(s));await rename(file+'.tmp',file);}
let busy=false,nextPoll=0;
async function tick(){
  if(busy)return;busy=true;
  try{
    const now=Date.now();
    if(now>=nextPoll||s.priceCheckSlot!==hourSlot(now)){await refresh(now);nextPoll=Date.now()+poll;}
    hourly(now);
    // Expire change messages from previous IST days instead of sending a backlog of obsolete prices.
    s.outbox=s.outbox.filter(x=>!/^\d{4}-/.test(x.id)||x.id.startsWith(ist(now).date));
    s.sent=Object.fromEntries(Object.entries(s.sent).filter(([,at])=>now-Date.parse(at)<8*86400000));
    await save();await deliver(Date.now());
  }catch{event('Monitor error; retrying on next cycle');}finally{busy=false;}
}
const html=await readFile(new URL('./dist/index.html',import.meta.url));
const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"};
  if(req.url==='/api/telegram-test'){
    if(!allowTestRequest(req)){res.writeHead(req.method==='POST'?403:405,headers);res.end();return;}
    if(busy){res.writeHead(409,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({message:'Monitor is busy. Try again in a few seconds.'}));return;}
    busy=true;
    try{const result=await sendTelegramTest(s,env,save);res.writeHead(result.status,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({message:result.message}));}
    catch{res.writeHead(503,headers);res.end();}finally{busy=false;}
    return;
  }
  if(req.method!=='GET'){res.writeHead(405,headers);res.end();return;}
  if(req.url==='/api/status'){
    res.writeHead(200,{...headers,'Content-Type':'application/json'});
    res.end(JSON.stringify({...s,sources:sourceStatus(s),newsFeeds:undefined,news:recentImportantNews(s.news||[]),anchors:undefined,lastPrices:undefined,sent:undefined,outbox:undefined,config,pollSeconds:poll/1000,pendingMessages:s.outbox.length,serverTime:iso(Date.now()),startedAt:iso(started)}));return;
  }
  if(req.url!=='/'&&req.url!=='/index.html'){res.writeHead(404,headers);res.end('Not found');return;}
  res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});res.end(html);
});
server.listen(Number(env.PORT)||3000,env.HOST||'127.0.0.1',()=>console.log('Metals Watch listening at http://'+(env.HOST||'127.0.0.1')+':'+(Number(env.PORT)||3000)));
await tick();
const timer=setInterval(tick,15000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);server.close(()=>process.exit(0));});
