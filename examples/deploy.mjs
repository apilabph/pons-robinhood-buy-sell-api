import { createPublicClient, http, keccak256 } from "viem";
import artifact from "../artifacts/TradeSettlement.json" with { type: "json" };
import config from "../src/config.json" with { type: "json" };
export function deploymentRequest() {
  return { chainId: config.chainId, data: artifact.bytecode, value: 0n };
}
export async function verifyDeployment(rpcUrl, address) {
  const client = createPublicClient({ transport: http(rpcUrl) });
  if ((await client.getChainId()) !== config.chainId)
    throw new Error("Wrong chain");
  const code = await client.getCode({ address });
  if (!code || keccak256(code) !== artifact.runtimeCodeHash)
    throw new Error("Runtime code mismatch");
  const read = (name) =>
    client.readContract({ address, abi: artifact.abi, functionName: name });
  const [fee, recipient, chain] = await Promise.all([
    read("FEE_BPS"),
    read("FEE_RECIPIENT"),
    read("CHAIN_ID"),
  ]);
  if (
    fee !== 25n ||
    recipient.toLowerCase() !== config.fee.toLowerCase() ||
    chain !== BigInt(config.chainId)
  )
    throw new Error("Fee/chain mismatch");
  return {
    verified: true,
    address,
    chainId: config.chainId,
    feeRecipient: recipient,
  };
}
// Deliberately no signer, key import, top-level deployment or transaction broadcast.
