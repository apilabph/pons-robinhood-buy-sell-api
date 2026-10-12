import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { CAPABILITIES } from './network.js';
import { ApiError, createRpc, requireThat } from './rpc.js';
import { inspectMarket } from './market.js';

export function createApp({ rpc = createRpc(), inspect = inspectMarket } = {}) {
  let active = 0;
  return createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(body));
    };
    let reserved = false;
    try {
      if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', meaning: 'process liveness only', tradingEnabled: false });
      if (req.method === 'GET' && req.url === '/v1/capabilities') return send(200, CAPABILITIES);
      if (req.method !== 'POST' || req.url !== '/v1/market') return send(404, { error: { code: 'NOT_FOUND', message: 'Only market inspection is available.' } });
      requireThat(active < 4, 'BUSY', 'Too many concurrent inspections.', 429);
      active++; reserved = true;
      requireThat(req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json', 'CONTENT_TYPE', 'Use application/json.', 415);
      const chunks = []; let length = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        requireThat(length <= 4096, 'BODY_TOO_LARGE', 'JSON body exceeds 4096 bytes.', 413);
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new ApiError('INVALID_JSON', 'Use a JSON object containing token.', 400); }
      requireThat(body && !Array.isArray(body) && typeof body === 'object' && Object.keys(body).length === 1 && Object.hasOwn(body, 'token'), 'INVALID_REQUEST', 'The only request field is token.', 400);
      send(200, await inspect(rpc, body.token));
    } catch (error) {
      if (!req.complete) { res.setHeader('connection', 'close'); req.resume(); }
      send(error instanceof ApiError ? error.status : 500, { error: {
        code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
        message: error instanceof ApiError ? error.message : 'Inspection failed.' } });
    } finally { if (reserved) active--; }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8788);
  requireThat(Number.isInteger(port) && port > 0 && port < 65536, 'PORT', 'Invalid local port.', 500);
  const app = createApp({ rpc: createRpc({ url: process.env.ROBINHOOD_RPC_URL }) });
  app.requestTimeout = 15000;
  app.headersTimeout = 10000;
  app.listen(port, '127.0.0.1', () => console.log(`Read-only development API: http://127.0.0.1:${port}`));
}
