import test, { before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import solc from "solc";
import { createVM } from "@ethereumjs/vm";
import { createCustomCommon, Mainnet } from "@ethereumjs/common";
import {
  Account,
  createAddressFromString,
  hexToBytes,
  bytesToHex,
} from "@ethereumjs/util";
import { decodeFunctionResult, encodeFunctionData } from "viem";
import config from "../src/config.json" with { type: "json" };
const router = "0x0000000000000000000000000000000000001000",
  token = "0x0000000000000000000000000000000000002000",
  user = "0x0000000000000000000000000000000000003000",
  venue = "0x0000000000000000000000000000000000004000";
let contracts;
before(() => {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "SettlementBase.sol": {
            content: fs.readFileSync("contracts/SettlementBase.sol", "utf8"),
          },
          "Harness.sol": {
            content: fs.readFileSync("test/fixtures/Harness.sol", "utf8"),
          },
        },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
          evmVersion: "paris",
          outputSelection: {
            "*": { "*": ["abi", "evm.deployedBytecode.object"] },
          },
        },
      }),
    ),
  );
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  assert.deepEqual(errors, []);
  contracts = output.contracts["Harness.sol"];
});
async function setup(chainId = config.chainId) {
  const vm = await createVM({
    common: createCustomCommon({ chainId }, Mainnet, { hardfork: "shanghai" }),
  });
  const addr = createAddressFromString;
  for (const [a, name] of [
    [router, "Harness"],
    [token, "MockToken"],
    [venue, "MockVenue"],
  ])
    await vm.stateManager.putCode(
      addr(a),
      hexToBytes("0x" + contracts[name].evm.deployedBytecode.object),
    );
  await vm.stateManager.putAccount(addr(user), new Account(0n, 10n ** 24n));
  const venueAccount = await vm.stateManager.getAccount(addr(venue));
  venueAccount.balance = 10n ** 24n;
  await vm.stateManager.putAccount(addr(venue), venueAccount);
  const call = async (
    a,
    name,
    args = [],
    value = 0n,
    kind = a === router ? "Harness" : a === token ? "MockToken" : "MockVenue",
  ) => {
    const r = await vm.evm.runCall({
      caller: addr(user),
      to: addr(a),
      gasLimit: 10000000n,
      value,
      data: hexToBytes(
        encodeFunctionData({
          abi: contracts[kind].abi,
          functionName: name,
          args,
        }),
      ),
    });
    return {
      failed: Boolean(r.execResult.exceptionError),
      error: r.execResult.exceptionError?.error,
      data: bytesToHex(r.execResult.returnValue),
      gas: r.execResult.executionGasUsed,
    };
  };
  const read = async (
    a,
    name,
    args = [],
    kind = a === router ? "Harness" : "MockToken",
  ) => {
    const r = await call(a, name, args, 0n, kind);
    assert.equal(r.failed, false);
    return decodeFunctionResult({
      abi: contracts[kind].abi,
      functionName: name,
      data: r.data,
    });
  };
  const balance = async (a) =>
    (await vm.stateManager.getAccount(addr(a)))?.balance ?? 0n;
  // Constructor storage initialization is not present when injecting runtime bytecode.
  assert.equal((await call(router, "setFill", [10000n])).failed, false);
  return { vm, call, read, balance, addr };
}
test("buy charges actual spent input, refunds unused budget, and preserves donated funds", async () => {
  const s = await setup();
  await s.call(router, "setFill", [5000n]);
  const a = await s.vm.stateManager.getAccount(s.addr(router));
  a.balance = 777n;
  await s.vm.stateManager.putAccount(s.addr(router), a);
  const before = await s.balance(user),
    budget = 1002500n,
    spent = 500000n,
    fee = 1250n;
  const r = await s.call(router, "buy", [token, 1n, 60n, 25n, 0], budget);
  assert.equal(r.failed, false, r.error);
  const output = decodeFunctionResult({
    abi: contracts.Harness.abi,
    functionName: "buy",
    data: r.data,
  });
  assert.deepEqual(output, [spent * 100n, fee, budget - spent - fee]);
  assert.equal(await s.balance(config.fee), fee);
  assert.equal(await s.balance(router), 777n);
  assert.equal(await s.balance(user), before - spent - fee);
  assert.equal(await s.read(token, "balanceOf", [user]), spent * 100n);
});
test("sell deducts exact fee from actual proceeds and clears protocol allowance", async () => {
  const s = await setup(),
    amount = 100000000n;
  await s.call(token, "mint", [user, amount]);
  await s.call(token, "mint", [router, 17n]);
  await s.call(token, "approve", [router, amount]);
  const before = await s.balance(user),
    r = await s.call(router, "sell", [token, amount, 997500n, 60n, 25n, 0]);
  assert.equal(r.failed, false, r.error);
  assert.deepEqual(
    decodeFunctionResult({
      abi: contracts.Harness.abi,
      functionName: "sell",
      data: r.data,
    }),
    [997500n, 2500n],
  );
  assert.equal(await s.balance(config.fee), 2500n);
  assert.equal(await s.balance(user), before + 997500n);
  assert.equal(await s.read(token, "balanceOf", [router]), 17n);
  assert.equal(await s.read(token, "allowance", [router, venue]), 0n);
});
test("minimum output failure rolls back swap, user input and service fee", async () => {
  const s = await setup(),
    before = await s.balance(user);
  const r = await s.call(
    router,
    "buy",
    [token, 10n ** 18n, 60n, 25n, 0],
    1002500n,
  );
  assert.equal(r.failed, true);
  assert.equal(await s.balance(user), before);
  assert.equal(await s.balance(config.fee), 0n);
  assert.equal(await s.read(token, "balanceOf", [user]), 0n);
});
test("stage change, low fee cap and expired or excessive deadline are rejected", async () => {
  const s = await setup();
  for (const args of [
    [token, 1n, 60n, 25n, 1],
    [token, 1n, 60n, 24n, 0],
    [token, 1n, 301n, 25n, 0],
  ])
    assert.equal((await s.call(router, "buy", args, 1002500n)).failed, true);
  await s.call(router, "setStage", [1]);
  assert.equal(
    (await s.call(router, "buy", [token, 1n, 60n, 25n, 0], 1002500n)).failed,
    true,
  );
  assert.equal(await s.balance(config.fee), 0n);
});
test("wrong chain cannot collect a fee", async () => {
  const s = await setup(1);
  assert.equal(
    (await s.call(router, "buy", [token, 1n, 60n, 25n, 0], 1002500n)).failed,
    true,
  );
  assert.equal(await s.balance(config.fee), 0n);
});
test("taxed transferFrom is rejected atomically without losing trader tokens", async () => {
  const s = await setup();
  await s.call(token, "mint", [user, 100000000n]);
  await s.call(token, "approve", [router, 100000000n]);
  await s.call(token, "setTax", [true]);
  assert.equal(
    (await s.call(router, "sell", [token, 100000000n, 1n, 60n, 25n, 0])).failed,
    true,
  );
  assert.equal(await s.read(token, "balanceOf", [user]), 100000000n);
  assert.equal(await s.balance(config.fee), 0n);
});
test("a rejecting fee recipient rolls back the entire trade", async () => {
  const s = await setup();
  await s.vm.stateManager.putCode(
    s.addr(config.fee),
    hexToBytes("0x" + contracts.RejectNative.evm.deployedBytecode.object),
  );
  const before = await s.balance(user);
  assert.equal(
    (await s.call(router, "buy", [token, 1n, 60n, 25n, 0], 1002500n)).failed,
    true,
  );
  assert.equal(await s.balance(user), before);
  assert.equal(await s.read(token, "balanceOf", [user]), 0n);
});
test("fee callbacks cannot reenter a trade", async () => {
  const s = await setup();
  await s.vm.stateManager.putCode(
    s.addr(config.fee),
    hexToBytes("0x" + contracts.ReenterNative.evm.deployedBytecode.object),
  );
  assert.equal(
    (await s.call(router, "buy", [token, 1n, 60n, 25n, 0], 1002500n)).failed,
    false,
  );
  assert.equal(await s.read(config.fee, "blocked", [], "ReenterNative"), true);
});
