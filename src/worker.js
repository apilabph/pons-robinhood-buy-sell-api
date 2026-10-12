import config from "./config.json" with { type: "json" };
import artifact from "../artifacts/TradeSettlement.json" with { type: "json" };
import spec from "../openapi.json" with { type: "json" };
import { ApiError, requireThat, createReadRpc } from "./evm-rpc.js";
import { build, address, snapshot, verifyRouter, read } from "./trading.js";
import { inspect } from "./inspect.js";
import { html } from "./site.js";
const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
};
const json = (x, status = 200) =>
  new Response(JSON.stringify(x), {
    status,
    headers: { ...headers, "content-type": "application/json; charset=utf-8" },
  });
async function body(request) {
  requireThat(
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ===
      "application/json",
    "CONTENT_TYPE",
    "Use application/json.",
    415,
  );
  const reader = request.body?.getReader();
  requireThat(reader, "INVALID_JSON", "JSON body is required.", 400);
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        throw new ApiError(
          "BODY_TOO_LARGE",
          "Request exceeds 4096 bytes.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("INVALID_JSON", "Use valid JSON.", 400);
  }
}
export async function handle(request, env = {}, context = {}) {
  const started = Date.now(),
    requestId = crypto.randomUUID();
  try {
    const url = new URL(request.url),
      p = url.pathname;
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    if (request.method === "GET") {
      if (p === "/")
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "public, max-age=300",
            "x-content-type-options": "nosniff",
            "content-security-policy":
              "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
          },
        });
      if (p === "/openapi.json") return json(spec);
      if (p === "/robots.txt")
        return new Response(
          "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://" +
            config.host +
            ".apilabph.workers.dev/sitemap.xml\n",
        );
      if (p === "/sitemap.xml")
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://' +
            config.host +
            ".apilabph.workers.dev/</loc></url></urlset>",
          { headers: { "content-type": "application/xml" } },
        );
      if (p === "/api/health")
        return json({
          status: "ok",
          meaning: "liveness only",
          version: config.version,
        });
      if (p === "/api/capabilities")
        return json({
          name: config.name,
          version: config.version,
          chainId: config.chainId,
          marketInspection: true,
          settlementConfigured: Boolean(env.SETTLEMENT_ROUTER),
          runtimeVerification: "required per build",
          tradingStatus: env.SETTLEMENT_ROUTER
            ? "verify-on-request"
            : "setup-required",
          feeCollectionActive: false,
          feeCollectionNote:
            "No funded live-trade verification in this release.",
          stages: config.stages,
          serviceFeeBps: 25,
          feeRecipient: config.fee,
          signing: false,
          broadcast: false,
          rapidapi: false,
        });
      if (p === "/api/deployment")
        return json({
          chainId: config.chainId,
          feeRecipient: config.fee,
          serviceFeeBps: 25,
          router: env.SETTLEMENT_ROUTER ?? null,
          runtimeCodeHash: artifact.runtimeCodeHash,
          artifact:
            "https://github.com/apilabph/" +
            config.slug +
            "/blob/main/artifacts/TradeSettlement.json",
          status: env.SETTLEMENT_ROUTER
            ? "configured-needs-runtime-check"
            : "contract-deployment-required",
        });
    }
    requireThat(
      request.method === "POST" &&
        ["/api/market", "/api/quote", "/api/trade", "/api/approval"].includes(
          p,
        ),
      "NOT_FOUND",
      "Endpoint not found.",
      404,
    );
    if (!context.test) {
      const ip = request.headers.get("cf-connecting-ip");
      requireThat(
        ip && env.PUBLIC_RATE_LIMITER && env.PUBLIC_TOTAL_LIMITER,
        "RATE_LIMIT_CONFIG",
        "Public rate limiting is unavailable.",
        503,
      );
      const a = await env.PUBLIC_RATE_LIMITER.limit({ key: ip }),
        b = await env.PUBLIC_TOTAL_LIMITER.limit({ key: "all" });
      requireThat(
        a.success && b.success,
        "RATE_LIMIT",
        "Rate limit reached. Retry after one minute.",
        429,
      );
    }
    const data = await body(request),
      rpc = context.rpc ?? createReadRpc(env.EVM_RPC_URL ?? config.rpc);
    let result;
    if (p === "/api/market") {
      requireThat(
        data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          Object.keys(data).length === 1 &&
          Object.hasOwn(data, "token"),
        "INVALID_REQUEST",
        "Provide token only.",
        400,
      );
      const token = address(data.token);
      result = await inspect(rpc, token);
      if (env.SETTLEMENT_ROUTER) {
        const block = await snapshot(rpc),
          router = await verifyRouter(rpc, env, block.number),
          s = await read(rpc, router, "stage", [token], block.number);
        result = {
          ...result,
          verifiedSettlementStage: config.stages[s[0]],
          router,
        };
      }
    } else
      result = await build(rpc, env, data, {
        quoteOnly: p === "/api/quote",
        approvalOnly: p === "/api/approval",
      });
    return json({ ...result, requestId, buildMs: Date.now() - started });
  } catch (error) {
    return json(
      {
        error: {
          code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
          message:
            error instanceof ApiError
              ? error.message
              : "Request could not be completed.",
        },
        requestId,
      },
      error instanceof ApiError ? error.status : 500,
    );
  }
}
export default { fetch: handle };
