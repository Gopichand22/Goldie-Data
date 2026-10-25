import test from 'node:test';
import assert from 'node:assert/strict';
import {runCloud,emptyState,protect,publicStatus,database} from './lib/cloud.mjs';
function fakeDb(state=emptyState()){
 let value=structuredClone(state),locked=false;const calls=[];
 return {calls,get value(){return value;},read:async()=>structuredClone(value),rpc:async(name,args)=>{
  calls.push(name);
  if(name==='metals_claim'){if(locked)return false;locked=true;return true;}
  if(name==='metals_save'){value=structuredClone(args.p_state);return true;}
  if(name==='metals_release'){locked=false;return true;}
 }};
}
test('cloud run persists state across cold starts and sends each IST slot once',async()=>{
 const now=Date.parse('2026-10-25T08:01:00+05:30'),s=emptyState();s.monitorStartedAt='2026-10-25T02:00:00Z';
 const db=fakeDb(s),env={FREE_FEEDS:'false',JEWELLER_FEEDS:'false',TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_CHAT_ID:'123'};let sent=0;
 const request=async()=>{assert.ok(db.value.outbox.length>0,'persist before Telegram send');sent++;return {ok:true,json:async()=>({ok:true})};};
 await runCloud(env,db,now,request);await runCloud(env,db,now+60000,request);
 assert.equal(sent,1);assert.ok(db.value.sent['2026-10-25/8']);assert.equal(db.value.outbox.length,0);
});
test('failed Telegram delivery persists retry and retries on a later invocation',async()=>{
 const now=Date.now(),s=emptyState();s.outbox=[{id:'retry',text:'test',tries:0,next:0}];
 const db=fakeDb(s),env={FREE_FEEDS:'false',JEWELLER_FEEDS:'false',TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_CHAT_ID:'123'};
 await runCloud(env,db,now,async()=>({ok:false,json:async()=>({ok:false,parameters:{retry_after:120}})}));
 assert.equal(db.value.outbox[0].tries,1);assert.ok(db.value.outbox[0].next>=now+120000);
 db.value.outbox[0].next=0;
 // Persist an eligible retry through the fake store, representing elapsed wall-clock time.
 await db.rpc('metals_save',{p_state:{...db.value,outbox:[{...db.value.outbox[0],next:0}]}});
 await runCloud(env,db,now+180000,async()=>({ok:true,json:async()=>({ok:true})}));
 assert.equal(db.value.outbox.length,0);assert.ok(db.value.sent.retry);
});
test('concurrent invocation skips work when lease is held',async()=>{
 let reads=0;const result=await runCloud({}, {rpc:async()=>false,read:async()=>{reads++;}},Date.now());
 assert.equal(result.skipped,true);assert.equal(reads,0);
});
test('lease is released on failed state read',async()=>{
 const calls=[];await assert.rejects(runCloud({}, {rpc:async n=>{calls.push(n);return true;},read:async()=>{throw Error('offline');}},Date.now()));
 assert.deepEqual(calls,['metals_claim','metals_release']);
});
test('endpoints fail closed and cron does not accept the dashboard password',()=>{
 const res={setHeader(){},end(){}};const secret='a-long-enough-test-secret';
 assert.equal(protect({headers:{}},res,false,{}),false);assert.equal(res.statusCode,503);
 assert.equal(protect({headers:{authorization:'Basic '+Buffer.from('metals:'+secret).toString('base64')}},res,true,{CRON_SECRET:secret}),false);
 assert.equal(protect({headers:{authorization:'Bearer '+secret}},res,true,{CRON_SECRET:secret}),true);
});
test('public status omits message queue and private deduplication state',()=>{
 const s=emptyState();s.outbox=[{text:'private'}];s.sent.secret='sent';
 const serialized=JSON.stringify(publicStatus(s,{}));assert.ok(!serialized.includes('private'));assert.ok(!serialized.includes('secret'));
});
test('database transport sends privileged key server-side and rejects errors',async()=>{
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-key'};
 let called=false;const db=database(env,async(url,options)=>{called=true;assert.equal(url.pathname,'/rest/v1/rpc/metals_read');assert.equal(options.headers.apikey,'server-key');return {ok:true,json:async()=>({})};});
 assert.deepEqual(await db.read(),emptyState());assert.equal(called,true);
 await assert.rejects(database(env,async()=>({ok:false})).read());
});
