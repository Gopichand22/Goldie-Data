import {createHash} from 'node:crypto';
import {iso,finitePrice} from './core.mjs';
import {internationalQuote,spotQuote,fedNews} from './feeds.mjs';
import {recentImportantNews} from './news-policy.mjs';
import {fundHealth} from './funds.mjs';

export const NEWS_SOURCES=[
 {id:'Fed',name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',host:'www.federalreserve.gov'},
 {id:'EconomicTimes',name:'The Economic Times',url:'https://economictimes.indiatimes.com/markets/commodities/rssfeeds/1808152121.cms',host:'economictimes.indiatimes.com',market:true},
 ...['markets','money'].map(section=>({id:'Mint/'+section,name:'Mint '+section,url:'https://www.livemint.com/rss/'+section,host:'www.livemint.com',market:true})),
 {id:'RBI',name:'Reserve Bank of India',url:'https://www.rbi.org.in/pressreleases_rss.xml',host:'www.rbi.org.in'},
 {id:'PIB',name:'PIB · Government of India',url:'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=1',host:'www.pib.gov.in'},
 ...[['GoldIndia','gold India'],['SilverIndia','silver India'],['FedGold','Federal Reserve gold']].map(([id,q])=>({id:'Google/'+id,name:'Google News · '+q,url:'https://news.google.com/rss/search?'+new URLSearchParams({q,hl:'en-IN',gl:'IN',ceid:'IN:en'}),disabled:'Feed license permits personal non-commercial feed readers only; public dashboard disabled.'})),
 {id:'GDELT',name:'GDELT DOC 2.0',url:'https://api.gdeltproject.org/api/v2/doc/doc?'+new URLSearchParams({query:'(gold OR silver OR "Federal Reserve" OR "USDINR")',mode:'artlist',format:'json',maxrecords:'250',timespan:'2d',sort:'datedesc'}),disabled:'Endpoint unreachable during verification; live schema and reuse terms not verified. Disabled.'}
];

export function canonicalUrl(raw){
 const u=new URL(raw);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid article URL');
 u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|oc)$/i.test(key))u.searchParams.delete(key);
 u.searchParams.sort();return u.href;
}
export function normalizeNews(items,source,now){
 return items.flatMap(item=>{try{
  const url=canonicalUrl(item.url),title=String(item.title||'').trim();
  const publishedAt=item.publishedAt??item.at;
  if(!title||!Number.isFinite(Date.parse(publishedAt))||Date.parse(publishedAt)>now)return [];
  return [{...item,id:createHash('sha256').update(url).digest('hex').slice(0,24),title,publisher:item.publisher||item.source||source,url,publishedAt:iso(Date.parse(publishedAt)),at:iso(Date.parse(publishedAt)),fetchedAt:item.fetchedAt||iso(now),category:newsCategory(title),source}];
 }catch{return [];}});
}
export function newsCategory(title){
 if(/gold/i.test(title)&&/India|Indian|rupee|Mumbai|Delhi|Chennai|Hyderabad|Bangalore/i.test(title))return 'Indian gold';
 if(/silver/i.test(title))return 'Silver';
 if(/gold|bullion/i.test(title))return 'Global gold';
 if(/USD[\s/.-]?INR|rupee/i.test(title))return 'USD/INR';
 if(/RBI|Reserve Bank of India/i.test(title))return 'RBI';
 if(/Federal Reserve|FOMC|\bFed\b/i.test(title))return 'US Federal Reserve';
 return 'Precious-metals policy';
}
export function dedupeNews(items,now){
 const urls=new Set(),titles=new Set();return recentImportantNews(items,now).filter(n=>{
  const title=n.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const url=canonicalUrl(n.url);if(urls.has(url)||titles.has(title))return false;urls.add(url);titles.add(title);return true;
 }).sort((a,b)=>['Indian gold','Silver','Global gold','USD/INR','RBI','US Federal Reserve','Precious-metals policy'].indexOf(a.category)-['Indian gold','Silver','Global gold','USD/INR','RBI','US Federal Reserve','Precious-metals policy'].indexOf(b.category)||Date.parse(b.at)-Date.parse(a.at));
}
export function xausQuotes(j,now){
 const at=j.price_as_of||j.data_state?.as_of;
 if(j.xau?.currency!=='USD'||j.xau?.unit!=='troy_oz'||!Number.isFinite(Date.parse(at))||Date.parse(at)>now+300000||!Number.isFinite(Date.parse(j.updated_at)))throw Error('Invalid XAUS quote or source time');
 // XAUS only supplies a distinct quote time for gold. Do not assign it to silver.
 if(!finitePrice(j.spot_usd_oz))throw Error('Invalid XAUS gold');
 return {symbol:'XAU',currency:'USD',unit:'USD/troy oz',price:j.spot_usd_oz,at,receivedAt:iso(now),source:'XAUS (upstream '+(j.price_source||'unspecified')+')',stale:!!j.stale||j.data_state?.status!=='fresh'||now-Date.parse(at)>180000||now-Date.parse(j.updated_at)>180000};
}
export function sourceStatus(s,now=Date.now()){
 const entries=Object.entries(s.sourceHealth||{}).map(([id,h])=>({id,...h,status:h.status==='disabled'?'disabled':h.error?'error':!h.lastSuccess||now-Date.parse(h.lastSuccess)>h.staleAfter||h.quoteStale||(id.startsWith('News/')&&(!h.sourceAt||now-Date.parse(h.sourceAt)>2*86400000))?'stale':'fresh'}));
 for(const [id,e] of Object.entries(s.jewellers||{}))entries.push({id:'Jeweller/'+id,name:e.name||id,lastSuccess:e.status==='available'?e.checkedAt:e.lastGoodAt,sourceAt:e.publishedDate||null,status:e.status!=='available'?'error':now-Date.parse(e.checkedAt)>1800000?'stale':'fresh',error:e.status!=='available'?e.note:null,note:!e.publishedDate?'Quote date unverified':null});
 for(const [id,e] of Object.entries(s.mintRates||{}))entries.push({id:'MintPrice/'+id,name:'Mint '+id,lastSuccess:e.status==='error'?e.lastGoodAt:e.checkedAt,sourceAt:e.publishedDate||null,status:e.status==='error'?'error':!e.publishedDate||now-Date.parse(e.publishedDate)>86400000?'stale':'fresh',error:e.status==='error'?e.note:null});
 return [...entries,...Object.values(s.funds||{}).map(f=>fundHealth(f,now))];
}

export function createIntegrations(s,env,request){
 s.sourceHealth ||= {};s.newsFeeds ||= {};s.spot ||= {};s.spotInr ||= {};s.feedChecked ||= {};
 async function fetchSource(id,name,url,ttl,parse){
  const h=s.sourceHealth[id] ||= {name,staleAfter:Math.max(ttl*2,180000)};
  if(h.nextAttempt&&nowTime<h.nextAttempt)return false;
  h.lastAttempt=iso(nowTime);
  try{
   const r=await request(url,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json, application/rss+xml, application/xml, text/xml'}});
   if(!r.ok){const e=Error('Provider HTTP '+r.status);const retry=r.headers?.get?.('retry-after');e.retryMs=/^\d+$/.test(retry||'')?Number(retry)*1000:Math.max(0,Date.parse(retry)-nowTime)||0;throw e;}
   const result=await parse(r);const maxAge=Number(r.headers?.get?.('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/)?.[1])||0;
   Object.assign(h,{lastSuccess:iso(nowTime),sourceAt:result?.sourceAt||null,quoteStale:!!result?.stale,note:result?.note||null,error:null,failures:0,nextAttempt:nowTime+Math.max(ttl,maxAge*1000)});
   delete s.errors[id];return true;
  }catch(e){h.failures=(h.failures||0)+1;h.error=/^Provider HTTP \d+$/.test(e.message)?e.message:'Source unreachable or invalid response';h.errorAt=iso(nowTime);h.nextAttempt=nowTime+Math.max(e.retryMs||0,Math.min(3600000,ttl*2**Math.min(h.failures-1,7)));s.errors[id]={at:h.errorAt,message:h.error};return false;}
 }
 let nowTime;
 async function metals(now){
  nowTime=now;
  const success=await Promise.all(['XAU','XAG'].map(symbol=>fetchSource('Spot/'+symbol,'Gold API · '+symbol,'https://api.gold-api.com/price/'+symbol,30000,async r=>{
   const q=internationalQuote(await r.json(),symbol,now);if(!s.spot[symbol]||Date.parse(q.at)>=Date.parse(s.spot[symbol].at))s.spot[symbol]=q;return {sourceAt:q.at,stale:now-Date.parse(q.at)>180000};
  })));
  if(!success[0]&&(!s.spot.XAU||s.sourceHealth['Spot/XAU']?.error||now-Date.parse(s.spot.XAU.at)>180000))await fetchSource('Spot/XAUS','XAUS · fallback gold','https://xaus.com/api/v1/spot',60000,async r=>{
   const q=xausQuotes(await r.json(),now);if(!s.spot.XAU||Date.parse(q.at)>Date.parse(s.spot.XAU.at))s.spot.XAU=q;return {sourceAt:q.at,stale:q.stale,note:'Silver excluded: no independent silver quote timestamp; upstream gold-api.com'};
  });
  await Promise.all(['XAU','XAG'].map(symbol=>fetchSource('SpotINR/'+symbol,'Gold API · '+symbol+' INR','https://api.gold-api.com/price/'+symbol+'/INR',30000,async r=>{
   const q=spotQuote(await r.json(),symbol,now);s.spotInr[symbol]=q;return {sourceAt:q.at,stale:now-Date.parse(q.at)>180000};
  })));
  for(const symbol of ['XAU','XAG']){const q=s.spot[symbol];if(!q)continue;const id='global/USD/'+symbol,last=s.history.filter(p=>p.id===id).at(-1);if(!last||last.at!==q.at||last.price!==q.price)s.history.push({id,price:q.price,at:q.at});}
 }
 async function news(now){
  nowTime=now;
  await Promise.all(NEWS_SOURCES.map(async spec=>{
   const id='News/'+spec.id;
   if(spec.disabled){s.sourceHealth[id]={name:spec.name,status:'disabled',note:spec.disabled};delete s.newsFeeds[spec.id];return;}
   if(spec.market&&env.MARKET_NEWS_FEEDS==='false')return;
   await fetchSource(id,spec.name,spec.url,900000,async r=>{
    const xml=await r.text();
    // RBI publishes timezone-less dates. Preserve no guessed UTC timestamp: exclude those items.
    const safeXml=xml.replace(/<pubDate>([^<]+)<\/pubDate>/gi,(all,date)=>/(?:GMT|UTC|[+-]\d{4}|Z)\s*$/i.test(date.trim())?all:'<pubDate></pubDate>');
    const articles=normalizeNews(fedNews(safeXml,{hostname:spec.host,source:spec.name,category:'Metals & policy'}),spec.name,now);
    s.newsFeeds[spec.id]=articles;s.feedChecked[spec.id]=iso(now);
    return {sourceAt:articles.map(n=>n.publishedAt).sort().at(-1)||null,note:articles.length?articles.length+' timestamped headlines':'No eligible timestamped items; empty or publication timezone unavailable'};
   });
  }));
  // The public deployment uses no subscription/key-based providers.
  delete s.newsFeeds.NewsAPI;delete s.newsFeeds.NewsData;
  const normalized=Object.entries(s.newsFeeds).flatMap(([key,items])=>items.flatMap(item=>normalizeNews([item],item.source||key,now).map(n=>({...n,fetchedAt:item.fetchedAt||s.feedChecked[key]||null}))));
  s.news=dedupeNews(normalized,now);
 }
 return {metals,news};
}
