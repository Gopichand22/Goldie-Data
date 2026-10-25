import {iso,finitePrice} from './core.mjs';

export const FUNDS=[
 {code:150714,name:'UTI Gold FoF - Direct Growth',schemeName:'UTI Gold ETF Fund of Fund - Direct Plan - Growth',isin:'INF789F1AWB9',metal:'gold'},
 {code:151731,name:'UTI Silver FoF - Direct Growth',schemeName:'UTI Silver ETF Fund of Fund - Direct Plan - Growth',isin:'INF789F1AYL4',metal:'silver'}
];
const day=t=>new Date(t+330*60000).toISOString().slice(0,10);
export function navDate(raw){
 const m=/^(\d{2})-(\d{2})-(\d{4})$/.exec(String(raw));if(!m)throw Error('Invalid NAV date');
 const date=`${m[3]}-${m[2]}-${m[1]}`;
 const parsed=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==date)throw Error('Invalid NAV calendar date');
 return date;
}
const normalizeName=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function parseFund(j,fund,now=Date.now()){
 if(j?.status!=='SUCCESS'||j.meta?.scheme_code!==fund.code||j.meta?.fund_house!=='UTI Mutual Fund'||normalizeName(j.meta?.scheme_name)!==normalizeName(fund.schemeName)||j.meta?.isin_growth!==fund.isin||j.meta?.isin_div_reinvestment)throw Error('Fund scheme, Direct Growth plan or ISIN mismatch');
 if(!Array.isArray(j.data)||!j.data.length||j.data.length>20000)throw Error('Missing or oversized NAV history');
 const observations=new Map();
 for(const item of j.data){
  const date=navDate(item.date),nav=Number(item.nav);
  if(!/^\d+(?:\.\d+)?$/.test(String(item.nav))||!finitePrice(nav)||date>day(now))throw Error('Invalid NAV value or future NAV date');
  if(observations.has(date)&&observations.get(date)!==nav)throw Error('Conflicting NAVs for one publication date');
  observations.set(date,nav);
 }
 const history=[...observations].map(([date,nav])=>({date,nav})).sort((a,b)=>a.date.localeCompare(b.date));
 const latest=history.at(-1),previous=history.at(-2);
 return {...fund,nav:latest.nav,navDate:latest.date,previousNav:previous?.nav??null,previousDate:previous?.date??null,change:previous?latest.nav-previous.nav:null,changePercent:previous?(latest.nav/previous.nav-1)*100:null,history,unit:'INR/unit',source:'MFAPI',authoritativeReference:'AMFI',referenceUrl:'https://www.amfiindia.com/',url:'https://api.mfapi.in/mf/'+fund.code,kind:'Published daily NAV; not a real-time trading price'};
}
// MFAPI publishes six ingestion times. Check a few minutes afterwards, not every monitor tick.
// These are provider checks, never asserted NAV publication timestamps.
export function nextFundFetch(now){
 const windows=[3*60+12,5*60+8,10*60+8,14*60+8,18*60+8,21*60+8];
 const date=day(now);
 for(const minute of windows){const at=Date.parse(date+'T'+String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')+':00+05:30');if(at>now)return at;}
 return Date.parse(day(now+86400000)+'T03:12:00+05:30');
}
export function fundHealth(fund,now=Date.now()){
 const oldDate=!!fund.navDate&&now-Date.parse(fund.navDate+'T00:00:00+05:30')>7*86400000;
 return {id:'NAV/'+fund.code,name:fund.name,lastSuccess:fund.lastSuccess||null,sourceAt:fund.navDate||null,sourceTimeKind:'date',status:fund.error?'error':!fund.lastSuccess||now-Date.parse(fund.lastSuccess)>36*3600000||oldDate?'stale':'fresh',error:fund.error||null,note:'Published NAV, INR per unit. MFAPI transport; AMFI authoritative reference. NAV date is date-only; no publication clock time supplied.'};
}
export async function fetchFunds(s,now,request=fetch){
 s.funds ||= {};
 await Promise.all(FUNDS.map(async fund=>{
  const key=String(fund.code),old=s.funds[key];
  if(old?.nextFetch&&now<old.nextFetch)return;
  let retryMs=0,maxAge=0;
  async function get(path){
   const r=await request('https://api.mfapi.in/mf/'+fund.code+path,{signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
   if(!r.ok){const retry=r.headers?.get?.('retry-after');retryMs=/^\d+$/.test(retry||'')?Number(retry)*1000:Math.max(0,Date.parse(retry)-now)||0;throw Error('Fund provider HTTP '+r.status);}
   maxAge=Math.max(maxAge,Number(r.headers?.get?.('cache-control')?.match(/(?:^|,)\s*max-age=(\d+)/)?.[1])||0);
   return parseFund(await r.json(),fund,now);
  }
  try{
   const latest=await get('/latest');
   if(old?.navDate&&latest.navDate<old.navDate)throw Error('Fund provider returned an older NAV');
   let data=old;
   if(!old?.history?.length||old.history.length<2||old.navDate!==latest.navDate||old.nav!==latest.nav){
    data=await get('');
    if(data.navDate<latest.navDate||(data.navDate===latest.navDate&&data.nav!==latest.nav))throw Error('Latest and historical NAV responses disagree');
   }
   s.funds[key]={...data,checkedAt:iso(now),lastSuccess:iso(now),status:'available',error:null,failures:0,nextFetch:Math.max(nextFundFetch(now),now+maxAge*1000)};
   delete s.errors['NAV/'+key];
  }catch(e){
   const failures=(old?.failures||0)+1;
   const error=/^(Fund provider HTTP \d+|Fund scheme,|Invalid NAV|Missing or|Conflicting NAV|Latest and historical|Fund provider returned)/.test(e.message)?e.message:'Fund provider unreachable or invalid response';
   s.funds[key]={...fund,...old,status:'error',error,checkedAt:iso(now),lastSuccess:old?.lastSuccess||null,failures,nextFetch:now+Math.max(retryMs,Math.min(6*3600000,900000*2**Math.min(failures-1,5)))};
   s.errors['NAV/'+key]={at:iso(now),message:error};
  }
 }));
}
