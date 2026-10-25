import test from 'node:test';import assert from 'node:assert/strict';
import {sendTelegramTest,allowTestRequest,telegramFailure} from './telegram-test.mjs';
test('Telegram chat and token errors give specific fixes without echoing raw responses',()=>{
 assert.match(telegramFailure({error_code:400,description:'Bad Request: chat not found'}),/Update TELEGRAM_CHAT_ID/);
 assert.match(telegramFailure({error_code:401}),/Bot token rejected/);
 assert.match(telegramFailure({error_code:403,description:'Forbidden: bot was blocked by the user'}),/Unblock/);
});
test('test delivery persists cooldown before sending and always uses configured destination',async()=>{
 const s={events:[]},env={TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_CHAT_ID:'123'};let saved=0,calls=0;
 const request=async(url,options)=>{calls++;assert.ok(saved);assert.equal(JSON.parse(options.body).chat_id,'123');return {ok:true,json:async()=>({ok:true})};};
 assert.equal((await sendTelegramTest(s,env,async()=>{saved++;},request)).status,200);
 assert.equal((await sendTelegramTest(s,env,async()=>{},request)).status,429);assert.equal(calls,1);
});
test('cross-origin and GET requests cannot trigger messages',()=>{
 assert.equal(allowTestRequest({method:'GET',headers:{}}),false);
 assert.equal(allowTestRequest({method:'POST',headers:{origin:'https://evil.test',host:'app.test'}}),false);
 assert.equal(allowTestRequest({method:'POST',headers:{origin:'https://app.test',host:'app.test'}}),true);
});
