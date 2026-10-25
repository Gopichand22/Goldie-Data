import test from 'node:test';
import assert from 'node:assert/strict';
import {spotQuote,fedNews,newsData,TROY_GRAMS,internationalQuote} from './feeds.mjs';
import {createMonitor} from './monitor.mjs';
import {emptyState} from './lib/cloud.mjs';
test('international spot preserves USD per troy ounce and rejects INR data',()=>{
 const now=Date.now(),j={symbol:'XAU',currency:'USD',price:4000,updatedAt:new Date(now).toISOString()};
 const q=internationalQuote(j,'XAU',now);assert.equal(q.price,4000);assert.equal(q.unit,'USD/troy oz');
 assert.throws(()=>internationalQuote({...j,currency:'INR'},'XAU',now));
});
test('global monitor captures USD history and independent INR quotes without duplicate samples',async()=>{
 const s=emptyState(),now=Date.now();s.feedChecked={Fed:new Date(now).toISOString()};
 const request=async url=>({ok:true,json:async()=>({symbol:url.includes('XAU')?'XAU':'XAG',currency:url.endsWith('/INR')?'INR':'USD',price:url.endsWith('/INR')?310000:4000,updatedAt:new Date(now).toISOString()})});
 const m=createMonitor(s,{JEWELLER_FEEDS:'false'},async()=>{},request);
 await m.refresh(now);await m.refresh(now+60000);
 assert.equal(s.history.filter(p=>p.id.startsWith('global/USD/')).length,2);
 assert.equal(s.spot.XAU.currency,'USD');assert.equal(s.spotInr.XAU.ouncePrice,310000);
 assert.ok(s.spotInr.XAU.price>0);assert.equal(Object.keys(s.errors).length,0);
});
test('spot validates units and timestamp and never fabricates a city',()=>{
 const now=Date.now(),j={symbol:'XAU',currency:'INR',price:TROY_GRAMS*100,updatedAt:new Date(now).toISOString()};
 const q=spotQuote(j,'XAU',now);assert.equal(q.price,100);assert.equal(q.city,undefined);assert.equal(q.gstIncluded,false);
 assert.throws(()=>spotQuote({...j,currency:'USD'},'XAU',now));assert.throws(()=>spotQuote({...j,updatedAt:'invalid'},'XAU',now));
});
const rss='<rss><channel><item><title><![CDATA[Fed &amp; rates]]></title><link><![CDATA[https://www.federalreserve.gov/newsevents/test.htm]]></link><pubDate>Tue, 13 Oct 2026 18:00:00 GMT</pubDate></item></channel></rss>';
test('fixed RSS parser handles CDATA and entities and rejects external URLs/DTDs',()=>{
 const n=fedNews(rss);assert.equal(n[0].title,'Fed & rates');assert.equal(n[0].at,'2026-10-13T18:00:00.000Z');
 assert.equal(fedNews(rss.replace('https://www.federalreserve.gov','javascript:alert(1)//')).length,0);
 assert.throws(()=>fedNews('<!DOCTYPE rss>'+rss));
});
test('free news API retains explicit 12-hour delay label',()=>{
 const n=newsData({status:'success',results:[{title:'Gold',link:'https://example.com/story',pubDate:'2026-10-25 12:00:00'}]});
 assert.match(n[0].delay,/12-hour/);assert.equal(n[0].at,'2026-10-25T12:00:00.000Z');
});
test('no-key news monitor caches RSS and filters old headlines without international price requests',async()=>{
 const s=emptyState(),now=Date.now(),calls=[];
 const request=async url=>{calls.push(String(url));return {ok:true,json:async()=>({symbol:String(url).includes('XAU')?'XAU':'XAG',currency:'INR',price:100000,updatedAt:new Date(now).toISOString()}),text:async()=>rss};};
 const m=createMonitor(s,{JEWELLER_FEEDS:'false',INTERNATIONAL_SPOT:'false'},async()=>{},request);await m.refresh(now);await m.refresh(now+60000);
 assert.equal(calls.length,1);assert.equal(Object.keys(s.quotes).length,0);assert.equal(Object.keys(s.spot).length,0);assert.equal(s.news.length,0);
 assert.equal(s.history.length,0);assert.equal(m.config.spot,false);
});
test('news failure records the provider error',async()=>{
 const s=emptyState();
 await createMonitor(s,{JEWELLER_FEEDS:'false',INTERNATIONAL_SPOT:'false'},async()=>{},async()=>({ok:false,status:429})).refresh(Date.now());
 assert.match(s.errors['News/Fed'].message,/429/);
});
