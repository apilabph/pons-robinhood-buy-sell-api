import { createRpc } from '../src/rpc.js';
import { inspectMarket } from '../src/market.js';
const token = process.argv[2] ?? '0x39dBED3a2bd333467115dE45665cC57F813C4571';
const start = performance.now();
const result = await inspectMarket(createRpc({ url: process.env.ROBINHOOD_RPC_URL }), token);
console.log(JSON.stringify({ verifiedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - start), ...result }, null, 2));
