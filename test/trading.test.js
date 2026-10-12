import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeFunctionResult,
  encodeFunctionData,
  decodeFunctionData,
  parseAbi,
  toHex,
} from "viem";
import { handle } from "../src/worker.js";
import { input, build, erc20 } from "../src/trading.js";
import { createReadRpc } from "../src/evm-rpc.js";
import artifact from "../artifacts/TradeSettlement.json" with { type: "json" };
import config from "../src/config.json" with { type: "json" };
const wallet = "0x0000000000000000000000000000000000003000",
  token = "0x0000000000000000000000000000000000002000",
  router = "0x0000000000000000000000000000000000001000";
const request = {
  publicKey: wallet,
  token,
  action: "buy",
  amount: "0.01",
  maxServiceFeeBps: 25,
};
const header = {
  number: "0x100",
  timestamp: toHex(Math.floor(Date.now() / 1000)),
  hash: "0x" + "11".repeat(32),
};
function fixture({
  chain = config.chainId,
  code = artifact.runtimeBytecode,
  fee = 25n,
  recipient = config.fee,
  allowance = 0n,
  changed = false,
  reorg = false,
  fail = false,
  stageId = 0,
} = {}) {
  let stages = 0;
  const calls = [];
  const rpc = async (method, params = []) => {
    calls.push({ method, params });
    if (method === "eth_chainId") return toHex(chain);
    if (method === "eth_getBlockByNumber")
      return {
        ...header,
        hash:
          reorg && params[0] !== "latest"
            ? "0x" + "22".repeat(32)
            : header.hash,
      };
    if (method === "eth_getCode") return code;
    if (method === "eth_estimateGas") return "0x30d40";
    if (method === "eth_getBalance") return "0x10000000000000000000";
    if (method === "eth_call") {
      const abi = params[0].to.toLowerCase() === token ? erc20 : artifact.abi;
      const d = decodeFunctionData({ abi, data: params[0].data });
      let result;
      if (d.functionName === "FEE_BPS") result = fee;
      else if (d.functionName === "FEE_RECIPIENT") result = recipient;
      else if (d.functionName === "CHAIN_ID") result = BigInt(config.chainId);
      else if (d.functionName === "stage")
        result = [changed && stages++ > 0 ? 1 : stageId, router, 0];
      else if (d.functionName === "allowance") result = allowance;
      else if (d.functionName === "approve") result = true;
      else if (d.functionName === "buy" || d.functionName === "sell") {
        if (fail) throw new Error("simulated revert");
        result =
          d.functionName === "buy"
            ? [1000000n, 24937655860349n, 1n]
            : [997500n, 2500n];
      } else throw new Error("Unexpected ABI");
      return encodeFunctionResult({
        abi,
        functionName: d.functionName,
        result,
      });
    }
    throw new Error("Unexpected method " + method);
  };
  return { rpc, calls };
}
test("all supported stage/direction combinations produce bounded unsigned transactions", async () => {
  for (const stageId of config.stages.keys())
    for (const action of ["buy", "sell"]) {
      const f = fixture({ allowance: 10n ** 20n, stageId });
      const result = await build(
        f.rpc,
        { SETTLEMENT_ROUTER: router },
        {
          ...request,
          action,
          amount: action === "buy" ? "0.01" : "1000000000",
        },
      );
      assert.equal(result.unsigned, true);
      assert.equal(result.submitted, false);
      assert.equal(result.simulation.status, "passed");
      assert.equal(result.minimumOut, action === "buy" ? "990000" : "987525");
      assert.equal(result.transaction.to, router);
      assert.ok(f.calls.every((c) => !c.method.includes("send")));
      const d = decodeFunctionData({
        abi: artifact.abi,
        data: result.transaction.data,
      });
      assert.equal(d.functionName, action);
      assert.equal(d.args[action === "buy" ? 3 : 4], 25n);
    }
});
test("unconfigured or altered settlement cannot produce a trade", async () => {
  await assert.rejects(
    () => build(fixture().rpc, {}, request),
    (e) => e.code === "SETUP_REQUIRED",
  );
  for (const options of [
    { code: "0x00" },
    { fee: 26n },
    { recipient: wallet },
    { chain: 1 },
  ])
    await assert.rejects(() =>
      build(fixture(options).rpc, { SETTLEMENT_ROUTER: router }, request),
    );
});
test("stage changes and reorganizations invalidate an otherwise simulated build", async () => {
  for (const options of [{ changed: true }, { reorg: true }])
    await assert.rejects(
      () => build(fixture(options).rpc, { SETTLEMENT_ROUTER: router }, request),
      (e) => ["STAGE_CHANGED", "SNAPSHOT_CHANGED"].includes(e.code),
    );
});
test("sells require exact allowance; insufficient nonzero allowance gets a zero reset", async () => {
  const sell = { ...request, action: "sell", amount: "1000000000" };
  await assert.rejects(
    () => build(fixture().rpc, { SETTLEMENT_ROUTER: router }, sell),
    (e) => e.code === "APPROVAL_REQUIRED",
  );
  for (const allowance of [0n, 1n]) {
    const r = await build(
      fixture({ allowance }).rpc,
      { SETTLEMENT_ROUTER: router },
      sell,
      { approvalOnly: true },
    );
    const d = decodeFunctionData({ abi: erc20, data: r.transaction.data });
    assert.equal(d.functionName, "approve");
    assert.equal(d.args[0], router);
    assert.equal(d.args[1], allowance === 0n ? 1000000000n : 0n);
  }
});
test("rejects unexpected fields, keys, bad precision, amounts and fee limits", () => {
  for (const extra of [
    { privateKey: "never-accepted" },
    { rpcUrl: "https://attacker.invalid" },
    { amount: 0.1 },
    { amount: "0.0000000000000000001" },
    { amount: "0" },
    { slippageBps: 10001 },
    { maxServiceFeeBps: 24 },
    { publicKey: config.fee },
    { action: "transfer" },
  ])
    assert.throws(() => input({ ...request, ...extra }));
});
test("HTTP returns explicit setup state, enforces body limit and protects public endpoint", async () => {
  const send = (body, context = { test: true }) =>
    handle(
      new Request("https://api.invalid/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      {},
      context,
    );
  assert.equal((await send(request)).status, 503);
  assert.equal(
    (await send({ ...request, extra: "x".repeat(5000) })).status,
    413,
  );
  assert.equal((await send(request, {})).status, 503);
  const cap = await (
    await handle(new Request("https://api.invalid/api/capabilities"))
  ).json();
  assert.equal(cap.tradingStatus, "setup-required");
  assert.equal(cap.signing, false);
  assert.equal(cap.broadcast, false);
});
test("RPC client blocks broadcasts, redirects and mismatched IDs without leaking upstream errors", async () => {
  const rpc = createReadRpc("https://rpc.invalid", {
    fetchImpl: async () => {
      throw new Error("secret-key-value");
    },
  });
  await assert.rejects(
    () => rpc("eth_sendRawTransaction", []),
    (e) => e.code === "RPC_METHOD",
  );
  await assert.rejects(
    () => rpc("eth_chainId", []),
    (e) => !e.message.includes("secret-key-value"),
  );
  const bad = createReadRpc("https://rpc.invalid", {
    fetchImpl: async () =>
      Response.json({ jsonrpc: "2.0", id: 999, result: "0x38" }),
  });
  await assert.rejects(
    () => bad("eth_chainId"),
    (e) => e.code === "RPC_RESPONSE",
  );
  const redirect = createReadRpc("https://rpc.invalid", {
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.invalid" },
      }),
  });
  await assert.rejects(
    () => redirect("eth_chainId"),
    (e) => e.code === "RPC_HTTP",
  );
});

import { prepareTrade, executeTrade } from "../examples/bot.mjs";
test("local bot rejects modified fee calldata and enforces its own price before signing", async () => {
  const good = await build(
    fixture().rpc,
    { SETTLEMENT_ROUTER: router },
    request,
  );
  const original = globalThis.fetch;
  let reply = good,
    submitted = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url.url ?? url).startsWith("https://rpc.invalid")) {
      const body = JSON.parse(options?.body ?? (await url.clone().text()));
      let result;
      if (body.method === "eth_chainId") result = toHex(config.chainId);
      else if (body.method === "eth_getCode") result = artifact.runtimeBytecode;
      else if (body.method === "eth_call") {
        const d = decodeFunctionData({
          abi: artifact.abi,
          data: body.params[0].data,
        });
        const value =
          d.functionName === "FEE_BPS"
            ? 25n
            : d.functionName === "CHAIN_ID"
              ? BigInt(config.chainId)
              : config.fee;
        result = encodeFunctionResult({
          abi: artifact.abi,
          functionName: d.functionName,
          result: value,
        });
      } else throw new Error("Unexpected local verification method");
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    }
    return Response.json(reply);
  };
  try {
    const args = {
      rpcUrl: "https://rpc.invalid",
      expectedRouter: router,
      ...request,
    };
    assert.equal((await prepareTrade(args)).transaction.to, router);
    const d = decodeFunctionData({
      abi: artifact.abi,
      data: good.transaction.data,
    });
    d.args[3] = 26n;
    reply = {
      ...good,
      transaction: {
        ...good.transaction,
        data: encodeFunctionData({
          abi: artifact.abi,
          functionName: "buy",
          args: d.args,
        }),
      },
    };
    await assert.rejects(() => prepareTrade(args), /Amount\/fee mismatch/);
    reply = good;
    const walletClient = {
      account: { address: wallet },
      chain: { id: config.chainId },
      sendTransaction: async () => {
        submitted++;
        return "0x" + "ab".repeat(32);
      },
    };
    const publicClient = {
      getChainId: async () => config.chainId,
      waitForTransactionReceipt: async () => ({ status: "success" }),
    };
    await assert.rejects(
      () =>
        executeTrade({
          ...args,
          walletClient,
          publicClient,
          minimumAcceptableOut: 1000001n,
        }),
      /acceptable price/,
    );
    assert.equal(submitted, 0);
    const result = await executeTrade({
      ...args,
      walletClient,
      publicClient,
      minimumAcceptableOut: 990000n,
    });
    assert.equal(result.receipt.status, "success");
    assert.equal(submitted, 1);
  } finally {
    globalThis.fetch = original;
  }
});
