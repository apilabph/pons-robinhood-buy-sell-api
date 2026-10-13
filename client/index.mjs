import config from '../src/config.json' with {type:'json'};
import artifact from '../artifacts/TradeSettlement.json' with {type:'json'};
import { createReadRpc } from '../src/evm-rpc.js';
import { build, address } from '../src/trading.js';
import { inspect } from '../src/inspect.js';

// Runs inside the customer's process. Credentials never go to APILabPH.
export function createClient({ rpcUrl, settlementRouter, fetchImpl = fetch } = {}) {
  let parsed;
  try { parsed = new URL(rpcUrl); } catch { throw new Error('Provide your own HTTPS rpcUrl.'); }
  if (typeof rpcUrl !== 'string' || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
    throw new Error('Provide your own HTTPS rpcUrl without basic authentication or a fragment.');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl must be a function.');
  const env = Object.freeze(settlementRouter ? { SETTLEMENT_ROUTER: address(settlementRouter) } : {});
  // Each operation gets a fresh RPC work budget and independently verified state.
  const rpc = () => createReadRpc(rpcUrl, { fetchImpl });
  const run = (order, options) => build(rpc(), env, structuredClone(order), options);
  return Object.freeze({
    capabilities: Object.freeze({rpcMode:"customer",customerRpcRequired:true,hostedTrading:false,serviceFeeBps:25,feeRecipient:config.fee,unsignedOnly:true,broadcast:false,fundedTradesTested:false,chainId:config.chainId,settlementConfigured:!!settlementRouter}),
    deployment: Object.freeze({chainId:config.chainId,feeRecipient:config.fee,serviceFeeBps:25,router:settlementRouter??null,runtimeCodeHash:artifact.runtimeCodeHash,status:settlementRouter?"configured-needs-runtime-check":"contract-deployment-required"}),

    inspectMarket: token => inspect(rpc(), address(token)),
    quote: order => run(order, { quoteOnly: true }),
    buildTrade: order => run(order, {}),
    buildApproval: order => run(order, { approvalOnly: true }),
  });
}
