import test from "node:test";
import assert from "node:assert/strict";
import { bodyJson } from "../src/request.js";
import { handle } from "../src/worker.js";

const request = (body, headers = {}) =>
  new Request("https://api.invalid/api/market", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    duplex: "half",
  });

test("unfinished upload times out and cancels even after receiving complete-looking JSON", async () => {
  for (const prefix of [undefined, new TextEncoder().encode("{}")]) {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        if (prefix) controller.enqueue(prefix);
      },
      cancel() {
        cancelled = true;
      },
    });
    await assert.rejects(
      () => bodyJson(request(stream), { timeoutMs: 20 }),
      (e) => e.code === "BODY_TIMEOUT" && e.status === 408,
    );
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
  }
});

test("chunked byte limits cannot be bypassed by small chunks or a false Content-Length", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(3000));
      controller.enqueue(new Uint8Array(1097));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    () => bodyJson(request(stream, { "content-length": "2" })),
    (e) => e.code === "BODY_TOO_LARGE" && e.status === 413,
  );
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});

test("malformed UTF-8 and compressed bodies are rejected before any RPC call", async () => {
  let calls = 0;
  for (const [data, headers, status] of [
    [
      new Uint8Array([
        123, 34, 116, 111, 107, 101, 110, 34, 58, 34, 255, 34, 125,
      ]),
      {},
      400,
    ],
    ["{}", { "content-encoding": "gzip" }, 415],
    ["{}", { "content-type": "application/json; charset=latin1" }, 415],
    ["{}", { "content-length": "4097" }, 413],
  ]) {
    const response = await handle(
      request(data, headers),
      {},
      {
        test: true,
        rpc: async () => {
          calls++;
        },
      },
    );
    assert.equal(response.status, status);
  }
  assert.equal(calls, 0);
});

test("UTF-8 JSON can span chunk boundaries without altering fields", async () => {
  const bytes = new TextEncoder().encode('{"token":"é"}');
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  assert.deepEqual(await bodyJson(request(stream)), { token: "é" });
  assert.equal(stream.locked, false);
});
