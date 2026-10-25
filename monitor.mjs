import {CITIES,iso,cityQuote,moved,stale} from './core.mjs';
import {fedNews,marketNews,mintNews,newsData,internationalQuote,spotQuote} from './feeds.mjs';
import {fetchJewellers,JEWELLERS} from './jewellers.mjs';
import {recentImportantNews} from './news-policy.mjs';
export function createMonitor(s,env,save,request=fetch){
const free=env.FREE_FEEDS!=='false';
const config={metals:env.JEWELLER_FEEDS!=='false',spot:free&&env.INTERNATIONAL_SPOT!=='false',
  news:free||!!env.NEWS_API_KEY||!!env.NEWSDATA_API_KEY,telegram:!!env.TELEGRAM_BOT_TOKEN&&!!env.TELEGRAM_CHAT_ID};
delete s.etfs;delete s.errors.ETFs;
s.spot ||= {};s.spotInr ||= {};s.feedChecked ||= {};s.newsFeeds ||= {};

function event(text){s.events.unshift({at:iso(Date.now()),text});s.events=s.events.slice(0,60);}
async function json(url,options={}){
  const r=await request(url,{...options,signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error(`Provider HTTP ${r.status}`);
  return r.json();
}
async function task(key,fn){try{await fn();delete s.errors[key];}catch(e){s.errors[key]={at:iso(Date.now()),message:e.message.startsWith('Provider HTTP')?e.message:'Feed response unavailable or invalid'};}}
function enqueue(id,text){if(!s.sent[id]&&!s.outbox.some(x=>x.id===id))s.outbox.push({id,text,tries:0,next:0});}
async function refresh(now){
  if(config.spot)await Promise.all(['XAU','XAG'].map(symbol=>task('Spot/'+symbol,async()=>{
   const q=internationalQuote(await json('https://api.gold-api.com/price/'+symbol+'/USD'),symbol,now);
   s.spot[symbol]=q;s.feedChecked['Spot/'+symbol]=iso(now);
   const id='global/USD/'+symbol,last=s.history.filter(p=>p.id===id).at(-1);
   if(!last||last.at!==q.at||last.price!==q.price)s.history.push({id,price:q.price,at:q.at});
  })));
  if(config.spot)await Promise.all(['XAU','XAG'].map(symbol=>task('SpotINR/'+symbol,async()=>{
   s.spotInr[symbol]=spotQuote(await json('https://api.gold-api.com/price/'+symbol+'/INR'),symbol,now);
   s.feedChecked['SpotINR/'+symbol]=iso(now);
  })));
  if(config.metals)await fetchJewellers(s,now,request,Math.max(300,Number(env.JEWELLER_POLL_SECONDS)||900)*1000);
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
  if(free&&(!s.feedChecked.Fed||now-Date.parse(s.feedChecked.Fed)>=15*60000))await task('News/Fed',async()=>{
    const r=await request('https://www.federalreserve.gov/feeds/press_monetary.xml',{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Provider HTTP '+r.status);
    const articles=fedNews(await r.text());if(!articles.length)throw Error('Empty news feed');
    s.newsFeeds.Fed=articles;s.feedChecked.Fed=iso(now);
  });
  if(env.NEWSDATA_API_KEY&&(!s.feedChecked.NewsData||now-Date.parse(s.feedChecked.NewsData)>=30*60000))await task('News/NewsData',async()=>{
    const u=new URL('https://newsdata.io/api/1/latest');u.search=new URLSearchParams({apikey:env.NEWSDATA_API_KEY,q:'gold OR silver OR bullion',language:'en',size:'10'});
    s.newsFeeds.NewsData=newsData(await json(u));s.feedChecked.NewsData=iso(now);
  });
  if(free&&env.MARKET_NEWS_FEEDS!=='false'&&(!s.feedChecked.EconomicTimes||now-Date.parse(s.feedChecked.EconomicTimes)>=15*60000))await task('News/EconomicTimes',async()=>{
    const r=await request('https://economictimes.indiatimes.com/markets/commodities/rssfeeds/1808152121.cms',{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Provider HTTP '+r.status);
    const articles=marketNews(await r.text());if(!articles.length)throw Error('Empty market news feed');
    s.newsFeeds.EconomicTimes=articles;s.feedChecked.EconomicTimes=iso(now);
  });
  if(env.NEWS_API_KEY&&(!s.lastNews||now-s.lastNews>30*60000))await task('News',async()=>{
    const u=new URL('https://newsapi.org/v2/everything');
    u.search=new URLSearchParams({q:'(gold OR silver) AND (bullion OR inflation OR "interest rates" OR "Federal Reserve" OR rupee)',language:'en',sortBy:'publishedAt',pageSize:'10',searchIn:'title,description'});
    const j=await json(u,{headers:{'X-Api-Key':env.NEWS_API_KEY}});
    if(j.status!=='ok'||!Array.isArray(j.articles))throw Error('Invalid news response');
    s.newsFeeds.NewsAPI=j.articles.filter(a=>a.title&&a.url&&/^https?:\/\//.test(a.url)).map(a=>({title:a.title,url:a.url,source:a.source?.name||'News',at:a.publishedAt}));s.lastNews=now;
  });
  if(free&&env.MARKET_NEWS_FEEDS!=='false')await Promise.all(['markets','money'].map(section=>{
   const key='Mint/'+section;
   if(s.feedChecked[key]&&now-Date.parse(s.feedChecked[key])<15*60000)return;
   return task('News/'+key,async()=>{
    const r=await request('https://www.livemint.com/rss/'+section,{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw Error('Provider HTTP '+r.status);
    const articles=mintNews(await r.text());if(!articles.length)throw Error('Empty market news feed');
    s.newsFeeds[key]=articles;s.feedChecked[key]=iso(now);
   });
  }));
  s.news=recentImportantNews([...new Map(Object.values(s.newsFeeds).flat().sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).map(n=>[n.url,n])).values()],now).slice(0,30);
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

