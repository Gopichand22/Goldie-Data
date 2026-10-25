import test from 'node:test';
import assert from 'node:assert/strict';
import {ist,dueSlots,cityQuote,moved,summary} from './core.mjs';
test('IST schedule handles midnight, deduplication and process start',()=>{
 assert.deepEqual(ist(Date.parse('2026-10-25T18:31:00Z')),{date:'2026-10-26',hour:0,minute:1});
 const start=Date.parse('2026-10-25T07:59:00+05:30'),now=Date.parse('2026-10-25T10:02:00+05:30');
 assert.deepEqual(dueSlots(now,start,{'2026-10-25/8':'sent'}).map(x=>x.id),['2026-10-25/10']);
 assert.equal(dueSlots(start,start,{}).length,0);assert.equal(dueSlots(now,now,{}).length,0);
});
test('parser rejects city substitutions and invalid currency/prices',()=>{
 const now=Date.now(),j={success:true,city:'Nellore',timestamp:new Date(now).toISOString(),prices:{silver:{pricePerGram:100,currency:'INR'}}};
 assert.equal(cityQuote(j,'Nellore','silver',now)[0].gstIncluded,null);
 assert.throws(()=>cityQuote(j,'Hyderabad','silver',now));
 j.prices.silver.currency='USD';assert.throws(()=>cityQuote(j,'Nellore','silver',now));
 j.prices.silver.currency='INR';j.prices.silver.pricePerGram=-1;assert.throws(()=>cityQuote(j,'Nellore','silver',now));
});
test('movement rules handle both directions and default to disabled',()=>{
 assert.equal(moved(100,102,1),true);assert.equal(moved(100,98,1),true);
 assert.equal(moved(100,100.2,1),false);assert.equal(moved(100,102,0),false);
});
test('summary labels missing jeweller sources',()=>{
 const s={jewellers:{},news:[]};
 const text=summary(s,'8:00',Date.now());assert.match(text,/Indian jeweller/);assert.match(text,/unavailable/);
});
