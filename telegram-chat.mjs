// Run locally after setting TELEGRAM_BOT_TOKEN and sending your new bot /start.
// Never prints the token or message contents; does not send any messages.
const token=process.env.TELEGRAM_BOT_TOKEN;
if(!token){console.error('Set TELEGRAM_BOT_TOKEN in .env first.');process.exit(1);}
try{
 const response=await fetch(`https://api.telegram.org/bot${token}/getUpdates`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({allowed_updates:['message'],timeout:0}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();
 if(!response.ok||!data.ok){console.error('Telegram could not read updates. Check the token; getUpdates also requires that no webhook is configured.');process.exit(1);}
 const chats=new Map();for(const item of data.result||[]){const chat=item.message?.chat;if(chat?.type==='private')chats.set(chat.id,chat);}
 if(!chats.size)console.log('No private chat found. Open your bot, press Start, send hello, then run this command again.');
 for(const [id,chat] of chats)console.log(`Chat: ${chat.username?'@'+chat.username:chat.first_name||'Private chat'}\nTELEGRAM_CHAT_ID=${id}`);
}catch{console.error('Telegram request failed. Check your network connection.');process.exitCode=1;}
