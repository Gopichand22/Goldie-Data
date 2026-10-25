import {iso,moved} from './core.mjs';
import {createIntegrations} from './integrations.mjs';
import {fetchJewellers,JEWELLERS} from './jewellers.mjs';
import {fetchMintPrices} from './mint-prices.mjs';
export function createMonitor(s,env,save,request=fetch){
const free=env.FREE_FEEDS!=='false';
const config={metals:env.JEWELLER_FEEDS!=='false',spot:free&&env.INTERNATIONAL_SPOT!=='false',
  news:free,telegram:!!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_CHAT_ID};
delete s.etfs;delete s.errors.ETFs;
s.spot ||= {};s.spotInr ||= {};s.feedChecked ||= {};s.newsFeeds ||= {};

const integrations=createIntegrations(s,env,request);
function event(text){s.events.unshift({at:iso(Date.now()),text});s.events=s.events.slice(0,60);}
function enqueue(id,text){if(!s.sent[id]&&!s.outbox.some(x=>x.id===id))s.outbox.push({id,text,tries:0,next:0});}
async function refresh(now){
  if(config.spot)await integrations.metals(now);
  if(config.metals)await fetchJewellers(s,now,request,Math.max(300,Number(env.JEWELLER_POLL_SECONDS)||900)*1000);
  if(config.metals)await fetchMintPrices(s,now,request);
  for(const site of JEWELLERS){
    const entry=s.jewellers?.[site.id];if(entry?.status!=='available')continue;
    for(const [metal,price] of Object.entries(entry.rates)){
      const id='jeweller/'+site.id+'/'+metal,anchor=s.anchors[id];
      if(anchor===undefined)s.anchors[id]=price;
      else if(moved(anchor,price,Number(env.ALERT_PERCENT)||0)&&config.telegram){
        enqueue('move/'+id+'/'+entry.checkedAt+'/'+price,site.name+' '+metal+': INR '+price+'/g\\nWebsite rate; GST/location may be unspecified.\\n'+site.url);
        s.anchors[id]=price;
      }
    }
  }
  if(config.news)await integrations.news(now);
  s.history=s.history.filter(x=>Date.parse(x.at)>now-7*86400000).slice(-20000);
  s.lastPoll=iso(now);
}
async function deliver(now){
  if(!config.telegram)return;
  for(const item of s.outbox.filter(x=>x.next<=now).slice(0,3)){
    try{
      const r=await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:item.text,link_preview_options:{is_disabled:true}}),signal:AbortSignal.timeout(8000)});
      const j=await r.json();
      if(!r.ok||!j.ok){const error=new Error('Telegram rejected delivery');error.retry=j.parameters?.retry_after;throw error;}
      s.sent[item.id]=iso(now);s.outbox=s.outbox.filter(x=>x.id!==item.id);event('Telegram delivered: '+item.id);delete s.errors.Telegram;await save();
    }catch(e){item.tries++;item.next=now+Math.max(Number(e.retry)||0,Math.min(3600,30*2**Math.min(item.tries,7)))*1000;s.errors.Telegram={at:iso(now),message:'Delivery failed; retry queued'};await save();}
  }
}

return {config,refresh,deliver,enqueue,event};
}

