import {protect,refreshStatus} from '../lib/cloud.mjs';
import {allowTestRequest} from '../telegram-test.mjs';
// Called by the open dashboard: fetches fresh prices on demand and returns the updated status.
export default async function handler(req,res){
  if(!protect(req,res))return;
  res.setHeader('Content-Type','application/json');
  if(!allowTestRequest(req)){res.statusCode=req.method==='POST'?403:405;res.end(JSON.stringify({error:'Use the dashboard.'}));return;}
  try{res.end(JSON.stringify(await refreshStatus()));}
  catch{res.statusCode=503;res.end(JSON.stringify({error:'Database unavailable. Check Supabase configuration and migration.'}));}
}
