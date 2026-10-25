import {readFile} from 'node:fs/promises';
import {protect} from '../lib/cloud.mjs';
export default async function handler(req,res){
  if(!protect(req,res))return;
  if(req.method!=='GET'){res.statusCode=405;res.end();return;}
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(await readFile(new URL('../dist/index.html',import.meta.url)));
}
