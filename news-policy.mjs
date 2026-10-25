export function indiaDay(time){return new Date(+new Date(time)+330*60000).toISOString().slice(0,10);}
export function importantNews(item){
 const text=(item.title||'')+' '+(item.category||'');
 if(/offer|discount|sale ends|shop now|celebrity|wedding collection/i.test(text))return false;
 return /(?:gold|silver|bullion).*(?:price|rate|rise|fall|surge|drop|rally|slump|import|duty|tax|record|demand|supply|market|GST)|(?:price|rate|duty|tax|GST).*(?:gold|silver|bullion)/i.test(text)
 || /(?:RBI|Reserve Bank|Federal Reserve|FOMC|Fed).*(?:statement|decision|interest|inflation|policy rate|rate cut|rate hike)/i.test(text)
 || /(?:interest rate|inflation|rupee|USD.?INR|geopolit|war).*(?:gold|silver|bullion)/i.test(text)
 || /(?:rupee|USD[\s/.-]?INR).*(?:dollar|exchange|rise|fall|gain|drop|weaken|strength|rate)/i.test(text)
 || /(?:RBI|Reserve Bank|Federal Reserve|FOMC).*(?:monetary policy|repo|inflation)/i.test(text);
}
export function recentImportantNews(items,now=Date.now()){
 const today=indiaDay(now),yesterday=indiaDay(now-86400000);
 return items.filter(n=>{const at=Date.parse(n.at);if(!Number.isFinite(at)||at>now)return false;const day=indiaDay(at);return (day===today||day===yesterday)&&importantNews(n);}).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
}
