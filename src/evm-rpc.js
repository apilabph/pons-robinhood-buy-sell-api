export class ApiError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function requireThat(ok, code, message, status) {
  if (!ok) throw new ApiError(code, message, status);
}
export const hexData = (x) =>
  typeof x === "string" && /^0x(?:[a-fA-F0-9]{2})*$/.test(x);
export const quantity = (x) =>
  typeof x === "string" && /^0x(?:0|[1-9a-fA-F][a-fA-F0-9]*)$/.test(x);
const allowed = new Set([
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_call",
  "eth_estimateGas",
  "eth_getBalance",
]);
export function createReadRpc(url, { fetchImpl = fetch, now = Date.now } = {}) {
  const parsed = new URL(url);
  requireThat(
    parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash,
    "RPC_CONFIG",
    "Configure an HTTPS RPC secret.",
    500,
  );
  let id = 0;
  const started = now();
  return async (method, params = []) => {
    requireThat(
      allowed.has(method),
      "RPC_METHOD",
      "Only read and simulation methods are allowed.",
      400,
    );
    requireThat(
      ++id <= 36 && now() - started < 20000,
      "RPC_BUDGET",
      "Request exceeded its RPC budget.",
      503,
    );
    const requestId = id,
      abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 8000);
    try {
      const r = await fetchImpl(url, {
        method: "POST",
        redirect: "manual",
        signal: abort.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      });
      requireThat(r.ok, "RPC_HTTP", "RPC read failed.", 503);
      const reader = r.body?.getReader();
      requireThat(reader, "RPC_RESPONSE", "RPC response is empty.");
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 262144) {
            await reader.cancel();
            throw new ApiError("RPC_SIZE", "RPC result is too large.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ApiError("RPC_RESPONSE", "RPC returned invalid JSON.");
      }
      requireThat(
        body?.jsonrpc === "2.0" &&
          body.id === requestId &&
          !Array.isArray(body),
        "RPC_RESPONSE",
        "Invalid RPC response identity.",
      );
      // Do not reflect upstream error messages: RPC providers can include credentials or large payloads.
      requireThat(
        !body.error,
        "SIMULATION_OR_READ_FAILED",
        "Chain read or simulation failed. Check funds, exact allowance, token restrictions and current market stage.",
        422,
      );
      requireThat(
        Object.hasOwn(body, "result"),
        "RPC_RESPONSE",
        "RPC result is missing.",
      );
      return body.result;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(
        "RPC_UNAVAILABLE",
        "RPC request did not complete.",
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
