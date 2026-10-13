import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../client/index.mjs';

test('customer client requires an explicit RPC and never chooses a provider implicitly', () => {
  for (const rpcUrl of [undefined, '', 'not-a-url', 'http://rpc.example', 'https://user:pass@rpc.example', 'https://rpc.example/#secret'])
    assert.throws(() => createClient({rpcUrl}), /HTTPS rpcUrl/);
});
test('invalid orders perform zero RPC and routing requests', async () => {
  let calls=0;
  const client=createClient({rpcUrl:'https://customer-rpc.example/?api-key=customer-fixture',fetchImpl:async()=>{calls++;throw Error('Unexpected network');}});
  await assert.rejects(() => client.buildTrade({privateKey:'not-a-real-key'}));
  assert.equal(calls,0);
});
test('provider failures stay on the customer endpoint and do not expose credentials', async () => {
  const rpcUrl='https://customer-rpc.example/?api-key=customer-fixture', calls=[];
  const client=createClient({rpcUrl,fetchImpl:async(url,options)=>{calls.push({url,options});throw Error(rpcUrl);}});
  const order='0x1111111111111111111111111111111111111111';
  await assert.rejects(() => client.inspectMarket(order), error => !String(error).includes('customer-fixture'));
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.url === rpcUrl && call.options.redirect === 'manual'));
});

test('hosted customer mode performs zero network calls, even with legacy operator RPC configured',async()=>{
 const {default:worker}=await import('../src/worker.js');
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Hosted RPC must not run');};
 try {
  for(const mode of [undefined,'customer']){
  const env={RPC_MODE:mode,ACCESS_MODE:'public',SOLANA_RPC_URL:'https://operator.invalid',EVM_RPC_URL:'https://operator.invalid'};
  for(const path of ['/api/quote','/api/trade','/api/trade/local','/api/market','/api/approval']){
   const response=await worker.fetch(new Request('https://host.invalid'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env,{});
   assert.equal(response.status,410);assert.equal((await response.json()).error.code,'CUSTOMER_RPC_REQUIRED');
  }
  const spec=await worker.fetch(new Request('https://host.invalid/openapi.json'),env,{});
  assert.equal(spec.status,200);assert.equal((await spec.json()).servers[0].url,'http://127.0.0.1:8787');
  const page=await worker.fetch(new Request('https://host.invalid/'),env,{});
  assert.match(await page.text(),/CUSTOMER_RPC_URL/);
  const caps=await worker.fetch(new Request('https://host.invalid/api/capabilities'),env,{});
  assert.equal((await caps.json()).rpcMode,'customer');assert.equal(calls,0);
  }
 }finally{globalThis.fetch=original;}
});

test('local REST binds requests to customer configuration, rejects foreign origins and never accepts signing',async()=>{
 const {createLocalServer}=await import('../client/server.mjs');
 let calls=0;
 const server=createLocalServer({rpcUrl:'https://customer.invalid/?key=fixture',fetchImpl:async()=>{calls++;throw Error('no network expected');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const cap=await fetch(base+'/api/capabilities');assert.equal((await cap.json()).rpcMode,'customer');
  const send=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body});
  assert.equal((await send('/api/trade','{}',{origin:'https://foreign.invalid'})).status,403);
  assert.equal((await send('/api/send','{}')).status,404);
  assert.equal((await send('/api/sign','{}')).status,404);
  assert.equal((await send('/api/trade','{"privateKey":"fixture"}')).status,400);
  assert.equal((await send('/api/trade',Buffer.from([0xff]))).status,400);
  assert.equal((await send('/api/trade','{}',{'content-encoding':'gzip'})).status,415);
  assert.equal(calls,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
