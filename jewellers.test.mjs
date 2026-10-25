import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJeweller,fetchJewellers,parseBhimaFeed} from './jewellers.mjs';
import {recentImportantNews} from './news-policy.mjs';
test('Kalyan extracts Today column and converts explicit ten-gram units',()=>{
 const html='Updated on Sunday, 25th October 2026<table><thead><tr><th>Gold Purity per 10g</th><th>Today</th><th>Yesterday</th></tr></thead><tr><td>24k</td><td>₹<!-- -->142580</td><td>₹140000</td></tr><tr><td>22k</td><td>₹130700</td><td>₹120000</td></tr></table>';
 const p=parseJeweller('kalyan',html);assert.equal(p.rates.gold24k,14258);assert.equal(p.rates.gold22k,13070);assert.equal(p.rates.silver,undefined);assert.ok(p.publishedDate);
});
test('Khazana extracts only metal/rate rows with explicit gram unit',()=>{
 const p=parseJeweller('khazana','<li><p class="metal">GOLD - 22KT</p><p class="rate">₹13,070.00/gm</p></li><li><p class="metal">SILVER</p><p class="rate">₹201.00/gm</p></li><article>Gold ring ₹50000</article>');
 assert.deepEqual(p.rates,{gold22k:13070,silver:201});assert.equal(p.publishedDate,null);assert.equal(p.gstIncluded,null);
 assert.equal(parseJeweller('khazana','Gold ring 22K ₹50000').status,'unavailable');
});
test('Jos Alukkas keeps published date and explicit gram gold values',()=>{
 const p=parseJeweller('josalukkas','<span>Updated on: <strong>24-10-26, 9:37:27 AM</strong></span><div>24K Gold / gram ₹14,264</div><div>22K Gold / gram ₹13,070</div>');
 assert.equal(p.rates.gold24k,14264);assert.equal(p.publishedDate,'2026-10-24T04:07:27.000Z');
});
test('unsupported JavaScript page does not invent a price',()=>{assert.deepEqual(parseJeweller('bhima','<script>const productPrice=99999;</script><div>Loading…</div>').rates,{});});
test('Bhima slider extracts the rendered 22K and 24K values from screenshot markup',()=>{
 const p=parseJeweller('bhima','<div id="gold-rate-slider"><p id="undefined-ib8f">Online Gold Rate 18K: 10695.00/g</p><p class="active">Online Gold Rate 22K: 13070.00/g</p><p>Online Gold Rate 24K: 14192.00/g</p></div>');
 assert.deepEqual(p.rates,{gold22k:13070,gold24k:14192});
});
test('Bhima public feed preserves source scope and rejects conflicting branch rates',()=>{
 const row={purity:'22K',metal_rate:'13070.00',get_store:{name:'Bhima Kochi'}};
 const p=parseBhimaFeed({success:true,data:[row,{...row,purity:'24K',metal_rate:'14192.00'}]});
 assert.deepEqual(p.rates,{gold22k:13070,gold24k:14192});assert.equal(p.location,'Bhima Kochi');assert.equal(p.publishedDate,null);
 assert.throws(()=>parseBhimaFeed({success:true,data:[row,{...row,metal_rate:'13080'}]}));
});
test('Bhima fetch uses normal public website headers and stores returned rate',async()=>{
 const state={jewellers:{},history:[]},now=Date.now();
 // Cache other sources to isolate the Bhima request flow.
 for(const id of ['regal','kalyan','khazana','josalukkas','malabar','joyalukkas','mukunda','abharan'])state.jewellers[id]={checkedAt:new Date(now).toISOString()};
 await fetchJewellers(state,now,async(url,options)=>{
  if(url.includes('engine.kartmax.in')){assert.equal(options.headers.Origin,'https://www.bhimajewels.com');return {ok:true,json:async()=>({success:true,data:[{purity:'22K',metal_rate:'13070'}]})};}
  return {ok:true,text:async()=>"<script>const priceApi='https://engine.kartmax.in/api/cart/metal-rates';</script>"};
 });
 assert.equal(state.jewellers.bhima.rates.gold22k,13070);assert.equal(state.jewellers.bhima.status,'available');
});
test('news date window follows IST across midnight and excludes old/future/promotional items',()=>{
 const now=Date.parse('2026-10-25T00:15:00+05:30');
 const items=[{title:'Gold prices rise',at:'2026-10-24T23:59:00+05:30'},{title:'RBI interest rate decision',at:'2026-10-25T00:10:00+05:30'},{title:'Gold price falls',at:'2026-10-23T23:59:00+05:30'},{title:'Gold price rises',at:'2026-10-25T01:00:00+05:30'},{title:'Gold discount sale ends',at:'2026-10-24T12:00:00+05:30'},{title:'Jewellery fashion tips',at:'2026-10-24T12:00:00+05:30'}];
 assert.equal(recentImportantNews(items,now).length,2);
});
test('source failures retain last-known rates but label error instead of fresh data',async()=>{
 const s={history:[],jewellers:{kalyan:{rates:{gold22k:13070},checkedAt:'2026-10-20T00:00:00Z'}}};
 await fetchJewellers(s,Date.now(),async()=>({ok:false,status:403}));
 assert.equal(s.jewellers.kalyan.rates.gold22k,13070);assert.equal(s.jewellers.kalyan.status,'error');
});
