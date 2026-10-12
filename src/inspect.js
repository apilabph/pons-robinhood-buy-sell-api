import { inspectMarket } from "./market.js";
import { ApiError } from "./evm-rpc.js";
export async function inspect(rpc, token) {
  try {
    return await inspectMarket(rpc, token);
  } catch (e) {
    if (e?.code && e?.status) throw new ApiError(e.code, e.message, e.status);
    throw e;
  }
}
