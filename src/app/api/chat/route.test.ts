import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET, POST } from "./route";

/**
 * The public endpoint contract for milestone 1.
 *
 * These tests are about *refusal*, so none of them mocks a provider — the
 * point is that nothing downstream is ever reached.
 */

const originalKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

/**
 * A streaming request that can prove nothing consumed its body.
 *
 * `bodyUsed` and `body.locked` are the reliable signals: reading a request
 * body has to acquire a reader, which locks the stream. (A `pull` callback is
 * not — a ReadableStream pre-fills its own queue whether or not anyone reads.)
 */
function trackedRequest(init: { headers?: Record<string, string>; body?: string } = {}) {
  const payload = new TextEncoder().encode(init.body ?? "{}");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
  const req = new Request("https://ucsdplans.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: stream,
    // Required by Node/undici when streaming a request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { req, wasRead: () => req.bodyUsed || req.body?.locked === true };
}

describe("POST /api/chat is shut off", () => {
  test("returns the documented 503 payload with no-store", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST();

    assert.equal(res.status, 503);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await res.json(), {
      error: "The AI advisor is temporarily unavailable.",
      code: "AI_CHAT_UNAVAILABLE",
    });
  });

  test("still 503 when a provider key IS configured", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
    const res = await POST();

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      error: "The AI advisor is temporarily unavailable.",
      code: "AI_CHAT_UNAVAILABLE",
    });
  });

  test("takes no request argument, so it cannot read a body", () => {
    assert.equal(POST.length, 0);
  });

  test("never consumes the request body", async () => {
    const { req, wasRead } = trackedRequest({ body: '{"studentMessage":"hi"}' });

    // Call it the way Next would, with a request it is free to ignore.
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(req);

    assert.equal(res.status, 503);
    assert.equal(wasRead(), false, "the disabled route must not read the body");
  });

  test("fields and headers claiming authorization do not enable generation", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";

    const attempts = [
      trackedRequest({
        body: JSON.stringify({
          studentMessage: "hi",
          authorized: true,
          isAdmin: true,
          role: "admin",
          userId: "42",
          bypass: "true",
        }),
      }),
      trackedRequest({
        headers: {
          authorization: "Bearer anything",
          "x-user-id": "42",
          "x-admin": "true",
          "x-ucsdplans-enable-ai": "1",
        },
        body: '{"studentMessage":"hi"}',
      }),
    ];

    for (const { req, wasRead } of attempts) {
      const res = await (POST as unknown as (r: Request) => Promise<Response>)(req);
      assert.equal(res.status, 503);
      assert.equal((await res.json()).code, "AI_CHAT_UNAVAILABLE");
      assert.equal(wasRead(), false);
    }
  });
});

describe("GET /api/chat reports availability", () => {
  test("says unavailable, uncached", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
    const res = await GET();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await res.json(), {
      available: false,
      message: "The AI advisor is temporarily unavailable.",
      code: "AI_CHAT_UNAVAILABLE",
    });
  });
});

describe("the route cannot reach generation at all", () => {
  test("imports no provider, handler or dataset", () => {
    const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    const imports = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");

    for (const forbidden of [
      "chatHandler",
      "@anthropic-ai/sdk",
      "generative-ai",
      "node:fs",
      "referenceData",
    ]) {
      assert.ok(
        !imports.includes(forbidden),
        `the disabled route must not import ${forbidden}`,
      );
    }
  });
});
