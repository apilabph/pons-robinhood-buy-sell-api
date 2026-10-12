import test from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionResult, keccak256 } from "viem";
import { inspectMarket, classifyV2 } from "../src/market.js";
import { FACTORIES, V3_FACTORY, WETH, ZERO } from "../src/network.js";
import { v1, v2, views } from "../src/abi.js";

const token = "0x1111111111111111111111111111111111111111";
const pool = "0x2222222222222222222222222222222222222222";
const curve = "0x3333333333333333333333333333333333333333";
const now = 1791800000000;
const block = {
  number: "0x123",
  timestamp: "0x" + Math.floor(now / 1000).toString(16),
  hash: "0x" + "ab".repeat(32),
};
const factories = FACTORIES.map((f) => ({
  ...f,
  codeHash: keccak256("0x6000"),
}));

function fixture(options = {}) {
  const log = [];
  const v2Mode = options.v2 ?? false;
  const v1record = {
    token,
    deployer: ZERO,
    pairedToken: WETH,
    positionManager: ZERO,
    positionId: 1n,
    dexId: 0n,
    launchConfigId: 0n,
    restrictionsEndBlock: 5n,
    supply: 1n,
    isToken0: false,
    poolFee: 10000,
    exists: !v2Mode,
    initialBuyAmount: 0n,
    ...options.record,
  };
  const v2record = {
    token,
    curve,
    deployer: ZERO,
    creatorFeeRecipient: ZERO,
    pairToken: ZERO,
    graduationThreshold: 10n,
    poolFee: 10000,
    tickSpacing: 200,
    creatorTaxBps: 0,
    buybackEnabled: false,
    phase: options.phase ?? 0,
    sweptQuote: 0n,
    sweptTokens: 0n,
    sweptAt: 0n,
    exists: v2Mode,
    ...options.record,
  };
  const rpc = async (method, params = []) => {
    log.push([method, params]);
    if (method === "eth_chainId") return options.chain ?? "0x1237";
    if (method === "eth_getBlockByNumber")
      return params[0] !== "latest" && options.reorg
        ? { ...block, hash: "0x" + "cd".repeat(32) }
        : { ...block, ...options.block };
    assert.equal(
      params[1],
      block.number,
      "All contract reads must use the fixed snapshot",
    );
    if (method === "eth_getCode") return options.code ?? "0x6000";
    assert.equal(method, "eth_call");
    const { to, data } = params[0];
    const factory = factories.find((f) => f.address === to);
    const abi = factory ? (factory.version === "v2" ? v2 : v1) : views;
    const { functionName, args } = decodeFunctionData({ abi, data });
    if (options.malformed) return "0x01";
    let result;
    if (functionName === "getLaunchedToken") {
      assert.equal(args[0].toLowerCase(), token);
      result =
        factory.version === "v2"
          ? v2record
          : {
              ...v1record,
              exists:
                options.duplicate ||
                (factory === factories[0] && v1record.exists),
            };
    } else {
      result = {
        graduationStatus: [1n, 1n, true],
        liquidityPool: pool,
        getPool: options.canonical ?? pool,
        factory: to === curve ? factories[2].address : V3_FACTORY,
        token0: WETH,
        token1: token,
        fee: 10000,
        token: options.curveToken ?? token,
        pairToken: ZERO,
        graduated: options.graduated ?? false,
        readyToGraduate: options.ready ?? false,
      }[functionName];
    }
    return encodeFunctionResult({ abi, functionName, result });
  };
  return { rpc, log, options: { factories, now: () => now } };
}
const run = (f) => inspectMarket(f.rpc, token, f.options);
const rejects = async (options, code) =>
  assert.rejects(run(fixture(options)), (error) => error.code === code);

test("V1 graduation retains the verified V3 pool without suggesting a migration", async () => {
  const result = await run(fixture());
  assert.equal(result.stage, "uniswap-v3-pool");
  assert.equal(result.migrationRequiredAtGraduation, false);
  assert.equal(result.graduationThresholdReached, true);
  assert.equal(result.tradingEnabled, false);
  assert.equal(result.poolIdentityVerified, true);
});
test("wrong chain is rejected before any contract read", async () => {
  const f = fixture({ chain: "0x1" });
  await assert.rejects(run(f), (e) => e.code === "WRONG_CHAIN");
  assert.equal(f.log.length, 1);
});
test("invalid and incorrectly checksummed inputs make no RPC calls", async () => {
  const f = fixture();
  for (const value of [
    null,
    ZERO,
    "hello",
    "0x39dBED3a2bd333467115dE45665cC57F813C4570",
  ])
    await assert.rejects(
      inspectMarket(f.rpc, value, f.options),
      (e) => e.code === "INVALID_TOKEN",
    );
  assert.equal(f.log.length, 0);
});
test("changed factory bytecode is rejected", () =>
  rejects({ code: "0x6001" }, "CONTRACT_CHANGED"));
test("missing contract is rejected", () =>
  rejects({ code: "0x" }, "MISSING_CODE"));
test("stale and future blocks are rejected", async () => {
  await rejects({ block: { timestamp: "0x1" } }, "STALE_BLOCK");
  await rejects({ block: { timestamp: "0xffffffffff" } }, "STALE_BLOCK");
});
test("reorganization invalidates a completed inspection", () =>
  rejects({ reorg: true }, "SNAPSHOT_CHANGED"));
test("duplicate registrations are rejected", () =>
  rejects({ duplicate: true }, "AMBIGUOUS_TOKEN"));
test("unknown token is rejected", () =>
  rejects({ record: { exists: false } }, "UNKNOWN_TOKEN"));
test("registration for another token is rejected", () =>
  rejects({ record: { token: curve } }, "REGISTRATION_MISMATCH"));
test("malformed view result is rejected", () =>
  rejects({ malformed: true }, "INVALID_CONTRACT_RESULT"));
test("counterfeit V1 pool is rejected", () =>
  rejects({ canonical: curve }, "POOL_MISMATCH"));
test("V1 non-WETH quote asset is explicitly unsupported", () =>
  rejects({ record: { pairedToken: curve } }, "UNSUPPORTED_PAIR"));
test("V2 closing curve is recognized before factory graduation", async () => {
  const result = await run(fixture({ v2: true, ready: true }));
  assert.equal(result.stage, "curve-closed-awaiting-sweep");
  assert.equal(result.tradingEnabled, false);
  assert.equal(result.taxesVerified, false);
});
test("V2 pool-created phase is not proof of pool validation or tradeability", async () => {
  const result = await run(fixture({ v2: true, phase: 2, graduated: true }));
  assert.equal(result.stage, "pool-created");
  assert.equal(result.poolIdentityVerified, false);
  assert.equal(result.tradingEnabled, false);
});
test("V2 curve bound to another token is rejected", () =>
  rejects({ v2: true, curveToken: pool }, "CURVE_MISMATCH"));
test("V2 stages reject inconsistent or unknown state", () => {
  assert.equal(classifyV2(0, false, false), "bonding-curve");
  assert.equal(classifyV2(1, true, true), "swept-awaiting-pool");
  assert.equal(classifyV2(3, true, true), "rescued");
  assert.throws(
    () => classifyV2(0, true, false),
    (e) => e.code === "INCONSISTENT_STAGE",
  );
  assert.throws(
    () => classifyV2(2, false, false),
    (e) => e.code === "INCONSISTENT_STAGE",
  );
  assert.throws(
    () => classifyV2(4, true, false),
    (e) => e.code === "UNKNOWN_PHASE",
  );
});
