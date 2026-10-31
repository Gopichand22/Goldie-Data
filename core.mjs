export const CITIES = ['Nellore', 'Bangalore', 'Hyderabad'];
export const iso = t => new Date(t).toISOString();
export function ist(t) {
  const d = new Date(+new Date(t) + 330 * 60000);
  return {date:d.toISOString().slice(0,10), hour:d.getUTCHours(), minute:d.getUTCMinutes()};
}
// One price comparison per IST clock hour, e.g. 2026-10-31/14.
export function hourSlot(t) {const p=ist(t);return `${p.date}/${p.hour}`;}
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
export function stale(q, now=Date.now()) {return !q?.at || now-Date.parse(q.at)>30*60000;}
const money=x=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(x);
const METALS={gold24k:'24K gold',gold22k:'22K gold',silver:'Silver'};
// Jeweller rates, Mint India rates and gold/silver ETF FoF NAVs that are currently valid.
export function trackedPrices(s) {
  const out={};
  for(const [id,e] of Object.entries(s.jewellers||{}))if(e.status==='available')
    for(const [m,p] of Object.entries(e.rates||{}))if(finitePrice(p))out['jeweller/'+id+'/'+m]={label:(e.name||id)+' '+(METALS[m]||m),price:p,unit:'/g'};
  for(const e of Object.values(s.mintRates||{}))if(e.status==='available')
    for(const [m,p] of Object.entries(e.rates||{}))if(finitePrice(p))out['mint/'+m]={label:'Mint India '+(METALS[m]||m),price:p,unit:'/g'};
  for(const [code,f] of Object.entries(s.funds||{}))if(f.status==='available'&&finitePrice(f.nav))
    out['etf/'+code]={label:f.name+' NAV',price:f.nav,unit:'/unit'};
  return out;
}
// Only prices seen on both checks count; a source going offline is not a price change.
export function priceChanges(previous={}, current={}) {
  return Object.entries(current).filter(([k,c])=>finitePrice(previous[k]?.price)&&previous[k].price!==c.price)
    .map(([id,c])=>({id,...c,from:previous[id].price}));
}
export function changeMessage(slot, changes) {
  const lines=[`Metals Watch · price change · ${slot} IST`];
  for(const c of changes){
    const diff=c.price-c.from,sign=diff>0?'▲ +':'▼ −';
    lines.push(`${c.label}: ${money(c.from)} → ${money(c.price)}${c.unit} (${sign}${money(Math.abs(diff))}, ${sign}${Math.abs(diff/c.from*100).toFixed(2)}%)`);
  }
  lines.push('\nWebsite rates; GST, making charges and branch applicability must be verified with each jeweller.');
  return lines.join('\n').slice(0,4000);
}
