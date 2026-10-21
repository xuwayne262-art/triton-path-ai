import { z } from "zod";
import { isEligibleEmail, normalizeEmail } from "@/lib/auth/eligibility";
import { readJsonBody } from "@/lib/ai/httpBody";
import { MAX_MODEL_INPUT, onlyAllowedFields, screenSensitive } from "../privacy";
import { systemPrompt, validateModelIntent, type ModelVocab } from "../intentSchema";
import type { PlanAiEvent, QuotaDecision } from "./quota";

/**
 * POST /api/plan-ai/interpret: one request, read by the model at most once.
 *
 * Every gate comes before the model, in the order that spends least:
 * identity from the server's own session, a same-origin request, the
 * deployment's switch, a well-formed body holding only the allowed fields,
 * a request with no personal details in it, and finally a reservation
 * against the shared budget. Only then is the model called — once, with a
 * deadline and no retries — and its answer checked for shape and meaning
 * before anything is returned. Every failure says what to do instead; none
 * leaks the provider's or the database's own words.
 */

export interface InterpretDependencies {
  email: () => Promise<string | null | undefined>;
  enabled: () => boolean;
  reserve: (email: string) => Promise<QuotaDecision>;
  vocab: () => Promise<ModelVocab>;
  /** The one model call: system prompt and request in, raw structured output back. */
  interpret: (system: string, text: string, signal: AbortSignal) => Promise<unknown>;
  metric: (event: PlanAiEvent) => Promise<void>;
  now?: () => number;
}

const MODEL_DEADLINE_MS = 12_000;

const bodySchema = z.object({
  text: z.string().trim().min(2).max(MAX_MODEL_INPUT),
  context: z.object({
    options: z.number().int().min(0).max(3),
    pending: z.boolean(),
  }).strict(),
}).strict();

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

/** The student-facing words for each refusal; the client shows them as they are. */
const UNAVAILABLE = "AI chat is temporarily unavailable. You can still build and edit your plan.";

export async function handleInterpret(request: Request, deps: InterpretDependencies): Promise<Response> {
  const now = deps.now ?? Date.now;
  const email = normalizeEmail(await deps.email());
  if (!email || !isEligibleEmail(email)) return json({ error: "Sign in with your @ucsd.edu account to use Plan with AI.", code: "AUTH_REQUIRED" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Please use Plan with AI on UCSDPlans.", code: "INVALID_ORIGIN" }, 403);
  if (!deps.enabled()) return json({ error: UNAVAILABLE, code: "AI_UNAVAILABLE" }, 503);

  const body = await readJsonBody(request);
  if (!body.ok) return json({ error: body.error, code: body.code }, body.status);
  if (!onlyAllowedFields(body.value)) return json({ error: "That request had fields Plan with AI doesn't accept.", code: "INVALID_REQUEST" }, 400);
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return json({ error: `Keep requests between 2 and ${MAX_MODEL_INPUT} characters.`, code: "INVALID_REQUEST" }, 400);
  const { text, context } = parsed.data;

  // The browser screens first; this is the boundary's second side, and costs nothing.
  const reasons = screenSensitive(text);
  if (reasons.length) {
    void deps.metric("sensitive_block");
    return json({ error: "That request looks like it includes personal details, so it wasn't sent to the AI service.", code: "SENSITIVE_INPUT", reasons }, 422);
  }

  let vocab: ModelVocab;
  let decision: QuotaDecision;
  try {
    vocab = await deps.vocab();
    decision = await deps.reserve(email);
  } catch (error) {
    console.error("[plan-ai] vocabulary or quota unavailable:", error instanceof Error ? error.message : String(error));
    return json({ error: UNAVAILABLE, code: "AI_UNAVAILABLE" }, 503);
  }
  if (!decision.ok) {
    void deps.metric("quota_block");
    const error = decision.reason === "student_day"
      ? "You've used today's AI requests. Buttons and the guided planner still work."
      : decision.reason === "site_minute"
        ? "Plan with AI is busy right now. Try again in a minute, or use the buttons."
        : "Plan with AI has reached today's limit for the whole site. Buttons and the guided planner still work.";
    return json({ error, code: "AI_LIMIT", reason: decision.reason }, 429, { "Retry-After": String(decision.retryAfter) });
  }

  const started = now();
  void deps.metric("model_call");
  let raw: unknown;
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(MODEL_DEADLINE_MS)]);
    raw = await deps.interpret(systemPrompt(vocab, context), text, signal);
  } catch (error) {
    // Name and status only: an error's message can echo the request.
    const e = error as { name?: unknown; statusCode?: unknown; responseHeaders?: Record<string, string> } | null;
    const name = String(e?.name ?? "Error");
    console.error(`[plan-ai] model call failed: ${name} ${e?.statusCode ?? ""} after ${now() - started} ms`);
    // 429 is the free tier's limit; 503 is Google's model overloaded. Both pass.
    if (e?.statusCode === 429 || e?.statusCode === 503) {
      void deps.metric("model_busy");
      const after = Number(e.responseHeaders?.["retry-after"]);
      return json({ error: "Plan with AI is busy right now. Try again in a minute, or use the buttons.", code: "AI_BUSY" }, 503,
        { "Retry-After": String(Number.isFinite(after) && after > 0 ? Math.ceil(after) : e.statusCode === 429 ? 60 : 30) });
    }
    if (name === "TimeoutError" || name === "AbortError" || /timeout|abort/i.test(name)) {
      void deps.metric("model_timeout");
      return json({ error: "Plan with AI took too long to answer. Try again, or use the buttons.", code: "AI_TIMEOUT" }, 504);
    }
    void deps.metric("model_failed");
    return json({ error: UNAVAILABLE, code: "AI_FAILED" }, 502);
  }

  try {
    const { interpretation, rejected } = validateModelIntent(raw, vocab);
    void deps.metric("model_ok");
    console.info(`[plan-ai] model ok in ${now() - started} ms`);
    return json({ interpretation, rejected, remaining: decision.remaining });
  } catch {
    void deps.metric("model_invalid");
    console.error(`[plan-ai] model answer failed validation after ${now() - started} ms`);
    return json({ error: "Plan with AI couldn't read that request. Try rephrasing it, or use the buttons.", code: "AI_INVALID" }, 502);
  }
}
