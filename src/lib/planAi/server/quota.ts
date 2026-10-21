import { createHmac } from "node:crypto";

/**
 * Plan with AI's model budget, and its switch.
 *
 * The model is used only when the deployment says so (PLAN_AI_ENABLED), has
 * a Gemini key, and has somewhere durable to count calls. Every call is
 * reserved before it is made, against three limits at once — per student
 * per day, site-wide per day and site-wide per minute — in one Supabase
 * transaction, so serverless instances share the count and a burst cannot
 * slip between them. The limits themselves live in the database
 * (supabase/006_plan_ai.sql, table plan_ai_budget), to be set below the
 * Google project's own free-tier limits shown in AI Studio, with room to
 * spare. A failed call still used its reservation, so retrying cannot
 * escape the cap.
 *
 * Without Supabase, `next dev` counts in this process's memory so the path
 * can be tried locally. Production never does: a per-instance counter is no
 * limit at all on serverless, so there the model is simply off.
 */

const env = (...names: string[]) => names.map((n) => process.env[n]?.trim()).find(Boolean) ?? "";

function supabase() {
  return {
    url: env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    key: env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"),
    secret: env("AUTH_SECRET", "NEXTAUTH_SECRET"),
  };
}

/** A Gemini API key from Google AI Studio. GOOGLE_GENERATIVE_AI_API_KEY is the AI SDK's own name for it. */
export const geminiKey = (): string => env("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY");

/**
 * The model to read requests with. Gemini 3.5 Flash-Lite is on Google's free
 * tier and passed the course-search cases in October 2026; PLAN_AI_MODEL can
 * name another Gemini model. There is no fallback to any other model, paid
 * or not: if this one is unavailable, the guided planner answers instead.
 */
export const planAiModel = (): string => env("PLAN_AI_MODEL") || "gemini-3.5-flash-lite";

const devQuota = () => process.env.NODE_ENV !== "production";

/** Somewhere to count calls that every instance shares (or, in development, this process). */
export function quotaConfigured(): boolean {
  const { url, key, secret } = supabase();
  return Boolean(url && key && secret) || (devQuota() && Boolean(supabase().secret));
}

/** Whether Plan with AI may call the model on this deployment. Off unless every part is in place. */
export function planAiEnabled(): boolean {
  return process.env.PLAN_AI_ENABLED === "true" && Boolean(geminiKey()) && quotaConfigured();
}

/** Why the model is off, for the server log only. */
export function planAiDiagnosis(): string {
  if (process.env.PLAN_AI_ENABLED !== "true") return "PLAN_AI_ENABLED is not true";
  if (!geminiKey()) return "GEMINI_API_KEY is not set";
  if (!quotaConfigured()) return "no quota store (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AUTH_SECRET)";
  return "configured";
}

export type QuotaDecision =
  | { ok: true; remaining: number | null }
  | { ok: false; reason: "student_day" | "site_day" | "site_minute"; retryAfter: number };

/** A keyed hash of the student, never the address, and not the plan's key either. */
export function quotaOwner(email: string, secret = supabase().secret): string {
  return createHmac("sha256", secret).update(`plan-ai:${email.trim().toLowerCase()}`).digest("hex");
}

/** Development caps, the same as the migration's defaults. */
const DEV = { perStudentDaily: 20, siteDaily: 150, sitePerMinute: 8 };
const devCounts = new Map<string, number>();

function devReserve(owner: string, now: Date): QuotaDecision {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
  const minute = now.toISOString().slice(0, 16);
  const get = (k: string) => devCounts.get(k) ?? 0;
  if (get(`min:${minute}`) >= DEV.sitePerMinute) return { ok: false, reason: "site_minute", retryAfter: 60 - now.getUTCSeconds() };
  if (get(`day:${day}`) >= DEV.siteDaily) return { ok: false, reason: "site_day", retryAfter: 3600 };
  if (get(`day:${day}:${owner}`) >= DEV.perStudentDaily) return { ok: false, reason: "student_day", retryAfter: 3600 };
  for (const k of [`min:${minute}`, `day:${day}`, `day:${day}:${owner}`]) devCounts.set(k, get(k) + 1);
  return { ok: true, remaining: DEV.perStudentDaily - get(`day:${day}:${owner}`) };
}

async function rpc(name: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const { url, key } = supabase();
  const res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // PostgREST's code (PGRST202: the 006 function is missing) or its message; never the request.
    const detail: unknown = await res.json().catch(() => null);
    const reason = detail && typeof detail === "object" ? (detail as { code?: unknown; message?: unknown }).code ?? (detail as { message?: unknown }).message : null;
    throw new Error(`${name} failed (HTTP ${res.status}${typeof reason === "string" ? `, ${reason.slice(0, 120)}` : ""})`);
  }
  return res.status === 204 ? null : res.json();
}

/** Reserves one model call for this student, or says which limit stops it. Throws when the count cannot be kept. */
export async function reservePlanAi(email: string, now = new Date()): Promise<QuotaDecision> {
  const { url, key, secret } = supabase();
  if (!secret) throw new Error("AUTH_SECRET is not set");
  const owner = quotaOwner(email, secret);
  if (!(url && key)) {
    if (devQuota()) return devReserve(owner, now);
    throw new Error("Plan with AI quota store is not configured");
  }
  const reply = await rpc("reserve_plan_ai", { owner_key: owner }, 4000) as Record<string, unknown> | null;
  if (!reply || typeof reply.ok !== "boolean") throw new Error("Invalid quota reply");
  if (reply.ok) return { ok: true, remaining: typeof reply.remaining === "number" ? reply.remaining : null };
  const reason = reply.reason === "site_minute" || reply.reason === "site_day" || reply.reason === "student_day" ? reply.reason : "site_day";
  const retryAfter = typeof reply.retry_after === "number" && reply.retry_after > 0 ? Math.ceil(reply.retry_after) : 60;
  return { ok: false, reason, retryAfter };
}

/** Events counted per day, without any student or request in them. */
export type PlanAiEvent =
  | "model_call" | "model_ok" | "model_invalid" | "model_timeout" | "model_busy" | "model_failed"
  | "quota_block" | "sensitive_block"
  | "apply_ok" | "apply_duplicate" | "apply_conflict" | "apply_failed" | "undo_ok" | "undo_conflict";

/**
 * Counts an event toward the day's metrics. Never blocks or fails a request:
 * a metric that cannot be written is only noted in the log.
 */
export async function bumpMetric(event: PlanAiEvent): Promise<void> {
  const { url, key } = supabase();
  if (!(url && key)) return;
  try {
    await rpc("bump_plan_ai_metric", { event_name: event }, 1500);
  } catch (err) {
    console.error(`[plan-ai] metric ${event} not recorded: ${err instanceof Error ? err.message : String(err)}`);
  }
}
