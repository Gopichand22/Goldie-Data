import {iso} from './core.mjs';
export function parseMintPrices(html,metal,now=Date.now()){
 if(!['gold','silver'].includes(metal)||html.length>4000000)throw Error('Invalid Mint page');
 const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
 function gram(heading){const i=text.indexOf(heading);if(i<0)return null;const m=text.slice(i,i+500).match(/Gram\s+Today\s+Yesterday\s+Change\s+1\s+₹\s*([\d,]+(?:\.\d+)?)/);const n=m?Number(m[1].replaceAll(',','')):null;return n>0&&n<100000?n:null;}
 const rates=metal==='gold'?{gold24k:gram('24K Gold Rate in India Today (INR)'),gold22k:gram('22K Gold Rate in India Today (INR)')}:{silver:gram('Silver Rate Today in India (INR)')};
 if(!Object.values(rates).some(v=>v>0))throw Error('Mint rate table unavailable');
 const stamp=text.match(/Updated on\s+([A-Za-z]+ \d{1,2}, \d{4} \d{1,2}:\d{2}:\d{2} [AP]M) IST/i);
 const at=stamp?Date.parse(stamp[1]+' +0530'):NaN;
 return {rates,source:'Mint',scope:'India',unit:'INR/g',publishedDate:Number.isFinite(at)?iso(at):null,checkedAt:iso(now),url:'https://www.livemint.com/'+metal+'-prices',status:'available'};
}
export async function fetchMintPrices(s,now,request=fetch){
 s.mintRates ||= {};
 await Promise.all(['gold','silver'].map(async metal=>{
  const old=s.mintRates[metal];if(old?.checkedAt&&now-Date.parse(old.checkedAt)<900000)return;
  try{const r=await request('https://www.livemint.com/'+metal+'-prices',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Source HTTP '+r.status);s.mintRates[metal]={...parseMintPrices(await r.text(),metal,now),lastGoodAt:iso(now)};}
  catch(e){s.mintRates[metal]={...old,status:'error',lastGoodAt:old?.lastGoodAt||(old?.status==='available'?old.checkedAt:null),checkedAt:iso(now),note:/^Source HTTP \d+$/.test(e.message)?e.message:'Source unreachable or extraction failed'};}
 }));
}
