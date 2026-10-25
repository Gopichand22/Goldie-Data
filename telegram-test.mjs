import {randomUUID} from 'node:crypto';
const COOLDOWN=60000;
export function telegramFailure(data){
 const description=data.description||'';
 if(data.error_code===401)return 'Bot token rejected. Update TELEGRAM_BOT_TOKEN in Vercel and redeploy.';
 if(/chat not found/i.test(description))return 'Chat not found. Open your bot, press Start, send hello, then get your chat ID again. Update TELEGRAM_CHAT_ID in Vercel and redeploy.';
 if(/blocked/i.test(description))return 'Bot is blocked. Unblock it in Telegram and press Start.';
 if(data.error_code===429)return 'Telegram rate limit reached. Wait before retrying.';
 return 'Telegram rejected the test. Check the bot token, chat ID, and that you pressed Start.';
}
export function allowTestRequest(req){
 if(req.method!=='POST')return false;
 try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
export async function sendTelegramTest(s,env,save,request=fetch,now=Date.now()){
 if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_CHAT_ID)return {status:503,message:'Telegram is not configured on the server.'};
 if(s.lastTelegramTestAt&&now-Date.parse(s.lastTelegramTestAt)<COOLDOWN)return {status:429,message:'Please wait one minute before sending another test.'};
 s.lastTelegramTestAt=new Date(now).toISOString();await save();
 const q=s.jewellers?.khazana,lines=['Metals Watch · Test delivery','Your Telegram connection is working.'];
 if(q?.rates?.gold22k)lines.push('Khazana 22K gold: INR '+q.rates.gold22k+'/g');
 if(q?.rates?.silver)lines.push('Khazana silver: INR '+q.rates.silver+'/g');
 if(q)lines.push('Last fetched: '+q.checkedAt+' (website rate; verify GST/source freshness)');
 try{
  const r=await request('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:lines.join('\n')}),signal:AbortSignal.timeout(12000)});
  const data=await r.json();
  if(!r.ok||!data.ok)return {status:502,message:telegramFailure(data)};
  s.events.unshift({at:new Date(now).toISOString(),text:'Telegram delivered: manual test'});s.events=s.events.slice(0,60);await save();
  return {status:200,message:'Test sent. Check your Telegram chat.'};
 }catch{return {status:502,message:'Could not confirm delivery. Check Telegram before retrying in one minute.'};}
}
export async function cloudTelegramTest(env,db,request=fetch){
 const token=randomUUID();if(!await db.rpc('metals_claim',{p_token:token}))return {status:409,message:'Monitor is busy. Try again in a few seconds.'};
 try{const s=await db.read();return await sendTelegramTest(s,env,async()=>{if(!await db.rpc('metals_save',{p_token:token,p_state:s}))throw Error('Lease expired');},request);}
 finally{await db.rpc('metals_release',{p_token:token});}
}
