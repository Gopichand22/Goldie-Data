import {finitePrice,iso} from './core.mjs';
export const TROY_GRAMS=31.1034768;
export function internationalQuote(j,symbol,now){
 if(j.symbol!==symbol||j.currency!=='USD'||!finitePrice(j.price))throw Error('Invalid international quote');
 if(!Number.isFinite(Date.parse(j.updatedAt))||Date.parse(j.updatedAt)>now+300000)throw Error('Invalid source time');
 return {symbol,price:j.price,currency:'USD',unit:'USD/troy oz',at:j.updatedAt,receivedAt:iso(now),source:'Gold-API.com'};
}
export function spotQuote(j,symbol,now){
  if(j.symbol!==symbol||j.currency!=='INR'||!finitePrice(j.price))throw Error('Invalid spot price');
  if(!Number.isFinite(Date.parse(j.updatedAt))||Date.parse(j.updatedAt)>now+300000)throw Error('Invalid source time');
  return {symbol,price:j.price/TROY_GRAMS,ouncePrice:j.price,unit:'INR/g',at:j.updatedAt,receivedAt:iso(now),source:'Gold-API.com',kind:'International spot converted to INR',gstIncluded:false};
}
function decode(text){
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>{
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(e[0]!=='#')return named[e.toLowerCase()];
    const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1));
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  }).trim();
}
// Bounded extraction for the fixed public RSS 2.0 feed, not a general XML evaluator.
// No external entities, DTDs, scripts, or remote references are executed.
export function fedNews(xml,{hostname='www.federalreserve.gov',source='Federal Reserve · Monetary policy',category='Monetary policy'}={}){
  if(xml.length>4000000||!/<rss\b/i.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Invalid RSS feed');
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(([,item])=>{
    const get=tag=>decode(item.match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1]||'');
    const title=get('title'),link=get('link'),at=Date.parse(get('pubDate'));
    let u;try{u=new URL(link);}catch{return [];}
    if(u.protocol!=='https:'||u.hostname!==hostname||!title||!Number.isFinite(at))return [];
    return [{title,url:u.href,at:iso(at),source,category,delay:'Publisher RSS; no fixed latency guarantee'}];
  });
}
export function marketNews(xml){return fedNews(xml,{hostname:'economictimes.indiatimes.com',source:'The Economic Times',category:'Commodities'});}
export function mintNews(xml){return fedNews(xml,{hostname:'www.livemint.com',source:'Mint',category:'Markets'});}
export function newsData(j){
  if(j.status!=='success'||!Array.isArray(j.results))throw Error('Invalid news response');
  return j.results.flatMap(a=>{
    const at=Date.parse((a.pubDate||'').replace(' ','T')+'Z');let u;
    try{u=new URL(a.link);}catch{return [];}
    if(!a.title||!['https:','http:'].includes(u.protocol)||!Number.isFinite(at))return [];
    return [{title:a.title,url:u.href,source:a.source_name||a.source_id||'NewsData.io',at:iso(at),delay:'NewsData free plan: 12-hour delay'}];
  });
}
