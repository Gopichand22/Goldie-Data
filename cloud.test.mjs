import test from 'node:test';
import assert from 'node:assert/strict';
import {runCloud,refreshStatus,emptyState,protect,publicStatus,database} from './lib/cloud.mjs';
function fakeDb(state=emptyState()){
 let value=structuredClone(state),locked=false;const calls=[];
 return {calls,get value(){return value;},read:async()=>structuredClone(value),save:async(token,state)=>{value=structuredClone(state);return true;},rpc:async(name,args)=>{
  calls.push(name);
  if(name==='metals_claim'){if(locked)return false;locked=true;return true;}
  if(name==='metals_save'){value=structuredClone(args.p_state);return true;}
  if(name==='metals_release'){locked=false;return true;}
 }};
}
test('cloud run compares prices once per IST hour and messages only on a difference',async()=>{
 const now=Date.parse('2026-10-25T08:01:00+05:30'),s=emptyState();
 s.jewellers={khazana:{name:'Khazana',status:'available',rates:{gold22k:11000},checkedAt:new Date(now).toISOString()}};
 const db=fakeDb(s),env={FREE_FEEDS:'false',JEWELLER_FEEDS:'false',TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_CHAT_ID:'123'};const texts=[];
 const request=async(url,o)=>{assert.ok(db.value.outbox.length>0,'persist before Telegram send');texts.push(JSON.parse(o.body).text);return {ok:true,json:async()=>({ok:true})};};
 await runCloud(env,db,now,request);
 assert.equal(texts.length,0,'first check only records a baseline');
 await runCloud(env,db,now+3600000,request);
 assert.equal(texts.length,0,'unchanged price sends nothing');
 await db.rpc('metals_save',{p_state:{...db.value,jewellers:{khazana:{...db.value.jewellers.khazana,rates:{gold22k:11080}}}}});
 await runCloud(env,db,now+3600000+60000,request);
 assert.equal(texts.length,0,'same hour is not checked twice');
 await runCloud(env,db,now+7200000,request);await runCloud(env,db,now+7200000+60000,request);
 assert.equal(texts.length,1);assert.match(texts[0],/10:00 IST/);assert.match(texts[0],/Khazana 22K gold/);
 assert.ok(db.value.sent['2026-10-25/10/change']);assert.equal(db.value.outbox.length,0);
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
test('dashboard is public while cron requires a configured bearer secret',()=>{
 const res={setHeader(){},end(){}};const secret='a-long-enough-test-secret';
 assert.equal(protect({headers:{}},res,false,{}),true);
 assert.equal(protect({headers:{}},res,true,{}),false);assert.equal(res.statusCode,503);
 assert.equal(protect({headers:{authorization:'Basic '+Buffer.from('metals:'+secret).toString('base64')}},res,true,{CRON_SECRET:secret}),false);
 assert.equal(protect({headers:{authorization:'Bearer '+secret}},res,true,{CRON_SECRET:secret}),true);
});
test('public status omits message queue and private deduplication state',()=>{
 const s=emptyState();s.outbox=[{text:'private'}];s.sent.secret='sent';
 const serialized=JSON.stringify(publicStatus(s,{}));assert.ok(!serialized.includes('private'));assert.ok(!serialized.includes('secret'));
});
test('database transport sends privileged key server-side and rejects errors',async()=>{
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-key'};
 const paths=[];const db=database(env,async(url,options)=>{paths.push(url.pathname);assert.equal(options.headers.apikey,'server-key');return {ok:true,json:async()=>url.pathname.endsWith('metals_version')?1:{}};},{});
 assert.deepEqual(await db.read(),emptyState());assert.ok(paths.includes('/rest/v1/rpc/metals_read'));
 await assert.rejects(database(env,async()=>({ok:false}),{}).read());
});
test('unchanged state is downloaded once; a new version or own save refreshes the warm copy',async()=>{
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-key'};
 let version=1,stored={lastPoll:'a'},downloads=0;
 const request=async(url,options)=>{const name=url.pathname.split('/').pop(),args=JSON.parse(options.body);let out;
  if(name==='metals_version')out=version;
  if(name==='metals_read'){downloads++;out=stored;}
  if(name==='metals_commit'){if(args.p_token==='lost')out=null;else{stored=args.p_state;out=++version;}}
  return {ok:true,json:async()=>structuredClone(out)};};
 const db=database(env,request,{});
 const first=await db.read();assert.equal(db.cached,false);first.lastPoll='mutated';
 assert.equal((await db.read()).lastPoll,'a','callers cannot corrupt the warm copy');assert.equal(db.cached,true);assert.equal(downloads,1);
 const s=await db.read();s.lastPoll='b';assert.equal(await db.save('token',s),true);
 assert.equal((await db.read()).lastPoll,'b');assert.equal(downloads,1,'own save needs no download');
 stored={lastPoll:'c'};version++;
 assert.equal((await db.read()).lastPoll,'c');assert.equal(downloads,2,'foreign write is downloaded');
 assert.equal(await db.save('lost',s),false);await db.read();assert.equal(downloads,3,'lost lease drops the warm copy');
});
test('dashboard refresh runs the monitor on demand, reuses a recent run and survives a failed run',async()=>{
 const now=Date.parse('2026-10-25T08:01:00+05:30'),db=fakeDb(),env={FREE_FEEDS:'false',JEWELLER_FEEDS:'false'};
 const first=await refreshStatus(env,db,now);assert.equal(first.lastRunAt,new Date(now).toISOString());assert.equal(first.outbox,undefined);
 const claims=()=>db.calls.filter(n=>n==='metals_claim').length;assert.equal(claims(),1);
 await refreshStatus(env,db,now+10000);assert.equal(claims(),1,'recent run reused');
 await refreshStatus(env,db,now+60000);assert.equal(claims(),2);
 db.save=async()=>{throw Error('offline');};
 assert.equal((await refreshStatus(env,db,now+120000)).lastRunAt,new Date(now+60000).toISOString());
});
