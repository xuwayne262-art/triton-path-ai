import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_BODY_BYTES, readJsonBody } from "./httpBody";

/**
 * `Content-Length` is a forbidden header on a real `Request`, so a fetch client
 * cannot lie about it — but a raw HTTP client can. These helpers build the
 * minimal shape `readJsonBody` actually touches (`headers` and `body`) so the
 * absent, honest and lying cases can all be exercised.
 */
function fakeRequest(
  body: ReadableStream<Uint8Array> | null,
  headers: Record<string, string> = { "content-type": "application/json" },
): Request {
  return { headers: new Headers(headers), body } as unknown as Request;
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

/** Serves up to `count` chunks, counting how many were ever produced. */
function chunkedStream(count: number, size: number) {
  const state = { served: 0 };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.served >= count) {
        controller.close();
        return;
      }
      state.served += 1;
      controller.enqueue(new Uint8Array(size).fill(0x20));
    },
  });
  return { stream, state };
}

describe("content type", () => {
  test("rejects a missing content type with 415", async () => {
    const res = await readJsonBody(fakeRequest(streamOf("{}"), {}));
    assert.equal(res.ok, false);
    assert.equal(res.ok === false && res.status, 415);
    assert.equal(res.ok === false && res.code, "UNSUPPORTED_MEDIA_TYPE");
  });

  test("rejects text/plain with 415", async () => {
    const res = await readJsonBody(
      fakeRequest(streamOf("{}"), { "content-type": "text/plain" }),
    );
    assert.equal(res.ok === false && res.status, 415);
  });

  test("accepts application/json with a charset parameter", async () => {
    const res = await readJsonBody(
      fakeRequest(streamOf('{"a":1}'), {
        "content-type": "application/json; charset=utf-8",
      }),
    );
    assert.deepEqual(res, { ok: true, value: { a: 1 } });
  });
});

describe("malformed bodies", () => {
  test("rejects invalid JSON with 400", async () => {
    const res = await readJsonBody(fakeRequest(streamOf("{not json")));
    assert.equal(res.ok === false && res.status, 400);
    assert.equal(res.ok === false && res.code, "INVALID_JSON");
  });

  test("rejects an empty body with 400", async () => {
    const res = await readJsonBody(fakeRequest(streamOf("")));
    assert.equal(res.ok === false && res.status, 400);
  });

  test("rejects an absent body with 400", async () => {
    const res = await readJsonBody(fakeRequest(null));
    assert.equal(res.ok === false && res.status, 400);
  });

  test("reports a stream that errors mid-read as malformed, not a crash", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":'));
      },
      pull(controller) {
        controller.error(new Error("client hung up"));
      },
    });
    const res = await readJsonBody(fakeRequest(stream));
    assert.equal(res.ok === false && res.status, 400);
  });

  test("passes through JSON that is valid but the wrong shape", async () => {
    // Shape is the schema's job, not this module's.
    assert.deepEqual(await readJsonBody(fakeRequest(streamOf("null"))), {
      ok: true,
      value: null,
    });
    assert.deepEqual(await readJsonBody(fakeRequest(streamOf("[1,2]"))), {
      ok: true,
      value: [1, 2],
    });
  });
});

describe("size limit", () => {
  test("rejects an honest oversized Content-Length without reading", async () => {
    const { stream } = chunkedStream(100, 32 * 1024);
    const res = await readJsonBody(
      fakeRequest(stream, {
        "content-type": "application/json",
        "content-length": String(MAX_BODY_BYTES + 1),
      }),
    );
    assert.equal(res.ok === false && res.status, 413);
    // Reading requires `getReader()`, which locks the stream. An unlocked
    // stream is proof the header check short-circuited before any read.
    // (Chunk counts cannot show this: a ReadableStream pre-fills its own queue.)
    assert.equal(stream.locked, false, "the header check should short-circuit the read");
  });

  test("rejects an oversized body when Content-Length is absent", async () => {
    const { stream, state } = chunkedStream(100, 32 * 1024);
    const res = await readJsonBody(fakeRequest(stream));

    assert.equal(res.ok === false && res.status, 413);
    assert.equal(res.ok === false && res.code, "REQUEST_TOO_LARGE");
    // 128 KiB / 32 KiB = 4 chunks to reach the cap, 5 to exceed it; one more
    // may sit in the stream's queue. Nowhere near all 100.
    assert.ok(
      state.served <= 8,
      `should stop reading early, but served ${state.served} chunks`,
    );
  });

  test("rejects an oversized body when Content-Length lies about being small", async () => {
    const { stream, state } = chunkedStream(100, 32 * 1024);
    const res = await readJsonBody(
      fakeRequest(stream, {
        "content-type": "application/json",
        "content-length": "10",
      }),
    );
    assert.equal(res.ok === false && res.status, 413);
    assert.ok(state.served <= 8, `served ${state.served} chunks`);
  });

  test("accepts a body just under the limit", async () => {
    const filler = "x".repeat(MAX_BODY_BYTES - 32);
    const res = await readJsonBody(fakeRequest(streamOf(JSON.stringify({ m: filler }))));
    assert.equal(res.ok, true);
  });
});
