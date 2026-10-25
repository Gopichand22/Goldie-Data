import {recentImportantNews} from './news-policy.mjs';
export const CITIES = ['Nellore', 'Bangalore', 'Hyderabad'];
export const HOURS = [8, 10, 14, 16, 18];
export const iso = t => new Date(t).toISOString();
export function ist(t) {
  const d = new Date(+new Date(t) + 330 * 60000);
  return {date:d.toISOString().slice(0,10), hour:d.getUTCHours(), minute:d.getUTCMinutes()};
}
export function dueSlots(now, started, sent={}) {
  const p=ist(now);
  return HOURS.map(h=>({id:`${p.date}/${h}`,at:Date.parse(`${p.date}T${String(h).padStart(2,'0')}:00:00+05:30`)}))
    .filter(x=>x.at<=now && x.at>=started && !sent[x.id]);
}
export function finitePrice(x) {return typeof x==='number' && Number.isFinite(x) && x>0;}
export function cityQuote(j, city, metal, now) {
  if(j.success!==true || j.city?.toLowerCase()!==city.toLowerCase()) throw Error('Provider city/response mismatch');
  const at=j.metadata?.last_verified_against_market_iso || j.timestamp;
  if(!Number.isFinite(Date.parse(at)) || Date.parse(at)>now+300000) throw Error('Invalid source timestamp');
  const keys=metal==='gold'?['gold24k','gold22k']:['silver'];
  return keys.map(k=>{
    const p=j.prices?.[k];
    if(!finitePrice(p?.pricePerGram) || p.currency!=='INR') throw Error('Invalid price or currency');
    return {id:`${city}/${k}`,city,metal:k,price:p.pricePerGram,unit:'INR/g',at,receivedAt:iso(now),
      source:'Nebula Metals',sources:j.metadata?.sources_used||[],confidence:j.metadata?.confidence||'unknown',
      gstIncluded:j.metadata?.gst_included ?? null,validation:j.metadata?.validation_passed ?? null,indicative:true};
  });
}
export function moved(previous, current, percent) {
  return percent>0 && finitePrice(previous) && Math.abs((current-previous)/previous*100)>=percent;
}
export function stale(q, now=Date.now()) {return !q?.at || now-Date.parse(q.at)>30*60000;}
const money=x=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(x);
export function summary(s, slot, now) {
  const lines=[`Metals Watch · ${slot} IST`, 'Indian jeweller website rates · INR per gram'];
  const entries=Object.values(s.jewellers||{});
  if(!entries.length)lines.push('Jeweller rates unavailable; waiting for source checks.');
  for(const entry of entries){
    lines.push('\n'+entry.name+' · '+entry.status);
    for(const [metal,label] of [['gold24k','24K'],['gold22k','22K'],['silver','Silver']]){
      const value=entry.rates?.[metal];
      lines.push(label+': '+(finitePrice(value)?money(value):'unavailable'));
    }
    lines.push('Checked: '+(entry.checkedAt||'unknown'));
    lines.push(entry.publishedDate?'Source date: '+entry.publishedDate:'Source rate date not published; freshness unverified');
    if(entry.status!=='available')lines.push('Last-known rate may be stale.');
  }
  lines.push('\nGST, making charges and branch applicability must be verified with each jeweller.');
  for(const n of recentImportantNews(s.news||[],now).slice(0,2))lines.push('\n'+n.title+'\n'+n.url);
  return lines.join('\n').slice(0,4000);
}
