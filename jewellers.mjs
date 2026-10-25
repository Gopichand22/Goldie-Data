import {iso} from './core.mjs';
export const JEWELLERS=[
 {id:'bhima',name:'Bhima',url:'https://www.bhimajewels.com/metal-rate'},
 {id:'regal',name:'Regal',url:'https://www.regaljewellers.net/how-to-plan-gold-purchase/'},
 {id:'kalyan',name:'Kalyan',url:'https://www.store.kalyanjewellers.net/gold-rate/india/en'},
 {id:'khazana',name:'Khazana',url:'https://www.khazanajewellery.com/store-locator'},
 {id:'josalukkas',name:'Jos Alukkas',url:'https://www.josalukkasonline.com/gold-rate-today/india'},
 {id:'malabar',name:'Malabar',url:'https://www.malabargoldanddiamonds.com/in/pan-india/en/stores/store-list.html'},
 {id:'joyalukkas',name:'Joyalukkas',url:'https://www.joyalukkas.in/goldrate'},
 {id:'mukunda',name:'Mukunda',url:'https://www.mukundajewellery.com/'},
 {id:'abharan',name:'Abharan',url:'https://abharan.com/'},
];
// Extract only inspected rate tables/containers, never arbitrary product prices.
function text(html){return html.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&#8377;|&#x20b9;|&rupee;/gi,'₹').replace(/\s+/g,' ').trim();}
function amount(value){const m=value.match(/₹\s*([\d,]+(?:\.\d+)?)/);return m?Number(m[1].replaceAll(',','')):null;}
export function parseJeweller(id,html,now=Date.now()){
 if(html.length>3000000)throw Error('Page too large');
 const rates={};let publishedDate=null;
 if(id==='bhima'){
  const clean=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const slider=clean.match(/<div\b[^>]*id=["']gold-rate-slider["'][^>]*>([\s\S]*?)<\/div>/i);
  if(slider)for(const [,p] of slider[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)){
   const m=text(p).match(/^Online Gold Rate\s+(22|24)K:\s*([\d,]+(?:\.\d+)?)\s*\/\s*g$/i);
   if(m)rates[m[1]==='22'?'gold22k':'gold24k']=Number(m[2].replaceAll(',',''));
  }
 }
 if(id==='khazana'){
  const blocks=[...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  for(const [,block] of blocks){
   const metal=block.match(/<p\b[^>]*class=["'][^"']*\bmetal\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
   const rate=block.match(/<p\b[^>]*class=["'][^"']*\brate\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
   if(!metal||!rate||!/(?:\/\s*gm|per\s*gram)/i.test(text(rate[1])))continue;
   const label=text(metal[1]),key=/22\s*K/i.test(label)?'gold22k':/24\s*K/i.test(label)?'gold24k':/^silver$/i.test(label)?'silver':null;
   if(key){const value=amount(text(rate[1]));if(value)rates[key]=value;}
  }
 }
 if(id==='kalyan'){
  for(const [,table] of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)){
   if(!/Gold Purity per 10g/i.test(text(table)))continue;
   for(const [,row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
    const key=/^24k$/i.test(cells[0])?'gold24k':/^22k$/i.test(cells[0])?'gold22k':null;
    const value=amount(cells[1]||'');if(key&&value)rates[key]=value/10;
   }
   break;
  }
  const clean=text(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  const m=clean.match(/Updated on \w+,\s*(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(20\d{2})/i);
  if(m){const d=Date.parse(m[1]+' '+m[2]+' '+m[3]+' 00:00:00 GMT+0530');if(Number.isFinite(d))publishedDate=iso(d);}
 }
 if(id==='josalukkas'){
  const clean=text(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  for(const [purity,key] of [['24','gold24k'],['22','gold22k']]){
   const m=clean.match(new RegExp(purity+'K Gold\\s*\\/\\s*gram\\s*₹\\s*([\\d,]+(?:\\.\\d+)?)','i'));
   if(m)rates[key]=Number(m[1].replaceAll(',',''));
  }
  const d=clean.match(/Updated on:\s*(\d{2})-(\d{2})-(\d{2}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if(d){let hour=Number(d[4])%12+(d[7].toUpperCase()==='PM'?12:0);const at=Date.parse('20'+d[3]+'-'+d[2]+'-'+d[1]+'T'+String(hour).padStart(2,'0')+':'+d[5]+':'+d[6]+'+05:30');if(Number.isFinite(at))publishedDate=iso(at);}
 }
 for(const [key,value] of Object.entries(rates))if(!Number.isFinite(value)||value<=0||value>(key==='silver'?10000:100000))delete rates[key];
 return {rates,publishedDate,checkedAt:iso(now),unit:'INR/g',gstIncluded:null,location:'Website rate; branch not specified',status:Object.keys(rates).length?'available':'unavailable',note:Object.keys(rates).length?(publishedDate?'Source date published':'Source does not publish a verified rate date'):'Rate not available in server HTML; regional URL or rendered-page adapter needed'};
}
export function parseBhimaFeed(j,now=Date.now()){
 if(j.success!==true||!Array.isArray(j.data)||j.data.length>100)throw Error('Invalid Bhima rate response');
 const rates={},locations=new Set();
 for(const item of j.data){
  const key=item.purity==='22K'?'gold22k':item.purity==='24K'?'gold24k':null;
  if(!key)continue;
  const value=Number(item.metal_rate);if(!Number.isFinite(value)||value<=0||value>100000)throw Error('Invalid Bhima price');
  if(rates[key]!==undefined&&rates[key]!==value)throw Error('Ambiguous Bhima branch rates');
  rates[key]=value;
  if(item.get_store?.name)locations.add(item.get_store.name);
 }
 if(!Object.keys(rates).length)throw Error('No Bhima gold rates');
 const location=[...locations].join(' / ')||'Online rate; branch not specified';
 return {rates,publishedDate:null,checkedAt:iso(now),unit:'INR/g',gstIncluded:null,location,status:'available',note:'Online rate · '+location+' · source date / GST unspecified'};
}
export async function fetchJewellers(state,now,request=fetch,interval=900000){
 state.jewellers ||= {};
 const allowed=new Set(JEWELLERS.map(site=>site.id));
 state.jewellers=Object.fromEntries(Object.entries(state.jewellers).filter(([id])=>allowed.has(id)));
 await Promise.all(JEWELLERS.map(async site=>{
  const old=state.jewellers[site.id];if(old?.checkedAt&&now-Date.parse(old.checkedAt)<interval)return;
  try{
   const r=await request(site.url,{signal:AbortSignal.timeout(6000),redirect:'follow',headers:{Accept:'text/html','User-Agent':'MetalsWatch/1.0 rate monitor'}});
   if(!r.ok)throw Error('Source HTTP '+r.status);
   const html=await r.text();let parsed=parseJeweller(site.id,html,now);
   if(site.id==='bhima'&&parsed.status!=='available'&&html.includes('https://engine.kartmax.in/api/cart/metal-rates')){
    const res=await request('https://engine.kartmax.in/api/cart/metal-rates',{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json',Origin:'https://www.bhimajewels.com',Referer:site.url}});
    if(!res.ok)throw Error('Source HTTP '+res.status);
    parsed=parseBhimaFeed(await res.json(),now);
   }
   if(site.id==='regal'&&html.includes('https://www.regaljewellers.net/gold-rate-protection-calculator/')){
    const calculator=await request('https://www.regaljewellers.net/gold-rate-protection-calculator/',{signal:AbortSignal.timeout(6000)});
    if(!calculator.ok)throw Error('Source HTTP '+calculator.status);
    const page=await calculator.text();
    if(page.includes('data-rate-url="/wp-json/regal/v1/gold-rate"')){
     const res=await request('https://www.regaljewellers.net/wp-json/regal/v1/gold-rate',{signal:AbortSignal.timeout(6000)});
     if(!res.ok)throw Error('Source HTTP '+res.status);
     const j=await res.json(),price=Number(j.rate);
     if(price>0&&price<100000&&Number.isFinite(Date.parse(j.updated_at)))parsed={...parsed,rates:{gold22k:price},publishedDate:j.updated_at,status:'available',location:j.branch_name||'Branch '+j.branch_code,note:'22K · '+(j.branch_name||'Branch '+j.branch_code)+' only · GST unspecified · public calculator feed'};
    }
   }
   state.jewellers[site.id]={...site,...parsed};
   if(parsed.status==='available')for(const [metal,price] of Object.entries(parsed.rates)){
    const id='jeweller/'+site.id+'/'+metal,last=state.history.filter(p=>p.id===id).at(-1);
    if(!last||last.price!==price||now-Date.parse(last.at)>=3600000)state.history.push({id,price,at:iso(now)});
   }
  }catch(e){state.jewellers[site.id]={...site,rates:old?.rates||{},publishedDate:old?.publishedDate||null,lastGoodAt:old?.lastGoodAt||old?.checkedAt||null,checkedAt:iso(now),status:'error',unit:'INR/g',note:e.message.startsWith('Source HTTP')?e.message:'Source unreachable or extraction failed'};}
 }));
}
