import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntegrations,normalizeNews,dedupeNews,sourceStatus,xausQuotes,NEWS_SOURCES} from './integrations.mjs';
import {emptyState} from './lib/cloud.mjs';
import {fetchJewellers} from './jewellers.mjs';
const now=Date.parse('2026-10-26T04:00:00Z');
const at=new Date(now).toISOString();
const response=j=>({ok:true,headers:new Headers(),json:async()=>j});
test('30-second metal cache persists across cold starts and respects provider cache headers',async()=>{
 const s=emptyState();let calls=0;
 const request=async url=>{calls++;return {...response({symbol:url.includes('XAU')?'XAU':'XAG',currency:url.endsWith('/INR')?'INR':'USD',price:4000,updatedAt:at}),headers:new Headers({'cache-control':'public, max-age=45'})};};
 await createIntegrations(s,{},request).metals(now);assert.equal(calls,4);
 await createIntegrations(structuredClone(s),{},request).metals(now+30000);assert.equal(calls,4);
 await createIntegrations(s,{},request).metals(now+45000);assert.equal(calls,8);
 assert.equal(s.history.length,2);
});
test('HTTP failures retain good prices, back off exponentially, and respect Retry-After',async()=>{
 const s=emptyState();s.spot={XAG:{symbol:'XAG',currency:'USD',price:50,at}};
 let calls=0;const request=async()=>{calls++;return {ok:false,status:429,headers:new Headers({'retry-after':'120'})};};
 const m=createIntegrations(s,{},request);await m.metals(now);const first=calls;
 assert.equal(s.spot.XAG.price,50);assert.equal(s.sourceHealth['Spot/XAG'].nextAttempt,now+120000);
 await createIntegrations(structuredClone(s),{},request).metals(now+60000);assert.equal(calls,first);
 await m.metals(now+120000);assert.equal(s.sourceHealth['Spot/XAG'].failures,2);
 assert.equal(sourceStatus(s,now+120000).find(h=>h.id==='Spot/XAG').status,'error');
});
test('XAUS validates units and real quote time, preserves stale state and never fabricates silver timestamps',()=>{
 const j={xau:{currency:'USD',unit:'troy_oz'},spot_usd_oz:4000,price_as_of:at,updated_at:at,data_state:{status:'fresh'}};
 assert.equal(xausQuotes(j,now).stale,false);assert.equal(xausQuotes({...j,stale:true},now).stale,true);
 assert.equal(xausQuotes(j,now+240000).stale,true);
 assert.throws(()=>xausQuotes({...j,price_as_of:null},now));assert.throws(()=>xausQuotes({...j,spot_usd_oz:-1},now));
});
test('news normalizes metadata, deduplicates canonical URLs and headlines, rejects invented/future dates',()=>{
 const items=normalizeNews([
  {title:'Gold prices rise in India',url:'https://example.com/news?utm_source=a',at},
  {title:'Gold prices rise in India!',url:'https://another.com/news',at},
  {title:'Silver prices rise',url:'https://example.com/news?utm_source=b',at},
  {title:'Gold prices drop',url:'javascript:alert(1)',at},
  {title:'Gold prices drop',url:'https://example.com/other',at:'invalid'},
  {title:'Gold prices drop',url:'https://example.com/future',at:new Date(now+1).toISOString()}
 ],'Publisher',now);
 assert.equal(items.length,3);const result=dedupeNews(items,now);assert.equal(result.length,1);
 for(const key of ['id','title','publisher','url','publishedAt','fetchedAt','category','source'])assert.ok(result[0][key]);
 assert.equal(result[0].url,'https://example.com/news');
});
test('RSS refreshes every 15 minutes; failures retain news with original fetch time; restricted feeds never requested',async()=>{
 const s=emptyState();let count=0,fail=false;
 const request=async url=>{count++;assert.ok(!url.includes('google')&&!url.includes('gdelt'));if(fail)return {ok:false,status:503};const host=new URL(url).hostname;return {ok:true,text:async()=>'<rss><channel><item><title>Gold prices rise in India</title><link>https://'+host+'/news</link><pubDate>'+new Date(now).toUTCString()+'</pubDate></item></channel></rss>'};};
 const m=createIntegrations(s,{MARKET_NEWS_FEEDS:'false'},request);await m.news(now);assert.equal(count,3);assert.equal(s.news.length,1);
 assert.equal(s.news[0].fetchedAt,at);await m.news(now+60000);assert.equal(count,3);
 fail=true;await m.news(now+900000);assert.equal(count,6);assert.equal(s.news[0].fetchedAt,at);
 assert.equal(sourceStatus(s,now+900000).find(h=>h.id==='News/Fed').status,'error');
 assert.equal(NEWS_SOURCES.filter(h=>h.id.startsWith('Google/')).length,3);
});
test('timezone-less RSS publication dates are not interpreted in the server timezone',async()=>{
 const s=emptyState();await createIntegrations(s,{MARKET_NEWS_FEEDS:'false'},async url=>({ok:true,text:async()=>'<rss><channel><item><title>RBI policy rate cut</title><link>https://'+new URL(url).hostname+'/news</link><pubDate>Mon, 26 Oct 2026 08:00:00</pubDate></item></channel></rss>'})).news(now);
 assert.equal(s.news.length,0);assert.match(s.sourceHealth['News/RBI'].note,/timezone/);
});
test('repeated retailer failures do not invent successful timestamps and extraction failures retain last good prices',async()=>{
 const s=emptyState();s.jewellers={khazana:{rates:{gold22k:13000},status:'available',checkedAt:at,publishedDate:at}};
 await fetchJewellers(s,now+1800000,async()=>({ok:true,text:async()=>'<html>Rate table unavailable</html>'}),900000);
 assert.equal(s.jewellers.khazana.rates.gold22k,13000);assert.equal(s.jewellers.khazana.lastGoodAt,at);
 await fetchJewellers(s,now+3600000,async()=>({ok:false,status:503}),900000);
 assert.equal(s.jewellers.khazana.lastGoodAt,at);
 assert.equal(s.jewellers.bhima.lastGoodAt,null);
 assert.equal(sourceStatus(s,now+3600000).find(h=>h.id==='Jeweller/khazana').status,'error');
});
