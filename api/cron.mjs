import {protect,runCloud} from '../lib/cloud.mjs';
export default async function handler(req,res){
  if(!protect(req,res,true))return;
  if(!['GET','POST'].includes(req.method)){res.statusCode=405;res.end();return;}
  res.setHeader('Content-Type','application/json');
  try{res.end(JSON.stringify(await runCloud()));}
  catch{res.statusCode=503;res.end(JSON.stringify({error:'Monitor run failed. Check Supabase connectivity and subsequent cron runs.'}));}
}
