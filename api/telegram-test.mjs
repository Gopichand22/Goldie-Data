import {database} from '../lib/cloud.mjs';
import {allowTestRequest,cloudTelegramTest} from '../telegram-test.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(!allowTestRequest(req)){res.statusCode=req.method==='POST'?403:405;res.end(JSON.stringify({message:'Use the Test Telegram button on this website.'}));return;}
 try{const result=await cloudTelegramTest(process.env,database());res.statusCode=result.status;res.end(JSON.stringify({message:result.message}));}
 catch{res.statusCode=503;res.end(JSON.stringify({message:'Test unavailable. Check database configuration.'}));}
}
