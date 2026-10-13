import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createClient } from './index.mjs';

// Optional REST interface for Python, cURL or any bot on the same machine.
// Only unsigned preparation is exposed. This is not a public hosting server.
export function createLocalServer(settings) {
  const client = createClient(settings);
  let active = 0;
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(data));
    };
    const hosts = ['127.0.0.1:' + req.socket.localPort, 'localhost:' + req.socket.localPort];
    if (!hosts.includes(req.headers.host) || (req.headers.origin && !hosts.map(h => 'http://' + h).includes(req.headers.origin)))
      return send(403, { error: { code: 'ORIGIN_REJECTED', message: 'Use this API from your local bot.' } });
    if (req.method === 'GET' && req.url === '/api/capabilities') return send(200, client.capabilities);
    if (req.method === 'GET' && req.url === '/api/deployment' && client.deployment) return send(200, client.deployment);
    if (req.method === 'GET' && req.url === '/api/health')
      return send(200, { status: 'ok', meaning: 'liveness only', rpcMode: 'customer', unsignedOnly: true });
    const operations = { '/api/quote': 'quote', '/api/trade': 'buildTrade', '/api/trade/local': 'buildTrade', '/api/market': 'inspectMarket', '/api/approval': 'buildApproval' };
    const operation = operations[req.url];
    if (req.method !== 'POST' || !operation || typeof client[operation] !== 'function')
      return send(404, { error: { code: 'NOT_FOUND', message: 'Unknown local API operation.' } });
    if (active >= 2) return send(429, { error: { code: 'BUSY', message: 'Wait for the current local request to finish.' } });
    active++;
    let timer;
    try {
      if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || req.headers['content-encoding'])
        return send(415, { error: { code: 'CONTENT_TYPE', message: 'Send uncompressed UTF-8 JSON.' } });
      const chunks=[];
      let size=0;
      timer=setTimeout(() => { send(408, {error:{code:'UPLOAD_TIMEOUT',message:'Request body timed out.'}}); req.destroy(); }, 3000);
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) { send(413, {error:{code:'BODY_TOO_LARGE',message:'Request body is too large.'}}); req.destroy(); return; }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      let body;
      try {
        body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
        if(!body || typeof body!=='object' || Array.isArray(body))throw Error();
      } catch { return send(400,{error:{code:'INVALID_JSON',message:'Send a JSON object.'}}); }
      if(operation==='inspectMarket' && (Object.keys(body).length!==1 || typeof body.token!=='string'))
        return send(400,{error:{code:'INVALID_REQUEST',message:'Provide token only.'}});
      const result = await client[operation](operation==='inspectMarket' ? body.token : body);
      send(200,result);
    } catch(error) {
      const known=Number.isInteger(error.status) && typeof error.code==='string';
      send(known ? error.status : 500,{error:{code:known ? error.code : 'LOCAL_API_ERROR',message:known ? error.message : 'The local request could not be completed.'}});
    } finally { clearTimeout(timer); active--; }
  });
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.LOCAL_API_PORT || 8787);
  if(!Number.isInteger(port) || port<1024 || port>65535)throw Error('Use LOCAL_API_PORT between 1024 and 65535.');
  const server=createLocalServer({rpcUrl:process.env.CUSTOMER_RPC_URL,jupiterApiKey:process.env.JUPITER_API_KEY,settlementRouter:process.env.SETTLEMENT_ROUTER});
  server.on('error',()=>{console.error('Local API could not start. Check the port and configuration.');process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log('Customer RPC API: http://127.0.0.1:'+port+' (unsigned preparation only)'));
}
