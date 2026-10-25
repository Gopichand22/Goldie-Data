import {protect,database,publicStatus} from '../lib/cloud.mjs';
export default async function handler(req,res){
  if(!protect(req,res))return;
  if(req.method!=='GET'){res.statusCode=405;res.end();return;}
  res.setHeader('Content-Type','application/json');
  try{res.end(JSON.stringify(publicStatus(await database().read())));}
  catch{res.statusCode=503;res.end(JSON.stringify({error:'Database unavailable. Check Supabase configuration and migration.'}));}
}
