import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import http from "node:http";
import fs from "node:fs/promises";
import { config } from "../website/config.js";
import { requestFor, codeFor, explainError } from "../website/request.js";
import { createPreviewServer } from "../scripts/preview-site.mjs";
const address = config.evm
  ? "0x1111111111111111111111111111111111111111"
  : "AvdQRq82hfuTLAmFMkkPy2XsTdoNzGmU7mq54vGjGDEZ";
const values = {
  token: address,
  wallet: address,
  market: address,
  amount: "0.01",
  action: "buy",
  operation: "quote",
  slippage: "100",
};
async function preview(
  run,
  fetcher = async () => new Response('{"stage":"test-fixture"}'),
) {
  const server = createPreviewServer({ fetcher });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    await run(base);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("playground preserves exact buy/sell units, fee cap and per-venue market fields", () => {
  for (const operation of ["quote", "trade"])
    for (const action of ["buy", "sell"]) {
      const amount = action === "buy" ? "0.000000001" : "1000000000";
      const req = requestFor({ ...values, operation, action, amount }, true);
      assert.equal(req.path, "/api/" + operation);
      assert.equal(req.body.amount, amount);
      assert.equal(typeof req.body.amount, "string");
      assert.equal(req.body.action, action);
      assert.equal(req.body.maxServiceFeeBps, 25);
      assert.equal(req.body.slippageBps, 100);
      assert.equal(req.body[config.evm ? "token" : "mint"], address);
      assert.equal(Object.hasOwn(req.body, "market"), !!config.needsMarket);
    }
  if (config.evm)
    assert.deepEqual(
      requestFor({ operation: "market", token: address }, true).body,
      { token: address },
    );
});
test("playground rejects invalid units, fee-unrelated slippage changes and malformed public addresses", () => {
  for (const change of [
    { amount: "0" },
    { amount: "" },
    { amount: "   " },
    { amount: undefined },
    { amount: null },
    { amount: 0 },
    { action: "" },
    { amount: "1e-3" },
    { amount: "-1" },
    { amount: "101" },
    { amount: "1.2", action: "sell" },
    { slippage: 0 },
    { slippage: 99999 },
    { token: "PRIVATE KEY PHRASE" },
    { wallet: "not-a-wallet" },
    { operation: "send" },
  ]) {
    assert.throws(() => requestFor({ ...values, ...change }, true));
  }
  if (config.four)
    assert.throws(() =>
      requestFor({ ...values, action: "sell", amount: "1000000001" }, true),
    );
});
test("generated JavaScript keeps adversarial strings as data and sends exactly one unsigned request", async () => {
  const req = {
    path: "/api/quote",
    body: {
      token: '\"; globalThis.compromised = true; //',
      amount: "'; echo BAD; '",
    },
  };
  let calls = 0;
  const sandbox = {
    console: { log() {} },
    AbortSignal,
    fetch: async (url, options) => {
      calls++;
      assert.equal(url, "http://127.0.0.1:8787/api/quote");
      assert.deepEqual(JSON.parse(options.body), req.body);
      return { ok: true, json: async () => ({ ok: true }) };
    },
  };
  const context = vm.createContext(sandbox);
  await new vm.Script(
    "(async()=>{" + codeFor(req, "javascript") + "\n})()",
  ).runInContext(context);
  assert.equal(calls, 1);
  assert.equal(sandbox.compromised, undefined);
  assert.ok(codeFor(req, "curl").includes("'\"'\"'"));
  assert.ok(codeFor(req, "python").includes("json.loads("));
});
test("preview exposes only website assets and read-only API operations", async () => {
  let calls = 0;
  await preview(
    async (base) => {
      const page = await fetch(base);
      assert.equal(page.status, 200);
      assert.match(
        page.headers.get("content-security-policy"),
        /script-src 'self'/,
      );
      assert.match(
        await page.text(),
        new RegExp(config.short.replaceAll(".", "\\.")),
      );
      for (const pathname of [
        "/api/trade",
        "/api/approval",
        "/api/send",
        "/.git/config",
        "/package.json",
        "/config.js?bad=1/../../",
      ]) {
        const res = await fetch(base + pathname, {
          method: "POST",
          body: "{}",
        });
        assert.equal(res.status, 404);
      }
      const head = await fetch(base + "/style.css", { method: "HEAD" });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), "");
      assert.equal(calls, 0);
    },
    async () => {
      calls++;
      return new Response("{}");
    },
  );
});
test("preview never proxies blockchain requests, even with valid public inputs", async () => {
  let calls=0;
  await preview(async base=>{
    const req=requestFor(values,true);
    for(const path of ['/api/market','/api/quote','/api/trade','/api/approval']) {
      const res=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(req.body)});
      assert.equal(res.status,404);
    }
    const res=await fetch(base+'/api/capabilities',{headers:{origin:'https://foreign.invalid'}});
    assert.equal(res.status,403);assert.equal(calls,0);
  },async()=>{calls++;return Response.json({});});
});

test("preview forwards only static capability metadata without user credentials", async () => {
  let calls=0;
  await preview(async base=>{
    const res=await fetch(base+'/api/capabilities',{headers:{Authorization:'Bearer never-forward',Cookie:'secret=value'}});
    assert.equal(res.status,200);assert.equal((await res.json()).rpcMode,'customer');assert.equal(calls,1);
  },async(url,options)=>{
    calls++;assert.equal(url,config.api+'/api/capabilities');assert.deepEqual(options.headers,{});
    return Response.json({rpcMode:'customer'});
  });
});

test("onboarding states beta limits, next steps, fees and empty live-test status honestly", async () => {
  const html = await fs.readFile(
    new URL("../website/index.html", import.meta.url),
    "utf8",
  );
  assert.ok(html.includes(config.fee));
  assert.ok(html.includes("0.25%"));
  assert.match(html, /Your RPC/);
  assert.match(html, /funded/i);
  assert.match(html, /No independent security audit or latency SLA/);
  assert.match(explainError("SETUP_REQUIRED"), /operator/);
  assert.match(explainError("APPROVAL_REQUIRED"), /exact approval/);
});
