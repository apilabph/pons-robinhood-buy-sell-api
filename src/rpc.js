import { RPC_URL } from "./network.js";

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
const methods = new Set([
  "eth_chainId",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_call",
]);
export const hexData = (value) =>
  typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
export const quantity = (value) =>
  typeof value === "string" && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);

// Operator-controlled URL only; HTTP requests cannot supply or override it.
export function createRpc({
  url = RPC_URL,
  fetchImpl = fetch,
  timeoutMs = 8000,
  maxBytes = 262144,
} = {}) {
  const parsed = new URL(url);
  requireThat(
    parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash,
    "RPC_CONFIG",
    "RPC must be an HTTPS URL without userinfo or a fragment.",
    500,
  );
  let sequence = 0;
  return async (method, params = []) => {
    requireThat(
      methods.has(method),
      "RPC_METHOD",
      "Only allowlisted read methods are supported.",
      400,
    );
    const id = ++sequence;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        redirect: "error",
        signal: abort.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      requireThat(response.ok, "RPC_HTTP", "RPC request failed.");
      const reader = response.body?.getReader();
      requireThat(reader, "RPC_RESPONSE", "RPC response has no body.");
      const chunks = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw new ApiError("RPC_SIZE", "RPC response exceeded its limit.");
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
        body &&
          body.jsonrpc === "2.0" &&
          body.id === id &&
          !Array.isArray(body),
        "RPC_RESPONSE",
        "RPC response identity is invalid.",
      );
      requireThat(
        !("error" in body),
        "RPC_ERROR",
        "RPC rejected a read request.",
      );
      requireThat(
        Object.hasOwn(body, "result"),
        "RPC_RESPONSE",
        "RPC result is missing.",
      );
      return body.result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        abort.signal.aborted ? "RPC_TIMEOUT" : "RPC_UNAVAILABLE",
        "RPC read did not complete.",
      );
    } finally {
      clearTimeout(timer);
    }
  };
}
