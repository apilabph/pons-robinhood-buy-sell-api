import test from 'node:test';
import assert from 'node:assert/strict';
import { createRpc } from '../src/rpc.js';

test('RPC cannot sign or send transactions', async () => {
  const rpc = createRpc({ fetchImpl: () => { throw new Error('must not fetch'); } });
  for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'personal_sign', 'eth_sign', 'debug_traceTransaction'])
    await assert.rejects(rpc(method), e => e.code === 'RPC_METHOD');
});
test('RPC requires matching JSON-RPC envelope and suppresses provider details', async () => {
  for (const body of [{ id: 99, jsonrpc: '2.0', result: '0x1237' }, { id: 1, result: '0x1237' }, { id: 1, jsonrpc: '2.0', error: { message: 'secret upstream URL' } }]) {
    const rpc = createRpc({ fetchImpl: async () => Response.json(body) });
    await assert.rejects(rpc('eth_chainId'), e => !e.message.includes('secret') && ['RPC_RESPONSE', 'RPC_ERROR'].includes(e.code));
  }
});
test('RPC rejects oversized responses and malformed JSON', async () => {
  await assert.rejects(createRpc({ maxBytes: 8, fetchImpl: async () => new Response('a'.repeat(50)) })('eth_chainId'), e => e.code === 'RPC_SIZE');
  await assert.rejects(createRpc({ fetchImpl: async () => new Response('invalid') })('eth_chainId'), e => e.code === 'RPC_RESPONSE');
});
test('RPC is HTTPS only and rejects embedded userinfo', () => {
  for (const url of ['http://localhost', 'https://name:secret@example.com', 'https://example.com/#fragment'])
    assert.throws(() => createRpc({ url }), e => e.code === 'RPC_CONFIG');
});
test('RPC timeout is bounded and does not expose network error text', async () => {
  const rpc = createRpc({ timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('credential-bearing URL')))) });
  await assert.rejects(rpc('eth_chainId'), e => e.code === 'RPC_TIMEOUT' && !e.message.includes('credential'));
});
test('valid result, redirect rejection and unique request IDs', async () => {
  const ids = [];
  const rpc = createRpc({ fetchImpl: async (_url, init) => {
    assert.equal(init.redirect, 'error'); const body = JSON.parse(init.body); ids.push(body.id);
    return Response.json({ jsonrpc: '2.0', id: body.id, result: '0x1237' });
  } });
  assert.deepEqual(await Promise.all([rpc('eth_chainId'), rpc('eth_chainId')]), ['0x1237', '0x1237']);
  assert.deepEqual(ids, [1, 2]);
});
