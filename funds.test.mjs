import test from 'node:test';
import assert from 'node:assert/strict';
import {FUNDS,parseFund,fetchFunds,fundHealth,nextFundFetch,navDate} from './funds.mjs';
const now=Date.parse('2026-10-26T10:10:00+05:30');
function payload(fund,rows=[{date:'23-10-2026',nav:'26.94420'},{date:'22-10-2026',nav:'27.28710'}]){return {status:'SUCCESS',meta:{scheme_code:fund.code,scheme_name:fund.schemeName,fund_house:'UTI Mutual Fund',isin_growth:fund.isin,isin_div_reinvestment:null},data:rows};}
const response=j=>({ok:true,json:async()=>j});
test('NAV identity requires the exact scheme code, UTI Direct Growth plan and growth ISIN',()=>{
 for(const fund of FUNDS){const j=payload(fund);assert.equal(parseFund(j,fund,now).code,fund.code);
  for(const meta of [{scheme_code:123},{fund_house:'Another AMC'},{scheme_name:fund.schemeName.replace('Direct','Regular')},{scheme_name:fund.schemeName.replace('Growth','IDCW')},{isin_growth:'OTHER'},{isin_div_reinvestment:'WRONG'}])assert.throws(()=>parseFund({...j,meta:{...j.meta,...meta}},fund,now));
 }
});
test('NAV history uses two distinct most-recent published dates, not calendar-day assumptions',()=>{
 const f=parseFund(payload(FUNDS[0],[{date:'22-10-2026',nav:'27.28710'},{date:'23-10-2026',nav:'26.94420'},{date:'23-10-2026',nav:'26.94420'},{date:'21-10-2026',nav:'27.50410'}]),FUNDS[0],now);
 assert.equal(f.history.length,3);assert.equal(f.nav,26.9442);assert.equal(f.previousNav,27.2871);assert.equal(f.navDate,'2026-10-23');assert.equal(f.previousDate,'2026-10-22');
 assert.ok(Math.abs(f.change-(-0.3429))<1e-10);assert.ok(Math.abs(f.changePercent-(-1.2566377519))<1e-8);
 const one=parseFund(payload(FUNDS[0],[{date:'23-10-2026',nav:'26.94420'}]),FUNDS[0],now);assert.equal(one.change,null);assert.equal(one.changePercent,null);
});
test('NAV validation rejects invalid dates, future dates, conflicting same-day prices and invalid values',()=>{
 assert.throws(()=>navDate('31-02-2026'));assert.throws(()=>navDate('2026-10-23'));
 for(const rows of [[{date:'27-10-2026',nav:'20'}],[{date:'23-10-2026',nav:'-1'}],[{date:'23-10-2026',nav:'NaN'}],[{date:'23-10-2026',nav:'0'}],[{date:'23-10-2026',nav:'20'},{date:'23-10-2026',nav:'21'}]])assert.throws(()=>parseFund(payload(FUNDS[0],rows),FUNDS[0],now));
});
test('fund cache survives cold starts; unchanged latest NAV avoids history downloads',async()=>{
 const s={errors:{}},calls=[];
 const request=async url=>{calls.push(url);const f=FUNDS.find(f=>url.includes(String(f.code)));const j=payload(f);if(url.endsWith('/latest'))j.data=j.data.slice(0,1);return response(j);};
 await fetchFunds(s,now,request);assert.equal(calls.length,4);assert.equal(s.funds[150714].history.length,2);
 const restored=structuredClone(s);await fetchFunds(restored,now+60000,request);assert.equal(calls.length,4);
 await fetchFunds(restored,s.funds[150714].nextFetch,request);assert.equal(calls.length,6);assert.equal(restored.funds[150714].history.length,2);
});
test('outages retain NAV, dates and history, mark stale, back off and respect Retry-After',async()=>{
 const old={...parseFund(payload(FUNDS[0]),FUNDS[0],now),lastSuccess:new Date(now).toISOString(),nextFetch:0};
 const s={errors:{},funds:{150714:old}};
 let calls=0;const request=async()=>{calls++;return {ok:false,status:429,headers:new Headers({'retry-after':'7200'})};};
 await fetchFunds(s,now+1000,request);assert.equal(s.funds[150714].nav,26.9442);assert.equal(s.funds[150714].navDate,'2026-10-23');assert.equal(s.funds[150714].history.length,2);
 assert.equal(s.funds[150714].lastSuccess,old.lastSuccess);assert.equal(s.funds[150714].nextFetch,now+1000+7200000);assert.equal(fundHealth(s.funds[150714],now+1000).status,'error');
 await fetchFunds(s,now+60000,request);assert.equal(calls,2);
 assert.equal(s.funds[151731].lastSuccess,null);
});
test('latest/history mismatch and regressing dates cannot overwrite a valid NAV',async()=>{
 const old={...parseFund(payload(FUNDS[0]),FUNDS[0],now),lastSuccess:new Date(now).toISOString()};
 const s={errors:{},funds:{150714:old}};
 await fetchFunds(s,now,async url=>{const fund=FUNDS.find(f=>url.includes(String(f.code)));return response(payload(fund,url.endsWith('/latest')?[{date:'23-10-2026',nav:'30'}]:[{date:'23-10-2026',nav:'29'},{date:'22-10-2026',nav:'28'}]));});
 assert.equal(s.funds[150714].nav,old.nav);assert.match(s.funds[150714].error,/disagree/);
 s.funds[150714].nextFetch=0;
 await fetchFunds(s,now+1000,async url=>response(payload(FUNDS.find(f=>url.includes(String(f.code))),[{date:'22-10-2026',nav:'27'}])));
 assert.equal(s.funds[150714].nav,old.nav);assert.match(s.funds[150714].error,/older NAV/);
});
test('fund schedule aligns to provider ingestion windows across IST midnight and freshness tolerates weekends',()=>{
 assert.equal(new Date(nextFundFetch(Date.parse('2026-10-26T10:04:00+05:30'))).toISOString(),'2026-10-26T04:38:00.000Z');
 assert.equal(new Date(nextFundFetch(Date.parse('2026-10-26T23:59:00+05:30'))).toISOString(),'2026-10-26T21:42:00.000Z');
 const f={...parseFund(payload(FUNDS[0]),FUNDS[0],now),lastSuccess:new Date(now).toISOString()};
 const h=fundHealth(f,now);assert.equal(h.status,'fresh');assert.equal(h.sourceAt,'2026-10-23');assert.equal(h.sourceTimeKind,'date');
 assert.equal(fundHealth(f,now+40*3600000).status,'stale');
});
