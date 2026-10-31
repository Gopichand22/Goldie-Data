import {sourceStatus} from '../integrations.mjs';
import {timingSafeEqual,randomUUID} from 'node:crypto';
import {createMonitor} from '../monitor.mjs';
import {hourSlot,ist,iso} from '../core.mjs';
import {recentImportantNews} from '../news-policy.mjs';
export const emptyState=()=>({quotes:{},news:[],history:[],sent:{},outbox:[],events:[],anchors:{},lastPoll:null,errors:{}});
export function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
export function protect(req,res,cron=false,env=process.env){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(!cron)return true;
  const secret=env.CRON_SECRET;
  if(!secret||secret.length<20){res.statusCode=503;res.end('Server secret not configured (minimum 20 characters)');return false;}
  const expected='Bearer '+secret;
  if(!equal(req.headers.authorization,expected)){res.statusCode=401;res.end('Unauthorized');return false;}
  return true;
}
export function database(env=process.env,request=fetch){
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Supabase not configured');
  const base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:')throw Error('Supabase requires HTTPS');
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
  async function rpc(name,args){const r=await request(new URL('/rest/v1/rpc/'+name,base),{method:'POST',headers,body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Database request failed');return r.json();}
  return {rpc,async read(){return {...emptyState(),...await rpc('metals_read',{})};}};
}
export function publicStatus(s,env=process.env){
  const {config}=createMonitor(s,env,async()=>{});
  return {...s,sources:sourceStatus(s),newsFeeds:undefined,news:recentImportantNews(s.news||[]),anchors:undefined,lastPrices:undefined,sent:undefined,outbox:undefined,config,pollSeconds:Math.max(30,Number(env.POLL_SECONDS)||30),pendingMessages:s.outbox.length,serverTime:iso(Date.now())};
}
export async function runCloud(env=process.env,db=database(env),now=Date.now(),request=fetch){
  const token=randomUUID();if(!await db.rpc('metals_claim',{p_token:token}))return {skipped:true,reason:'Another run holds the lease'};
  try{
    const s=await db.read();s.monitorStartedAt ||= iso(now);
    const save=async()=>{if(!await db.rpc('metals_save',{p_token:token,p_state:s}))throw Error('Monitor lease expired');};
    const m=createMonitor(s,env,save,request);
    const interval=Math.max(30,Number(env.POLL_SECONDS)||30)*1000;
    if(!s.lastPoll||now-Date.parse(s.lastPoll)>=interval||s.priceCheckSlot!==hourSlot(now))await m.refresh(now);
    m.hourly(now);
    s.outbox=s.outbox.filter(x=>!/^\d{4}-/.test(x.id)||x.id.startsWith(ist(now).date));
    s.sent=Object.fromEntries(Object.entries(s.sent).filter(([,at])=>now-Date.parse(at)<8*86400000));
    s.lastRunAt=iso(now);await save();await m.deliver(Date.now());
    return {ok:true,lastPoll:s.lastPoll,pendingMessages:s.outbox.length,feedErrors:Object.keys(s.errors)};
  }finally{await db.rpc('metals_release',{p_token:token});}
}
