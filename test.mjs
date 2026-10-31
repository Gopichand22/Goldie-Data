import test from 'node:test';
import assert from 'node:assert/strict';
import {ist,hourSlot,cityQuote,trackedPrices,priceChanges,changeMessage} from './core.mjs';
test('IST hour slots handle midnight',()=>{
 assert.deepEqual(ist(Date.parse('2026-10-25T18:31:00Z')),{date:'2026-10-26',hour:0,minute:1});
 assert.equal(hourSlot(Date.parse('2026-10-25T18:31:00Z')),'2026-10-26/0');
 assert.equal(hourSlot(Date.parse('2026-10-25T10:59:59+05:30')),'2026-10-25/10');
});
test('parser rejects city substitutions and invalid currency/prices',()=>{
 const now=Date.now(),j={success:true,city:'Nellore',timestamp:new Date(now).toISOString(),prices:{silver:{pricePerGram:100,currency:'INR'}}};
 assert.equal(cityQuote(j,'Nellore','silver',now)[0].gstIncluded,null);
 assert.throws(()=>cityQuote(j,'Hyderabad','silver',now));
 j.prices.silver.currency='USD';assert.throws(()=>cityQuote(j,'Nellore','silver',now));
 j.prices.silver.currency='INR';j.prices.silver.pricePerGram=-1;assert.throws(()=>cityQuote(j,'Nellore','silver',now));
});
test('price changes cover jewellers, Mint and ETF NAVs and ignore offline sources',()=>{
 const s={jewellers:{khazana:{name:'Khazana',status:'available',rates:{gold22k:11000,silver:150}},kalyan:{name:'Kalyan',status:'error',rates:{gold22k:1}}},
  mintRates:{gold:{status:'available',rates:{gold24k:12000}}},funds:{150714:{name:'UTI Gold FoF',status:'available',nav:30}}};
 const before=trackedPrices(s);assert.deepEqual(Object.keys(before).sort(),['etf/150714','jeweller/khazana/gold22k','jeweller/khazana/silver','mint/gold24k']);
 assert.equal(priceChanges(undefined,before).length,0);assert.equal(priceChanges(before,before).length,0);
 s.jewellers.khazana.rates.gold22k=11050;s.funds[150714].nav=29.5;delete s.mintRates.gold;
 const changes=priceChanges(before,trackedPrices(s));
 assert.deepEqual(changes.map(c=>[c.id,c.from,c.price]),[['jeweller/khazana/gold22k',11000,11050],['etf/150714',30,29.5]]);
 const text=changeMessage('14:00',changes);assert.match(text,/14:00 IST/);assert.match(text,/Khazana 22K gold: .*11,000.*11,050.*\+0\.45%/);assert.match(text,/UTI Gold FoF NAV: .*−1\.67%/);
});
