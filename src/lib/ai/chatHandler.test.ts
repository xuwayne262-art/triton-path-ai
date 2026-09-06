import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleChatRequest } from "./chatHandler";
import type { ChatDeps, ProviderEvent, StartStreamArgs } from "./chatHandler";
import { ReferenceDataError } from "./referenceData";
import type { ReferenceData } from "./referenceData";

/**
 * Every test here mocks the provider. Nothing in this file can reach Anthropic,
 * so running the suite never costs anything.
 */

const REFERENCE: ReferenceData = {
  coursesJson: '[{"id":"CSE 11","title":"Intro to Programming","units":4}]',
  courseCount: 1,
  collegeGeRules: { writing: "MCWP 40 and MCWP 50" },
  collegesWithGeRules: ["Muir", "Revelle"],
};

function textEvent(text: string): ProviderEvent {
  return { type: "content_block_delta", delta: { type: "text_delta", text } };
}

interface MockOptions {
  events?: ProviderEvent[];
  /** Throw on the very first `next()`, before any output. */
  failFirst?: unknown;
  /** Throw after this many events have been yielded. */
  failAfter?: number;
  /** Never produce anything; only an abort ends it. */
  hang?: boolean;
  /** Yield to the event loop between events so a cancel can land. */
  slow?: boolean;
}

function mockProvider(options: MockOptions = {}) {
  const calls: StartStreamArgs[] = [];
  const state = { aborted: 0 };

  const startStream = (args: StartStreamArgs) => {
    calls.push(args);
    const iterate = async function* (): AsyncGenerator<ProviderEvent> {
      if (options.hang) {
        await new Promise((_resolve, reject) => {
          const stop = () => reject(new Error("Request was aborted."));
          if (args.signal.aborted) stop();
          else args.signal.addEventListener("abort", stop, { once: true });
        });
      }
      if (options.failFirst !== undefined) throw options.failFirst;

      const events = options.events ?? [textEvent("hello")];
      for (let i = 0; i < events.length; i += 1) {
        if (options.failAfter !== undefined && i === options.failAfter) {
          throw new Error("upstream exploded at /home/deploy/app/secret.ts:42");
        }
        if (options.slow) await new Promise((r) => setTimeout(r, 5));
        yield events[i];
      }
    };

    return {
      [Symbol.asyncIterator]: iterate,
      abort() {
        state.aborted += 1;
      },
    };
  };

  return { startStream, calls, aborts: () => state.aborted };
}

function deps(overrides: Partial<ChatDeps> = {}): Partial<ChatDeps> {
  return {
    apiKey: "sk-ant-test-not-a-real-key",
    loadData: async () => REFERENCE,
    timeoutMs: 5_000,
    requestId: () => "testreq",
    logError: () => {},
    ...overrides,
  };
}

function jsonRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request("https://ucsdplans.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

const VALID = { studentMessage: "What GEs does Muir require?", selectedCollege: "Muir" };

// ── Gates ─────────────────────────────────────────────────────────────────────

describe("configuration", () => {
  test("an unconfigured provider key is a safe 503, and nothing is called", async () => {
    const provider = mockProvider();
    let loaded = false;

    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({
        apiKey: undefined,
        startStream: provider.startStream,
        loadData: async () => {
          loaded = true;
          return REFERENCE;
        },
      }),
    );

    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), {
      error: "The AI advisor is temporarily unavailable.",
      code: "AI_CHAT_UNAVAILABLE",
    });
    assert.equal(provider.calls.length, 0);
    assert.equal(loaded, false, "must not read datasets when unconfigured");
  });

  test("the student-facing error never names the environment variable", async () => {
    const res = await handleChatRequest(jsonRequest(VALID), deps({ apiKey: undefined }));
    const text = await res.text();
    assert.ok(!text.includes("ANTHROPIC"), text);
    assert.ok(!text.includes("env"), text);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("invalid requests never reach the provider", () => {
  const cases: Array<[string, Request, number]> = [
    ["malformed JSON", jsonRequest("{not json"), 400],
    ["a JSON null body", jsonRequest("null"), 400],
    ["an array body", jsonRequest([1, 2, 3]), 400],
    ["a primitive body", jsonRequest("42"), 400],
    ["a string body", jsonRequest('"hello"'), 400],
    ["a non-string message", jsonRequest({ studentMessage: 42 }), 400],
    ["an empty message", jsonRequest({ studentMessage: "   " }), 400],
    ["an over-long message", jsonRequest({ studentMessage: "a".repeat(4001) }), 400],
    [
      "an invalid college",
      jsonRequest({ studentMessage: "hi", selectedCollege: "Stanford" }),
      400,
    ],
    [
      "a malformed plan",
      jsonRequest({ studentMessage: "hi", currentPlan: [{ code: "CSE 11", year: 77 }] }),
      400,
    ],
    [
      "an unsupported content type",
      jsonRequest(VALID, { headers: { "Content-Type": "text/plain" } }),
      415,
    ],
  ];

  for (const [label, req, status] of cases) {
    test(`${label} -> ${status}`, async () => {
      const provider = mockProvider();
      const res = await handleChatRequest(req, deps({ startStream: provider.startStream }));

      assert.equal(res.status, status);
      assert.equal(res.headers.get("Cache-Control"), "no-store");
      assert.equal(provider.calls.length, 0, "the provider must never be called");
    });
  }

  test("an oversized body is 413 and never reaches the provider", async () => {
    const provider = mockProvider();
    const huge = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(32 * 1024).fill(0x20));
      },
    });
    const req = new Request("https://ucsdplans.test/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: huge,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const res = await handleChatRequest(req, deps({ startStream: provider.startStream }));
    assert.equal(res.status, 413);
    assert.equal(provider.calls.length, 0);
  });

  test("a valid representative planner payload is accepted", async () => {
    const provider = mockProvider();
    const res = await handleChatRequest(
      jsonRequest({
        studentMessage: "Am I on track?",
        selectedCollege: "Warren",
        currentPlan: {
          plannedCourses: [
            {
              courseId: "cse11",
              course: { code: "CSE 11", title: "Intro to Programming", units: 4 },
              year: 1,
              quarter: "Fall",
            },
          ],
        },
      }),
      deps({ startStream: provider.startStream }),
    );

    assert.equal(res.status, 200);
    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0].userMessage, "Am I on track?");
  });
});

// ── Dataset failures ──────────────────────────────────────────────────────────

describe("dataset failures", () => {
  test("a read failure is a sanitized 500 and never reaches the provider", async () => {
    const provider = mockProvider();
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({
        startStream: provider.startStream,
        loadData: async () => {
          throw new ReferenceDataError(
            "read",
            "ENOENT: /home/deploy/app/data/courses.json missing",
          );
        },
      }),
    );

    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), {
      error: "Course data could not be loaded right now.",
      code: "DATA_UNAVAILABLE",
    });
    assert.ok(!text.includes("/home/deploy"), "must not leak server paths");
    assert.ok(!text.includes("ENOENT"));
    assert.equal(provider.calls.length, 0);
  });

  test("a parse failure is handled the same way", async () => {
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({
        loadData: async () => {
          throw new ReferenceDataError("parse", "Unexpected token < in JSON");
        },
      }),
    );
    assert.equal(res.status, 500);
    assert.equal((await res.json()).code, "DATA_UNAVAILABLE");
  });
});

// ── Provider failures ─────────────────────────────────────────────────────────

describe("provider failures before the first token", () => {
  test("become a real HTTP status, not a successful empty stream", async () => {
    const provider = mockProvider({
      failFirst: Object.assign(new Error("invalid x-api-key sk-ant-abc123"), { status: 401 }),
    });
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({ startStream: provider.startStream }),
    );

    assert.equal(res.status, 502);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), {
      error: "The AI advisor could not complete this request.",
      code: "PROVIDER_ERROR",
    });
    assert.ok(!text.includes("sk-ant"), "must not echo the key back");
    assert.ok(!text.includes("x-api-key"));
    assert.ok(provider.aborts() >= 1, "provider work must be stopped");
  });

  test("a constructor throw is a sanitized 502", async () => {
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({
        startStream: () => {
          throw new Error("Missing credentials at /app/node_modules/sdk/index.js:1");
        },
      }),
    );
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.code, "PROVIDER_UNAVAILABLE");
    assert.ok(!JSON.stringify(body).includes("node_modules"));
  });

  test("a timeout before the first token is a 504", async () => {
    const provider = mockProvider({ hang: true });
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({ startStream: provider.startStream, timeoutMs: 20 }),
    );

    assert.equal(res.status, 504);
    assert.equal((await res.json()).code, "GENERATION_TIMEOUT");
    assert.ok(provider.aborts() >= 1, "the timeout must abort provider work");
  });
});

// ── Streaming ─────────────────────────────────────────────────────────────────

describe("the stream contract", () => {
  test("text events then [DONE] on success", async () => {
    const provider = mockProvider({
      events: [textEvent("Hello"), { type: "thinking_delta" }, textEvent(" there")],
    });
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({ startStream: provider.startStream }),
    );

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "text/event-stream");
    assert.equal(res.headers.get("Cache-Control"), "no-store");

    const body = await res.text();
    assert.equal(
      body,
      'data: {"text":"Hello"}\n\ndata: {"text":" there"}\n\ndata: [DONE]\n\n',
    );
  });

  test("a mid-stream failure sends a safe error event and no [DONE]", async () => {
    const provider = mockProvider({
      events: [textEvent("partial"), textEvent("never sent")],
      failAfter: 1,
    });
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({ startStream: provider.startStream }),
    );

    // Headers were already sent, so the status is still 200.
    assert.equal(res.status, 200);
    const body = await res.text();

    assert.ok(body.includes('data: {"text":"partial"}'));
    assert.ok(
      body.includes(
        'data: {"error":"The AI advisor could not complete this request.","code":"PROVIDER_ERROR"}',
      ),
      body,
    );
    assert.ok(!body.includes("[DONE]"), "a failed stream must not claim success");
    assert.ok(!body.includes("secret.ts"), "must not leak the raw provider message");
  });

  test("the stream closes exactly once and is fully readable", async () => {
    const provider = mockProvider({ events: [textEvent("a"), textEvent("b")] });
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({ startStream: provider.startStream }),
    );

    const reader = res.body!.getReader();
    let chunks = 0;
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
      chunks += 1;
    }
    assert.ok(chunks >= 3);
    // Awaiting closure after a clean end must not throw.
    await reader.closed;
  });
});

// ── Cancellation ──────────────────────────────────────────────────────────────

describe("cancellation", () => {
  test("a client disconnect aborts provider work", async () => {
    const provider = mockProvider({ hang: true });
    const controller = new AbortController();
    const req = jsonRequest(VALID, { signal: controller.signal });

    const pending = handleChatRequest(
      req,
      deps({ startStream: provider.startStream, timeoutMs: 10_000 }),
    );
    // Let the handler get as far as awaiting the first event.
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();

    const res = await pending;
    assert.ok(provider.aborts() >= 1, "the provider stream must be aborted");
    assert.equal(res.status, 502);
  });

  test("cancelling the response stream aborts provider work", async () => {
    const provider = mockProvider({
      events: Array.from({ length: 50 }, (_, i) => textEvent(`chunk ${i}`)),
      slow: true,
    });
    const res = await handleChatRequest(
      jsonRequest(VALID),
      deps({ startStream: provider.startStream, timeoutMs: 10_000 }),
    );

    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    await new Promise((r) => setTimeout(r, 40));
    assert.ok(provider.aborts() >= 1, "cancelling the response must abort the provider");
  });
});

// ── Logging ───────────────────────────────────────────────────────────────────

describe("server logging", () => {
  test("never records the student's message, plan or raw provider text", async () => {
    const lines: string[] = [];
    const provider = mockProvider({
      failFirst: new Error("rate limit for org org-secret-id, key sk-ant-abc123"),
    });

    await handleChatRequest(
      jsonRequest({
        studentMessage: "my private question about failing CSE 12",
        selectedCollege: "Muir",
        currentPlan: [{ code: "CSE 12", year: 1, quarter: "Fall" }],
      }),
      deps({ startStream: provider.startStream, logError: (l) => lines.push(l) }),
    );

    const log = lines.join("\n");
    assert.ok(log.length > 0, "a failure should still be logged");
    assert.ok(!log.includes("private question"), log);
    assert.ok(!log.includes("CSE 12"), log);
    assert.ok(!log.includes("sk-ant"), log);
    assert.ok(!log.includes("org-secret-id"), log);
    assert.ok(log.includes("testreq"), "the request id makes logs correlatable");
  });
});
