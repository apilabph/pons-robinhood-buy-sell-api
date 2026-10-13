import { ApiError, requireThat } from "./evm-rpc.js";

// Bound both bytes and elapsed time, including clients that never finish uploading.
export async function bodyJson(request, { timeoutMs = 3000 } = {}) {
  requireThat(
    /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") ?? "",
    ),
    "CONTENT_TYPE",
    "Use application/json with UTF-8.",
    415,
  );
  requireThat(
    !request.headers.has("content-encoding"),
    "CONTENT_ENCODING",
    "Compressed request bodies are not supported.",
    415,
  );
  const length = request.headers.get("content-length");
  requireThat(
    length === null || (/^\d+$/.test(length) && Number(length) <= 4096),
    "BODY_TOO_LARGE",
    "Request exceeds 4096 bytes.",
    413,
  );
  const reader = request.body?.getReader();
  requireThat(reader, "INVALID_JSON", "JSON body is required.", 400);
  const chunks = [];
  let size = 0,
    timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiError(
          "BODY_TIMEOUT",
          "JSON body must finish within three seconds.",
          408,
        ),
      );
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    await Promise.race([
      timeout,
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) {
            void reader.cancel().catch(() => {});
            throw new ApiError(
              "BODY_TOO_LARGE",
              "Request exceeds 4096 bytes.",
              413,
            );
          }
          chunks.push(value);
        }
      })(),
    ]);
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
      );
    } catch {
      throw new ApiError("INVALID_JSON", "Use valid UTF-8 JSON.", 400);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
