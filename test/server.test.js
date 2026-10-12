import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';

async function withServer(fn, inspect) {
  const server = createApp({ rpc: () => { throw new Error('No network in tests'); }, inspect });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const post = (url, body, path = '/v1/market') => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('HTTP liveness/capabilities expose no trading service', () => withServer(async url => {
  const health = await (await fetch(url + '/health')).json(); assert.equal(health.tradingEnabled, false);
  const caps = await (await fetch(url + '/v1/capabilities')).json();
  assert.equal(caps.feesCollected, false); assert.equal(caps.unsignedTransactions, false);
  assert.equal((await post(url, '{}', '/v1/trade')).status, 404);
}));
test('HTTP rejects invalid inputs, extra fields and oversized JSON before inspection', () => withServer(async url => {
  for (const body of ['{', '{}', '[]', '{"token":"x","privateKey":"do-not-accept"}']) assert.equal((await post(url, body)).status, 400);
  assert.equal((await post(url, JSON.stringify({ token: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await fetch(url + '/v1/market', { method: 'POST', body: '{}' })).status, 415);
}, () => { throw new Error('Must not inspect'); }));
test('HTTP successful read and safe internal errors', () => withServer(async url => {
  const result = await post(url, '{"token":"ok"}'); assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.deepEqual(await result.json(), { tradingEnabled: false });
  const bad = await post(url, '{"token":"error"}'); assert.equal(bad.status, 500);
  assert.ok(!(await bad.text()).includes('sensitive'));
}, async (_rpc, token) => { if (token === 'error') throw new Error('sensitive stack'); return { tradingEnabled: false }; }));
test('HTTP concurrency bound releases capacity after in-flight calls finish', () => withServer(async url => {
  const requests = Array.from({ length: 4 }, () => post(url, '{"token":"wait"}'));
  while (pending.length < 4) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await post(url, '{"token":"overflow"}')).status, 429);
  pending.splice(0).forEach(resolve => resolve({ tradingEnabled: false }));
  assert.ok((await Promise.all(requests)).every(r => r.status === 200));
}, () => new Promise(resolve => pending.push(resolve))));
const pending = [];
