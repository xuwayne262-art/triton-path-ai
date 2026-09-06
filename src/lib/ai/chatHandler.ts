import Anthropic from "@anthropic-ai/sdk";
import { MAX_BODY_BYTES, readJsonBody } from "./httpBody";
import { validateChatRequest } from "./chatSchema";
import { loadReferenceData, ReferenceDataError } from "./referenceData";
import { buildSystemPrompt, CHAT_MAX_TOKENS, CHAT_MODEL } from "./prompt";
import type { ReferenceData } from "./referenceData";

/**
 * The chat generation path.
 *
 * NOTE: no route calls this today. `/api/chat` is shut off for milestone 1
 * (see `availability.ts`). This module exists so the implementation can be
 * fixed, tested and later reintegrated behind real authentication — it is not
 * reachable from the public internet in its current wiring.
 */

/**
 * A whole answer is capped at 1024 output tokens, which streams comfortably
 * inside a minute. 60s bounds a stuck upstream connection while leaving a slow
 * first token room to arrive.
 */
export const GENERATION_TIMEOUT_MS = 60_000;

// ── Provider seam ─────────────────────────────────────────────────────────────

/** The subset of an SDK stream event this route cares about. */
export interface ProviderEvent {
  type: string;
  delta?: { type: string; text?: string };
}

export interface ProviderStream extends AsyncIterable<ProviderEvent> {
  abort(): void;
}

export interface StartStreamArgs {
  system: string;
  userMessage: string;
  signal: AbortSignal;
  apiKey: string;
}

/** Injected in tests so no paid request is ever made. */
export type StartStream = (args: StartStreamArgs) => ProviderStream;

/**
 * Constructs the Anthropic client lazily.
 *
 * The client is built here, per request, only after every gate and the whole
 * schema have passed — the reviewed implementation built it at module scope,
 * so merely importing the route needed a key. Importing this module or
 * building the app now needs nothing; only an actual generation does. The key
 * comes from the server environment and never leaves it.
 */
export const startAnthropicStream: StartStream = ({
  system,
  userMessage,
  signal,
  apiKey,
}) => {
  const client = new Anthropic({ apiKey });
  return client.messages.stream(
    {
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userMessage }],
    },
    { signal },
  ) as unknown as ProviderStream;
};

// ── Dependencies ──────────────────────────────────────────────────────────────

export interface ChatDeps {
  startStream: StartStream;
  loadData: (college: string) => Promise<ReferenceData>;
  apiKey: string | undefined;
  timeoutMs: number;
  requestId: () => string;
  logError: (line: string) => void;
}

export function defaultDeps(): ChatDeps {
  return {
    startStream: startAnthropicStream,
    loadData: (college) => loadReferenceData(college),
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeoutMs: GENERATION_TIMEOUT_MS,
    requestId: () => globalThis.crypto.randomUUID().slice(0, 8),
    logError: (line) => console.error(line),
  };
}

// ── Safe responses ────────────────────────────────────────────────────────────

/** Student-facing copy. Never contains provider text, paths or env var names. */
const SAFE = {
  unavailable: "The AI advisor is temporarily unavailable.",
  provider: "The AI advisor could not complete this request.",
  timeout: "The AI advisor took too long to respond.",
  data: "Course data could not be loaded right now.",
} as const;

function jsonError(
  status: number,
  code: string,
  error: string,
  requestId: string,
): Response {
  return new Response(JSON.stringify({ error, code }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

/** Logs a class of failure without the student's message, plan or SDK text. */
function describe(err: unknown): string {
  if (err instanceof ReferenceDataError) return `ReferenceDataError(${err.stage})`;
  if (err && typeof err === "object") {
    const name = err.constructor?.name ?? "Error";
    const status =
      "status" in err && typeof err.status === "number" ? ` status=${err.status}` : "";
    return `${name}${status}`;
  }
  return typeof err;
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Validates a chat request and streams the answer back as SSE.
 *
 * Stream contract (unchanged):
 *   text      `data: {"text":"..."}`
 *   error     `data: {"error":"...","code":"..."}`
 *   success   `data: [DONE]`
 *
 * A failure before the first token produces a real HTTP status instead; once
 * bytes are on the wire the only option left is an error event, and `[DONE]`
 * is never sent in that case.
 */
export async function handleChatRequest(
  req: Request,
  overrides: Partial<ChatDeps> = {},
): Promise<Response> {
  const deps: ChatDeps = { ...defaultDeps(), ...overrides };
  const rid = deps.requestId();

  // 1. Server configuration. Checked before any body is read, and reported to
  //    the student without naming the missing variable.
  if (!deps.apiKey) {
    deps.logError(`[chat:${rid}] refused: provider key not configured`);
    return jsonError(503, "AI_CHAT_UNAVAILABLE", SAFE.unavailable, rid);
  }
  const apiKey = deps.apiKey;

  // 2. Body, bounded to MAX_BODY_BYTES while reading.
  const body = await readJsonBody(req);
  if (!body.ok) return jsonError(body.status, body.code, body.error, rid);

  // 3. Shape. Nothing past this point sees caller-controlled structure.
  const parsed = validateChatRequest(body.value);
  if (!parsed.ok) return jsonError(400, parsed.code, parsed.error, rid);
  const { studentMessage, selectedCollege, plan } = parsed.value;

  // 4. Trusted reference data.
  let data: ReferenceData;
  try {
    data = await deps.loadData(selectedCollege);
  } catch (err) {
    deps.logError(`[chat:${rid}] reference data failed: ${describe(err)}`);
    return jsonError(500, "DATA_UNAVAILABLE", SAFE.data, rid);
  }

  const system = buildSystemPrompt({ selectedCollege, plan, data });

  // 5. Cancellation: the client hanging up, the response stream being
  //    cancelled, or the timeout all abort the same controller, which is
  //    handed to the provider.
  const ac = new AbortController();
  let timedOut = false;
  let settled = false;

  const timer = setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, deps.timeoutMs);

  const onClientGone = () => ac.abort();
  req.signal?.addEventListener("abort", onClientGone, { once: true });

  let stream: ProviderStream | null = null;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    req.signal?.removeEventListener("abort", onClientGone);
    // Stop provider work we are no longer going to read. This does not refund
    // tokens already generated and billed — it only avoids buying more.
    try {
      stream?.abort();
    } catch {
      /* already finished */
    }
  };

  // 6. Provider construction.
  try {
    stream = deps.startStream({
      system,
      userMessage: studentMessage,
      signal: ac.signal,
      apiKey,
    });
  } catch (err) {
    deps.logError(`[chat:${rid}] provider init failed: ${describe(err)}`);
    cleanup();
    return jsonError(502, "PROVIDER_UNAVAILABLE", SAFE.provider, rid);
  }

  // 7. Peek at the first event so a connection-time failure still becomes a
  //    real HTTP status rather than a "successful" empty stream.
  const iterator = stream[Symbol.asyncIterator]();
  let first: IteratorResult<ProviderEvent>;
  try {
    first = await iterator.next();
  } catch (err) {
    deps.logError(`[chat:${rid}] generation failed before first token: ${describe(err)}`);
    cleanup();
    return timedOut
      ? jsonError(504, "GENERATION_TIMEOUT", SAFE.timeout, rid)
      : jsonError(502, "PROVIDER_ERROR", SAFE.provider, rid);
  }

  // 8. Stream the rest.
  const encoder = new TextEncoder();

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (payload: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch {
          open = false; // consumer went away mid-write
        }
      };
      const finish = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by a cancel */
        }
      };

      const forward = (event: IteratorResult<ProviderEvent>): boolean => {
        if (event.done) return false;
        const e = event.value;
        if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
          send(JSON.stringify({ text: e.delta.text ?? "" }));
        }
        return true;
      };

      try {
        let current = first;
        while (forward(current)) {
          if (ac.signal.aborted) break;
          current = await iterator.next();
        }

        if (ac.signal.aborted) {
          // Timed out mid-answer: say so rather than implying success.
          if (timedOut) {
            send(JSON.stringify({ error: SAFE.timeout, code: "GENERATION_TIMEOUT" }));
          }
        } else {
          send("[DONE]");
        }
      } catch (err) {
        deps.logError(`[chat:${rid}] generation failed mid-stream: ${describe(err)}`);
        send(
          JSON.stringify(
            timedOut
              ? { error: SAFE.timeout, code: "GENERATION_TIMEOUT" }
              : { error: SAFE.provider, code: "PROVIDER_ERROR" },
          ),
        );
      } finally {
        cleanup();
        finish();
      }
    },
    cancel() {
      // Browser closed the tab or aborted the fetch.
      ac.abort();
      cleanup();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Request-Id": rid,
    },
  });
}

export { MAX_BODY_BYTES };
