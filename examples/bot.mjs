import { decodeFunctionData, parseUnits } from "viem";
import artifact from "../artifacts/TradeSettlement.json" with { type: "json" };
import config from "../src/config.json" with { type: "json" };
import { verifyDeployment } from "./deploy.mjs";
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
// Call this from your bot; signer/RPC credentials stay inside that bot.
export async function prepareTrade({
  rpcUrl,
  expectedRouter,
  publicKey,
  token,
  action,
  amount,
  slippageBps = 100,
}) {
  await verifyDeployment(rpcUrl, expectedRouter);
  const response = await fetch(
    "https://" + config.host + ".apilabph.workers.dev/api/trade",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicKey,
        token,
        action,
        amount,
        slippageBps,
        maxServiceFeeBps: 25,
      }),
    },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.code ?? "API_ERROR");
  const tx = result.transaction;
  if (
    !tx ||
    tx.chainId !== config.chainId ||
    !same(tx.from, publicKey) ||
    !same(tx.to, expectedRouter)
  )
    throw new Error("Transaction identity mismatch");
  const decoded = decodeFunctionData({ abi: artifact.abi, data: tx.data });
  if (decoded.functionName !== action || !same(decoded.args[0], token))
    throw new Error("Trade differs from your request");
  const args = decoded.args,
    minimum = args[action === "buy" ? 1 : 2],
    deadline = args[action === "buy" ? 2 : 3],
    maxFee = args[action === "buy" ? 3 : 4];
  const budget = action === "buy" ? parseUnits(amount, 18) : 0n;
  if (
    BigInt(tx.value) !== budget ||
    (action === "sell" && args[1] !== BigInt(amount)) ||
    maxFee !== 25n ||
    minimum !== BigInt(result.minimumOut) ||
    minimum <= 0n
  )
    throw new Error("Amount/fee mismatch");
  if (
    deadline <= BigInt(Math.floor(Date.now() / 1000)) ||
    deadline > BigInt(Math.floor(Date.now() / 1000) + 120) ||
    BigInt(tx.gas) > 4800000n
  )
    throw new Error("Expired deadline or excessive gas limit");
  return {
    quote: result,
    transaction: {
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
      gas: BigInt(tx.gas),
      chainId: tx.chainId,
    },
  };
}
// Next: compare minimumOut with your bot's own acceptable price, inspect the quote,
// then use your existing local wallet client to sign/send transaction.
// Do not trust an API-provided minimum as your entire trading strategy.

// Optional local execution helper. Calling this spends funds; nothing runs on import.
export async function executeTrade({
  walletClient,
  publicClient,
  expectedRouter,
  rpcUrl,
  token,
  action,
  amount,
  minimumAcceptableOut,
  slippageBps = 100,
}) {
  if (
    !walletClient.account ||
    walletClient.chain?.id !== config.chainId ||
    (await publicClient.getChainId()) !== config.chainId
  )
    throw new Error(
      "Configure your local wallet and public clients for the expected chain",
    );
  if (typeof minimumAcceptableOut !== "bigint" || minimumAcceptableOut <= 0n)
    throw new Error("Provide your strategy minimum in raw output units");
  const prepared = await prepareTrade({
    rpcUrl,
    expectedRouter,
    publicKey: walletClient.account.address,
    token,
    action,
    amount,
    slippageBps,
  });
  if (BigInt(prepared.quote.minimumOut) < minimumAcceptableOut)
    throw new Error("Quote is below your own acceptable price");
  const hash = await walletClient.sendTransaction(prepared.transaction);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw Object.assign(new Error("Trade reverted; do not blindly resend"), {
      hash,
    });
  return { hash, receipt, quote: prepared.quote };
}
