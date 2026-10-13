import specification from '../openapi.json' with {type:'json'};
import { customerHtml } from './customer-docs.js';
import config from './config.json' with { type: 'json' };
// Documentation hosting must not perform any blockchain RPC work in customer mode.
export function customerRpcResponse(request, env = {}) {
  if (env.RPC_MODE === 'self-hosted') return null;
  const url = new URL(request.url);
  if (['GET','HEAD'].includes(request.method) && url.pathname === '/') return new Response(request.method === 'HEAD' ? null : customerHtml,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'cache-control':'no-store'}});
  if (['GET','HEAD'].includes(request.method) && url.pathname === '/openapi.json') return new Response(request.method === 'HEAD' ? null : JSON.stringify(specification),{headers:{'content-type':'application/json','cache-control':'no-store'}});
  if (!url.pathname.startsWith('/api/')) return null;
  const capabilities = { rpcMode: 'customer', customerRpcRequired: true, hostedTrading: false, serviceFeeBps: 25, feeRecipient: config.fee, signing: 'client', broadcast: false, fundedTradesTested: false, localApi: 'http://127.0.0.1:8787', documentation: 'https://github.com/apilabph/pons-robinhood-buy-sell-api/blob/main/docs/CUSTOMER-RPC.md' };
  if (request.method === 'GET' && ['/api/health', '/api/capabilities'].includes(url.pathname))
    return Response.json(url.pathname === '/api/health' ? { status: 'ok', meaning: 'documentation liveness only', rpcMode: 'customer' } : capabilities, {headers:{'cache-control':'no-store'}});
  if (request.method === 'GET' && url.pathname === '/api/deployment') return null;
  return Response.json({error:{code:'CUSTOMER_RPC_REQUIRED',message:'Run the local API or client in your own bot with your own RPC. This hosted endpoint does not prepare trades.'},documentation:capabilities.documentation},{status:410,headers:{'cache-control':'no-store'}});
}
