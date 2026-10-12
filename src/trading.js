import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  parseAbi,
  parseUnits,
  toHex,
} from "viem";
import artifact from "../artifacts/TradeSettlement.json" with { type: "json" };
import config from "./config.json" with { type: "json" };
import { ApiError, requireThat, hexData, quantity } from "./evm-rpc.js";
export const erc20 = parseAbi([
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function balanceOf(address) view returns(uint256)",
]);
const zero = "0x0000000000000000000000000000000000000000";
export const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
export function address(x) {
  requireThat(
    typeof x === "string" && isAddress(x, { strict: true }) && !same(x, zero),
    "INVALID_ADDRESS",
    "Use a nonzero EVM address with a valid checksum or all lowercase.",
    400,
  );
  return getAddress(x);
}
export function input(body) {
  requireThat(
    body && typeof body === "object" && !Array.isArray(body),
    "INVALID_REQUEST",
    "Use a JSON object.",
    400,
  );
  const keys = new Set([
    "publicKey",
    "token",
    "action",
    "amount",
    "slippageBps",
    "maxServiceFeeBps",
    "deadlineSeconds",
  ]);
  requireThat(
    Object.keys(body).every((k) => keys.has(k)),
    "INVALID_REQUEST",
    "Unknown field. Private keys, RPC URLs and custom call data are never accepted.",
    400,
  );
  const publicKey = address(body.publicKey),
    token = address(body.token),
    action = body.action;
  requireThat(
    ["buy", "sell"].includes(action),
    "INVALID_ACTION",
    "Action must be buy or sell.",
    400,
  );
  requireThat(
    typeof body.amount === "string" && body.amount.length <= 80,
    "INVALID_AMOUNT",
    "Amount must be a decimal string.",
    400,
  );
  let amount;
  if (action === "buy") {
    requireThat(
      /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(body.amount),
      "INVALID_AMOUNT",
      "Buy amount is native currency with at most 18 decimal places.",
      400,
    );
    amount = parseUnits(body.amount, 18);
    requireThat(
      amount <= 100n * 10n ** 18n,
      "INVALID_AMOUNT",
      "Buy budget exceeds the beta limit of 100 native units.",
      400,
    );
  } else {
    requireThat(
      /^[1-9][0-9]*$/.test(body.amount),
      "INVALID_AMOUNT",
      "Sell amount must be raw integer token units.",
      400,
    );
    amount = BigInt(body.amount);
  }
  requireThat(
    amount > 0n && amount <= 2n ** 128n - 1n,
    "INVALID_AMOUNT",
    "Amount is outside supported bounds.",
    400,
  );
  const slippageBps = body.slippageBps ?? 100,
    maxServiceFeeBps = body.maxServiceFeeBps ?? 25,
    deadlineSeconds = body.deadlineSeconds ?? 60;
  requireThat(
    Number.isInteger(slippageBps) && slippageBps >= 1 && slippageBps <= 1000,
    "INVALID_SLIPPAGE",
    "Slippage must be 1–1000 basis points.",
    400,
  );
  requireThat(
    Number.isInteger(maxServiceFeeBps) &&
      maxServiceFeeBps >= 25 &&
      maxServiceFeeBps <= 10000,
    "FEE_LIMIT",
    "This API charges 25 basis points; your limit must allow it.",
    400,
  );
  requireThat(
    Number.isInteger(deadlineSeconds) &&
      deadlineSeconds >= 30 &&
      deadlineSeconds <= 120,
    "INVALID_DEADLINE",
    "Deadline must be 30–120 seconds.",
    400,
  );
  requireThat(
    !same(publicKey, config.fee),
    "INVALID_ADDRESS",
    "Use a separate trading wallet from the fee recipient.",
    400,
  );
  return {
    publicKey,
    token,
    action,
    amount,
    slippageBps,
    maxServiceFeeBps,
    deadlineSeconds,
  };
}
export async function read(rpc, to, name, args, block, abi = artifact.abi) {
  const result = await rpc("eth_call", [
    { to, data: encodeFunctionData({ abi, functionName: name, args }) },
    block,
  ]);
  requireThat(hexData(result), "RPC_RESPONSE", "Invalid contract result.");
  try {
    return decodeFunctionResult({ abi, functionName: name, data: result });
  } catch {
    throw new ApiError(
      "CONTRACT_RESPONSE",
      "Contract response did not match the reviewed ABI.",
    );
  }
}
function blockInfo(b, now) {
  requireThat(
    b &&
      quantity(b.number) &&
      quantity(b.timestamp) &&
      /^0x[0-9a-fA-F]{64}$/.test(b.hash),
    "RPC_RESPONSE",
    "Invalid block header.",
  );
  const age = BigInt(Math.floor(now / 1000)) - BigInt(b.timestamp);
  requireThat(
    age >= -30n && age <= 120n,
    "STALE_BLOCK",
    "RPC returned a stale or future block.",
  );
  return b;
}
export async function snapshot(rpc, now = Date.now()) {
  const [chain, b] = await Promise.all([
    rpc("eth_chainId"),
    rpc("eth_getBlockByNumber", ["latest", false]),
  ]);
  requireThat(
    quantity(chain) && BigInt(chain) === BigInt(config.chainId),
    "WRONG_CHAIN",
    "RPC is connected to the wrong chain.",
  );
  return blockInfo(b, now);
}
export async function verifyRouter(rpc, env, block) {
  requireThat(
    env.SETTLEMENT_ROUTER,
    "SETUP_REQUIRED",
    "The operator must deploy and configure the reviewed settlement contract before trading is available.",
    503,
  );
  const router = address(env.SETTLEMENT_ROUTER),
    code = await rpc("eth_getCode", [router, block]);
  requireThat(
    hexData(code) &&
      code.length > 2 &&
      keccak256(code) === artifact.runtimeCodeHash,
    "ROUTER_MISMATCH",
    "Configured settlement bytecode does not match this release.",
    503,
  );
  // Constants are checked as well as code; this makes deployment diagnostics explicit.
  const [fee, recipient, chain] = await Promise.all([
    read(rpc, router, "FEE_BPS", [], block),
    read(rpc, router, "FEE_RECIPIENT", [], block),
    read(rpc, router, "CHAIN_ID", [], block),
  ]);
  requireThat(
    fee === 25n &&
      same(recipient, config.fee) &&
      chain === BigInt(config.chainId),
    "ROUTER_MISMATCH",
    "Settlement fee or chain configuration differs.",
    503,
  );
  return router;
}
export async function build(
  rpc,
  env,
  body,
  { quoteOnly = false, approvalOnly = false, now = Date.now() } = {},
) {
  const request = input(body);
  requireThat(
    env.SETTLEMENT_ROUTER,
    "SETUP_REQUIRED",
    "Settlement contract deployment is pending. Market inspection is available; trading and fee collection are not active.",
    503,
  );
  const block = await snapshot(rpc, now),
    at = block.number,
    router = await verifyRouter(rpc, env, at);
  const stage = await read(rpc, router, "stage", [request.token], at);
  requireThat(
    config.stages[stage[0]],
    "UNSUPPORTED_MARKET",
    "Unsupported stage.",
  );
  if (
    config.slug === "fourmeme-buy-sell-api" &&
    request.action === "sell" &&
    stage[0] === 0
  )
    requireThat(
      request.amount % 1000000000n === 0n,
      "INVALID_PRECISION",
      "Four.Meme curve sells must be multiples of 1,000,000,000 raw units.",
      400,
    );
  const context = {
    chainId: config.chainId,
    publicKey: request.publicKey,
    token: request.token,
    action: request.action,
    stage: config.stages[stage[0]],
    stageId: stage[0],
    market: stage[1],
    snapshot: { number: BigInt(at).toString(), hash: block.hash },
    serviceFeeBps: 25,
    feeRecipient: config.fee,
    router,
    runtimeCodeHash: artifact.runtimeCodeHash,
    unsigned: true,
    submitted: false,
  };
  if (request.action === "sell") {
    const allowance = await read(
      rpc,
      request.token,
      "allowance",
      [request.publicKey, router],
      at,
      erc20,
    );
    if (allowance < request.amount) {
      // Reset a nonzero insufficient allowance first (USDT-style tokens); never use unlimited approvals.
      const approvalAmount = allowance === 0n ? request.amount : 0n;
      const tx = {
        from: request.publicKey,
        to: request.token,
        data: encodeFunctionData({
          abi: erc20,
          functionName: "approve",
          args: [router, approvalAmount],
        }),
        value: "0x0",
      };
      if (approvalOnly) {
        const approvalResult = await rpc("eth_call", [tx, at]);
        requireThat(
          approvalResult === "0x" ||
            approvalResult === "0x" + "0".repeat(63) + "1",
          "APPROVAL_FAILED",
          "Token rejected the exact allowance update.",
          422,
        );
        const gas = await estimate(rpc, tx);
        await sameBlock(rpc, block, now);
        return {
          ...context,
          approvalRequired: true,
          approvalAmount: approvalAmount.toString(),
          next:
            approvalAmount === 0n
              ? "Confirm reset, then request the exact approval again."
              : "Confirm approval, then rebuild the trade.",
          transaction: { ...tx, chainId: config.chainId, gas: toHex(gas) },
        };
      }
      throw new ApiError(
        "APPROVAL_REQUIRED",
        "Request /api/approval, inspect and sign that exact allowance locally, then rebuild.",
        409,
      );
    }
  }
  if (approvalOnly)
    return { ...context, approvalRequired: false, transaction: null };
  const deadline = BigInt(Math.floor(now / 1000) + request.deadlineSeconds);
  // Build the exact call we will simulate, with an absolute minimum net receipt.
  const transaction = (minimum) => ({
    from: request.publicKey,
    to: router,
    data: encodeFunctionData({
      abi: artifact.abi,
      functionName: request.action,
      args:
        request.action === "buy"
          ? [
              request.token,
              minimum,
              deadline,
              BigInt(request.maxServiceFeeBps),
              stage[0],
            ]
          : [
              request.token,
              request.amount,
              minimum,
              deadline,
              BigInt(request.maxServiceFeeBps),
              stage[0],
            ],
    }),
    value: request.action === "buy" ? toHex(request.amount) : "0x0",
  });
  const simulate = async (tx) => {
    const result = await rpc("eth_call", [tx, at]);
    try {
      return decodeFunctionResult({
        abi: artifact.abi,
        functionName: request.action,
        data: result,
      });
    } catch {
      throw new ApiError(
        "SIMULATION_RESULT",
        "Simulation did not return the expected trade result.",
      );
    }
  };
  const first = await simulate(transaction(1n)),
    expectedOut = first[0];
  requireThat(
    expectedOut > 0n,
    "ZERO_OUTPUT",
    "Simulation returned no output.",
    422,
  );
  const minimum = (expectedOut * BigInt(10000 - request.slippageBps)) / 10000n;
  requireThat(
    minimum > 0n,
    "AMOUNT_TOO_SMALL",
    "Slippage would round the minimum output to zero.",
    400,
  );
  const tx = transaction(minimum),
    result = await simulate(tx),
    gas = await estimate(rpc, tx);
  requireThat(
    result[0] >= minimum,
    "MINIMUM_NOT_MET",
    "Simulation output is below the minimum.",
    422,
  );
  const [balance, currentStage] = await Promise.all([
    rpc("eth_getBalance", [request.publicKey, at]),
    read(rpc, router, "stage", [request.token], "latest"),
  ]);
  requireThat(
    quantity(balance) && BigInt(balance) >= BigInt(tx.value),
    "INSUFFICIENT_FUNDS",
    "Trading wallet lacks native input funds.",
    422,
  );
  requireThat(
    stage[0] === currentStage[0] &&
      same(stage[1], currentStage[1]) &&
      stage[2] === currentStage[2],
    "STAGE_CHANGED",
    "Market stage changed; rebuild.",
    409,
  );
  await sameBlock(rpc, block, now);
  return {
    ...context,
    inputAmount: request.amount.toString(),
    inputUnit: request.action === "buy" ? "wei" : "raw-token-units",
    expectedOut: result[0].toString(),
    minimumOut: minimum.toString(),
    outputUnit: request.action === "buy" ? "raw-token-units" : "wei",
    estimatedServiceFeeWei: result[1].toString(),
    estimatedRefundWei: request.action === "buy" ? result[2].toString() : "0",
    slippageBps: request.slippageBps,
    deadline: deadline.toString(),
    simulation: {
      status: "passed",
      block: BigInt(at).toString(),
      guaranteesExecution: false,
    },
    networkGasExtra: true,
    gasEstimate: gas.toString(),
    transaction: quoteOnly
      ? undefined
      : { ...tx, chainId: config.chainId, gas: toHex(gas) },
  };
}
async function estimate(rpc, tx) {
  const gas = await rpc("eth_estimateGas", [tx]);
  requireThat(
    quantity(gas) && BigInt(gas) > 0n && BigInt(gas) <= 4000000n,
    "GAS_LIMIT",
    "Gas estimate exceeds the beta limit.",
    422,
  );
  return (BigInt(gas) * 120n + 99n) / 100n;
}
async function sameBlock(rpc, block, now) {
  const end = blockInfo(
    await rpc("eth_getBlockByNumber", [block.number, false]),
    now,
  );
  requireThat(
    end.hash === block.hash && end.number === block.number,
    "SNAPSHOT_CHANGED",
    "Block was reorganized; rebuild.",
    409,
  );
}
